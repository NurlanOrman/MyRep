import { useState } from 'react';
import { money } from './format';

/**
 * Small dependency-free charts. Colors come from CSS tokens (--series-1/2),
 * validated for light & dark surfaces; identity is never color-only (legend + tooltip + table).
 */

export interface GroupedDatum {
  label: string;
  values: number[];
}

export function GroupedBars({ data, series, height = 180 }: { data: GroupedDatum[]; series: string[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = data.flatMap((d) => d.values);
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const span = max - min;
  const W = 100 / Math.max(1, data.length);
  const zeroY = (max / span) * height;

  return (
    <div className="chart">
      <div className="legend">
        {series.map((s, i) => (
          <span key={s} className="legend-item">
            <i className={`swatch s${i + 1}`} /> {s}
          </span>
        ))}
      </div>
      <div className="bars" style={{ height }} onMouseLeave={() => setHover(null)}>
        <div className="bars-zero" style={{ top: zeroY }} />
        {data.map((d, i) => (
          <div
            key={d.label}
            className={`bar-group ${hover === i ? 'hover' : ''}`}
            style={{ width: `${W}%` }}
            onMouseEnter={() => setHover(i)}
            onTouchStart={() => setHover(i)}
            tabIndex={0}
            onFocus={() => setHover(i)}
            aria-label={`${d.label}: ${series.map((s, k) => `${s} ${money(d.values[k])}`).join(', ')}`}
          >
            {d.values.map((v, k) => {
              const h = (Math.abs(v) / span) * height;
              const top = v >= 0 ? zeroY - h : zeroY;
              return <span key={k} className={`bar s${k + 1} ${v < 0 ? 'neg' : ''}`} style={{ height: Math.max(v === 0 ? 0 : 2, h), top }} />;
            })}
            {hover === i && (
              <div className="tip" role="tooltip">
                <b>{d.label}</b>
                {series.map((s, k) => (
                  <div key={s}>
                    <i className={`swatch s${k + 1}`} /> {s}: {money(d.values[k])}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="bar-labels">
        {data.map((d) => (
          <span key={d.label} style={{ width: `${W}%` }}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Ranked horizontal bars for one measure (e.g. where the money goes). */
export function HBars({ items, format = money }: { items: { label: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((a, b) => a + b.value, 0);
  return (
    <div className="hbars">
      {items.map((i) => (
        <div key={i.label} className="hbar" title={`${i.label}: ${format(i.value)} (${total ? ((i.value / total) * 100).toFixed(0) : 0}%)`}>
          <span className="hbar-label">{i.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${(i.value / max) * 100}%` }} />
          </span>
          <span className="hbar-val">
            {format(i.value)} <small className="muted">{total ? `${((i.value / total) * 100).toFixed(0)}%` : ''}</small>
          </span>
        </div>
      ))}
    </div>
  );
}
