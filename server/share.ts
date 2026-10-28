// Короткие ссылки: сервер хранит уже закодированный профиль (или пару для результата) под коротким id.
// Хранилище — Upstash Redis по REST (на Vercel подключается из Marketplace), локально — память процесса.

import { randomBytes } from 'node:crypto';
import { HttpError } from './http.ts';

const TTL_SECONDS = 30 * 24 * 60 * 60;
/** Код профиля — base64url; у результата два кода через точку. */
const CODE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?$/;
const ID = /^[A-Za-z0-9_-]{8}$/;
const MAX_CODE = 48 * 1024;

const NOT_CONFIGURED = 'Короткие ссылки не настроены: подключите Upstash Redis (KV_REST_API_URL и KV_REST_API_TOKEN)';

interface Store {
  set(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
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
  };
}

/** Только для локального запуска: на serverless каждый вызов может попасть в новый процесс. */
function memoryStore(): Store {
  const items = new Map<string, { value: string; expires: number }>();
  return {
    async set(key, value) {
      items.set(key, { value, expires: Date.now() + TTL_SECONDS * 1000 });
    },
    async get(key) {
      const item = items.get(key);
      return item && item.expires > Date.now() ? item.value : null;
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

export async function saveShare(body: unknown): Promise<{ id: string }> {
  const code = (body as { code?: unknown } | null)?.code;
  if (typeof code !== 'string' || code.length > MAX_CODE || !CODE.test(code)) {
    throw new HttpError(400, 'Некорректный код профиля');
  }
  const id = randomBytes(6).toString('base64url');
  await getStore().set(`share:${id}`, code);
  return { id };
}

export async function loadShare(id: string): Promise<{ code: string }> {
  if (!ID.test(id)) throw new HttpError(400, 'Некорректная ссылка');
  const code = await getStore().get(`share:${id}`);
  if (!code) throw new HttpError(404, 'Ссылка устарела или не найдена — попросите прислать новую');
  return { code };
}
