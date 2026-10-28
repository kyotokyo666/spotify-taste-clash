import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lobby } from './components/Lobby';
import { Results } from './components/Results';
import { decodeProfile } from './lib/codec';
import { compareProfiles } from './lib/compare';
import { demoProfiles } from './lib/demo';
import { fetchReplies, isShortId, markRepliesSeen, resolveCode, sendReply, type Reply } from './lib/links';
import { completeLogin, fetchProfile, startLogin } from './lib/spotify';
import {
  loadMe,
  loadPendingReply,
  loadPendingSlot,
  loadSlots,
  saveMe,
  savePendingReply,
  savePendingSlot,
  saveSlots,
  type Slots,
} from './lib/storage';
import type { Slot } from './lib/types';

interface BootResult {
  slots?: Slots;
  /** false — не сохранять в localStorage (демо). */
  persist?: boolean;
  results?: boolean;
  error?: string;
}

let boot: Promise<BootResult> | undefined;

function busyLabel(): string | null {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (new URLSearchParams(window.location.search).has('code')) return 'Слушаем ваш Spotify…';
  if (hash.has('invite') || hash.has('clash')) return 'Распаковываем профиль…';
  return null;
}

async function bootstrap(): Promise<BootResult> {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (hash.has('demo')) {
    const [a, b] = demoProfiles();
    return { slots: { a, b }, persist: false, results: true };
  }
  const invite = hash.get('invite');
  const clash = hash.get('clash');
  let result: BootResult = {};
  try {
    if (invite || clash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      if (clash) {
        const [ca, cb] = (await resolveCode(clash)).split('.');
        const [a, b] = await Promise.all([decodeProfile(ca), decodeProfile(cb ?? '')]);
        // Результат по ссылке не затирает сохранённые слоты.
        return { slots: { a, b }, persist: false, results: true };
      }
      const a = await decodeProfile(await resolveCode(invite!));
      const me = loadMe();
      result = { slots: { a, b: me }, persist: true, results: Boolean(me) };
      saveSlots(result.slots!);
      // Ответ возможен только на короткое приглашение: оно хранится на сервере.
      // Свою же ссылку, открытую для проверки, ответом не считаем.
      const own = me && me.createdAt === a.createdAt && me.name === a.name;
      if (isShortId(invite!) && !own) {
        if (me) await sendReply(invite!, me);
        else savePendingReply({ id: invite!, name: a.name });
      }
    }

    const token = await completeLogin();
    if (token) {
      const profile = await fetchProfile(token);
      const current = loadSlots();
      const slot: Slot = loadPendingSlot() ?? (current.a ? 'b' : 'a');
      savePendingSlot(undefined);
      const next = { ...current, [slot]: profile };
      saveMe(profile);
      const reply = loadPendingReply();
      if (reply) {
        savePendingReply(undefined);
        await sendReply(reply.id, profile);
      }
      result = { slots: next, persist: true, results: Boolean(next.a && next.b) };
    }
    return result;
  } catch (e) {
    return { ...result, error: e instanceof Error ? e.message : String(e) };
  }
}

export function App() {
  const [slots, setSlotsState] = useState<Slots>(loadSlots);
  const [view, setView] = useState<'lobby' | 'results'>('lobby');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);

  const setSlots = useCallback((next: Slots) => {
    setSlotsState(next);
    saveSlots(next);
  }, []);

  // Один раз при загрузке: ссылка-приглашение, ссылка на результат или возврат со страницы Spotify.
  // Сама загрузка — общее на модуль обещание, а эффект лишь применяет её результат: в StrictMode
  // эффект запускается дважды, и одноразовый code от Spotify нельзя ни обменять повторно,
  // ни потерять вместе с отменённым первым запуском.
  useEffect(() => {
    let cancelled = false;
    const label = busyLabel();
    if (label) setBusy(label);
    boot ??= bootstrap();
    boot
      .then((r) => {
        if (cancelled) return;
        if (r.slots) (r.persist ? setSlots : setSlotsState)(r.slots);
        if (r.results) setView('results');
        if (r.error) setError(r.error);
        setBusy(null);
        // Ответы друзей на приглашения, отправленные с этого устройства.
        return fetchReplies().then((list) => !cancelled && setReplies(list));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [setSlots]);

  const connect = async (slot: Slot) => {
    setError(null);
    savePendingSlot(slot);
    try {
      await startLogin();
    } catch (e) {
      savePendingSlot(undefined);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const openReply = async (r: Reply) => {
    try {
      // Сравниваем с тем слепком, который друг получил по ссылке, а если он истёк — с текущим.
      const mine = await resolveCode(r.invite.id).then(decodeProfile, () => loadMe());
      if (!mine) throw new Error('Ваш профиль из приглашения устарел — войдите заново');
      markRepliesSeen(r.invite.id, r.index + 1);
      setReplies((list) => list.filter((x) => x.invite.id !== r.invite.id || x.index > r.index));
      setSlots({ a: mine, b: r.friend });
      setView('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const dismissReply = (r: Reply) => {
    markRepliesSeen(r.invite.id, r.index + 1);
    setReplies((list) => list.filter((x) => x.key !== r.key));
  };

  const clash = useMemo(
    () => (view === 'results' && slots.a && slots.b ? compareProfiles(slots.a, slots.b) : null),
    [view, slots],
  );

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  return (
    <div className="app">
      {busy && (
        <div className="busy" role="status">
          <span className="spinner" aria-hidden /> {busy}
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button className="link" onClick={() => setError(null)}>
            Закрыть
          </button>
        </div>
      )}
      {clash && slots.a && slots.b ? (
        <Results a={slots.a} b={slots.b} clash={clash} onBack={() => setView('lobby')} />
      ) : (
        <Lobby
          slots={slots}
          replies={replies}
          replyTo={loadPendingReply()?.name}
          onOpenReply={openReply}
          onDismissReply={dismissReply}
          onConnect={connect}
          onSet={(slot, p) => setSlots({ ...slots, [slot]: p })}
          onCompare={() => setView('results')}
          onDemo={() => {
            // Демо не сохраняем, чтобы не затереть настоящие профили.
            const [a, b] = demoProfiles();
            setSlotsState({ a, b });
            setView('results');
          }}
          onError={setError}
        />
      )}
    </div>
  );
}
