import { useMemo } from 'react';
import { bestIndex, COMPARE_METRICS, compareInsight, evaluateLoads, overallBest, type CompareMetric } from '../engine/analytics';
import { useStore } from '../state/store';
import { Card, Empty } from '../ui/components';
import { hourly, miles, money, pct, rate, route, shortDate } from '../ui/format';
import { navigate } from '../ui/router';
import { decisionTone } from './calculator/ResultSummary';
import { loadDateKey } from '../engine/analytics';

const fmt = (m: CompareMetric, v: number | null) => {
  if (v == null) return '—';
  switch (m.format) {
    case 'money':
      return money(v);
    case 'rate':
      return rate(v);
    case 'hourly':
      return hourly(v);
    case 'pct':
      return pct(v, 0);
    case 'miles':
      return m.key === 'hours' ? v.toFixed(1) : miles(v);
    case 'score':
      return String(v);
  }
};

export function ComparePage() {
  const { data, compareIds, toggleCompare, setCompareIds, editLoad } = useStore();
  const all = useMemo(() => evaluateLoads(data.loads, data.settings), [data.loads, data.settings]);
  const rows = compareIds.map((id) => all.find((r) => r.load.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
  const names = rows.map((_, i) => `Load ${String.fromCharCode(65 + i)}`);
  const best = overallBest(rows);
  const insight = compareInsight(rows, names);
  const candidates = all.filter((r) => r.result.ready).slice(0, 30);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Compare loads</h1>
          <p className="muted">Pick up to 4 saved loads. Best value in each row is highlighted.</p>
        </div>
        {rows.length > 0 && (
          <button className="btn ghost" onClick={() => setCompareIds([])}>
            Clear
          </button>
        )}
      </div>

      {rows.length >= 2 && best >= 0 && (
        <div className={`winner tone-${decisionTone(rows[best].result.decision.decision)}`}>
          <span className="winner-kicker">Best option</span>
          <strong>
            {names[best]} — {rows[best].load.broker || 'No broker'}
          </strong>
          <span>
            Score {rows[best].result.score?.total} · {money(rows[best].result.profit.operating)} profit · {hourly(rows[best].result.perHour.operating)}
          </span>
          {insight && <p className="insight">💡 {insight}</p>}
        </div>
      )}

      {rows.length > 0 ? (
        <Card className="scroll-x">
          <table className="table compare">
            <thead>
              <tr>
                <th>Metric</th>
                {rows.map((r, i) => (
                  <th key={r.load.id} className={i === best ? 'best-col' : ''}>
                    <div className="cmp-name">
                      {names[i]} {i === best && rows.length > 1 ? '★' : ''}
                    </div>
                    <div className="cmp-sub">{r.load.broker || '—'}</div>
                    <div className="cmp-sub">{route(r.load)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_METRICS.map((m) => {
                const values = rows.map((r) => m.get(r.result));
                const bi = bestIndex(values, m.higherIsBetter);
                return (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    {values.map((v, i) => (
                      <td key={i} className={`${i === bi ? 'best' : ''} ${i === best ? 'best-col' : ''}`}>
                        {fmt(m, v)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td>Decision</td>
                {rows.map((r, i) => (
                  <td key={i} className={i === best ? 'best-col' : ''}>
                    <span className={`pill tone-${decisionTone(r.result.decision.decision)}`}>{r.result.decision.decision ?? '—'}</span>
                  </td>
                ))}
              </tr>
              <tr>
                <td />
                {rows.map((r, i) => (
                  <td key={i} className={i === best ? 'best-col' : ''}>
                    <button className="btn small ghost" onClick={() => { editLoad(r.load.id); navigate('calc'); }}>
                      Open
                    </button>
                    <button className="btn small ghost" onClick={() => toggleCompare(r.load.id)}>
                      Remove
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </Card>
      ) : (
        <Empty title="Nothing to compare yet">
          <p>Save broker offers from the calculator, then tick them below.</p>
        </Empty>
      )}

      <Card title="Saved loads">
        {candidates.length === 0 ? (
          <p className="muted">No saved loads.</p>
        ) : (
          <ul className="pick-list">
            {candidates.map(({ load, result }) => {
              const on = compareIds.includes(load.id);
              return (
                <li key={load.id}>
                  <label className={`pick ${on ? 'on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggleCompare(load.id)} />
                    <span className="pick-main">
                      <b>{load.broker || 'No broker'}</b> · {route(load)}
                      <small>
                        {shortDate(loadDateKey(load))} · {money(result.revenue.gross)} · {miles(result.miles.total)} mi · score {result.score?.total ?? '—'}
                      </small>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
