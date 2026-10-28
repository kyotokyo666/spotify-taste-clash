// Короткие ссылки: сервер хранит уже закодированный профиль (или пару для результата) под коротким id.
// Друг, принявший приглашение, оставляет под тем же id свой профиль-ответ; прочитать ответы может
// только автор приглашения — по секретному owner-токену, который знает лишь его браузер.
// Хранилище — Upstash Redis по REST (на Vercel подключается из Marketplace), локально — память процесса.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './http.ts';

const TTL_SECONDS = 30 * 24 * 60 * 60;
/** Код профиля — base64url; у результата два кода через точку. */
const CODE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?$/;
const ID = /^[A-Za-z0-9_-]{8}$/;
const MAX_CODE = 48 * 1024;
/** Одну ссылку могут кинуть в общий чат — храним несколько последних ответов. */
const MAX_REPLIES = 10;

const NOT_CONFIGURED = 'Короткие ссылки не настроены: подключите Upstash Redis (KV_REST_API_URL и KV_REST_API_TOKEN)';

interface Store {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
  /** Добавляет в конец списка, оставляя последние MAX_REPLIES. */
  push(key: string, value: string): Promise<void>;
  list(key: string): Promise<string[]>;
}

function redisConfig() {
  const env = process.env;
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

function redisStore(url: string, token: string): Store {
  const command = async (args: (string | number)[]) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Upstash ${res.status}`);
    return ((await res.json()) as { result: unknown }).result;
  };
  return {
    async set(key, value) {
      await command(['SET', key, value, 'EX', TTL_SECONDS]);
    },
    async get(key) {
      const result = await command(['GET', key]);
      return typeof result === 'string' ? result : null;
    },
    async push(key, value) {
      await command(['RPUSH', key, value]);
      await command(['LTRIM', key, -MAX_REPLIES, -1]);
      await command(['EXPIRE', key, TTL_SECONDS]);
    },
    async list(key) {
      const result = await command(['LRANGE', key, 0, -1]);
      return Array.isArray(result) ? result.filter((x): x is string => typeof x === 'string') : [];
    },
  };
}

/** Только для локального запуска: на serverless каждый вызов может попасть в новый процесс. */
function memoryStore(): Store {
  const items = new Map<string, { value: string; expires: number }>();
  const lists = new Map<string, string[]>();
  return {
    async set(key, value) {
      items.set(key, { value, expires: Date.now() + TTL_SECONDS * 1000 });
    },
    async get(key) {
      const item = items.get(key);
      return item && item.expires > Date.now() ? item.value : null;
    },
    async push(key, value) {
      lists.set(key, [...(lists.get(key) ?? []), value].slice(-MAX_REPLIES));
    },
    async list(key) {
      return lists.get(key) ?? [];
    },
  };
}

let store: Store | undefined;
function getStore(): Store {
  if (store) return store;
  const redis = redisConfig();
  if (redis) return (store = redisStore(redis.url, redis.token));
  if (process.env.VERCEL) throw new HttpError(503, NOT_CONFIGURED);
  return (store = memoryStore());
}

export function shareConfigured(): boolean {
  return Boolean(redisConfig() || !process.env.VERCEL);
}

function readCode(body: unknown): string {
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== 'string' || code.length > MAX_CODE || !CODE.test(code)) {
    throw new HttpError(400, 'Некорректный код профиля');
  }
  return code;
}

function readId(id: unknown): string {
  if (typeof id !== 'string' || !ID.test(id)) throw new HttpError(400, 'Некорректная ссылка');
  return id;
}

const hash = (token: string) => createHash('sha256').update(token).digest();

export async function saveShare(body: unknown): Promise<{ id: string; owner: string }> {
  const code = readCode(body);
  const id = randomBytes(6).toString('base64url');
  const owner = randomBytes(18).toString('base64url');
  const store = getStore();
  await store.set(`share:${id}`, code);
  await store.set(`owner:${id}`, hash(owner).toString('base64url'));
  return { id, owner };
}

export async function loadShare(id: string): Promise<{ code: string }> {
  const code = await getStore().get(`share:${readId(id)}`);
  if (!code) throw new HttpError(404, 'Ссылка устарела или не найдена — попросите прислать новую');
  return { code };
}

/** Друг, открывший приглашение, оставляет свой профиль, чтобы результат увидел и автор. */
export async function saveReply(body: unknown): Promise<{ ok: true }> {
  const id = readId((body as { id?: unknown } | null)?.id);
  const code = readCode(body);
  if (code.includes('.')) throw new HttpError(400, 'Некорректный код профиля');
  const store = getStore();
  if (!(await store.get(`share:${id}`))) throw new HttpError(404, 'Приглашение устарело');
  await store.push(`reply:${id}`, code);
  return { ok: true };
}

export async function loadReplies(id: string, owner: string): Promise<{ codes: string[] }> {
  const store = getStore();
  const expected = await store.get(`owner:${readId(id)}`);
  const ok = expected !== null && timingSafeEqual(Buffer.from(expected, 'base64url'), hash(owner));
  if (!ok) throw new HttpError(403, 'Нет доступа к ответам на это приглашение');
  return { codes: await store.list(`reply:${id}`) };
}
