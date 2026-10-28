// Клиент AI-эндпоинтов. На сервер уходит только сводка различий и названия треков:
// имена людей заменены на {A}/{B} и подставляются обратно уже в браузере.

import type { MixRequest, MixResponse, TrackRef, VerdictRequest, VerdictResponse } from '../../server/schema';
import { genreFamily, type Clash } from './compare';
import type { Profile, ProfileTrack } from './types';

export type { MixResponse, VerdictResponse };

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Сервер ответил ${res.status}`);
  return json as T;
}

/** Доступен ли ИИ: сервер поднят и ключ настроен. На статическом хостинге эндпоинта нет — тогда false. */
export async function aiAvailable(): Promise<boolean> {
  try {
    const res = await fetch('/api/status');
    return res.ok && ((await res.json()) as { ai?: boolean }).ai === true;
  } catch {
    return false;
  }
}

function trackFamily(t: ProfileTrack, ...profiles: Profile[]): string | undefined {
  for (const p of profiles) {
    const genres = p.artists.find((a) => a.id === t.artistIds[0])?.genres;
    if (genres?.length) return genreFamily(genres[0]);
  }
  return undefined;
}

/** Треки обоих в одном списке: owner помечает, чей трек; общие идут первыми. */
function trackPool(a: Profile, b: Profile, perSide: number): TrackRef[] {
  const inB = new Set(b.tracks.map((t) => t.id));
  const inA = new Set(a.tracks.map((t) => t.id));
  const ref = (t: ProfileTrack, owner: TrackRef['owner']): TrackRef => ({
    id: t.id,
    title: t.name,
    artist: t.artistNames.join(', '),
    owner,
    family: trackFamily(t, a, b),
    year: t.year,
  });
  const shared = a.tracks.filter((t) => inB.has(t.id)).map((t) => ref(t, 'both'));
  const onlyA = a.tracks.filter((t) => !inB.has(t.id)).slice(0, perSide).map((t) => ref(t, 'A'));
  const onlyB = b.tracks.filter((t) => !inA.has(t.id)).slice(0, perSide).map((t) => ref(t, 'B'));
  return [...shared, ...onlyA, ...onlyB];
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function verdictRequest(a: Profile, b: Profile, clash: Clash): VerdictRequest {
  const sharedArtistIds = new Set(clash.sharedArtists.map((s) => s.id));
  // Кандидаты на «вы сойдётесь на X и Y»: общие треки и треки общих исполнителей — в приоритете.
  const pool = trackPool(a, b, 15);
  const byShared = (t: TrackRef) =>
    t.owner === 'both' ? 0 : [...a.tracks, ...b.tracks].find((x) => x.id === t.id)!.artistIds.some((id) => sharedArtistIds.has(id)) ? 1 : 2;
  const candidates = pool.sort((x, y) => byShared(x) - byShared(y)).slice(0, 24);

  const { a: da, b: db } = clash.dna;
  const traits = [
    { label: 'мейнстрим (0–100)', a: da.mainstream, b: db.mainstream },
    { label: 'средний год музыки', a: da.avgYear, b: db.avgYear },
    { label: 'разнообразие (0–1)', a: da.variety, b: db.variety },
    { label: 'постоянство (0–1)', a: da.loyalty, b: db.loyalty },
    { label: 'доля explicit (0–1)', a: da.explicitShare, b: db.explicitShare },
  ]
    .filter((t): t is { label: string; a: number; b: number } => t.a !== undefined && t.b !== undefined)
    .map((t) => ({ label: t.label, a: round2(t.a), b: round2(t.b) }));

  return {
    score: clash.score,
    components: clash.components.map((c) => ({ label: c.label, value: c.value === undefined ? null : round2(c.value) })),
    sharedArtists: clash.sharedArtists.slice(0, 15).map((s) => s.name),
    topArtistsA: a.artists.slice(0, 15).map((x) => x.name),
    topArtistsB: b.artists.slice(0, 15).map((x) => x.name),
    genres: clash.families.map((f) => ({ label: f.family, a: round2(f.a), b: round2(f.b) })),
    decades: clash.decades.slice(-12).map((d) => ({ label: `${d.decade}-е`, a: round2(d.a), b: round2(d.b) })),
    traits,
    candidates,
  };
}

export function mixRequest(a: Profile, b: Profile, length = 14): MixRequest {
  return { pool: trackPool(a, b, 22).slice(0, 60), length };
}

export const fetchVerdict = (req: VerdictRequest) => post<VerdictResponse>('/api/verdict', req);
export const fetchMix = (req: MixRequest) => post<MixResponse>('/api/mix', req);

/** Подставляет имена вместо плейсхолдеров {A} и {B}. */
export function personalize(text: string, nameA: string, nameB: string): string {
  return text.replace(/\{A\}/g, nameA).replace(/\{B\}/g, nameB);
}
