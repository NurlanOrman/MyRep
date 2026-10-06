import { useMemo, useState } from 'react';
import { evaluateLoads, filterLoads, loadDateKey, type EvaluatedLoad, type LoadFilters } from '../engine/analytics';
import type { LoadStatus } from '../engine/types';
import { useStore } from '../state/store';
import { Card, Empty, NumberField, SelectField, TextField } from '../ui/components';
import { hourly, miles, money, rate, route, shortDate } from '../ui/format';
import { navigate } from '../ui/router';
import { scoreTone } from './calculator/ResultSummary';

type SortKey = 'date' | 'gross' | 'profit' | 'ppm' | 'pph' | 'score' | 'miles';

const SORTS: { value: SortKey; label: string; get: (r: EvaluatedLoad) => number | string }[] = [
  { value: 'date', label: 'Newest', get: (r) => loadDateKey(r.load) },
  { value: 'profit', label: 'Profit', get: (r) => r.result.profit.operating },
  { value: 'ppm', label: 'Profit / mile', get: (r) => r.result.perMile.operatingPerTotal },
  { value: 'pph', label: 'Profit / hour', get: (r) => r.result.perHour.operating ?? -Infinity },
  { value: 'score', label: 'Score', get: (r) => r.result.score?.total ?? -1 },
  { value: 'gross', label: 'Gross', get: (r) => r.result.revenue.gross },
  { value: 'miles', label: 'Miles', get: (r) => r.result.miles.total },
];

const STATUS_LABEL: Record<LoadStatus, string> = {
  offer: 'Offer',
  booked: 'Booked',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export function LoadsPage() {
  const { data, editLoad, duplicateLoad, deleteLoad, toggleCompare, compareIds, newDraft, upsertLoad } = useStore();
  const [f, setF] = useState<LoadFilters>({});
  const [sort, setSort] = useState<SortKey>('date');
  const [showFilters, setShowFilters] = useState(false);
  const all = useMemo(() => evaluateLoads(data.loads, data.settings), [data.loads, data.settings]);
  const brokers = useMemo(() => [...new Set(data.loads.map((l) => l.broker.trim()).filter(Boolean))].sort(), [data.loads]);

  const rows = useMemo(() => {
    const s = SORTS.find((x) => x.value === sort)!;
    return filterLoads(all, f).sort((a, b) => {
      const va = s.get(a);
      const vb = s.get(b);
      return va < vb ? 1 : va > vb ? -1 : 0;
    });
  }, [all, f, sort]);

  const set = (patch: Partial<LoadFilters>) => setF((x) => ({ ...x, ...patch }));
  const active = Object.values(f).filter((v) => v !== undefined && v !== null && v !== '').length;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Loads</h1>
          <p className="muted">
            {rows.length} of {all.length} loads
          </p>
        </div>
        <button className="btn primary" onClick={() => { newDraft(); navigate('calc'); }}>
          + New load
        </button>
      </div>

      <div className="toolbar">
        <input className="search" type="search" placeholder="Search broker, city, load #…" value={f.search ?? ''} onChange={(e) => set({ search: e.target.value })} aria-label="Search loads" />
        <button className={`btn ${active ? 'outline' : 'ghost'}`} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          Filters{active ? ` (${active})` : ''}
        </button>
        <select className="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {showFilters && (
        <Card>
          <div className="form-grid">
            <TextField label="From" type="date" value={f.from ?? ''} onChange={(v) => set({ from: v })} />
            <TextField label="To" type="date" value={f.to ?? ''} onChange={(v) => set({ to: v })} />
            <SelectField label="Broker" value={f.broker ?? ''} onChange={(v) => set({ broker: v })} options={[{ value: '', label: 'All brokers' }, ...brokers.map((b) => ({ value: b, label: b }))]} />
            <TextField label="State (origin or dest.)" value={f.state ?? ''} onChange={(v) => set({ state: v })} maxLength={2} upper />
            <SelectField
              label="Status"
              value={(f.status ?? '') as LoadStatus | ''}
              onChange={(v) => set({ status: v })}
              options={[{ value: '', label: 'All' }, ...(Object.keys(STATUS_LABEL) as LoadStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
            />
            <NumberField label="Min profit" prefix="$" nullable value={f.minProfit ?? null} onChange={(v) => set({ minProfit: v })} />
            <NumberField label="Min rate / total mile" prefix="$" nullable value={f.minRatePerMile ?? null} onChange={(v) => set({ minRatePerMile: v })} />
            <NumberField label="Min miles" nullable value={f.minMiles ?? null} onChange={(v) => set({ minMiles: v })} />
            <NumberField label="Max miles" nullable value={f.maxMiles ?? null} onChange={(v) => set({ maxMiles: v })} />
            <NumberField label="Min score" nullable value={f.minScore ?? null} onChange={(v) => set({ minScore: v })} />
          </div>
          <button className="btn ghost small" onClick={() => setF({})}>
            Clear filters
          </button>
        </Card>
      )}

      {rows.length === 0 ? (
        <Empty title={all.length ? 'No loads match' : 'No saved loads yet'}>
          <p>{all.length ? 'Try clearing filters.' : 'Calculate a broker offer and tap Save load.'}</p>
        </Empty>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="scroll-x only-desktop">
            <table className="table loads">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Broker</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Gross</th>
                  <th>Miles</th>
                  <th>Expenses</th>
                  <th>Profit</th>
                  <th>$/mi</th>
                  <th>$/hr</th>
                  <th>Score</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ load, result: r }) => (
                  <tr key={load.id}>
                    <td>{shortDate(loadDateKey(load))}</td>
                    <td>{load.broker || '—'}</td>
                    <td>{route(load)}</td>
                    <td>
                      <select className="status-select" value={load.status} aria-label="Status" onChange={(e) => upsertLoad({ ...load, status: e.target.value as LoadStatus, updatedAt: new Date().toISOString() })}>
                        {(Object.keys(STATUS_LABEL) as LoadStatus[]).map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{money(r.revenue.gross)}</td>
                    <td>{miles(r.miles.total)}</td>
                    <td>{money(r.costs.totalCost)}</td>
                    <td className={r.profit.operating >= 0 ? 'pos' : 'neg'}>{money(r.profit.operating)}</td>
                    <td>{rate(r.perMile.operatingPerTotal)}</td>
                    <td>{hourly(r.perHour.operating)}</td>
                    <td>
                      <span className={`pill tone-${scoreTone(r.score?.tone)}`}>{r.score?.total ?? '—'}</span>
                    </td>
                    <td className="row-actions">
                      <button className="btn small ghost" onClick={() => { editLoad(load.id); navigate('calc'); }}>Open</button>
                      <button className={`btn small ghost ${compareIds.includes(load.id) ? 'on' : ''}`} onClick={() => toggleCompare(load.id)}>
                        {compareIds.includes(load.id) ? '✓ Compare' : 'Compare'}
                      </button>
                      <button className="btn small ghost" onClick={() => { duplicateLoad(load.id); navigate('calc'); }}>Copy</button>
                      <button className="btn small ghost danger" onClick={() => confirm('Delete this load?') && deleteLoad(load.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <ul className="load-cards only-mobile">
            {rows.map(({ load, result: r }) => (
              <li key={load.id} className="load-card">
                <button className="load-card-main" onClick={() => { editLoad(load.id); navigate('calc'); }}>
                  <div className="lc-top">
                    <span className="lc-broker">{load.broker || 'No broker'}</span>
                    <span className={`pill tone-${scoreTone(r.score?.tone)}`}>{r.score?.total ?? '—'}</span>
                  </div>
                  <div className="lc-route">{route(load)}</div>
                  <div className="lc-stats">
                    <span><small>Gross</small>{money(r.revenue.gross)}</span>
                    <span><small>Profit</small><b className={r.profit.operating >= 0 ? 'pos' : 'neg'}>{money(r.profit.operating)}</b></span>
                    <span><small>$/mi</small>{rate(r.perMile.operatingPerTotal)}</span>
                    <span><small>$/hr</small>{hourly(r.perHour.operating)}</span>
                  </div>
                  <div className="lc-meta">
                    {shortDate(loadDateKey(load))} · {miles(r.miles.total)} mi · {STATUS_LABEL[load.status]}
                  </div>
                </button>
                <div className="lc-actions">
                  <button className={`btn small ghost ${compareIds.includes(load.id) ? 'on' : ''}`} onClick={() => toggleCompare(load.id)}>
                    {compareIds.includes(load.id) ? '✓ Compare' : 'Compare'}
                  </button>
                  <button className="btn small ghost" onClick={() => { duplicateLoad(load.id); navigate('calc'); }}>Copy</button>
                  <button className="btn small ghost danger" onClick={() => confirm('Delete this load?') && deleteLoad(load.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
