import { fuelSensitivity, type LoadResult } from '../../engine/calculate';
import type { LoadInput, Settings } from '../../engine/types';
import { Card, Line } from '../../ui/components';
import { cents, hourly, hours, miles, money, pct, rate, rate3, signedMoney } from '../../ui/format';

const METHOD_LABEL = { perMile: 'per mile', perDay: 'per working day', perLoad: 'per load' } as const;

export function ProfitBreakdown({ r, load }: { r: LoadResult; load: LoadInput }) {
  const c = r.costs;
  const f = c.fixed;
  const basis =
    f.method === 'perMile'
      ? `${miles(f.basis)} mi × ${rate3(f.rate)}`
      : f.method === 'perDay'
        ? `${f.basis.toFixed(2)} days × ${cents(f.rate)}`
        : `1 load × ${cents(f.rate)}`;
  return (
    <Card title="Gross → Expenses → Profit">
      <div className="lines">
        <Line label="Gross revenue" value={cents(r.revenue.gross)} strong />
        {r.revenue.accessorials > 0 && <Line muted label="incl. accessorials" value={cents(r.revenue.accessorials)} />}
        <Line minus label="Fuel" hint={`${r.fuel.gallons.toFixed(1)} gal × ${cents(r.fuel.dieselPrice)}`} value={cents(c.fuel)} />
        {c.def > 0 && <Line minus label="DEF" hint={`${r.fuel.defGallons.toFixed(1)} gal`} value={cents(c.def)} />}
        <Line minus label="Maintenance reserve" hint={`${miles(r.miles.total)} mi`} value={cents(c.maintenance)} />
        <Line minus label="Tire reserve" value={cents(c.tires)} />
        {c.trailerMaintenance > 0 && <Line minus label="Trailer maintenance" value={cents(c.trailerMaintenance)} />}
        {c.tolls > 0 && <Line minus label="Tolls" value={cents(c.tolls)} />}
        {Object.entries(c.otherByCategory).map(([cat, v]) => (
          <Line key={cat} minus label={cat} value={cents(v)} />
        ))}
        {c.factoring > 0 && <Line minus label="Factoring fee" value={cents(c.factoring)} />}
        <Line label="Total trip expenses" value={cents(c.tripExpenses)} strong />
        <Line minus label={`Allocated fixed costs (${METHOD_LABEL[f.method]})`} hint={basis} value={cents(f.allocated)} />
        <Line label="Total cost" value={cents(c.totalCost)} strong />
        <div className="line-sep" />
        <Line label="Operating profit" value={<span className={r.profit.operating >= 0 ? 'pos' : 'neg'}>{cents(r.profit.operating)}</span>} strong />
        <Line minus label="Owner labor value" hint={`${hours(r.hours.total)} × ${cents(load.assumptions.targetHourlyRate)}/h`} value={cents(r.profit.laborValue)} />
        <Line label="Economic profit" value={<span className={r.profit.economic >= 0 ? 'pos' : 'neg'}>{cents(r.profit.economic)}</span>} strong />
      </div>
      <p className="note">
        <b>Operating profit</b> is what the business keeps. <b>Economic profit</b> is what is left after paying yourself your target hourly rate — the real gain from taking this load.
      </p>
    </Card>
  );
}

export function Negotiation({ r, load }: { r: LoadResult; load: LoadInput }) {
  const be = r.breakEven;
  const a = load.assumptions;
  const short = be.minimumAcceptable - r.revenue.gross;
  return (
    <Card title="What should I ask broker?">
      <div className="nego-grid">
        <div>
          <span>Current offer</span>
          <strong>{money(r.revenue.gross)}</strong>
          <em>{rate(r.perMile.grossPerLoaded)}/loaded mi</em>
        </div>
        <div>
          <span>Cash break-even</span>
          <strong>{money(be.cash)}</strong>
          <em>covers costs only</em>
        </div>
        <div>
          <span>Break-even + your labor</span>
          <strong>{money(be.withLabor)}</strong>
          <em>economic profit = $0</em>
        </div>
        <div>
          <span>Target profit</span>
          <strong>{money(be.targetProfit)}</strong>
          <em>{load.targetProfitOverride ? 'this load' : a.targetProfitMode === 'perMile' ? `${cents(a.targetProfitPerMile)} × ${miles(r.miles.total)} mi` : 'per load'}</em>
        </div>
        <div className="hl">
          <span>Recommended minimum</span>
          <strong>{money(be.minimumRounded)}</strong>
          <em>{rate(be.minimumPerLoadedMile)}/loaded mi</em>
        </div>
        <div className="hl">
          <span>Target negotiation rate</span>
          <strong>{money(be.negotiationTarget)}</strong>
          <em>
            +{a.negotiationBufferPct}% room · {rate(be.negotiationPerLoadedMile)}/loaded mi
          </em>
        </div>
      </div>
      {r.ready && (
        <blockquote className="quote">
          “I would not take this load below {money(be.minimumRounded)}.”
        </blockquote>
      )}
      {r.ready && (
        <p className="note">
          Why: costs {money(r.costs.totalCost)} + your labor {money(r.profit.laborValue)} ({hours(r.hours.total)} × {money(a.targetHourlyRate)}/h) + target profit {money(be.targetProfit)}
          {a.factoringPct > 0 ? `, grossed up for ${a.factoringPct}% factoring` : ''} = {money(be.minimumAcceptable)}, rounded up to ${a.roundRatesTo}.{' '}
          {short > 0 ? `The offer is ${money(short)} short.` : `The offer clears it by ${money(-short)}.`}
        </p>
      )}
    </Card>
  );
}

export function DeadheadCard({ r, threshold }: { r: LoadResult; threshold: number }) {
  const high = r.miles.deadheadPct > threshold;
  return (
    <Card title="Deadhead analysis">
      <div className="mini-grid">
        <div><span>Deadhead miles</span><strong>{miles(r.miles.deadhead)}</strong></div>
        <div><span>Total miles</span><strong>{miles(r.miles.total)}</strong></div>
        <div><span>Deadhead %</span><strong className={high ? 'neg' : ''}>{pct(r.miles.deadheadPct)}</strong></div>
        <div><span>Deadhead cost</span><strong>{money(r.deadhead.cost)}</strong></div>
        <div><span>Revenue / total mi</span><strong>{rate(r.perMile.grossPerTotal)}</strong></div>
        <div><span>Profit / total mi</span><strong>{rate(r.perMile.operatingPerTotal)}</strong></div>
      </div>
      {r.ready && high && (
        <p className="alert">
          ⚠️ <b>HIGH DEADHEAD:</b> {pct(r.miles.deadheadPct, 0)} of total miles are unpaid.
        </p>
      )}
      <p className="note">Deadhead cost = deadhead miles × variable cost {rate3(r.costs.variablePerMile)}/mi (fuel, DEF, maintenance, tires).</p>
    </Card>
  );
}

export function TimeCard({ r }: { r: LoadResult }) {
  const b = r.hours.breakdown;
  const parts: [string, number][] = b
    ? [
        ['Driving (loaded)', b.driving],
        ['Deadhead driving', b.deadheadDriving],
        ['Loading', b.loading],
        ['Unloading', b.unloading],
        ['Waiting', b.waiting],
        ['Fueling', b.fueling],
        ['Inspection', b.inspection],
        ['Other', b.other],
      ]
    : [];
  return (
    <Card title="Time analysis">
      <div className="mini-grid">
        <div><span>Work hours</span><strong>{hours(r.hours.total)}</strong><em>{r.hours.mode === 'auto' ? 'auto estimate' : r.hours.mode === 'total' ? 'entered' : 'detailed'}</em></div>
        <div><span>Trip duration</span><strong>{r.hours.calendarHours != null ? hours(r.hours.calendarHours) : '—'}</strong><em>{r.hours.calendarHours != null ? `${(r.hours.calendarHours / 24).toFixed(1)} days` : 'set pickup & delivery'}</em></div>
        <div><span>Gross / hour</span><strong>{hourly(r.perHour.gross)}</strong></div>
        <div><span>Operating / hour</span><strong>{hourly(r.perHour.operating)}</strong></div>
        <div><span>Economic / hour</span><strong>{hourly(r.perHour.economic)}</strong></div>
        <div><span>Operating / trip hour</span><strong>{hourly(r.perHour.operatingPerCalendarHour)}</strong><em>calendar time</em></div>
      </div>
      {parts.length > 0 && (
        <div className="lines compact">
          {parts.filter(([, v]) => v > 0).map(([k, v]) => (
            <Line key={k} label={k} value={hours(v)} />
          ))}
        </div>
      )}
    </Card>
  );
}

export function FuelCard({ r, load, settings }: { r: LoadResult; load: LoadInput; settings: Settings }) {
  const f = r.fuel;
  const rows = fuelSensitivity(load, settings, settings.fuelSensitivityPrices);
  return (
    <Card title="Fuel">
      <div className="mini-grid">
        <div><span>Effective MPG</span><strong>{f.effectiveMpg.toFixed(2)}</strong></div>
        <div><span>Gallons</span><strong>{f.gallons.toFixed(1)}</strong><em>{f.isOverride ? 'manual override' : 'miles ÷ MPG'}</em></div>
        <div><span>Fuel cost</span><strong>{money(r.costs.fuel)}</strong></div>
        <div><span>Fuel / mile</span><strong>{rate(f.costPerMile)}</strong></div>
        <div><span>Fuel to buy</span><strong>{f.fuelToBuy.toFixed(1)} gal</strong><em>after {f.startingFuel} gal in tank</em></div>
        <div><span>Fuel stops</span><strong>{f.fuelStops}</strong><em>{f.remainingAfterTrip > 0 ? `${f.remainingAfterTrip.toFixed(1)} gal left` : `${load.fuel.tankGallons} gal tank`}</em></div>
      </div>
      <table className="table sens">
        <caption>If diesel costs…</caption>
        <thead>
          <tr>
            <th>Diesel</th>
            <th>Fuel</th>
            <th>Op. profit</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.dieselPrice} className={Math.abs(x.dieselPrice - f.dieselPrice) < 0.005 ? 'current' : ''}>
              <td>{cents(x.dieselPrice)}</td>
              <td>{money(x.fuelCost)}</td>
              <td>{money(x.operating)}</td>
              <td className={x.deltaVsCurrent >= 0 ? 'pos' : 'neg'}>{signedMoney(x.deltaVsCurrent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">Fuel cost counts every gallon burned — fuel already in the tank must be replaced. Each $0.10/gal = {money(f.gallons * 0.1)} on this load.</p>
    </Card>
  );
}

export function ScoreCard({ r }: { r: LoadResult }) {
  const s = r.score;
  if (!s) return null;
  const fmt = (key: string, v: number) => {
    switch (key) {
      case 'profitPerMile':
      case 'revenuePerMile':
        return rate(v);
      case 'profitPerHour':
        return hourly(v);
      case 'economicProfit':
        return money(v);
      case 'stops':
        return String(v);
      case 'waitingHours':
        return hours(v);
      case 'tripLength':
        return `${miles(v)} mi`;
      default:
        return pct(v, 0);
    }
  };
  return (
    <Card title={`Load score ${s.total}/100`}>
      <div className="score-bars">
        {s.components.map((c) => (
          <div key={c.key} className="score-bar" title={`${c.points.toFixed(0)} pts × weight ${c.weight}`}>
            <span className="sb-label">{c.label}</span>
            <span className="sb-val">{fmt(c.key, c.value)}</span>
            <span className="sb-track">
              <span className="sb-fill" style={{ width: `${c.points}%` }} />
            </span>
            <span className="sb-pts">{c.points.toFixed(0)}</span>
          </div>
        ))}
      </div>
      <div className="lines compact">
        <Line label="Weighted base score" value={s.base.toFixed(1)} />
        {s.manualRisks.map((m) => (
          <Line key={m.key} minus label={m.label} value={m.penalty} />
        ))}
        <Line label="Final score" value={s.total} strong />
      </div>
      <p className="note">Each factor scores 0–100 between its “bad” and “good” thresholds (Settings → Scoring), weighted. Checked risks subtract penalty points.</p>
    </Card>
  );
}

export function TaxCard({ r }: { r: LoadResult }) {
  return (
    <Card title="Tax estimate">
      <p className="disclaimer">Estimate only — not tax advice. Talk to a tax professional.</p>
      <div className="lines">
        <Line label="Pre-tax operating profit" value={cents(r.profit.operating)} />
        <Line label="Pre-tax economic profit" value={cents(r.profit.economic)} />
        <Line minus label={`Estimated tax (${r.tax.ratePct}% of operating profit)`} value={cents(r.tax.tax)} />
        <Line label="After-tax operating profit" value={cents(r.tax.afterTaxOperating)} strong />
        <Line label="After-tax economic profit" value={cents(r.tax.afterTaxEconomic)} strong />
      </div>
      <p className="note">Tax is estimated on operating profit because your own labor is not a deductible business expense.</p>
    </Card>
  );
}
