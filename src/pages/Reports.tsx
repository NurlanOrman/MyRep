import { useMemo, useRef, useState } from 'react';
import { brokerStats, evaluateLoads, inRange, monthRange, summarize } from '../engine/analytics';
import { useStore } from '../state/store';
import { fromJSON, loadsFromCSV, mergeLoads, toCSV, toJSON } from '../storage/exportImport';
import { Card, Empty, download } from '../ui/components';
import { hourly, miles, money, pct, rate } from '../ui/format';

export function ReportsPage() {
  const { data } = useStore();
  const all = useMemo(() => evaluateLoads(data.loads, data.settings), [data.loads, data.settings]);
  const brokers = useMemo(() => brokerStats(all), [all]);

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const { from, to } = monthRange(d);
    return { label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), s: summarize(inRange(all, from, to)) };
  });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="muted">Broker performance, monthly results and data export</p>
        </div>
      </div>

      <Card title="Broker ranking">
        {brokers.length === 0 ? (
          <Empty title="No broker data yet">
            <p>Save loads with a broker name to build stats. Set invoiced/paid dates to track payment days.</p>
          </Empty>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Broker</th>
                  <th>Loads</th>
                  <th>Hauled</th>
                  <th>Avg gross</th>
                  <th>Avg profit</th>
                  <th>Profit / mi</th>
                  <th>Rate / mi</th>
                  <th>Pay days</th>
                  <th>Cancel %</th>
                  <th>Avg score</th>
                </tr>
              </thead>
              <tbody>
                {brokers.map((b, i) => (
                  <tr key={b.broker}>
                    <td>{i + 1}</td>
                    <td>
                      <b>{b.broker}</b>
                    </td>
                    <td>{b.quotes}</td>
                    <td>{b.hauled}</td>
                    <td>{money(b.avgGross)}</td>
                    <td className={b.avgProfit >= 0 ? 'pos' : 'neg'}>{money(b.avgProfit)}</td>
                    <td>{rate(b.avgProfitPerMile)}</td>
                    <td>{rate(b.avgRatePerMile)}</td>
                    <td>{b.avgPaymentDays != null ? b.avgPaymentDays.toFixed(0) : '—'}</td>
                    <td>{b.cancellationRatePct != null ? pct(b.cancellationRatePct, 0) : '—'}</td>
                    <td>{b.avgScore != null ? b.avgScore.toFixed(0) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="note">Rate stats include every priced, non-cancelled load (offers too). Averages per mile are Σ profit ÷ Σ miles. Ranked by average score.</p>
      </Card>

      <Card title="Monthly results (booked & completed)">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Loads</th>
                <th>Gross</th>
                <th>Expenses</th>
                <th>Op. profit</th>
                <th>Econ. profit</th>
                <th>Miles</th>
                <th>Deadhead</th>
                <th>$/mi</th>
                <th>$/hr</th>
              </tr>
            </thead>
            <tbody>
              {months.map(({ label, s }) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{s.loads}</td>
                  <td>{money(s.gross)}</td>
                  <td>{money(s.totalCost)}</td>
                  <td className={s.operating >= 0 ? 'pos' : 'neg'}>{money(s.operating)}</td>
                  <td className={s.economic >= 0 ? 'pos' : 'neg'}>{money(s.economic)}</td>
                  <td>{miles(s.totalMiles)}</td>
                  <td>{pct(s.deadheadPct, 0)}</td>
                  <td>{rate(s.avgProfitPerMile)}</td>
                  <td>{hourly(s.avgProfitPerHour)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <DataTools />
    </div>
  );
}

export function DataTools() {
  const { data, replaceData, activeProfile } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const stamp = new Date().toISOString().slice(0, 10);
  const rows = () => evaluateLoads(data.loads, data.settings);

  const onFile = async (file: File) => {
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith('.json')) {
        const incoming = fromJSON(text);
        if (!confirm(`Restore backup with ${incoming.loads.length} loads? This replaces settings and merges loads.`)) return;
        replaceData({ ...incoming, loads: mergeLoads(data.loads, incoming.loads), draft: data.draft });
        setMsg(`Restored ${incoming.loads.length} loads and settings.`);
      } else {
        const loads = loadsFromCSV(text, data.settings, activeProfile);
        replaceData({ ...data, loads: mergeLoads(data.loads, loads) });
        setMsg(`Imported ${loads.length} loads from CSV (cost assumptions from current Settings).`);
      }
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <Card title="Export & import">
      <div className="btn-row">
        <button className="btn" onClick={() => download(`loads-${stamp}.csv`, toCSV(rows()), 'text/csv;charset=utf-8')}>
          Export CSV
        </button>
        <button className="btn" onClick={() => download(`loads-excel-${stamp}.csv`, toCSV(rows(), { excel: true }), 'text/csv;charset=utf-8')}>
          Export for Excel
        </button>
        <button className="btn" onClick={() => download(`load-profit-backup-${stamp}.json`, toJSON(data), 'application/json')}>
          Backup (JSON)
        </button>
        <button className="btn outline" onClick={() => fileRef.current?.click()}>
          Import CSV / JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
      </div>
      {msg && <p className="note" role="status">{msg}</p>}
      <p className="note">Data is stored on this device (browser storage). Back up regularly — clearing Safari data deletes it.</p>
    </Card>
  );
}
