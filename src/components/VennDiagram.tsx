import { useState } from 'react';
import type { Venn, VennBranch } from '../lib/compare';
import { Legend } from './charts';
import { useTooltip } from './ui';

/** Площадь линзы — пересечения двух кругов радиусов r1, r2 на расстоянии d. */
export function lensArea(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;
  const a1 = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const a2 = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const tri = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return a1 + a2 - tri;
}

/** Расстояние между центрами, при котором пересечение имеет заданную площадь (бисекция: площадь убывает по d). */
export function distanceForOverlap(r1: number, r2: number, target: number): number {
  let lo = Math.abs(r1 - r2);
  let hi = r1 + r2;
  if (target <= 0) return hi;
  if (target >= Math.PI * Math.min(r1, r2) ** 2) return lo;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (lensArea(r1, r2, mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

type Region = 'onlyA' | 'both' | 'onlyB';

const MAX_BRANCHES = 5;
const MAX_ITEMS = 6;

function Tree({ branches }: { branches: VennBranch[] }) {
  if (!branches.length) return <p className="muted small">Пусто</p>;
  return (
    <ul className="tree">
      {branches.slice(0, MAX_BRANCHES).map((br) => (
        <li key={br.group || 'all'}>
          {br.group && <span className="tree-group">{br.group}</span>}
          <span className="tree-items">
            {br.items.slice(0, MAX_ITEMS).map((it) => (
              <span className="chip" key={it}>
                {it}
              </span>
            ))}
            {br.items.length > MAX_ITEMS && <span className="muted small">+{br.items.length - MAX_ITEMS}</span>}
          </span>
        </li>
      ))}
      {branches.length > MAX_BRANCHES && (
        <li className="muted small">и ещё {branches.length - MAX_BRANCHES} {branches[0].group ? 'семей' : ''}</li>
      )}
    </ul>
  );
}

/**
 * Диаграмма Эйлера–Венна с площадями, пропорциональными числу элементов:
 * размер круга — сколько всего у человека, перекрытие — сколько общего.
 */
export function VennDiagram({ venn, nameA, nameB, unit }: { venn: Venn; nameA: string; nameB: string; unit: string }) {
  const { bind, node } = useTooltip();
  const [region, setRegion] = useState<Region>('both');
  const { onlyA, both, onlyB } = venn.counts;
  const totalA = onlyA + both;
  const totalB = onlyB + both;

  const W = 360;
  const H = 210;
  const maxR = 92;
  const k = maxR / Math.sqrt(Math.max(totalA, totalB, 1) / Math.PI);
  // Минимальный радиус — чтобы крошечный профиль оставался видимым; пропорции при этом чуть искажаются.
  const rA = Math.max(28, k * Math.sqrt(totalA / Math.PI));
  const rB = Math.max(28, k * Math.sqrt(totalB / Math.PI));
  const d = both ? distanceForOverlap(rA, rB, both * k * k) : rA + rB + 12;
  const left = (W - (rA + d + rB)) / 2;
  const cxA = left + rA;
  const cxB = cxA + d;
  const cy = H / 2;

  const edgeAL = cxA - rA;
  const edgeAR = cxA + rA;
  const edgeBL = cxB - rB;
  const edgeBR = cxB + rB;
  const labelX: Record<Region, number> = {
    onlyA: (edgeAL + Math.max(edgeAL + 24, Math.min(edgeBL, edgeAR))) / 2,
    both: (Math.max(edgeBL, edgeAL) + Math.min(edgeAR, edgeBR)) / 2,
    onlyB: (Math.min(edgeBR - 24, Math.max(edgeAR, edgeBL)) + edgeBR) / 2,
  };
  const regions: { key: Region; count: number; title: string }[] = [
    { key: 'onlyA', count: onlyA, title: `Только у ${nameA}` },
    { key: 'both', count: both, title: 'Общее' },
    { key: 'onlyB', count: onlyB, title: `Только у ${nameB}` },
  ];

  return (
    <figure className="chart venn">
      <Legend nameA={nameA} nameB={nameB} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Венн: ${onlyA} только у ${nameA}, ${both} общих, ${onlyB} только у ${nameB}`}>
        <circle className="venn-circle a" cx={cxA} cy={cy} r={rA} />
        <circle className="venn-circle b" cx={cxB} cy={cy} r={rB} />
        {regions.map((r) => (
          <g
            key={r.key}
            className={`venn-region ${region === r.key ? 'active' : ''}`}
            onClick={() => setRegion(r.key)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setRegion(r.key)}
            role="button"
            aria-pressed={region === r.key}
            {...bind(
              <>
                <b>{r.title}</b>: {r.count} {unit}
                <br />
                Нажмите, чтобы раскрыть список
              </>,
            )}
          >
            <rect x={labelX[r.key] - 26} y={cy - 26} width={52} height={52} rx={10} className="venn-hit" />
            <text x={labelX[r.key]} y={cy + 9} textAnchor="middle" className="venn-count">
              {r.count}
            </text>
          </g>
        ))}
      </svg>
      <div className="segmented" role="tablist">
        {regions.map((r) => (
          <button key={r.key} role="tab" aria-selected={region === r.key} className={region === r.key ? 'on' : ''} onClick={() => setRegion(r.key)}>
            <i className={`swatch ${r.key === 'onlyA' ? 'a' : r.key === 'onlyB' ? 'b' : 'ab'}`} /> {r.title} · {r.count}
          </button>
        ))}
      </div>
      <Tree branches={venn[region]} />
      {node}
    </figure>
  );
}
