import { useMemo, useState } from 'react';
import { evaluateLoads, inRange, monthRange, summarize, weeklySeries, weekRange } from '../engine/analytics';
import { useStore } from '../state/store';
import { Card, Metric, Progress } from '../ui/components';
import { GroupedBars, HBars } from '../ui/charts';
import { hourly, miles, money, pct, rate, shortDate } from '../ui/format';
import { navigate } from '../ui/router';

export function DashboardPage() {
  const { data, newDraft } = useStore();
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const ref = new Date(now.getFullYear(), now.getMonth() + offset, offset === 0 ? now.getDate() : 15);
  const all = useMemo(() => evaluateLoads(data.loads, data.settings), [data.loads, data.settings]);
  const { from, to } = monthRange(ref);
  const month = summarize(inRange(all, from, to));
  const wk = weekRange(now);
  const week = summarize(inRange(all, wk.from, wk.to));
  const weeks = weeklySeries(all, now, 8);
  const t = data.settings.targets;
  const monthName = ref.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const openOffers = all.filter((r) => r.load.status === 'offer').length;

  const costs = [
    { label: 'Fuel', value: month.fuelCost },
    { label: 'Fixed costs', value: month.fixedCosts },
    { label: 'Maintenance & tires', value: month.maintenanceReserve },
    { label: 'Other trip', value: month.otherExpenses },
    { label: 'Tolls', value: month.tolls },
    { label: 'DEF', value: month.def },
    { label: 'Factoring', value: month.factoring },
  ]
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Booked &amp; completed loads · {openOffers} open offer{openOffers === 1 ? '' : 's'} not counted</p>
        </div>
        <button className="btn primary" onClick={() => { newDraft(); navigate('calc'); }}>
          + New load
        </button>
      </div>

      <div className="month-switch">
        <button className="btn ghost small" onClick={() => setOffset((o) => o - 1)} aria-label="Previous month">‹</button>
        <strong>{offset === 0 ? `This month · ${monthName}` : monthName}</strong>
        <button className="btn ghost small" onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Next month">›</button>
      </div>

      {month.loads === 0 && (
        <p className="note">Dashboard counts loads marked <b>Booked</b> or <b>Completed</b>. Change a load’s status in Loads or in the calculator’s Load details.</p>
      )}

      <div className="metric-grid dash">
        <Metric big label="Gross revenue" value={money(month.gross)} sub={`${month.loads} loads`} />
        <Metric big label="Operating profit" value={money(month.operating)} tone={month.operating > 0 ? 'good' : month.operating < 0 ? 'bad' : 'neutral'} sub={`margin ${pct(month.gross ? (month.operating / month.gross) * 100 : 0)}`} />
        <Metric big label="Economic profit" value={money(month.economic)} tone={month.economic > 0 ? 'good' : month.economic < 0 ? 'bad' : 'neutral'} sub={`after ${money(month.laborValue)} your labor`} />
        <Metric label="Total expenses" value={money(month.totalCost)} sub={`${money(month.tripExpenses)} trip + ${money(month.fixedCosts)} fixed`} />
        <Metric label="Total miles" value={miles(month.totalMiles)} sub={`${miles(month.loadedMiles)} loaded`} />
        <Metric label="Deadhead" value={pct(month.deadheadPct)} sub={`${miles(month.deadheadMiles)} mi`} tone={month.deadheadPct > data.settings.warnings.deadheadPct ? 'warn' : 'neutral'} />
        <Metric label="Avg rate / mile" value={rate(month.avgRatePerMile)} sub={`${rate(month.avgRatePerLoadedMile)} loaded`} />
        <Metric label="Avg profit / mile" value={rate(month.avgProfitPerMile)} />
        <Metric label="Avg profit / hour" value={hourly(month.avgProfitPerHour)} sub={`${month.workHours.toFixed(0)} work h`} />
        <Metric label="Avg load score" value={month.avgScore != null ? month.avgScore.toFixed(0) : '—'} />
        <Metric label="Fuel cost" value={money(month.fuelCost)} />
        <Metric label="Maintenance reserve" value={money(month.maintenanceReserve)} />
        <Metric label="Fixed costs" value={money(month.fixedCosts)} />
        <Metric label="Est. tax set-aside" value={money(month.tax)} sub="estimate only" />
      </div>

      <div className="two-col">
        <Card title="Targets">
          <Progress label="Monthly gross" actual={month.gross} target={t.monthlyGross} format={money} />
          <Progress label="Monthly economic profit" actual={month.economic} target={t.monthlyProfit} format={money} />
          <Progress label={`Week gross (${shortDate(wk.from)}–${shortDate(wk.to)})`} actual={week.gross} target={t.weeklyGross} format={money} />
          <Progress label="Week economic profit" actual={week.economic} target={t.weeklyProfit} format={money} />
          <Progress label="Profit / mile" actual={month.avgProfitPerMile} target={t.profitPerMile} format={rate} />
          <Progress label="Profit / hour" actual={month.avgProfitPerHour ?? 0} target={t.profitPerHour} format={(v) => hourly(v)} />
        </Card>
        <Card title="Last 8 weeks">
          <GroupedBars
            series={['Gross', 'Operating profit']}
            data={weeks.map((w) => ({ label: shortDate(w.from), values: [w.gross, w.operating] }))}
          />
        </Card>
      </div>

      <Card title={`Where the money goes · ${monthName}`}>
        {costs.length ? <HBars items={costs} /> : <p className="muted">No booked or completed loads in this month yet.</p>}
      </Card>
    </div>
  );
}
