/**
 * Aggregations over saved loads: history filters, comparison, broker stats,
 * dashboard summaries. Pure functions — dates are passed in, never read from the clock.
 */
import { calculateLoad, type LoadResult, type ScoreConfig } from './calculate';
import { r2, safeDiv, sum } from './math';
import type { LoadInput, LoadStatus } from './types';

export interface EvaluatedLoad {
  load: LoadInput;
  result: LoadResult;
}

export function evaluateLoads(loads: LoadInput[], config: ScoreConfig): EvaluatedLoad[] {
  return loads.map((load) => ({ load, result: calculateLoad(load, config) }));
}

/** Business date of a load as YYYY-MM-DD: pickup date, else delivery date, else created date (local). */
export function loadDateKey(load: LoadInput): string {
  if (load.pickupAt) return load.pickupAt.slice(0, 10);
  if (load.deliveryAt) return load.deliveryAt.slice(0, 10);
  return toDateKey(new Date(load.createdAt));
}

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Loads that count as real business (money actually earned / being earned). */
export const HAULED: LoadStatus[] = ['booked', 'completed'];

// ───────────────────────── History filters ─────────────────────────

export interface LoadFilters {
  search?: string;
  from?: string; // YYYY-MM-DD inclusive
  to?: string;
  broker?: string;
  state?: string;
  status?: LoadStatus | '';
  minProfit?: number | null;
  minRatePerMile?: number | null; // gross / total mile
  minMiles?: number | null;
  maxMiles?: number | null;
  minScore?: number | null;
}

export function filterLoads(rows: EvaluatedLoad[], f: LoadFilters): EvaluatedLoad[] {
  const q = (f.search ?? '').trim().toLowerCase();
  return rows.filter(({ load, result }) => {
    const date = loadDateKey(load);
    if (f.from && date < f.from) return false;
    if (f.to && date > f.to) return false;
    if (f.broker && load.broker.trim().toLowerCase() !== f.broker.trim().toLowerCase()) return false;
    if (f.status && load.status !== f.status) return false;
    if (f.state) {
      const st = f.state.trim().toUpperCase();
      if (load.pickupState.toUpperCase() !== st && load.deliveryState.toUpperCase() !== st) return false;
    }
    if (f.minProfit != null && result.profit.operating < f.minProfit) return false;
    if (f.minRatePerMile != null && result.perMile.grossPerTotal < f.minRatePerMile) return false;
    if (f.minMiles != null && result.miles.total < f.minMiles) return false;
    if (f.maxMiles != null && result.miles.total > f.maxMiles) return false;
    if (f.minScore != null && (result.score?.total ?? 0) < f.minScore) return false;
    if (q) {
      const hay = [
        load.broker,
        load.loadNumber,
        load.pickupCity,
        load.pickupState,
        load.deliveryCity,
        load.deliveryState,
        load.commodity,
        load.notes,
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ───────────────────────── Compare ─────────────────────────

export interface CompareMetric {
  key: string;
  label: string;
  format: 'money' | 'rate' | 'hourly' | 'pct' | 'miles' | 'score';
  higherIsBetter: boolean | null; // null = not ranked
  get: (r: LoadResult) => number | null;
}

export const COMPARE_METRICS: CompareMetric[] = [
  { key: 'gross', label: 'Gross', format: 'money', higherIsBetter: null, get: (r) => r.revenue.gross },
  { key: 'miles', label: 'Total miles', format: 'miles', higherIsBetter: null, get: (r) => r.miles.total },
  { key: 'cost', label: 'Total cost', format: 'money', higherIsBetter: null, get: (r) => r.costs.totalCost },
  { key: 'operating', label: 'Operating profit', format: 'money', higherIsBetter: true, get: (r) => r.profit.operating },
  { key: 'economic', label: 'Economic profit', format: 'money', higherIsBetter: true, get: (r) => r.profit.economic },
  { key: 'gpm', label: 'Gross / total mile', format: 'rate', higherIsBetter: true, get: (r) => r.perMile.grossPerTotal },
  { key: 'ppm', label: 'Profit / mile', format: 'rate', higherIsBetter: true, get: (r) => r.perMile.operatingPerTotal },
  { key: 'pph', label: 'Profit / hour', format: 'hourly', higherIsBetter: true, get: (r) => r.perHour.operating },
  { key: 'margin', label: 'Margin', format: 'pct', higherIsBetter: true, get: (r) => r.profit.operatingMarginPct },
  { key: 'deadhead', label: 'Deadhead', format: 'pct', higherIsBetter: false, get: (r) => r.miles.deadheadPct },
  { key: 'hours', label: 'Work hours', format: 'miles', higherIsBetter: null, get: (r) => r.hours.total },
  { key: 'score', label: 'Load score', format: 'score', higherIsBetter: true, get: (r) => r.score?.total ?? null },
];

/** Index of the best row for a metric, or -1 when not ranked / tied for everyone. */
export function bestIndex(values: (number | null)[], higherIsBetter: boolean | null): number {
  if (higherIsBetter == null) return -1;
  let best = -1;
  values.forEach((v, i) => {
    if (v == null) return;
    const b = best === -1 ? null : values[best];
    if (b == null || (higherIsBetter ? v > b : v < b)) best = i;
  });
  const unique = values.filter((v) => v != null && v === values[best]).length;
  return unique === values.filter((v) => v != null).length && values.length > 1 ? -1 : best;
}

/** Overall winner: highest load score; ties broken by operating profit per hour, then economic profit. */
export function overallBest(rows: EvaluatedLoad[]): number {
  let best = -1;
  rows.forEach((row, i) => {
    if (!row.result.ready) return;
    if (best === -1) return void (best = i);
    const a = row.result;
    const b = rows[best].result;
    const key = (r: LoadResult) => [r.score?.total ?? 0, r.perHour.operating ?? 0, r.profit.economic];
    const ka = key(a);
    const kb = key(b);
    for (let k = 0; k < ka.length; k++) {
      if (ka[k] !== kb[k]) {
        if (ka[k] > kb[k]) best = i;
        return;
      }
    }
  });
  return best;
}

/** Explains when the highest-gross load is NOT the best one. */
export function compareInsight(rows: EvaluatedLoad[], names: string[]): string | null {
  const best = overallBest(rows);
  if (best < 0 || rows.length < 2) return null;
  let topGross = 0;
  rows.forEach((r, i) => {
    if (r.result.revenue.gross > rows[topGross].result.revenue.gross) topGross = i;
  });
  if (topGross === best) return null;
  const b = rows[best].result;
  const g = rows[topGross].result;
  const money = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString('en-US')}`;
  const parts = [`${names[best]} beats ${names[topGross]} despite ${money(g.revenue.gross - b.revenue.gross)} less gross`];
  const dpm = b.perMile.operatingPerTotal - g.perMile.operatingPerTotal;
  if (dpm > 0) parts.push(`+$${dpm.toFixed(2)}/mile`);
  if (b.perHour.operating != null && g.perHour.operating != null) {
    const dph = b.perHour.operating - g.perHour.operating;
    if (dph > 0) parts.push(`+$${dph.toFixed(0)}/hour`);
  }
  const dm = g.miles.total - b.miles.total;
  if (dm > 0) parts.push(`${dm.toLocaleString('en-US')} fewer miles of wear`);
  return parts.join(', ') + '.';
}

// ───────────────────────── Period summary (dashboard) ─────────────────────────

export interface PeriodSummary {
  loads: number;
  gross: number;
  totalCost: number;
  tripExpenses: number;
  fixedCosts: number;
  operating: number;
  laborValue: number;
  economic: number;
  totalMiles: number;
  loadedMiles: number;
  deadheadMiles: number;
  deadheadPct: number;
  workHours: number;
  avgRatePerMile: number; // gross / total mile
  avgRatePerLoadedMile: number;
  avgProfitPerMile: number; // operating / total mile
  avgProfitPerHour: number | null;
  avgScore: number | null;
  fuelCost: number;
  maintenanceReserve: number; // truck + tires + trailer reserves
  tolls: number;
  otherExpenses: number;
  def: number;
  factoring: number;
  tax: number;
}

/** Sums (not averages of ratios): avg $/mile = Σ profit / Σ miles, the only correct way to average rates. */
export function summarize(rows: EvaluatedLoad[]): PeriodSummary {
  const R = rows.map((r) => r.result);
  const s = (f: (r: LoadResult) => number) => r2(sum(R.map(f)));
  const totalMiles = sum(R.map((r) => r.miles.total));
  const loadedMiles = sum(R.map((r) => r.miles.loaded));
  const deadheadMiles = sum(R.map((r) => r.miles.deadhead));
  const workHours = sum(R.map((r) => r.hours.total));
  const gross = s((r) => r.revenue.gross);
  const operating = s((r) => r.profit.operating);
  const scored = R.filter((r) => r.score);
  return {
    loads: rows.length,
    gross,
    totalCost: s((r) => r.costs.totalCost),
    tripExpenses: s((r) => r.costs.tripExpenses),
    fixedCosts: s((r) => r.costs.fixed.allocated),
    operating,
    laborValue: s((r) => r.profit.laborValue),
    economic: s((r) => r.profit.economic),
    totalMiles,
    loadedMiles,
    deadheadMiles,
    deadheadPct: safeDiv(deadheadMiles, totalMiles) * 100,
    workHours,
    avgRatePerMile: safeDiv(gross, totalMiles),
    avgRatePerLoadedMile: safeDiv(gross, loadedMiles),
    avgProfitPerMile: safeDiv(operating, totalMiles),
    avgProfitPerHour: workHours > 0 ? operating / workHours : null,
    avgScore: scored.length ? sum(scored.map((r) => r.score!.total)) / scored.length : null,
    fuelCost: s((r) => r.costs.fuel),
    maintenanceReserve: s((r) => r.costs.maintenance + r.costs.tires + r.costs.trailerMaintenance),
    tolls: s((r) => r.costs.tolls),
    otherExpenses: s((r) => r.costs.otherExpenses),
    def: s((r) => r.costs.def),
    factoring: s((r) => r.costs.factoring),
    tax: s((r) => r.tax.tax),
  };
}

export function inRange(rows: EvaluatedLoad[], from: string, to: string, statuses: LoadStatus[] = HAULED) {
  return rows.filter(({ load }) => {
    const d = loadDateKey(load);
    return d >= from && d <= to && statuses.includes(load.status);
  });
}

export function monthRange(ref: Date): { from: string; to: string } {
  const from = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { from: toDateKey(from), to: toDateKey(to) };
}

/** Monday-based week containing `ref`. */
export function weekRange(ref: Date): { from: string; to: string } {
  const day = (ref.getDay() + 6) % 7; // Mon=0
  const from = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - day);
  const to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 6);
  return { from: toDateKey(from), to: toDateKey(to) };
}

export interface WeekBucket {
  from: string;
  to: string;
  gross: number;
  operating: number;
  economic: number;
}

export function weeklySeries(rows: EvaluatedLoad[], ref: Date, weeks: number): WeekBucket[] {
  const out: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - i * 7);
    const { from, to } = weekRange(d);
    const sm = summarize(inRange(rows, from, to));
    out.push({ from, to, gross: sm.gross, operating: sm.operating, economic: sm.economic });
  }
  return out;
}

export function progress(actual: number, target: number): number {
  return target > 0 ? (actual / target) * 100 : 0;
}

// ───────────────────────── Brokers ─────────────────────────

export interface BrokerStats {
  broker: string;
  quotes: number;
  hauled: number;
  cancelled: number;
  avgGross: number;
  avgProfit: number; // operating
  avgProfitPerMile: number; // Σ operating / Σ miles
  avgRatePerMile: number;
  avgScore: number | null;
  avgPaymentDays: number | null;
  cancellationRatePct: number | null;
  totalGross: number;
}

export function daysBetween(a: string, b: string): number | null {
  const x = Date.parse(a);
  const y = Date.parse(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return Math.round((y - x) / 86_400_000);
}

/**
 * Rate stats use every ready, non-cancelled load from the broker (offers included —
 * that is what the broker pays). Payment days use loads with both invoiced & paid dates.
 * Cancellation rate = cancelled / (booked + completed + cancelled).
 */
export function brokerStats(rows: EvaluatedLoad[]): BrokerStats[] {
  const groups = new Map<string, EvaluatedLoad[]>();
  for (const row of rows) {
    const name = row.load.broker.trim() || '(no broker)';
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const stats: BrokerStats[] = [];
  for (const list of groups.values()) {
    const name = list[0].load.broker.trim() || '(no broker)';
    const priced = list.filter((r) => r.result.ready && r.load.status !== 'cancelled');
    const R = priced.map((r) => r.result);
    const hauled = list.filter((r) => HAULED.includes(r.load.status)).length;
    const cancelled = list.filter((r) => r.load.status === 'cancelled').length;
    const payDays = list
      .map((r) => daysBetween(r.load.invoicedAt, r.load.paidAt))
      .filter((d): d is number => d != null && d >= 0);
    const scored = R.filter((r) => r.score);
    const miles = sum(R.map((r) => r.miles.total));
    const totalGross = r2(sum(R.map((r) => r.revenue.gross)));
    stats.push({
      broker: name,
      quotes: list.length,
      hauled,
      cancelled,
      avgGross: r2(safeDiv(totalGross, R.length)),
      avgProfit: r2(safeDiv(sum(R.map((r) => r.profit.operating)), R.length)),
      avgProfitPerMile: safeDiv(sum(R.map((r) => r.profit.operating)), miles),
      avgRatePerMile: safeDiv(totalGross, miles),
      avgScore: scored.length ? sum(scored.map((r) => r.score!.total)) / scored.length : null,
      avgPaymentDays: payDays.length ? sum(payDays) / payDays.length : null,
      cancellationRatePct: hauled + cancelled > 0 ? (cancelled / (hauled + cancelled)) * 100 : null,
      totalGross,
    });
  }
  return stats.sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1) || b.avgProfitPerMile - a.avgProfitPerMile);
}
