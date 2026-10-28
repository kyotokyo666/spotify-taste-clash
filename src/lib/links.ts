import { encodeProfile } from './codec';
import type { Profile } from './types';

/** Короткий id из /api/share; настоящий код профиля всегда намного длиннее. */
const SHORT_ID = /^[A-Za-z0-9_-]{8}$/;

export function appUrl(hash: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#${hash}`;
}

/** Сохраняет код на сервере и возвращает короткий id; без сервера — null, и ссылка останется длинной. */
async function shorten(code: string): Promise<string | null> {
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return null;
    const { id } = (await res.json()) as { id?: unknown };
    return typeof id === 'string' && SHORT_ID.test(id) ? id : null;
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

/** Ссылка, открыв которую друг сравнит свой вкус с профилем p. */
export async function inviteLink(p: Profile) {
  const code = await encodeProfile(p);
  return appUrl(`invite=${(await shorten(code)) ?? code}`);
}

/** Ссылка сразу на готовый результат для пары. */
export async function clashLink(a: Profile, b: Profile) {
  const [ca, cb] = await Promise.all([encodeProfile(a), encodeProfile(b)]);
  const code = `${ca}.${cb}`;
  return appUrl(`clash=${(await shorten(code)) ?? code}`);
}
