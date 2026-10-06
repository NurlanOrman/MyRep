import { useMemo, useState } from 'react';
import { applyScenario, compareScenario, type ScenarioOverrides } from '../engine/scenario';
import { useStore } from '../state/store';
import { Card, Empty } from '../ui/components';
import { cents, hourly, money, rate, route, signed, signedMoney } from '../ui/format';
import { navigate } from '../ui/router';
import { decisionTone } from './calculator/ResultSummary';

interface Knob {
  key: keyof ScenarioOverrides;
  label: string;
  base: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}

export function WhatIfPage() {
  const { data, draft, updateDraft } = useStore();
  const [o, setO] = useState<ScenarioOverrides>({});
  const cmp = useMemo(() => compareScenario(draft, o, data.settings), [draft, o, data.settings]);
  const b = cmp.base;

  if (!b.ready) {
    return (
      <div className="page">
        <h1>What if?</h1>
        <Empty title="Enter a load first">
          <button className="btn primary" onClick={() => navigate('calc')}>
            Go to calculator
          </button>
        </Empty>
      </div>
    );
  }

  const baseGross = draft.revenue.mode === 'total' ? draft.revenue.totalGross : draft.revenue.brokerRate;
  const knobs: Knob[] = [
    { key: 'dieselPrice', label: 'Diesel price', base: draft.fuel.dieselPrice, min: 2.5, max: 6.5, step: 0.05, fmt: (v) => `${cents(v)}/gal` },
    { key: 'mpg', label: 'MPG', base: draft.fuel.mpg, min: 4, max: 20, step: 0.1, fmt: (v) => v.toFixed(2) },
    { key: 'brokerRate', label: draft.revenue.mode === 'total' ? 'Total gross' : 'Broker rate', base: baseGross, min: 0, max: Math.max(1000, Math.round(baseGross * 2)), step: 25, fmt: money },
    { key: 'loadedMiles', label: 'Loaded miles', base: draft.loadedMiles, min: 0, max: Math.max(500, draft.loadedMiles * 2), step: 5, fmt: (v) => `${Math.round(v)} mi` },
    { key: 'deadheadMiles', label: 'Deadhead miles', base: draft.deadheadMiles, min: 0, max: Math.max(500, draft.deadheadMiles * 2), step: 5, fmt: (v) => `${Math.round(v)} mi` },
    { key: 'hours', label: 'Work hours', base: Math.round(b.hours.total * 10) / 10, min: 0, max: Math.max(40, Math.ceil(b.hours.total * 2)), step: 0.5, fmt: (v) => `${v.toFixed(1)} h` },
    { key: 'maintenancePerMile', label: 'Maintenance $/mi', base: draft.assumptions.maintenancePerMile, min: 0, max: 0.6, step: 0.01, fmt: (v) => `${cents(v)}/mi` },
    { key: 'insuranceMonthlyDelta', label: 'Insurance change / month', base: 0, min: -1000, max: 2000, step: 50, fmt: (v) => signedMoney(v) },
    { key: 'targetHourlyRate', label: 'Your target hourly rate', base: draft.assumptions.targetHourlyRate, min: 0, max: 100, step: 1, fmt: (v) => `${money(v)}/h` },
  ];

  const s = cmp.scenario;
  const rows: [string, string, string, string, number][] = [
    ['Gross', money(b.revenue.gross), money(s.revenue.gross), signedMoney(cmp.delta.gross), cmp.delta.gross],
    ['Total cost', money(b.costs.totalCost), money(s.costs.totalCost), signedMoney(cmp.delta.totalCost), -cmp.delta.totalCost],
    ['Operating profit', money(b.profit.operating), money(s.profit.operating), signedMoney(cmp.delta.operating), cmp.delta.operating],
    ['Economic profit', money(b.profit.economic), money(s.profit.economic), signedMoney(cmp.delta.economic), cmp.delta.economic],
    ['Profit / mile', rate(b.perMile.operatingPerTotal), rate(s.perMile.operatingPerTotal), signed(cmp.delta.operatingPerMile, rate), cmp.delta.operatingPerMile],
    ['Profit / hour', hourly(b.perHour.operating), hourly(s.perHour.operating), cmp.delta.operatingPerHour == null ? '—' : signed(cmp.delta.operatingPerHour, hourly), cmp.delta.operatingPerHour ?? 0],
    ['Minimum rate', money(b.breakEven.minimumRounded), money(s.breakEven.minimumRounded), signedMoney(s.breakEven.minimumRounded - b.breakEven.minimumRounded), b.breakEven.minimumRounded - s.breakEven.minimumRounded],
    ['Load score', String(b.score?.total ?? '—'), String(s.score?.total ?? '—'), cmp.delta.score == null ? '—' : signed(cmp.delta.score, (x) => x.toFixed(0)), cmp.delta.score ?? 0],
  ];

  const changed = Object.keys(o).length > 0;

  return (
    <div className="page whatif">
      <div className="page-head">
        <div>
          <h1>What if?</h1>
          <p className="muted">
            {draft.broker || 'Current load'} · {route(draft)}
          </p>
        </div>
        <button className="btn ghost" onClick={() => navigate('calc')}>
          ← Back
        </button>
      </div>

      <div className="whatif-grid">
        <Card title="Change assumptions" actions={changed && <button className="btn ghost small" onClick={() => setO({})}>Reset</button>}>
          <div className="knobs">
            {knobs.map((k) => {
              const v = (o[k.key] as number | undefined) ?? k.base;
              const isChanged = o[k.key] !== undefined && Math.abs(v - k.base) > 1e-9;
              return (
                <label key={k.key} className={`knob ${isChanged ? 'changed' : ''}`}>
                  <span className="knob-top">
                    <span>{k.label}</span>
                    <span className="knob-val">
                      {isChanged && <s className="muted">{k.fmt(k.base)}</s>} {k.fmt(v)}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={Math.min(k.min, k.base)}
                    max={Math.max(k.max, k.base)}
                    step={k.step}
                    value={v}
                    onChange={(e) => setO((prev) => ({ ...prev, [k.key]: Number(e.target.value) }))}
                  />
                </label>
              );
            })}
          </div>
        </Card>

        <div className="whatif-result">
          <div className={`decision small tone-${decisionTone(s.decision.decision)}`}>
            <div className="decision-main">
              <div className="decision-kicker">Scenario decision</div>
              <div className="decision-word">{s.decision.decision ?? '—'}</div>
              <div className="decision-headline">{s.decision.headline}</div>
            </div>
          </div>
          <div className="big-delta">
            <span>Operating profit</span>
            <strong>
              {money(b.profit.operating)} → {money(s.profit.operating)}
            </strong>
            <em className={cmp.delta.operating >= 0 ? 'pos' : 'neg'}>Difference: {signedMoney(cmp.delta.operating)}</em>
          </div>
          <Card>
            <table className="table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Now</th>
                  <th>What if</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, base, scen, delta, goodness]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{base}</td>
                    <td>
                      <b>{scen}</b>
                    </td>
                    <td className={Math.abs(goodness) < 0.005 ? '' : goodness > 0 ? 'pos' : 'neg'}>{delta}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          {changed && (
            <button
              className="btn primary block"
              onClick={() => {
                updateDraft((d) => applyScenario(d, o));
                setO({});
                navigate('calc');
              }}
            >
              Apply to load
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
