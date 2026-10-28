import { describe, expect, it } from 'vitest';
import { MixRequest, VerdictRequest } from '../../server/schema';
import { distanceForOverlap, lensArea } from '../components/VennDiagram';
import { mixRequest, personalize, verdictRequest } from './ai';
import { compareProfiles } from './compare';
import { demoProfiles } from './demo';

const [alex, sam] = demoProfiles();
const clash = compareProfiles(alex, sam);

describe('геометрия Венна', () => {
  it('площадь линзы: крайние случаи', () => {
    expect(lensArea(10, 10, 25)).toBe(0);
    expect(lensArea(10, 5, 2)).toBeCloseTo(Math.PI * 25);
  });

  it('подбирает расстояние под заданную площадь пересечения', () => {
    for (const target of [5, 50, 150]) {
      const d = distanceForOverlap(10, 8, target);
      expect(lensArea(10, 8, d)).toBeCloseTo(target, 3);
    }
  });
});

describe('Венн', () => {
  it('области не пересекаются и в сумме дают объединение', () => {
    const { counts } = clash.venn.artists;
    const ids = (p: typeof alex) =>
      new Set([...p.artists.map((a) => a.id), ...p.tracks.flatMap((t) => t.artistIds)]);
    const union = new Set([...ids(alex), ...ids(sam)]);
    expect(counts.onlyA + counts.both + counts.onlyB).toBe(union.size);
    expect(clash.venn.artists.both.flatMap((b) => b.items)).toContain('Frank Ocean');
  });

  it('жанровое дерево группирует микрожанры по семьям', () => {
    const tree = clash.venn.genres!.onlyA;
    const electronic = tree.find((b) => b.group === 'Электроника');
    expect(electronic?.items).toEqual(expect.arrayContaining(['french house']));
  });
});

describe('Hipster Index', () => {
  it('равен 100 − мейнстрим, гистограмма нормирована', () => {
    const d = clash.dna.a;
    expect(d.hipster).toBeCloseTo(100 - d.mainstream!);
    expect(d.popHist!.reduce((s, x) => s + x, 0)).toBeCloseTo(1);
    expect(d.nicheArtist?.name).toBeTruthy();
  });

  it('без popularity индекса нет', () => {
    const strip = (p: typeof alex) => ({
      ...p,
      artists: p.artists.map((a) => ({ ...a, pop: undefined })),
      tracks: p.tracks.map((t) => ({ ...t, pop: undefined })),
    });
    const c = compareProfiles(strip(alex), strip(sam));
    expect(c.dna.a.hipster).toBeUndefined();
    expect(c.dna.a.popHist).toBeUndefined();
  });
});

describe('контракт AI', () => {
  it('запрос вердикта проходит серверную валидацию и не содержит имён', () => {
    const req = verdictRequest(alex, sam, clash);
    expect(() => VerdictRequest.parse(req)).not.toThrow();
    expect(JSON.stringify(req)).not.toContain(alex.name);
    expect(JSON.stringify(req)).not.toContain(sam.name);
    // Общие треки — первые кандидаты на «вы сойдётесь на X и Y»
    expect(req.candidates[0].owner).toBe('both');
  });

  it('запрос микса проходит валидацию, в пуле треки обоих', () => {
    const req = mixRequest(alex, sam);
    expect(() => MixRequest.parse(req)).not.toThrow();
    const owners = new Set(req.pool.map((t) => t.owner));
    expect(owners).toEqual(new Set(['A', 'B', 'both']));
    expect(new Set(req.pool.map((t) => t.id)).size).toBe(req.pool.length);
  });

  it('подставляет имена вместо плейсхолдеров', () => {
    expect(personalize('{A} и {B}: {A} за рулём', 'Алекс', 'Сэм')).toBe('Алекс и Сэм: Алекс за рулём');
  });
});
