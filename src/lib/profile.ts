import type { Profile, ProfileArtist, ProfileTrack, Ranks } from './types';

// Сырые объекты Spotify Web API. Spotify урезает поля для приложений в Development Mode
// (genres, popularity и т.п. могут отсутствовать), поэтому всё, кроме id/name, — опционально.
interface RawImage {
  url: string;
  width?: number | null;
}

export interface RawArtist {
  id: string;
  name: string;
  genres?: string[];
  popularity?: number;
  images?: RawImage[];
}

export interface RawTrack {
  id: string;
  name: string;
  popularity?: number;
  explicit?: boolean;
  artists: { id: string; name: string }[];
  album?: { images?: RawImage[]; release_date?: string };
}

/** Вклад каждого временного окна: долгий топ говорит о вкусе больше, чем последние 4 недели. */
const RANGE_WEIGHT: Ranks = [0.25, 0.35, 0.4];
const MAX_ITEMS = 60;

/** Картинка ~160px: достаточно для аватарок и не раздувает ссылку. */
export function pickImage(images: RawImage[] | undefined): string | undefined {
  if (!images?.length) return undefined;
  const sorted = [...images].sort((x, y) => (x.width ?? 0) - (y.width ?? 0));
  return (sorted.find((i) => (i.width ?? 0) >= 160) ?? sorted[sorted.length - 1]).url;
}

function parseYear(date: string | undefined): number | undefined {
  const y = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(y) && y > 1900 ? y : undefined;
}

/**
 * Сводит три топа (short/medium/long) в один список с весами.
 * Вес позиции линейно падает от 1 (первое место) к 1/n (последнее).
 */
function merge<R extends { id: string }, T>(
  lists: R[][],
  make: (raw: R) => T,
): (T & { w: number; ranks: Ranks })[] {
  const byId = new Map<string, T & { w: number; ranks: Ranks }>();
  lists.forEach((list, range) => {
    list.forEach((raw, i) => {
      let item = byId.get(raw.id);
      if (!item) {
        item = { ...make(raw), w: 0, ranks: [0, 0, 0] };
        byId.set(raw.id, item);
      }
      item.w += RANGE_WEIGHT[range] * ((list.length - i) / list.length);
      item.ranks[range] = i + 1;
    });
  });
  return [...byId.values()].sort((x, y) => y.w - x.w).slice(0, MAX_ITEMS);
}

export function buildProfile(input: {
  name: string;
  avatar?: string;
  artists: RawArtist[][];
  tracks: RawTrack[][];
  createdAt?: number;
}): Profile {
  const artists: ProfileArtist[] = merge(input.artists, (a) => ({
    id: a.id,
    name: a.name,
    img: pickImage(a.images),
    genres: a.genres ?? [],
    pop: a.popularity,
  }));
  const tracks: ProfileTrack[] = merge(input.tracks, (t) => ({
    id: t.id,
    name: t.name,
    artistIds: t.artists.map((a) => a.id),
    artistNames: t.artists.map((a) => a.name),
    img: pickImage(t.album?.images),
    year: parseYear(t.album?.release_date),
    pop: t.popularity,
    explicit: t.explicit,
  }));
  return {
    name: input.name,
    avatar: input.avatar,
    createdAt: input.createdAt ?? Date.now(),
    artists,
    tracks,
  };
}
