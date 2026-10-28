import { encodeProfile } from './codec';
import type { Profile } from './types';

export function appUrl(hash: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}#${hash}`;
}

/** Ссылка, открыв которую друг сравнит свой вкус с профилем p. */
export async function inviteLink(p: Profile) {
  return appUrl(`invite=${await encodeProfile(p)}`);
}

/** Ссылка сразу на готовый результат для пары. */
export async function clashLink(a: Profile, b: Profile) {
  const [ca, cb] = await Promise.all([encodeProfile(a), encodeProfile(b)]);
  return appUrl(`clash=${ca}.${cb}`);
}
