// API Taste Clash. Работает как middleware Vite (dev), внутри server/index.ts (prod) и в функциях Vercel (api/).
// Ключ Anthropic живёт только на сервере: браузер присылает обезличенную сводку различий.

import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import { HttpError } from './http.ts';
import { MixRequest, MixResponse, VerdictRequest, VerdictResponse } from './schema.ts';
import { loadShare, saveShare, shareConfigured } from './share.ts';

const MODEL = 'claude-opus-5-5';
const MAX_BODY = 64 * 1024;
const WINDOW_MS = 10 * 60 * 1000;

const VERDICT_SYSTEM = `Ты — остроумный музыкальный критик в приложении Taste Clash, которое сравнивает вкусы двух людей.
Тебе дают JSON-сводку: балл совместимости, жанровые доли, эпохи, привычки и список треков-кандидатов.
Людей называй строго плейсхолдерами {A} и {B} — настоящих имён ты не знаешь.

Задача — компромиссный вердикт в духе: «Вам лучше не ездить вместе на машине, но вы сойдётесь на треках X и Y».
- Опирайся на конкретные цифры и названия из сводки, а не на общие слова.
- Тон дружеский и смешной, без снисхождения ни к одному из вкусов.
- picks — 2–3 трека строго из candidates (по id), которые реально устроят обоих; объясни выбор через их общие черты.
- Пиши по-русски.`;

const MIX_SYSTEM = `Ты — диджей, который собирает компромиссный плейлист для двух людей {A} и {B} в приложении Taste Clash.
Тебе дают пул треков: owner показывает, чей трек (A, B или both — общий), family — жанровая семья, year — год.

Собери плейлист заданной длины строго из треков пула (по id, без повторов):
- чередуй треки {A} и {B}, общие (both) используй как мосты между полюсами;
- выстраивай плавную дугу: соседние треки должны быть близки по жанру, эпохе или настроению, резкие скачки — только через мост;
- в transition для каждого трека одной живой фразой объясни, почему он логично идёт после предыдущего (у первого — почему с него стоит начать);
- придумай короткое название плейлиста и описание в одно-два предложения.
Людей называй только {A} и {B}. Пиши по-русски.`;

// ---------- Инфраструктура ----------

const NOT_CONFIGURED = 'ИИ не настроен: задайте ANTHROPIC_API_KEY на сервере';

// Ключ берётся из окружения (ANTHROPIC_API_KEY) или профиля `ant auth login`.
let client: Anthropic | undefined;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** SDK проверяет учётные данные только при запросе, поэтому для статуса смотрим их источники сами. */
function aiConfigured(): boolean {
  const env = process.env;
  return Boolean(
    env.ANTHROPIC_API_KEY ||
      env.ANTHROPIC_AUTH_TOKEN ||
      env.ANTHROPIC_PROFILE ||
      existsSync(join(env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'anthropic')),
  );
}

/** Простое ограничение частоты по IP: ИИ тратит деньги владельца ключа, хранилище — место. */
function rateLimit(requests: number, message: string) {
  const hits = new Map<string, number[]>();
  return (ip: string) => {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= requests) throw new HttpError(429, message);
    recent.push(now);
    hits.set(ip, recent);
  };
}
const aiRate = rateLimit(10, 'Слишком много запросов к ИИ — попробуйте через несколько минут');
const shareRate = rateLimit(30, 'Слишком много ссылок подряд — попробуйте через несколько минут');

/** За прокси Vercel настоящий IP клиента — первый в X-Forwarded-For. */
function clientIp(req: IncomingMessage): string {
  const forwarded = process.env.VERCEL ? req.headers['x-forwarded-for'] : undefined;
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0].trim();
  return first || req.socket.remoteAddress || 'unknown';
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Слишком большой запрос');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Некорректный JSON');
  }
}

async function ask<S extends z.ZodType>(system: string, input: unknown, schema: S, effort: 'low' | 'medium'): Promise<z.infer<S>> {
  if (!aiConfigured()) throw new HttpError(503, NOT_CONFIGURED);
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content: JSON.stringify(input) }],
  });
  if (response.stop_reason === 'refusal') throw new HttpError(422, 'Модель отказалась отвечать на этот запрос');
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) {
    throw new HttpError(502, 'Модель вернула неполный ответ — попробуйте ещё раз');
  }
  return response.parsed_output as z.infer<S>;
}

// ---------- Эндпоинты ----------

async function verdict(body: unknown): Promise<VerdictResponse> {
  const input = VerdictRequest.parse(body);
  const out = await ask(VERDICT_SYSTEM, input, VerdictResponse, 'low');
  // Модель не должна выдумывать треки: оставляем только id из присланных кандидатов.
  const ids = new Set(input.candidates.map((c) => c.id));
  return { ...out, picks: out.picks.filter((p) => ids.has(p.id)).slice(0, 3) };
}

async function mix(body: unknown): Promise<MixResponse> {
  const input = MixRequest.parse(body);
  const out = await ask(MIX_SYSTEM, input, MixResponse, 'medium');
  const ids = new Set(input.pool.map((t) => t.id));
  const seen = new Set<string>();
  const tracks = out.tracks.filter((t) => ids.has(t.id) && !seen.has(t.id) && seen.add(t.id));
  if (tracks.length < 4) throw new HttpError(502, 'Не удалось собрать плейлист — попробуйте ещё раз');
  return { ...out, tracks: tracks.slice(0, input.length) };
}

const ROUTES: Record<string, { run: (body: unknown) => Promise<unknown>; limit: (ip: string) => void }> = {
  '/api/verdict': { run: verdict, limit: aiRate },
  '/api/mix': { run: mix, limit: aiRate },
  '/api/share': { run: saveShare, limit: shareRate },
};

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

/** Возвращает true, если запрос был к API и уже обработан. */
export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;
  if (path === '/api/status' && req.method === 'GET') {
    send(res, 200, { ai: aiConfigured(), share: shareConfigured() });
    return true;
  }
  const route = ROUTES[path];
  if (!route) return false;
  try {
    if (path === '/api/share' && req.method === 'GET') {
      send(res, 200, await loadShare(url.searchParams.get('id') ?? ''));
      return true;
    }
    if (req.method !== 'POST') {
      send(res, 405, { error: 'Только POST' });
      return true;
    }
    route.limit(clientIp(req));
    send(res, 200, await route.run(await readJson(req)));
  } catch (e) {
    const [status, message] = describeError(e);
    if (status >= 500) console.error(`[api] ${path}:`, e);
    send(res, status, { error: message });
  }
  return true;
}

function describeError(e: unknown): [number, string] {
  if (e instanceof HttpError) return [e.status, e.message];
  if (e instanceof Error && e.name === 'ZodError') return [400, 'Некорректные данные запроса'];
  if (e instanceof Anthropic.AuthenticationError) return [503, 'ИИ не настроен: проверьте ANTHROPIC_API_KEY на сервере'];
  if (e instanceof Anthropic.RateLimitError) return [429, 'ИИ сейчас перегружен — попробуйте чуть позже'];
  if (e instanceof Anthropic.APIConnectionError) return [502, 'Не удалось связаться с ИИ'];
  if (e instanceof Anthropic.APIError) return [502, `Ошибка ИИ (${e.status ?? 'нет статуса'})`];
  return [500, 'Внутренняя ошибка'];
}
