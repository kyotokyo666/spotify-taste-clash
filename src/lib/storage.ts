// localStorage может быть недоступен (приватный режим, заблокированные cookies) —
// приложение должно работать и без него, просто ничего не запоминая.

import type { Profile, Slot } from './types';

const SLOTS_KEY = 'tasteclash.slots';
const ME_KEY = 'tasteclash.me';
const PENDING_KEY = 'tasteclash.pendingSlot';

export type Slots = Partial<Record<Slot, Profile>>;

function read<T>(store: () => Storage, key: string): T | undefined {
  try {
    const raw = store().getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(store: () => Storage, key: string, value: unknown) {
  try {
    if (value === undefined) store().removeItem(key);
    else store().setItem(key, JSON.stringify(value));
  } catch {
    /* хранилище недоступно — работаем без памяти */
  }
}

const local = () => localStorage;
const session = () => sessionStorage;

export const loadSlots = () => read<Slots>(local, SLOTS_KEY) ?? {};
export const saveSlots = (s: Slots) => write(local, SLOTS_KEY, s);

/** Последний собственный профиль — чтобы по ссылке друга сравнение строилось без повторного входа. */
export const loadMe = () => read<Profile>(local, ME_KEY);
export const saveMe = (p: Profile | undefined) => write(local, ME_KEY, p);

/** В какой слот положить профиль после возврата со страницы Spotify. */
export const loadPendingSlot = () => read<Slot>(session, PENDING_KEY);
export const savePendingSlot = (s: Slot | undefined) => write(session, PENDING_KEY, s);
