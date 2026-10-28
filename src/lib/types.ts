export type TimeRange = 'short_term' | 'medium_term' | 'long_term';

export const TIME_RANGES: TimeRange[] = ['short_term', 'medium_term', 'long_term'];

/** Позиции в топах Spotify (1-based), 0 — нет в этом топе. Порядок: short, medium, long. */
export type Ranks = [number, number, number];

export interface ProfileArtist {
  id: string;
  name: string;
  img?: string;
  genres: string[];
  /** Сводный вес 0..1 по всем временным окнам. */
  w: number;
  ranks: Ranks;
  pop?: number;
}

export interface ProfileTrack {
  id: string;
  name: string;
  artistIds: string[];
  artistNames: string[];
  img?: string;
  year?: number;
  w: number;
  ranks: Ranks;
  pop?: number;
  explicit?: boolean;
}

export interface Profile {
  name: string;
  avatar?: string;
  /** Unix-время (мс), когда снят слепок вкуса. */
  createdAt: number;
  artists: ProfileArtist[];
  tracks: ProfileTrack[];
}

export type Slot = 'a' | 'b';
