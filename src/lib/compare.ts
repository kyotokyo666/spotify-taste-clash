import type { Profile, ProfileArtist, Ranks } from './types';

// ---------- Жанры: сотни микрожанров Spotify сводятся к понятным «семьям» ----------

/** Порядок важен: побеждает первое совпадение («k-pop» — это K-pop, а не просто поп). */
const GENRE_FAMILIES: [string, RegExp][] = [
  ['K-pop / J-pop', /k-pop|korean|j-pop|j-rock|anime|vocaloid/],
  ['Хип-хоп', /(?<!trip )hip hop|rap|trap|drill|grime|phonk/],
  ['R&B / соул', /r&b|soul|funk|motown|disco/],
  ['Метал', /metal|core\b|djent/],
  ['Панк / эмо', /punk|emo/],
  ['Инди', /indie|lo-fi|bedroom|shoegaze|dream pop/],
  ['Рок', /rock|grunge|britpop|psych|permanent wave/],
  ['Электроника', /house|techno|edm|electro|dubstep|trance|drum and bass|ambient|synthwave|garage|bass|hardstyle|trip hop|downtempo|chillwave/],
  ['Джаз / блюз', /jazz|bossa|swing|blues/],
  ['Классика', /classical|orchestra|baroque|opera|soundtrack|score|piano/],
  ['Латино', /latin|reggaeton|salsa|bachata|cumbia|sertanejo|samba/],
  ['Фолк / кантри', /country|folk|americana|bluegrass|singer-songwriter/],
  ['Регги / афро', /reggae|dancehall|afro/],
  ['Поп', /pop|schlager|estrada/],
];
export const OTHER_FAMILY = 'Другое';

export function genreFamily(genre: string): string {
  const g = genre.toLowerCase();
  return GENRE_FAMILIES.find(([, re]) => re.test(g))?.[0] ?? OTHER_FAMILY;
}

// ---------- Векторная математика ----------

type Vec = Map<string, number>;

function add(v: Vec, key: string, x: number) {
  v.set(key, (v.get(key) ?? 0) + x);
}

export function cosine(a: Vec, b: Vec): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, x] of a) {
    na += x * x;
    const y = b.get(k);
    if (y) dot += x * y;
  }
  for (const y of b.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function normalize(v: Vec): Vec {
  let sum = 0;
  for (const x of v.values()) sum += x;
  return sum ? new Map([...v].map(([k, x]) => [k, x / sum])) : v;
}

/** Пересечение гистограмм: 1 — распределения совпадают, 0 — не пересекаются. */
function overlap(a: Vec, b: Vec): number {
  let s = 0;
  for (const [k, x] of a) s += Math.min(x, b.get(k) ?? 0);
  return s;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function weightedMean(items: { w: number; v?: number }[]): number | undefined {
  let sw = 0;
  let s = 0;
  for (const { w, v } of items) {
    if (v === undefined) continue;
    sw += w;
    s += w * v;
  }
  return sw ? s / sw : undefined;
}

// ---------- Профильные метрики ----------

/** Близость к исполнителям: собственный топ + исполнители любимых треков (с половинным весом). */
function artistAffinity(p: Profile): Vec {
  const v: Vec = new Map();
  for (const a of p.artists) add(v, a.id, a.w);
  for (const t of p.tracks) for (const id of t.artistIds) add(v, id, (0.5 * t.w) / t.artistIds.length);
  return v;
}

function trackVec(p: Profile): Vec {
  return new Map(p.tracks.map((t) => [t.id, t.w]));
}

function hasGenres(p: Profile) {
  return p.artists.some((a) => a.genres.length > 0);
}

function genreVecs(p: Profile): { fine: Vec; family: Vec } {
  const fine: Vec = new Map();
  const family: Vec = new Map();
  for (const a of p.artists) {
    if (!a.genres.length) continue;
    const fams = new Set(a.genres.map(genreFamily));
    for (const g of a.genres) add(fine, g, a.w / a.genres.length);
    for (const f of fams) add(family, f, a.w / fams.size);
  }
  return { fine: normalize(fine), family: normalize(family) };
}

function decadeVec(p: Profile): Vec {
  const v: Vec = new Map();
  for (const t of p.tracks) if (t.year) add(v, String(Math.floor(t.year / 10) * 10), t.w);
  return normalize(v);
}

export interface Dna {
  /** Доля уникальных исполнителей среди любимых треков. */
  variety?: number;
  /** Какая часть нынешних фаворитов была в топе и за всё время. */
  loyalty?: number;
  avgYear?: number;
  explicitShare?: number;
  /** Средняя популярность исполнителей, 0..100. */
  mainstream?: number;
  topFamily?: string;
  topArtist?: string;
  /** Hipster Index: 100 − мейнстрим. */
  hipster?: number;
  /** Доля веса пяти главных исполнителей — насколько слушание сосредоточено на любимцах. */
  focus?: number;
  /** Распределение веса исполнителей по корзинам популярности 0–20, 20–40, … 80–100. */
  popHist?: number[];
  nicheArtist?: { name: string; pop: number };
}

export const POP_BUCKETS = ['0–20', '20–40', '40–60', '60–80', '80–100'];

function popularity(p: Profile): Pick<Dna, 'mainstream' | 'hipster' | 'popHist' | 'nicheArtist'> {
  const withPop = p.artists.filter((a) => a.pop !== undefined);
  const mainstream =
    weightedMean(p.artists.map((a) => ({ w: a.w, v: a.pop }))) ??
    weightedMean(p.tracks.map((t) => ({ w: t.w, v: t.pop })));
  if (!withPop.length) return { mainstream, hipster: mainstream === undefined ? undefined : 100 - mainstream };
  const hist = [0, 0, 0, 0, 0];
  let total = 0;
  for (const a of withPop) {
    hist[Math.min(4, Math.floor(a.pop! / 20))] += a.w;
    total += a.w;
  }
  // Нишевый — самый непопулярный среди заметной части топа, а не случайный хвост.
  const niche = withPop.slice(0, 30).reduce((m, a) => (a.pop! < m.pop! ? a : m));
  return {
    mainstream,
    hipster: 100 - mainstream!,
    popHist: hist.map((x) => x / total),
    nicheArtist: { name: niche.name, pop: niche.pop! },
  };
}

function dna(p: Profile, families: Vec): Dna {
  const trackArtists = new Set(p.tracks.map((t) => t.artistIds[0]));
  const recent = p.artists.filter((a) => a.ranks[0] > 0);
  const topFamily = [...families].filter(([f]) => f !== OTHER_FAMILY).sort((x, y) => y[1] - x[1])[0]?.[0];
  const totalW = p.artists.reduce((s, a) => s + a.w, 0);
  return {
    ...popularity(p),
    focus: totalW ? p.artists.slice(0, 5).reduce((s, a) => s + a.w, 0) / totalW : undefined,
    variety: p.tracks.length ? trackArtists.size / p.tracks.length : undefined,
    loyalty: recent.length ? recent.filter((a) => a.ranks[2] > 0).length / recent.length : undefined,
    avgYear: weightedMean(p.tracks.map((t) => ({ w: t.w, v: t.year }))),
    explicitShare: weightedMean(
      p.tracks.map((t) => ({ w: t.w, v: t.explicit === undefined ? undefined : Number(t.explicit) })),
    ),
    topFamily,
    topArtist: p.artists[0]?.name,
  };
}

// ---------- Сравнение ----------

export interface Component {
  key: 'artists' | 'tracks' | 'genres' | 'eras';
  label: string;
  hint: string;
  /** 0..1 после калибровки; undefined — не хватает данных. */
  value?: number;
  weight: number;
}

export interface SharedItem {
  id: string;
  name: string;
  sub?: string;
  img?: string;
  rankA?: number;
  rankB?: number;
  strength: number;
}

export interface FamilyRow {
  family: string;
  a: number;
  b: number;
}

export interface DecadeRow {
  decade: number;
  a: number;
  b: number;
}

export interface Rec {
  id: string;
  name: string;
  sub?: string;
  img?: string;
  rank?: number;
}

/** Ветка «жанрового дерева»: семья → её микрожанры. Для исполнителей group пустая. */
export interface VennBranch {
  group: string;
  items: string[];
}

export interface Venn {
  counts: { onlyA: number; both: number; onlyB: number };
  onlyA: VennBranch[];
  both: VennBranch[];
  onlyB: VennBranch[];
}

export interface Clash {
  score: number;
  verdict: { title: string; subtitle: string };
  components: Component[];
  sharedArtists: SharedItem[];
  sharedTracks: SharedItem[];
  venn: { genres?: Venn; artists: Venn };
  families: FamilyRow[];
  decades: DecadeRow[];
  dna: { a: Dna; b: Dna };
  /** forA — что B может посоветовать A, и наоборот. */
  recs: { forA: Rec[]; forB: Rec[] };
  insights: string[];
}

const bestRank = (r?: Ranks) => {
  const nz = r?.filter((x) => x > 0) ?? [];
  return nz.length ? Math.min(...nz) : undefined;
};

/**
 * Сырые косинусы по исполнителям у живых людей обычно 0.05–0.4 — их растягиваем
 * экспоненциальным насыщением, чтобы 0.3 читалось как «много общего», а не как «30%».
 */
const saturate = (x: number, k: number) => 1 - Math.exp(-k * x);

const VERDICTS: [number, string, string][] = [
  [85, 'Музыкальные близнецы', 'Можно делить один аккаунт на двоих'],
  [70, 'На одной волне', 'Совместный плейлист соберётся сам собой'],
  [50, 'Хороший дуэт', 'Общая база есть, и каждому есть что показать'],
  [30, 'Противоположности притягиваются', 'Вам будет чем удивить друг друга'],
  [0, 'Параллельные вселенные', 'Идеальный повод для обмена плейлистами'],
];

export function verdictFor(score: number) {
  const [, title, subtitle] = VERDICTS.find(([min]) => score >= min)!;
  return { title, subtitle };
}

function artistMeta(id: string, ...profiles: Profile[]): { name: string; img?: string; ranks: (Ranks | undefined)[] } {
  let name = '';
  let img: string | undefined;
  const ranks = profiles.map((p) => {
    const a = p.artists.find((x) => x.id === id);
    if (a) {
      name ||= a.name;
      img ||= a.img;
    }
    return a?.ranks;
  });
  if (!name) {
    for (const p of profiles) {
      for (const t of p.tracks) {
        const i = t.artistIds.indexOf(id);
        if (i >= 0) {
          name = t.artistNames[i];
          img ||= t.img;
          break;
        }
      }
      if (name) break;
    }
  }
  return { name, img, ranks };
}

function recsFor(target: Vec, source: Profile): Rec[] {
  return source.artists
    .filter((a: ProfileArtist) => !target.has(a.id))
    .slice(0, 6)
    .map((a) => {
      const track = source.tracks.find((t) => t.artistIds.includes(a.id));
      return {
        id: a.id,
        name: a.name,
        img: a.img,
        rank: bestRank(a.ranks),
        sub: track ? `попробуй «${track.name}»` : a.genres[0],
      };
    });
}

/**
 * Делит два взвешенных множества на три области Венна. Внутри области ключи
 * группируются в ветки (для жанров — по семьям) и сортируются по суммарному весу.
 */
function buildVenn(a: Vec, b: Vec, label: (k: string) => string, group: (k: string) => string = () => ''): Venn {
  const region = (keys: string[], weight: (k: string) => number): VennBranch[] => {
    const branches = new Map<string, { w: number; items: [string, number][] }>();
    for (const k of keys) {
      const g = group(k);
      const br = branches.get(g) ?? { w: 0, items: [] };
      br.w += weight(k);
      br.items.push([label(k), weight(k)]);
      branches.set(g, br);
    }
    return [...branches]
      .sort((x, y) => y[1].w - x[1].w)
      .map(([g, br]) => ({ group: g, items: br.items.sort((x, y) => y[1] - x[1]).map(([n]) => n) }));
  };
  const onlyA = [...a.keys()].filter((k) => !b.has(k));
  const both = [...a.keys()].filter((k) => b.has(k));
  const onlyB = [...b.keys()].filter((k) => !a.has(k));
  return {
    counts: { onlyA: onlyA.length, both: both.length, onlyB: onlyB.length },
    onlyA: region(onlyA, (k) => a.get(k)!),
    both: region(both, (k) => Math.min(a.get(k)!, b.get(k)!)),
    onlyB: region(onlyB, (k) => b.get(k)!),
  };
}

export function compareProfiles(a: Profile, b: Profile): Clash {
  const affA = artistAffinity(a);
  const affB = artistAffinity(b);
  const genresAvailable = hasGenres(a) && hasGenres(b);
  const gA = genreVecs(a);
  const gB = genreVecs(b);
  const decA = decadeVec(a);
  const decB = decadeVec(b);

  const components: Component[] = [
    {
      key: 'artists',
      label: 'Общие исполнители',
      hint: 'Совпадение топов исполнителей с учётом мест и любимых треков',
      value: saturate(cosine(affA, affB), 5),
      weight: 0.35,
    },
    {
      key: 'tracks',
      label: 'Общие треки',
      hint: 'Одни и те же песни в топах',
      value: saturate(cosine(trackVec(a), trackVec(b)), 8),
      weight: 0.15,
    },
    {
      key: 'genres',
      label: 'Жанры',
      hint: genresAvailable
        ? 'Похожесть по микрожанрам и по крупным жанровым семьям'
        : 'Spotify не отдал жанры для этих профилей',
      value: genresAvailable ? 0.4 * cosine(gA.fine, gB.fine) + 0.6 * cosine(gA.family, gB.family) : undefined,
      weight: 0.3,
    },
    {
      key: 'eras',
      label: 'Эпохи',
      hint: 'Из каких десятилетий ваша музыка',
      value: decA.size && decB.size ? clamp01((overlap(decA, decB) - 0.2) / 0.75) : undefined,
      weight: 0.2,
    },
  ];

  const usable = components.filter((c) => c.value !== undefined);
  const totalW = usable.reduce((s, c) => s + c.weight, 0);
  const score = totalW ? Math.round((100 * usable.reduce((s, c) => s + c.weight * c.value!, 0)) / totalW) : 0;

  const sharedArtists: SharedItem[] = [...affA]
    .filter(([id]) => affB.has(id))
    .map(([id, wa]) => {
      const meta = artistMeta(id, a, b);
      return {
        id,
        name: meta.name,
        img: meta.img,
        rankA: bestRank(meta.ranks[0]),
        rankB: bestRank(meta.ranks[1]),
        strength: Math.sqrt(wa * affB.get(id)!),
      };
    })
    .sort((x, y) => y.strength - x.strength)
    .slice(0, 12);

  const tracksB = new Map(b.tracks.map((t) => [t.id, t]));
  const sharedTracks: SharedItem[] = a.tracks
    .filter((t) => tracksB.has(t.id))
    .map((t) => {
      const tb = tracksB.get(t.id)!;
      return {
        id: t.id,
        name: t.name,
        sub: t.artistNames.join(', '),
        img: t.img ?? tb.img,
        rankA: bestRank(t.ranks),
        rankB: bestRank(tb.ranks),
        strength: Math.sqrt(t.w * tb.w),
      };
    })
    .sort((x, y) => y.strength - x.strength)
    .slice(0, 10);

  const artistName = (id: string) => artistMeta(id, a, b).name;
  const venn = {
    genres: genresAvailable ? buildVenn(gA.fine, gB.fine, (g) => g, genreFamily) : undefined,
    artists: buildVenn(affA, affB, artistName),
  };

  const families: FamilyRow[] = genresAvailable
    ? [...new Set([...gA.family.keys(), ...gB.family.keys()])]
        .map((family) => ({ family, a: gA.family.get(family) ?? 0, b: gB.family.get(family) ?? 0 }))
        .sort((x, y) => y.a + y.b - (x.a + x.b))
        .slice(0, 8)
    : [];

  const decades: DecadeRow[] = [...new Set([...decA.keys(), ...decB.keys()])]
    .map(Number)
    .sort((x, y) => x - y)
    .map((d) => ({ decade: d, a: decA.get(String(d)) ?? 0, b: decB.get(String(d)) ?? 0 }));

  const dnaA = dna(a, gA.family);
  const dnaB = dna(b, gB.family);

  return {
    score,
    verdict: verdictFor(score),
    components,
    sharedArtists,
    sharedTracks,
    venn,
    families,
    decades,
    dna: { a: dnaA, b: dnaB },
    recs: { forA: recsFor(affA, b), forB: recsFor(affB, a) },
    insights: buildInsights(a.name, b.name, { sharedArtists, sharedTracks, families, dnaA, dnaB }),
  };
}

function pluralYears(n: number) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'год';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'года';
  return 'лет';
}

function buildInsights(
  nameA: string,
  nameB: string,
  d: { sharedArtists: SharedItem[]; sharedTracks: SharedItem[]; families: FamilyRow[]; dnaA: Dna; dnaB: Dna },
): string[] {
  const out: string[] = [];
  const { sharedArtists, sharedTracks, families, dnaA, dnaB } = d;

  if (sharedArtists.length) {
    out.push(`Ваш главный общий исполнитель — ${sharedArtists[0].name}.`);
  } else {
    out.push('Ни одного общего исполнителя — редкий и очень интересный случай.');
  }
  if (sharedTracks.length) {
    out.push(`«${sharedTracks[0].name}» есть в топе у обоих — это ваш гимн.`);
  }

  const common = families
    .filter((f) => f.family !== OTHER_FAMILY)
    .sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b))[0];
  if (common && Math.min(common.a, common.b) > 0.05) out.push(`Вас объединяет жанр «${common.family}».`);

  const split = families
    .filter((f) => f.family !== OTHER_FAMILY)
    .sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b))[0];
  if (split && Math.abs(split.a - split.b) > 0.15) {
    out.push(`«${split.family}» — территория ${split.a > split.b ? nameA : nameB}.`);
  }

  if (dnaA.avgYear && dnaB.avgYear) {
    const diff = Math.round(Math.abs(dnaA.avgYear - dnaB.avgYear));
    if (diff >= 3) {
      out.push(`${dnaA.avgYear < dnaB.avgYear ? nameA : nameB} слушает музыку в среднем на ${diff} ${pluralYears(diff)} старше.`);
    }
  }
  if (dnaA.mainstream !== undefined && dnaB.mainstream !== undefined && Math.abs(dnaA.mainstream - dnaB.mainstream) >= 10) {
    out.push(`${dnaA.mainstream > dnaB.mainstream ? nameA : nameB} ближе к мейнстриму, ${dnaA.mainstream > dnaB.mainstream ? nameB : nameA} — к андерграунду.`);
  }
  if (dnaA.loyalty !== undefined && dnaB.loyalty !== undefined && Math.abs(dnaA.loyalty - dnaB.loyalty) >= 0.2) {
    out.push(`У ${dnaA.loyalty > dnaB.loyalty ? nameA : nameB} старые фавориты держатся в топе годами, а ${dnaA.loyalty > dnaB.loyalty ? nameB : nameA} постоянно открывает новое.`);
  }
  return out;
}
