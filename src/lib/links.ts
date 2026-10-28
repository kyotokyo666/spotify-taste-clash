import { decodeProfile, encodeProfile } from './codec';
import { loadSent, saveSent, type SentInvite } from './storage';
import type { Profile } from './types';

/** Короткий id из /api/share; настоящий код профиля всегда намного длиннее. */
const SHORT_ID = /^[A-Za-z0-9_-]{8}$/;
/** Сервер хранит записи 30 дней; приглашение пересоздаём чуть раньше. */
const INVITE_REUSE_MS = 25 * 24 * 60 * 60 * 1000;
const SENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const isShortId = (value: string) => SHORT_ID.test(value);

export function appUrl(hash: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#${hash}`;
}

/** Сохраняет код на сервере и возвращает короткий id; без сервера — null, и ссылка останется длинной. */
async function shorten(code: string): Promise<{ id: string; owner: string } | null> {
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return null;
    const { id, owner } = (await res.json()) as { id?: unknown; owner?: unknown };
    return typeof id === 'string' && SHORT_ID.test(id) && typeof owner === 'string' ? { id, owner } : null;
  } catch {
    return null;
  }
}

/** Значение из ссылки — короткий id или сам код; возвращает код. */
export async function resolveCode(value: string): Promise<string> {
  if (!SHORT_ID.test(value)) return value;
  const res = await fetch(`/api/share?id=${encodeURIComponent(value)}`).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { code?: string; error?: string } | null;
  if (!res?.ok || !data?.code) throw new Error(data?.error ?? 'Не удалось открыть короткую ссылку');
  return data.code;
}

/**
 * Ссылка, открыв которую друг сравнит свой вкус с профилем p. Короткое приглашение запоминаем,
 * чтобы потом забрать ответы друзей, и переиспользуем для того же слепка.
 */
export async function inviteLink(p: Profile) {
  const sent = loadSent().filter((s) => Date.now() - s.sentAt < SENT_TTL_MS);
  const reuse = sent.find((s) => s.profileAt === p.createdAt && Date.now() - s.sentAt < INVITE_REUSE_MS);
  if (reuse) return appUrl(`invite=${reuse.id}`);
  const code = await encodeProfile(p);
  const short = await shorten(code);
  if (!short) return appUrl(`invite=${code}`);
  saveSent([...sent, { ...short, profileAt: p.createdAt, sentAt: Date.now(), seen: 0 }].slice(-10));
  return appUrl(`invite=${short.id}`);
}

/** Ссылка сразу на готовый результат для пары. */
export async function clashLink(a: Profile, b: Profile) {
  const [ca, cb] = await Promise.all([encodeProfile(a), encodeProfile(b)]);
  const code = `${ca}.${cb}`;
  return appUrl(`clash=${(await shorten(code))?.id ?? code}`);
}

/** Оставляет свой профиль в ответ на короткое приглашение — чтобы результат увидел и его автор. */
export async function sendReply(id: string, p: Profile): Promise<void> {
  await fetch('/api/reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, code: await encodeProfile(p) }),
  }).catch(() => undefined);
}

export interface Reply {
  key: string;
  invite: SentInvite;
  index: number;
  friend: Profile;
}

/** Непросмотренные ответы на отправленные отсюда приглашения. */
export async function fetchReplies(): Promise<Reply[]> {
  const sent = loadSent().filter((s) => Date.now() - s.sentAt < SENT_TTL_MS);
  const lists = await Promise.all(
    sent.map(async (invite) => {
      try {
        const res = await fetch(`/api/reply?id=${encodeURIComponent(invite.id)}`, { headers: { 'X-Owner-Token': invite.owner } });
        if (!res.ok) return [];
        const { codes } = (await res.json()) as { codes?: string[] };
        const fresh = (codes ?? []).map((code, index) => ({ code, index })).filter((r) => r.index >= invite.seen);
        const decoded = await Promise.all(
          fresh.map(async ({ code, index }) => {
            const friend = await decodeProfile(code).catch(() => null);
            return friend && { key: `${invite.id}:${index}`, invite, index, friend };
          }),
        );
        return decoded.filter((r): r is Reply => r !== null);
      } catch {
        return [];
      }
    }),
  );
  return lists.flat();
}

/** Отмечает ответы приглашения просмотренными вплоть до upTo (не включая). */
export function markRepliesSeen(id: string, upTo: number) {
  saveSent(loadSent().map((s) => (s.id === id ? { ...s, seen: Math.max(s.seen, upTo) } : s)));
}
