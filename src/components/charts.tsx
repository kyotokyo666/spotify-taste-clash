import { useId } from 'react';
import type { Component } from '../lib/compare';
import { pct, useTooltip } from './ui';

interface Names {
  nameA: string;
  nameB: string;
}

export function Legend({ nameA, nameB }: Names) {
  return (
    <div className="legend">
      <span>
        <i className="swatch a" /> {nameA}
      </span>
      <span>
        <i className="swatch b" /> {nameB}
      </span>
    </div>
  );
}

/** Главная цифра: кольцо + число. Кольцо — декор, число читается и без него. */
export function ScoreRing({ score }: { score: number }) {
  const r = 84;
  const c = 2 * Math.PI * r;
  const gradient = useId();
  return (
    <div className="score-ring" role="img" aria-label={`Совместимость ${score} процентов`}>
      <svg viewBox="0 0 200 200" aria-hidden>
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" className="ring-stop-1" />
            <stop offset="100%" className="ring-stop-2" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={r} className="ring-track" />
        <circle
          cx="100"
          cy="100"
          r={r}
          stroke={`url(#${gradient})`}
          className="ring-fill"
          strokeDasharray={`${(c * score) / 100} ${c}`}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="score-value">
        <span className="num">{score}</span>
        <span className="unit">%</span>
      </div>
    </div>
  );
}

export function Breakdown({ components }: { components: Component[] }) {
  const { bind, node } = useTooltip();
  return (
    <div className="breakdown">
      {components.map((c) => (
        <div className="meter-row" key={c.key} {...bind(<><b>{c.label}</b><br />{c.hint}</>)}>
          <span className="meter-label">{c.label}</span>
          <span className="meter-track">
            {c.value !== undefined && <span className="meter-fill" style={{ width: pct(c.value) }} />}
          </span>
          <span className="meter-value">{c.value !== undefined ? pct(c.value) : 'нет данных'}</span>
        </div>
      ))}
      {node}
    </div>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="table-view">
      <summary>Показать таблицей</summary>
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={String(r[0])}>
              {r.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export interface PairRow {
  label: string;
  a: number;
  b: number;
}

/** Сгруппированные столбцы A/B: эпохи, корзины популярности. */
export function PairedBars({
  rows,
  nameA,
  nameB,
  axisTitle,
  format = pct,
}: { rows: PairRow[]; axisTitle: string; format?: (x: number) => string } & Names) {
  const { bind, node } = useTooltip();
  const max = Math.max(...rows.flatMap((r) => [r.a, r.b]), 0.01);
  return (
    <figure className="chart">
      <Legend nameA={nameA} nameB={nameB} />
      <div className="pairs">
        {rows.map((r) => (
          <div
            className="pair-col"
            key={r.label}
            {...bind(
              <>
                <b>{r.label}</b>
                <br />
                {nameA}: {format(r.a)} · {nameB}: {format(r.b)}
              </>,
            )}
          >
            <div className="pair-bars">
              <span className="pair-bar a" style={{ height: `${(r.a / max) * 100}%` }} />
              <span className="pair-bar b" style={{ height: `${(r.b / max) * 100}%` }} />
            </div>
            <span className="pair-label">{r.label}</span>
          </div>
        ))}
      </div>
      <DataTable head={[axisTitle, nameA, nameB]} rows={rows.map((r) => [r.label, format(r.a), format(r.b)])} />
      {node}
    </figure>
  );
}

export interface RadarAxis {
  label: string;
  a: number;
  b: number;
  /** Как показывать сырое значение в тултипе и таблице. */
  format: (x: number) => string;
}

/**
 * «Паутина» на 3–8 осей. Значения нормируются на общий максимум по оси scaleMax
 * (для жанров — относительно самой большой доли, для привычек — шкала 0..1).
 * sqrt-шкала не даёт одной доминирующей доле схлопнуть остальные оси в центр.
 */
export function Radar({
  axes,
  nameA,
  nameB,
  scaleMax,
  sqrt,
}: { axes: RadarAxis[]; scaleMax?: number; sqrt?: boolean } & Names) {
  const { bind, node } = useTooltip();
  const size = 340;
  const c = size / 2;
  const R = 112;
  const max = scaleMax ?? Math.max(...axes.flatMap((x) => [x.a, x.b]), 0.01);
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / axes.length;
  const point = (i: number, v: number) => {
    const k = Math.min(v, max) / max;
    const r = (sqrt ? Math.sqrt(k) : k) * R;
    return [c + r * Math.cos(angle(i)), c + r * Math.sin(angle(i))] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => point(i, v).join(',')).join(' ');
  const tip = (ax: RadarAxis) => (
    <>
      <b>{ax.label}</b>
      <br />
      {nameA}: {ax.format(ax.a)} · {nameB}: {ax.format(ax.b)}
    </>
  );

  return (
    <figure className="chart">
      <Legend nameA={nameA} nameB={nameB} />
      <svg className="radar" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Радар: ${axes.map((x) => x.label).join(', ')}`}>
        {[0.25, 0.5, 0.75, 1].map((k) => (
          <polygon key={k} className="radar-ring" points={poly(axes.map(() => max * (sqrt ? k * k : k)))} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, max);
          return <line key={i} className="radar-axis" x1={c} y1={c} x2={x} y2={y} />;
        })}
        {(['a', 'b'] as const).map((s) => (
          <polygon key={s} className={`radar-shape ${s}`} points={poly(axes.map((x) => x[s]))} />
        ))}
        {(['a', 'b'] as const).map((s) =>
          axes.map((ax, i) => {
            const [x, y] = point(i, ax[s]);
            return <circle key={`${s}${i}`} className={`radar-dot ${s}`} cx={x} cy={y} r={4} />;
          }),
        )}
        {axes.map((ax, i) => {
          const cos = Math.cos(angle(i));
          const sin = Math.sin(angle(i));
          const lx = c + (R + 16) * cos;
          const ly = c + (R + 16) * sin;
          const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
          return (
            <g key={ax.label} className="radar-hit" {...bind(tip(ax))}>
              {/* Невидимая зона наведения вдоль всей оси — больше, чем сами точки. */}
              <line x1={c} y1={c} x2={c + (R + 4) * cos} y2={c + (R + 4) * sin} className="radar-hit-line" />
              <text x={lx} y={ly + (sin > 0.3 ? 10 : sin < -0.3 ? -2 : 4)} textAnchor={anchor} className="radar-label">
                {ax.label}
              </text>
            </g>
          );
        })}
      </svg>
      <DataTable head={['Ось', nameA, nameB]} rows={axes.map((x) => [x.label, x.format(x.a), x.format(x.b)])} />
      {node}
    </figure>
  );
}

/** Шкала андерграунд ↔ мейнстрим с двумя отметками. */
export function MainstreamScale({ a, b, nameA, nameB }: { a?: number; b?: number } & Names) {
  const { bind, node } = useTooltip();
  const marks = [
    { key: 'a', v: a, name: nameA },
    { key: 'b', v: b, name: nameB },
  ].filter((m): m is { key: string; v: number; name: string } => m.v !== undefined);
  if (!marks.length) return null;
  return (
    <div className="scale">
      <div className="scale-track">
        {marks.map((m) => (
          <span
            key={m.key}
            className={`scale-mark ${m.key}`}
            style={{ left: `${m.v}%` }}
            {...bind(
              <>
                <b>{m.name}</b>: популярность {Math.round(m.v)} из 100
              </>,
            )}
          >
            <span className="scale-name">{m.name}</span>
          </span>
        ))}
      </div>
      <div className="scale-ends">
        <span>андерграунд</span>
        <span>мейнстрим</span>
      </div>
      {node}
    </div>
  );
}
