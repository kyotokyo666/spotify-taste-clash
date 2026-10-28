import { describe, expect, it } from 'vitest';
import { compareProfiles, cosine, genreFamily, verdictFor } from './compare';
import { demoProfiles } from './demo';
import { buildProfile } from './profile';

describe('genreFamily', () => {
  it('сводит микрожанры к семьям, учитывая порядок правил', () => {
    expect(genreFamily('k-pop boy group')).toBe('K-pop / J-pop');
    expect(genreFamily('russian hip hop')).toBe('Хип-хоп');
    expect(genreFamily('dream pop')).toBe('Инди');
    expect(genreFamily('dance pop')).toBe('Поп');
    expect(genreFamily('gregorian chant')).toBe('Другое');
    expect(genreFamily('trip hop')).toBe('Электроника');
  });
});

describe('cosine', () => {
  it('1 для одинаковых векторов и 0 для непересекающихся', () => {
    const v = new Map([['x', 1], ['y', 2]]);
    expect(cosine(v, v)).toBeCloseTo(1);
    expect(cosine(v, new Map([['z', 1]]))).toBe(0);
    expect(cosine(new Map(), v)).toBe(0);
  });
});

describe('compareProfiles', () => {
  const [alex, sam] = demoProfiles();

  it('профиль с самим собой — 100%', () => {
    const c = compareProfiles(alex, alex);
    expect(c.score).toBe(100);
    expect(c.verdict.title).toBe('Музыкальные близнецы');
  });

  it('демо-пара даёт среднюю совместимость с общими исполнителями и треками', () => {
    const c = compareProfiles(alex, sam);
    expect(c.score).toBeGreaterThan(20);
    expect(c.score).toBeLessThan(80);
    expect(c.sharedArtists.map((a) => a.name)).toEqual(expect.arrayContaining(['Frank Ocean', 'Kendrick Lamar']));
    expect(c.sharedTracks.map((t) => t.name)).toContain('Pink + White');
    expect(c.recs.forA.every((r) => !alex.artists.some((a) => a.id === r.id))).toBe(true);
    expect(c.insights.length).toBeGreaterThan(2);
  });

  it('симметрична по общему баллу', () => {
    expect(compareProfiles(alex, sam).score).toBe(compareProfiles(sam, alex).score);
  });

  it('без жанров (урезанный API) считает по оставшимся компонентам', () => {
    const strip = (p: typeof alex) => ({ ...p, artists: p.artists.map((a) => ({ ...a, genres: [], pop: undefined })) });
    const c = compareProfiles(strip(alex), strip(sam));
    expect(c.components.find((x) => x.key === 'genres')!.value).toBeUndefined();
    expect(c.families).toEqual([]);
    expect(c.score).toBeGreaterThan(0);
  });

  it('полностью разные вкусы — низкий балл', () => {
    const mk = (prefix: string, year: number) =>
      buildProfile({
        name: prefix,
        artists: [[...Array(10)].map((_, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}`, genres: [prefix] }))],
        tracks: [[...Array(10)].map((_, i) => ({
          id: `${prefix}t${i}`, name: 't', artists: [{ id: `${prefix}${i}`, name: 'x' }], album: { release_date: String(year) },
        }))],
      });
    const c = compareProfiles(mk('metal', 1985), mk('k-pop', 2023));
    expect(c.score).toBeLessThan(10);
    expect(c.sharedArtists).toEqual([]);
  });
});

describe('verdictFor', () => {
  it('границы уровней', () => {
    expect(verdictFor(0).title).toBe('Параллельные вселенные');
    expect(verdictFor(50).title).toBe('Хороший дуэт');
    expect(verdictFor(84).title).toBe('На одной волне');
  });
});
