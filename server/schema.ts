// Контракт AI-эндпоинтов: общий для сервера (валидация) и клиента (типы).
// Имена людей сюда не попадают — только плейсхолдеры {A} и {B}, клиент подставляет их сам.

import { z } from 'zod';

const text = z.string().max(160);

export const TrackRef = z.object({
  id: z.string().max(64),
  title: text,
  artist: text,
  /** Чей это трек: A, B или общий. */
  owner: z.enum(['A', 'B', 'both']),
  family: text.optional(),
  year: z.number().int().optional(),
});

const Share = z.object({ label: text, a: z.number(), b: z.number() });

export const VerdictRequest = z.object({
  score: z.number().min(0).max(100),
  components: z.array(z.object({ label: text, value: z.number().nullable() })).max(6),
  sharedArtists: z.array(text).max(15),
  topArtistsA: z.array(text).max(15),
  topArtistsB: z.array(text).max(15),
  genres: z.array(Share).max(10),
  decades: z.array(Share).max(12),
  traits: z.array(Share).max(10),
  candidates: z.array(TrackRef).min(1).max(30),
});

export const VerdictResponse = z.object({
  headline: z.string().describe('Компромиссный вердикт одной фразой, с юмором'),
  roadTrip: z.string().describe('Шутливый прогноз совместной поездки на машине: кто и за что будет бороться за AUX'),
  details: z.string().describe('2–3 предложения: в чём различия и где точка встречи'),
  picks: z
    .array(z.object({ id: z.string().describe('id трека из candidates'), why: z.string() }))
    .describe('2–3 трека из candidates, на которых сойдутся оба'),
});

export const MixRequest = z.object({
  pool: z.array(TrackRef).min(4).max(60),
  length: z.number().int().min(6).max(20),
});

export const MixResponse = z.object({
  title: z.string(),
  description: z.string(),
  tracks: z
    .array(
      z.object({
        id: z.string().describe('id трека из pool'),
        transition: z.string().describe('Одна фраза: почему этот трек логично идёт после предыдущего'),
      }),
    )
    .describe('Треки в порядке воспроизведения'),
});

export type TrackRef = z.infer<typeof TrackRef>;
export type VerdictRequest = z.infer<typeof VerdictRequest>;
export type VerdictResponse = z.infer<typeof VerdictResponse>;
export type MixRequest = z.infer<typeof MixRequest>;
export type MixResponse = z.infer<typeof MixResponse>;
