// localStorage может быть недоступен (приватный режим, заблокированные cookies) —
// приложение должно работать и без него, просто ничего не запоминая.

import type { Profile, Slot } from './types';

const SLOTS_KEY = 'tasteclash.slots';
const ME_KEY = 'tasteclash.me';
const PENDING_KEY = 'tasteclash.pendingSlot';
const SENT_KEY = 'tasteclash.sent';
const REPLY_KEY = 'tasteclash.replyTo';

export type Slots = Partial<Record<Slot, Profile>>;

/** Отправленное приглашение: owner-токен даёт право читать ответы друзей. */
export interface SentInvite {
  id: string;
  owner: string;
  /** createdAt профиля — одно приглашение на один слепок. */
  profileAt: number;
  sentAt: number;
  /** Сколько ответов уже просмотрено или скрыто. */
  seen: number;
}

/** Приглашение, на которое этот браузер ответит профилем после входа. */
export interface PendingReply {
  id: string;
  name: string;
}

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

export const loadSent = () => read<SentInvite[]>(local, SENT_KEY) ?? [];
export const saveSent = (list: SentInvite[]) => write(local, SENT_KEY, list);

export const loadPendingReply = () => read<PendingReply>(session, REPLY_KEY);
export const savePendingReply = (r: PendingReply | undefined) => write(session, REPLY_KEY, r);
