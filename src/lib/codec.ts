// Профиль упаковывается в компактный код для ссылки: кортежи вместо объектов,
// словарь жанров, укороченные URL обложек, затем deflate + base64url.
// Код кладётся во фрагмент URL (#...), поэтому никогда не уходит на сервер.

import type { Profile, Ranks } from './types';

const VERSION = 1;
const IMG_PREFIX = 'https://i.scdn.co/image/';

const packImg = (u?: string) => (u ? (u.startsWith(IMG_PREFIX) ? u.slice(IMG_PREFIX.length) : u) : '');
const unpackImg = (s: string) => (s ? (s.includes('/') ? s : IMG_PREFIX + s) : undefined);
const packNum = (n?: number) => (n === undefined ? -1 : n);
const unpackNum = (n: number) => (n < 0 ? undefined : n);
const round = (w: number) => Math.round(w * 1000);

type WireArtist = [string, string, string, number, number[], Ranks, number];
type WireTrack = [string, string, string[], string[], string, number, number, Ranks, number, number];
type Wire = [number, string, string, number, string[], WireArtist[], WireTrack[]];

export function toWire(p: Profile): Wire {
  const genres: string[] = [];
  const gIndex = new Map<string, number>();
  const gid = (g: string) => {
    let i = gIndex.get(g);
    if (i === undefined) {
      i = genres.push(g) - 1;
      gIndex.set(g, i);
    }
    return i;
  };
  return [
    VERSION,
    p.name,
    p.avatar ?? '',
    Math.round(p.createdAt / 1000),
    genres,
    p.artists.map((a) => [a.id, a.name, packImg(a.img), round(a.w), a.genres.map(gid), a.ranks, packNum(a.pop)]),
    p.tracks.map((t) => [
      t.id,
      t.name,
      t.artistIds,
      t.artistNames,
      packImg(t.img),
      packNum(t.year),
      round(t.w),
      t.ranks,
      packNum(t.pop),
      t.explicit === undefined ? -1 : Number(t.explicit),
    ]),
  ];
}

export function fromWire(w: Wire): Profile {
  if (!Array.isArray(w) || w[0] !== VERSION) throw new Error('Неподдерживаемая версия кода');
  const [, name, avatar, createdAt, genres, artists, tracks] = w;
  return {
    name,
    avatar: avatar || undefined,
    createdAt: createdAt * 1000,
    artists: artists.map(([id, n, img, wt, g, ranks, pop]) => ({
      id,
      name: n,
      img: unpackImg(img),
      w: wt / 1000,
      genres: g.map((i) => genres[i]),
      ranks,
      pop: unpackNum(pop),
    })),
    tracks: tracks.map(([id, n, artistIds, artistNames, img, year, wt, ranks, pop, explicit]) => ({
      id,
      name: n,
      artistIds,
      artistNames,
      img: unpackImg(img),
      year: unpackNum(year),
      w: wt / 1000,
      ranks,
      pop: unpackNum(pop),
      explicit: explicit < 0 ? undefined : explicit === 1,
    })),
  };
}

function toB64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeProfile(p: Profile): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(toWire(p)));
  return toB64url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeProfile(code: string): Promise<Profile> {
  try {
    const bytes = await pipe(fromB64url(code.trim()), new DecompressionStream('deflate-raw'));
    return fromWire(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (e) {
    throw new Error(e instanceof Error && e.message.includes('версия') ? e.message : 'Код повреждён или неполный');
  }
}
