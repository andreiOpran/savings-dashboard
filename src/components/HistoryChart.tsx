import { useLayoutEffect, useRef, useState } from 'react';
import type { HistoryRow } from '../calc';
import { money, monthLabel } from '../format';

const SERIES = [
  { key: 'balance', label: 'Balance', cls: 's1' },
  { key: 'withReceivables', label: 'Balance + de primit', cls: 's2' },
  { key: 'goals', label: 'Needed for goals', cls: 's3' },
] as const;

const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0)!;
  const ticks: number[] = [];
  const end = Math.ceil(max / step) * step;
  for (let v = Math.floor(min / step) * step; v <= end + step * 0.001; v += step) ticks.push(v);
  return ticks;
}

const short = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : `${Math.round(v)}`);

export function HistoryChart({ rows }: { rows: HistoryRow[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const height = 260;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (rows.length === 0) {
    return <div className="empty">Add your first month to see the chart.</div>;
  }

  const values = rows.flatMap((r) => [r.balance, r.withReceivables, r.goals]);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(...values));
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];
  const iw = Math.max(10, width - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (rows.length === 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const path = (k: (typeof SERIES)[number]['key']) =>
    rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join('');

  const labelEvery = Math.ceil(rows.length / Math.max(1, Math.floor(iw / 56)));
  const last = rows.length - 1;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    rows.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i; });
    setHover(best);
  };

  const h = hover ?? null;
  const tipLeft = h !== null ? Math.min(Math.max(x(h), 90), width - 90) : 0;

  return (
    <div className="chart" ref={ref}>
      <ul className="legend" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key}><span className={`swatch ${s.cls}`} />{s.label}</li>
        ))}
      </ul>
      <div className="chart-plot">
        <svg
          width={width} height={height} role="img"
          aria-label={`Savings history, ${rows.length} months. Latest balance ${money(rows[last].balance)}.`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'baseline' : 'grid'} x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{short(t)}</text>
            </g>
          ))}
          {rows.map((r, i) => (i % labelEvery === 0 || i === last) && (i === last || last - i >= labelEvery) ? (
            <text key={r.month} className="tick" x={x(i)} y={height - 8} textAnchor="middle">
              {monthLabel(r.month, false)}{r.month.endsWith('-01') || i === 0 ? ` ’${r.month.slice(2, 4)}` : ''}
            </text>
          ) : null)}
          <path className="line s3 dashed" d={path('goals')} />
          <path className="line s2" d={path('withReceivables')} />
          <path className="line s1" d={path('balance')} />
          {h !== null && <line className="crosshair" x1={x(h)} x2={x(h)} y1={PAD.top} y2={PAD.top + ih} />}
          {SERIES.map((s) => {
            const i = h ?? last;
            return <circle key={s.key} className={`dot ${s.cls}`} cx={x(i)} cy={y(rows[i][s.key])} r={4} />;
          })}
        </svg>
        {h !== null && (
          <div className="tooltip" style={{ left: tipLeft, top: 4 }}>
            <strong>{monthLabel(rows[h].month)}</strong>
            {SERIES.map((s) => (
              <div key={s.key} className="tip-row">
                <span className={`swatch ${s.cls}`} /><span>{s.label}</span><b>{money(rows[h][s.key])}</b>
              </div>
            ))}
            <div className="tip-row total">
              <span /><span>Free after goals</span><b>{money(rows[h].untilGoals)}</b>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
