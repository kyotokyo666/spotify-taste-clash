import { describe, expect, it } from 'vitest';
import { decodeProfile, encodeProfile } from './codec';
import { demoProfiles } from './demo';

describe('codec', () => {
  it('кодирует и раскодирует профиль без потерь (с точностью до весов)', async () => {
    const [alex] = demoProfiles();
    const withImg = { ...alex, artists: alex.artists.map((a, i) => ({ ...a, img: i ? undefined : 'https://i.scdn.co/image/abc123' })) };
    const code = await encodeProfile(withImg);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeProfile(code);
    expect(back.name).toBe(alex.name);
    expect(back.artists[0].img).toBe('https://i.scdn.co/image/abc123');
    expect(back.artists.map((a) => a.id)).toEqual(alex.artists.map((a) => a.id));
    expect(back.artists[1].genres).toEqual(alex.artists[1].genres);
    expect(back.tracks[0].year).toBe(alex.tracks[0].year);
    expect(back.tracks[0].w).toBeCloseTo(alex.tracks[0].w, 2);
  });

  it('отклоняет мусор понятной ошибкой', async () => {
    await expect(decodeProfile('not-a-code')).rejects.toThrow('Код повреждён');
  });
});
