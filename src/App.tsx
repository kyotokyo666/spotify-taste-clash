import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lobby } from './components/Lobby';
import { Results } from './components/Results';
import { decodeProfile } from './lib/codec';
import { compareProfiles } from './lib/compare';
import { demoProfiles } from './lib/demo';
import { completeLogin, fetchProfile, startLogin } from './lib/spotify';
import {
  loadMe,
  loadPendingSlot,
  loadSlots,
  saveMe,
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
        const [ca, cb] = clash.split('.');
        const [a, b] = await Promise.all([decodeProfile(ca), decodeProfile(cb ?? '')]);
        // Результат по ссылке не затирает сохранённые слоты.
        return { slots: { a, b }, persist: false, results: true };
      }
      const a = await decodeProfile(invite!);
      const me = loadMe();
      result = { slots: { a, b: me }, persist: true, results: Boolean(me) };
      saveSlots(result.slots!);
    }

    const token = await completeLogin();
    if (token) {
      const profile = await fetchProfile(token);
      const current = loadSlots();
      const slot: Slot = loadPendingSlot() ?? (current.a ? 'b' : 'a');
      savePendingSlot(undefined);
      const next = { ...current, [slot]: profile };
      saveMe(profile);
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
