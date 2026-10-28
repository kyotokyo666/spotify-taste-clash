// Авторизация Spotify по Authorization Code + PKCE: без бэкенда и без client secret.
// Токен живёт только в памяти — он нужен один раз, чтобы снять слепок вкуса.

import { TIME_RANGES, type Profile, type TimeRange } from './types';
import { buildProfile, type RawArtist, type RawTrack } from './profile';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-top-read';
const PKCE_KEY = 'tasteclash.pkce';

export const CLIENT_ID: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '';

export function redirectUri(): string {
  return import.meta.env.VITE_SPOTIFY_REDIRECT_URI || window.location.origin + import.meta.env.BASE_URL;
}

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(len = 64): string {
  return base64url(crypto.getRandomValues(new Uint8Array(len))).slice(0, len);
}

async function sha256(input: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)));
}

/** Уводит браузер на страницу входа Spotify. */
export async function startLogin(): Promise<void> {
  if (!CLIENT_ID) throw new Error('Не задан VITE_SPOTIFY_CLIENT_ID (см. .env.example)');
  const verifier = randomString(64);
  const state = randomString(16);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES,
    state,
    code_challenge_method: 'S256',
    code_challenge: base64url(await sha256(verifier)),
    // Всегда показываем диалог, чтобы на одном устройстве можно было сменить аккаунт для второго игрока.
    show_dialog: 'true',
  });
  window.location.assign(`${AUTH_URL}?${params}`);
}

/**
 * Если мы вернулись со страницы Spotify — обменивает code на токен и чистит URL.
 * Возвращает access token или null, если это обычная загрузка страницы.
 */
export async function completeLogin(): Promise<string | null> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (!code && !error) return null;

  const stored = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  window.history.replaceState(null, '', url.pathname + url.hash);

  if (error) throw new Error(error === 'access_denied' ? 'Доступ к Spotify не выдан' : `Spotify: ${error}`);
  if (!stored) throw new Error('Сессия входа потерялась — попробуйте ещё раз');
  const { verifier, state } = JSON.parse(stored) as { verifier: string; state: string };
  if (url.searchParams.get('state') !== state) throw new Error('Неверный state — вход отклонён');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Не удалось получить токен (${res.status})`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function api<T>(token: string, path: string, attempt = 0): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get('Retry-After') ?? '1');
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
    return api(token, path, attempt + 1);
  }
  if (res.status === 403) {
    throw new Error('Spotify отказал в доступе (403). В Development Mode аккаунт нужно добавить в User Management приложения.');
  }
  if (!res.ok) throw new Error(`Spotify API ${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

interface Me {
  display_name: string | null;
  id: string;
  images?: { url: string; width: number | null }[];
}

/** Скачивает топы за все три периода и собирает из них профиль вкуса. */
export async function fetchProfile(token: string): Promise<Profile> {
  const me = await api<Me>(token, '/me');
  const top = <T,>(type: 'artists' | 'tracks', range: TimeRange) =>
    api<{ items: T[] }>(token, `/me/top/${type}?time_range=${range}&limit=50`).then((r) => r.items);

  const [artists, tracks] = await Promise.all([
    Promise.all(TIME_RANGES.map((r) => top<RawArtist>('artists', r))),
    Promise.all(TIME_RANGES.map((r) => top<RawTrack>('tracks', r))),
  ]);

  if (artists.every((l) => l.length === 0) && tracks.every((l) => l.length === 0)) {
    throw new Error('Spotify пока не собрал ваш топ — послушайте музыку ещё немного и возвращайтесь');
  }

  return buildProfile({
    name: me.display_name || me.id,
    avatar: me.images?.length ? me.images[me.images.length - 1].url : undefined,
    artists,
    tracks,
  });
}
