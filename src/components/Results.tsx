import { useState } from 'react';
import { OTHER_FAMILY, POP_BUCKETS, type Clash, type Dna, type Rec, type SharedItem } from '../lib/compare';
import { clashLink } from '../lib/links';
import type { Profile } from '../lib/types';
import { AiPanel } from './AiPanel';
import { Breakdown, MainstreamScale, PairedBars, Radar, ScoreRing, type RadarAxis } from './charts';
import { VennDiagram } from './VennDiagram';
import { Avatar, NavBar, ShareButton, pct } from './ui';

interface Props {
  a: Profile;
  b: Profile;
  clash: Clash;
  onBack: () => void;
}

function Section({ title, note, wide, children }: { title: string; note?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={`card ${wide ? 'wide' : ''}`}>
      <header className="card-head">
        <h2>{title}</h2>
        {note && <p className="muted">{note}</p>}
      </header>
      {children}
    </section>
  );
}

function SharedList({ items, nameA, nameB, square }: { items: SharedItem[]; nameA: string; nameB: string; square?: boolean }) {
  return (
    <ul className="shared">
      {items.map((it) => (
        <li key={it.id}>
          {square ? <span className="cover">{it.img && <img src={it.img} alt="" loading="lazy" />}</span> : <Avatar src={it.img} name={it.name} size={44} />}
          <span className="shared-text">
            <b>{it.name}</b>
            {it.sub && <span className="muted">{it.sub}</span>}
          </span>
          <span className="ranks">
            <span className="rank a" title={`Место у ${nameA}`}>
              {it.rankA ? `#${it.rankA}` : '—'}
            </span>
            <span className="rank b" title={`Место у ${nameB}`}>
              {it.rankB ? `#${it.rankB}` : '—'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecList({ title, recs, tone }: { title: string; recs: Rec[]; tone: 'a' | 'b' }) {
  return (
    <div className={`recs tone-${tone}`}>
      <h3>{title}</h3>
      {recs.length ? (
        <ul>
          {recs.map((r) => (
            <li key={r.id}>
              <Avatar src={r.img} name={r.name} size={40} />
              <span className="shared-text">
                <b>{r.name}</b>
                {r.sub && <span className="muted">{r.sub}</span>}
              </span>
              {r.rank && <span className="muted small">#{r.rank}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Всё, что слушает другой, вы уже знаете.</p>
      )}
    </div>
  );
}

const DNA_ROWS: { label: string; hint: string; get: (d: Dna) => string | undefined }[] = [
  { label: 'Главный жанр', hint: 'Самая большая жанровая семья', get: (d) => d.topFamily },
  { label: 'Артист №1', hint: 'Первое место в сводном топе', get: (d) => d.topArtist },
  {
    label: 'Средний год музыки',
    hint: 'Год выхода альбомов любимых треков',
    get: (d) => (d.avgYear ? String(Math.round(d.avgYear)) : undefined),
  },
  {
    label: 'Разнообразие',
    hint: 'Сколько разных исполнителей среди любимых треков',
    get: (d) => (d.variety !== undefined ? pct(d.variety) : undefined),
  },
  {
    label: 'Постоянство',
    hint: 'Какая часть свежих фаворитов была в топе и за всё время',
    get: (d) => (d.loyalty !== undefined ? pct(d.loyalty) : undefined),
  },
  {
    label: 'Треки с explicit',
    hint: 'Доля любимых треков с пометкой explicit',
    get: (d) => (d.explicitShare !== undefined ? pct(d.explicitShare) : undefined),
  },
];

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented compact" role="tablist">
      {options.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function OverlapCard({ a, b, clash }: Omit<Props, 'onBack'>) {
  const [mode, setMode] = useState<'genres' | 'artists'>(clash.venn.genres ? 'genres' : 'artists');
  const venn = mode === 'genres' ? clash.venn.genres : clash.venn.artists;
  return (
    <Section title="Пересечение вкусов" note="Площадь круга — сколько всего, перекрытие — сколько общего">
      {clash.venn.genres && (
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            ['genres', 'Жанры'],
            ['artists', 'Исполнители'],
          ]}
        />
      )}
      {venn && <VennDiagram venn={venn} nameA={a.name} nameB={b.name} unit={mode === 'genres' ? 'жанров' : 'исполнителей'} />}
    </Section>
  );
}

const share = (x: number) => pct(x);
const unit01 = (x: number) => pct(x);

function radarHabits(da: Dna, db: Dna): RadarAxis[] {
  const year = (y?: number) => (y === undefined ? undefined : Math.max(0, Math.min(1, (y - 1960) / 66)));
  const axes: (Omit<RadarAxis, 'a' | 'b'> & { a?: number; b?: number })[] = [
    { label: 'Мейнстрим', a: da.mainstream && da.mainstream / 100, b: db.mainstream && db.mainstream / 100, format: (x) => String(Math.round(x * 100)) },
    { label: 'Разнообразие', a: da.variety, b: db.variety, format: unit01 },
    { label: 'Постоянство', a: da.loyalty, b: db.loyalty, format: unit01 },
    { label: 'Фокус на любимцах', a: da.focus, b: db.focus, format: unit01 },
    { label: 'Новизна', a: year(da.avgYear), b: year(db.avgYear), format: (x) => `≈${Math.round(1960 + x * 66)}` },
    { label: 'Explicit', a: da.explicitShare, b: db.explicitShare, format: unit01 },
  ];
  return axes.filter((x): x is RadarAxis => x.a !== undefined && x.b !== undefined);
}

function RadarCard({ a, b, clash }: Omit<Props, 'onBack'>) {
  const genreAxes: RadarAxis[] = clash.families
    .filter((f) => f.family !== OTHER_FAMILY)
    .slice(0, 6)
    .map((f) => ({ label: f.family, a: f.a, b: f.b, format: share }));
  const habitAxes = radarHabits(clash.dna.a, clash.dna.b);
  const hasGenres = genreAxes.length >= 3;
  const [mode, setMode] = useState<'genres' | 'habits'>(hasGenres ? 'genres' : 'habits');
  if (!hasGenres && habitAxes.length < 3) return null;
  return (
    <Section
      title="Паутина параметров"
      note={
        mode === 'genres'
          ? 'Доля жанров во вкусе; шкала корневая, точные доли — в подсказках и таблице'
          : 'Spotify не отдаёт число прослушиваний — интенсивность оценивается по местам в топах'
      }
    >
      {hasGenres && habitAxes.length >= 3 && (
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            ['genres', 'Жанры'],
            ['habits', 'Привычки'],
          ]}
        />
      )}
      {mode === 'genres' ? (
        <Radar axes={genreAxes} nameA={a.name} nameB={b.name} sqrt />
      ) : (
        <Radar axes={habitAxes} nameA={a.name} nameB={b.name} scaleMax={1} />
      )}
    </Section>
  );
}

function hipsterTitle(h: number) {
  if (h >= 60) return 'Глубокий андерграунд';
  if (h >= 40) return 'Золотая середина';
  if (h >= 20) return 'Друг чартов';
  return 'Живой топ-50';
}

function HipsterCard({ a, b, clash }: Omit<Props, 'onBack'>) {
  const { a: da, b: db } = clash.dna;
  if (da.hipster === undefined && db.hipster === undefined) {
    return (
      <Section title="Hipster Index">
        <p className="muted">Spotify не отдал popularity для этих профилей — индекс посчитать не из чего.</p>
      </Section>
    );
  }
  const people = [
    { p: a, d: da, tone: 'a' },
    { p: b, d: db, tone: 'b' },
  ];
  return (
    <Section title="Hipster Index" note="100 − средняя популярность исполнителей в Spotify (0–100)">
      <div className="hipster-tiles">
        {people.map(({ p, d, tone }) => (
          <div className={`stat tone-${tone}`} key={tone}>
            <span className="stat-name">{p.name}</span>
            <span className="stat-num">{d.hipster !== undefined ? Math.round(d.hipster) : '—'}</span>
            {d.hipster !== undefined && <span className="stat-sub">{hipsterTitle(d.hipster)}</span>}
            {d.nicheArtist && (
              <span className="muted small">
                Самый нишевый: {d.nicheArtist.name} ({d.nicheArtist.pop})
              </span>
            )}
          </div>
        ))}
      </div>
      <MainstreamScale a={da.mainstream} b={db.mainstream} nameA={a.name} nameB={b.name} />
      {da.popHist && db.popHist && (
        <PairedBars
          axisTitle="Популярность"
          rows={POP_BUCKETS.map((label, i) => ({ label, a: da.popHist![i], b: db.popHist![i] }))}
          nameA={a.name}
          nameB={b.name}
        />
      )}
    </Section>
  );
}

export function Results({ a, b, clash, onBack }: Props) {
  const { dna } = clash;
  const dnaRows = DNA_ROWS.map((r) => ({ ...r, a: r.get(dna.a), b: r.get(dna.b) })).filter((r) => r.a || r.b);

  return (
    <main className="page results">
      <NavBar
        left={
          <button className="link-btn" onClick={onBack}>
            ‹ Назад
          </button>
        }
      >
        <ShareButton className="btn primary small" label="Поделиться" title="Наш Taste Clash" getUrl={() => clashLink(a, b)} />
      </NavBar>

      <section className="hero-result">
        <div className="duo">
          <figure className="person tone-a">
            <Avatar src={a.avatar} name={a.name} size={84} tone="a" />
            <figcaption>{a.name}</figcaption>
          </figure>
          <ScoreRing score={clash.score} />
          <figure className="person tone-b">
            <Avatar src={b.avatar} name={b.name} size={84} tone="b" />
            <figcaption>{b.name}</figcaption>
          </figure>
        </div>
        <h1 className="verdict">{clash.verdict.title}</h1>
        <p className="lead">{clash.verdict.subtitle}</p>
        <ul className="insights group">
          {clash.insights.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <div className="grid">
        <Section title="ИИ-разбор" note="Gemini смотрит на ваши различия и ищет компромисс" wide>
          <AiPanel a={a} b={b} clash={clash} />
        </Section>

        <Section title="Из чего складывается балл" note="Наведите на строку, чтобы узнать, как считается">
          <Breakdown components={clash.components} />
        </Section>

        <Section
          title="Общие исполнители"
          note={clash.sharedArtists.length ? `Места в топе: ${a.name} и ${b.name}` : undefined}
        >
          {clash.sharedArtists.length ? (
            <SharedList items={clash.sharedArtists} nameA={a.name} nameB={b.name} />
          ) : (
            <p className="muted">Пересечений нет — тем интереснее рекомендации ниже.</p>
          )}
        </Section>

        <OverlapCard a={a} b={b} clash={clash} />
        <RadarCard a={a} b={b} clash={clash} />
        <HipsterCard a={a} b={b} clash={clash} />

        {clash.decades.length > 0 && (
          <Section title="Машина времени" note="Из каких десятилетий ваши любимые треки">
            <PairedBars
              axisTitle="Десятилетие"
              rows={clash.decades.map((d) => ({ label: `${String(d.decade).slice(2)}-е`, a: d.a, b: d.b }))}
              nameA={a.name}
              nameB={b.name}
            />
          </Section>
        )}

        {clash.sharedTracks.length > 0 && (
          <Section title="Общие треки" note="Песни, которые есть в топе у обоих">
            <SharedList items={clash.sharedTracks} nameA={a.name} nameB={b.name} square />
          </Section>
        )}

        <Section title="Музыкальная ДНК" note="Привычки слушателя — по отдельности">
          <table className="dna group-table">
            <thead>
              <tr>
                <th />
                <th className="tone-a">{a.name}</th>
                <th className="tone-b">{b.name}</th>
              </tr>
            </thead>
            <tbody>
              {dnaRows.map((r) => (
                <tr key={r.label} title={r.hint}>
                  <th scope="row">{r.label}</th>
                  <td>{r.a ?? '—'}</td>
                  <td>{r.b ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Обменяйтесь музыкой" note="Любимцы одного, которых нет в топе у другого">
          <div className="recs-grid">
            <RecList title={`${b.name} советует → ${a.name}`} recs={clash.recs.forA} tone="b" />
            <RecList title={`${a.name} советует → ${b.name}`} recs={clash.recs.forB} tone="a" />
          </div>
        </Section>
      </div>

      <footer className="foot muted small">
        Данные: Spotify Web API · слепки от {new Date(a.createdAt).toLocaleDateString('ru-RU')} и{' '}
        {new Date(b.createdAt).toLocaleDateString('ru-RU')}
      </footer>
    </main>
  );
}
