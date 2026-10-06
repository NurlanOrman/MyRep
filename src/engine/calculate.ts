/**
 * The calculation engine. Pure functions only — no UI, no storage, no Date.now().
 * Every number shown in the app comes from `calculateLoad`.
 *
 * Money line items are rounded to cents BEFORE they are summed, so the
 * breakdown on screen always adds up exactly (like a spreadsheet).
 */
import { ceilTo, clamp, num, r2, safeDiv, signedNum, sum } from './math';
import type {
  AutoRiskKey,
  Decision,
  LoadInput,
  ManualRiskKey,
  ScoreRange,
  Settings,
} from './types';
import { AUTO_RISK_LABELS, MANUAL_RISKS } from './defaults';

export type ScoreConfig = Pick<Settings, 'scoring' | 'warnings' | 'riskPenalties'>;

// ───────────────────────── Revenue & miles ─────────────────────────

export function totalMiles(loadedMiles: number, deadheadMiles: number): number {
  return num(loadedMiles) + num(deadheadMiles);
}

export function deadheadPct(deadheadMiles: number, total: number): number {
  return safeDiv(num(deadheadMiles), total) * 100;
}

export function accessorialsTotal(load: LoadInput): number {
  const r = load.revenue;
  return r2(
    sum([r.fuelSurcharge, r.detention, r.layover, r.tarpFee, r.stopOffFee, r.otherAccessorials].map(num)),
  );
}

/** Total Gross = Broker Rate + FSC + Detention + Layover + Tarp + Stop-off + Other (or one all-in number). */
export function grossRevenue(load: LoadInput): number {
  if (load.revenue.mode === 'total') return r2(num(load.revenue.totalGross));
  return r2(num(load.revenue.brokerRate) + accessorialsTotal(load));
}

// ───────────────────────── Fuel ─────────────────────────

export interface FuelResult {
  effectiveMpg: number;
  calculatedGallons: number;
  gallons: number;
  isOverride: boolean;
  dieselPrice: number;
  fuelCost: number;
  costPerMile: number;
  defGallons: number;
  defCost: number;
  startingFuel: number;
  /** Gallons to buy during the trip (cash-flow info; cost still counts ALL gallons burned). */
  fuelToBuy: number;
  remainingAfterTrip: number;
  fuelStops: number;
}

export function effectiveMpg(mpg: number, adjustmentPct: number): number {
  return num(mpg) * (1 + signedNum(adjustmentPct) / 100);
}

export function calculateFuel(load: LoadInput, miles: number): FuelResult {
  const f = load.fuel;
  const mpg = effectiveMpg(f.mpg, f.mpgAdjustmentPct);
  const calculatedGallons = mpg > 0 ? miles / mpg : 0;
  const override = f.gallonsOverride != null && num(f.gallonsOverride) > 0;
  const gallons = override ? num(f.gallonsOverride) : calculatedGallons;
  const price = num(f.dieselPrice);
  // Fuel cost = ALL gallons burned × price. Fuel already in the tank was paid for
  // and must be replaced, so starting fuel does not reduce the cost of the load.
  const fuelCost = r2(gallons * price);
  const defGallons = gallons * (num(f.defPctOfDiesel) / 100);
  const defCost = r2(defGallons * num(f.defPricePerGallon));
  const start = num(f.startingFuel);
  const fuelToBuy = Math.max(0, gallons - start);
  const tank = num(f.tankGallons);
  return {
    effectiveMpg: mpg,
    calculatedGallons,
    gallons,
    isOverride: override,
    dieselPrice: price,
    fuelCost,
    costPerMile: safeDiv(fuelCost, miles),
    defGallons,
    defCost,
    startingFuel: start,
    fuelToBuy,
    remainingAfterTrip: Math.max(0, start - gallons),
    fuelStops: tank > 0 ? Math.ceil(fuelToBuy / tank - 1e-9) : 0,
  };
}

// ───────────────────────── Hours ─────────────────────────

export interface HoursBreakdown {
  driving: number;
  deadheadDriving: number;
  loading: number;
  unloading: number;
  waiting: number;
  fueling: number;
  inspection: number;
  other: number;
}

export interface HoursResult {
  mode: LoadInput['hours']['mode'];
  breakdown: HoursBreakdown | null;
  total: number;
  /** Calendar hours from pickup to delivery + deadhead driving (null if dates missing). */
  calendarHours: number | null;
}

export function calculateHours(load: LoadInput, fuelStops: number): HoursResult {
  const h = load.hours;
  const a = load.assumptions;
  let breakdown: HoursBreakdown | null = null;
  let total = 0;

  if (h.mode === 'total') {
    total = num(h.total);
  } else if (h.mode === 'detailed') {
    breakdown = {
      driving: num(h.driving),
      deadheadDriving: num(h.deadheadDriving),
      loading: num(h.loading),
      unloading: num(h.unloading),
      waiting: num(h.waiting),
      fueling: num(h.fueling),
      inspection: num(h.inspection),
      other: num(h.other),
    };
  } else {
    // Auto estimate from settings: miles / avg speed, 1 pickup + (stops − 1) drops,
    // fuel stops × time per stop, one inspection per load. Waiting/other are user-entered.
    const speed = num(a.avgSpeedMph);
    const stops = Math.max(2, Math.round(num(load.stops)) || 2);
    breakdown = {
      driving: safeDiv(num(load.loadedMiles), speed),
      deadheadDriving: safeDiv(num(load.deadheadMiles), speed),
      loading: num(a.hoursPerStop),
      unloading: num(a.hoursPerStop) * (stops - 1),
      waiting: num(h.waiting),
      fueling: fuelStops * num(a.fuelStopHours),
      inspection: num(a.inspectionHoursPerLoad),
      other: num(h.other),
    };
  }
  if (breakdown) total = sum(Object.values(breakdown));

  let calendarHours: number | null = null;
  const p = Date.parse(load.pickupAt);
  const d = Date.parse(load.deliveryAt);
  if (Number.isFinite(p) && Number.isFinite(d) && d > p) {
    const dh = breakdown ? breakdown.deadheadDriving : safeDiv(num(load.deadheadMiles), num(a.avgSpeedMph));
    calendarHours = (d - p) / 3_600_000 + dh;
  }
  return { mode: h.mode, breakdown, total, calendarHours };
}

// ───────────────────────── Fixed cost allocation ─────────────────────────

export interface FixedAllocationResult {
  monthly: number;
  method: LoadInput['assumptions']['allocation']['method'];
  /** $ per mile / per day / per load. */
  rate: number;
  /** Miles, days or loads (=1) this load consumes. */
  basis: number;
  allocated: number;
}

export function allocateFixedCosts(load: LoadInput, miles: number, workHours: number): FixedAllocationResult {
  const a = load.assumptions;
  const monthly = num(a.monthlyFixedCosts);
  const al = a.allocation;
  let rate = 0;
  let basis = 0;
  switch (al.method) {
    case 'perMile':
      rate = safeDiv(monthly, num(al.expectedMonthlyMiles));
      basis = miles;
      break;
    case 'perDay':
      rate = safeDiv(monthly, num(al.workingDaysPerMonth));
      basis =
        load.tripDaysOverride != null && num(load.tripDaysOverride) > 0
          ? num(load.tripDaysOverride)
          : safeDiv(workHours, num(al.workHoursPerDay));
      break;
    case 'perLoad':
      rate = safeDiv(monthly, num(al.expectedLoadsPerMonth));
      basis = 1;
      break;
  }
  return { monthly, method: al.method, rate, basis, allocated: r2(rate * basis) };
}

// ───────────────────────── Score ─────────────────────────

export interface ScoreComponent {
  key: string;
  label: string;
  value: number;
  points: number; // 0–100
  weight: number;
}

export interface ScoreResult {
  total: number;
  base: number;
  penalty: number;
  label: string;
  tone: 'excellent' | 'good' | 'marginal' | 'risky' | 'bad';
  components: ScoreComponent[];
  manualRisks: { key: ManualRiskKey; label: string; penalty: number }[];
}

/** Linear scale: `bad` → 0 pts, `good` → 100 pts. Works for inverted metrics (good < bad). */
export function linearPoints(value: number, range: Pick<ScoreRange, 'bad' | 'good'>): number {
  if (range.good === range.bad) return value >= range.good ? 100 : 0;
  return clamp((value - range.bad) / (range.good - range.bad), 0, 1) * 100;
}

export function tripLengthPoints(miles: number, min: number, max: number): number {
  if (miles >= min && miles <= max) return 100;
  if (miles < min) return linearPoints(miles, { bad: min / 2, good: min });
  return linearPoints(miles, { bad: max * 2, good: max });
}

export function scoreLabel(score: number): Pick<ScoreResult, 'label' | 'tone'> {
  if (score >= 85) return { label: 'EXCELLENT LOAD', tone: 'excellent' };
  if (score >= 70) return { label: 'GOOD LOAD', tone: 'good' };
  if (score >= 55) return { label: 'MARGINAL', tone: 'marginal' };
  if (score >= 40) return { label: 'RISKY', tone: 'risky' };
  return { label: 'BAD LOAD', tone: 'bad' };
}

export interface ScoreInputs {
  profitPerMile: number;
  profitPerHour: number | null;
  economicProfit: number;
  marginPct: number;
  revenuePerMile: number;
  deadheadPct: number;
  fuelPctOfGross: number;
  tollPctOfGross: number;
  stops: number;
  waitingHours: number;
  weightPctOfPayload: number | null;
  totalMiles: number;
}

export function calculateScore(
  m: ScoreInputs,
  risks: LoadInput['risks'],
  config: ScoreConfig,
): ScoreResult {
  const s = config.scoring;
  const comps: ScoreComponent[] = [];
  const add = (key: keyof Omit<typeof s, 'tripLength'>, label: string, value: number | null) => {
    if (value == null || !Number.isFinite(value)) return; // unknown → excluded, weights renormalize
    comps.push({ key, label, value, points: linearPoints(value, s[key]), weight: s[key].weight });
  };
  add('profitPerMile', 'Profit / mile', m.profitPerMile);
  add('profitPerHour', 'Profit / hour', m.profitPerHour);
  add('economicProfit', 'Economic profit', m.economicProfit);
  add('margin', 'Margin %', m.marginPct);
  add('revenuePerMile', 'Revenue / total mile', m.revenuePerMile);
  add('deadheadPct', 'Deadhead %', m.deadheadPct);
  add('fuelPctOfGross', 'Fuel % of gross', m.fuelPctOfGross);
  add('tollPctOfGross', 'Tolls % of gross', m.tollPctOfGross);
  add('stops', 'Stops', m.stops);
  add('waitingHours', 'Waiting hours', m.waitingHours);
  add('weightPctOfPayload', 'Weight % of payload', m.weightPctOfPayload);
  comps.push({
    key: 'tripLength',
    label: 'Trip length fit',
    value: m.totalMiles,
    points: tripLengthPoints(m.totalMiles, s.tripLength.preferredMin, s.tripLength.preferredMax),
    weight: s.tripLength.weight,
  });

  const totalWeight = sum(comps.map((c) => c.weight));
  const base = safeDiv(sum(comps.map((c) => c.points * c.weight)), totalWeight);
  const manualRisks = MANUAL_RISKS.filter((r) => risks[r.key]).map((r) => ({
    key: r.key,
    label: r.label,
    penalty: num(config.riskPenalties[r.key]),
  }));
  const penalty = sum(manualRisks.map((r) => r.penalty));
  const total = Math.round(clamp(base - penalty, 0, 100));
  return { total, base, penalty, ...scoreLabel(total), components: comps, manualRisks };
}

// ───────────────────────── Full load result ─────────────────────────

export interface Warning {
  key: AutoRiskKey;
  label: string;
  message: string;
}

export interface LoadResult {
  ready: boolean;
  miles: { loaded: number; deadhead: number; total: number; deadheadPct: number };
  revenue: { brokerRate: number; accessorials: number; gross: number };
  fuel: FuelResult;
  hours: HoursResult;
  costs: {
    fuel: number;
    def: number;
    maintenance: number;
    tires: number;
    trailerMaintenance: number;
    tolls: number;
    otherExpenses: number;
    otherByCategory: Record<string, number>;
    factoring: number;
    /** Trip expenses = everything except allocated fixed costs. */
    tripExpenses: number;
    fixed: FixedAllocationResult;
    totalCost: number;
    variablePerMile: number;
  };
  profit: {
    operating: number;
    laborValue: number;
    economic: number;
    operatingMarginPct: number;
    economicMarginPct: number;
  };
  perMile: {
    grossPerLoaded: number;
    grossPerTotal: number;
    costPerTotal: number;
    operatingPerTotal: number;
    economicPerTotal: number;
  };
  perHour: {
    gross: number | null;
    operating: number | null;
    economic: number | null;
    operatingPerCalendarHour: number | null;
  };
  breakEven: {
    /** Gross at which operating profit = 0. */
    cash: number;
    /** Gross at which economic profit = 0 (costs + your labor). */
    withLabor: number;
    targetProfit: number;
    /** Costs + labor + target profit. */
    minimumAcceptable: number;
    minimumRounded: number;
    negotiationTarget: number;
    minimumPerLoadedMile: number;
    negotiationPerLoadedMile: number;
    safetyMargin: number;
  };
  deadhead: { miles: number; pct: number; cost: number };
  tax: { ratePct: number; tax: number; afterTaxOperating: number; afterTaxEconomic: number };
  warnings: Warning[];
  score: ScoreResult | null;
  decision: { decision: Decision | null; headline: string; reasons: string[] };
}

export function calculateLoad(load: LoadInput, config: ScoreConfig): LoadResult {
  const a = load.assumptions;
  const loaded = num(load.loadedMiles);
  const dh = num(load.deadheadMiles);
  const miles = totalMiles(loaded, dh);
  const dhPct = deadheadPct(dh, miles);

  // Revenue
  const gross = grossRevenue(load);
  const brokerRate = load.revenue.mode === 'total' ? gross : r2(num(load.revenue.brokerRate));
  const accessorials = load.revenue.mode === 'total' ? 0 : accessorialsTotal(load);

  // Variable costs
  const fuel = calculateFuel(load, miles);
  const maintenance = r2(miles * num(a.maintenancePerMile));
  const tires = r2(miles * num(a.tirePerMile));
  const trailerMaintenance = r2(miles * num(a.trailerMaintenancePerMile));
  const tolls = r2(num(load.tolls.estimated) + num(load.tolls.transponderFees));
  const otherByCategory: Record<string, number> = {};
  for (const e of load.expenses) {
    const cat = e.category || 'Miscellaneous';
    otherByCategory[cat] = r2((otherByCategory[cat] ?? 0) + r2(num(e.amount)));
  }
  const otherExpenses = r2(sum(Object.values(otherByCategory)));
  const factoringPct = num(a.factoringPct) / 100;
  const factoring = r2(gross * factoringPct);

  const tripExpensesExFactoring = r2(
    fuel.fuelCost + fuel.defCost + maintenance + tires + trailerMaintenance + tolls + otherExpenses,
  );
  const tripExpenses = r2(tripExpensesExFactoring + factoring);

  // Hours & fixed allocation
  const hours = calculateHours(load, fuel.fuelStops);
  const fixed = allocateFixedCosts(load, miles, hours.total);
  const totalCost = r2(tripExpenses + fixed.allocated);

  // Profit
  const operating = r2(gross - totalCost);
  const laborValue = r2(hours.total * num(a.targetHourlyRate));
  const economic = r2(operating - laborValue);
  const hasHours = hours.total > 0;

  // Break-even. Factoring is a % of gross, so solve: G − f·G − C = X  →  G = (C + X) / (1 − f)
  const costsExFactoring = r2(tripExpensesExFactoring + fixed.allocated);
  const k = 1 - factoringPct > 0 ? 1 - factoringPct : 1;
  const cash = r2(costsExFactoring / k);
  const withLabor = r2((costsExFactoring + laborValue) / k);
  const targetProfit = r2(
    load.targetProfitOverride != null && num(load.targetProfitOverride) > 0
      ? num(load.targetProfitOverride)
      : a.targetProfitMode === 'perLoad'
        ? num(a.targetProfitPerLoad)
        : num(a.targetProfitPerMile) * miles,
  );
  const minimumAcceptable = r2((costsExFactoring + laborValue + targetProfit) / k);
  const minimumRounded = ceilTo(minimumAcceptable, num(a.roundRatesTo));
  const negotiationTarget = ceilTo(minimumAcceptable * (1 + num(a.negotiationBufferPct) / 100), num(a.roundRatesTo));

  const variablePerMile = safeDiv(
    fuel.fuelCost + fuel.defCost + maintenance + tires + trailerMaintenance,
    miles,
  );

  const taxRate = num(a.taxRatePct);
  // Tax is owed on business (operating) profit — your own labor is not a deductible expense.
  const tax = r2(Math.max(0, operating) * (taxRate / 100));

  const ready = gross > 0 && miles > 0;

  // Metrics used by score & warnings
  const fuelPctOfGross = safeDiv(fuel.fuelCost, gross) * 100;
  const tollPctOfGross = safeDiv(tolls, gross) * 100;
  const operatingMarginPct = safeDiv(operating, gross) * 100;
  const waitingHours = hours.breakdown ? hours.breakdown.waiting : num(load.hours.waiting);
  const weightPctOfPayload =
    num(load.weightLbs) > 0 && num(a.payloadCapacityLbs) > 0
      ? (num(load.weightLbs) / num(a.payloadCapacityLbs)) * 100
      : null;

  const w = config.warnings;
  const warnings: Warning[] = [];
  const warn = (key: AutoRiskKey, cond: boolean, message: string) => {
    if (ready && cond) warnings.push({ key, label: AUTO_RISK_LABELS[key], message });
  };
  warn('highDeadhead', dhPct > w.deadheadPct, `${dhPct.toFixed(0)}% of total miles are unpaid.`);
  warn('lowMargin', operatingMarginPct < w.marginPct, `Operating margin is only ${operatingMarginPct.toFixed(1)}%.`);
  warn('highFuelExposure', fuelPctOfGross > w.fuelPctOfGross, `Fuel eats ${fuelPctOfGross.toFixed(0)}% of gross.`);
  warn('tollHeavy', tollPctOfGross > w.tollPctOfGross, `Tolls are ${tollPctOfGross.toFixed(1)}% of gross.`);
  warn('tooManyStops', num(load.stops) > w.stops, `${num(load.stops)} stops on this load.`);
  warn('longWaiting', waitingHours >= w.waitingHours, `${waitingHours.toFixed(1)} h expected waiting.`);
  warn(
    'heavyLoad',
    weightPctOfPayload != null && weightPctOfPayload >= w.weightPctOfPayload,
    `Load uses ${(weightPctOfPayload ?? 0).toFixed(0)}% of trailer payload.`,
  );

  const perHourOperating = hasHours ? safeDiv(operating, hours.total) : null;
  const score = ready
    ? calculateScore(
        {
          profitPerMile: safeDiv(operating, miles),
          profitPerHour: perHourOperating,
          economicProfit: economic,
          marginPct: operatingMarginPct,
          revenuePerMile: safeDiv(gross, miles),
          deadheadPct: dhPct,
          fuelPctOfGross,
          tollPctOfGross,
          stops: Math.max(2, num(load.stops)),
          waitingHours,
          weightPctOfPayload,
          totalMiles: miles,
        },
        load.risks,
        config,
      )
    : null;

  const breakEven = {
    cash,
    withLabor,
    targetProfit,
    minimumAcceptable,
    minimumRounded,
    negotiationTarget,
    minimumPerLoadedMile: safeDiv(minimumRounded, loaded),
    negotiationPerLoadedMile: safeDiv(negotiationTarget, loaded),
    safetyMargin: r2(gross - minimumAcceptable),
  };

  return {
    ready,
    miles: { loaded, deadhead: dh, total: miles, deadheadPct: dhPct },
    revenue: { brokerRate, accessorials, gross },
    fuel,
    hours,
    costs: {
      fuel: fuel.fuelCost,
      def: fuel.defCost,
      maintenance,
      tires,
      trailerMaintenance,
      tolls,
      otherExpenses,
      otherByCategory,
      factoring,
      tripExpenses,
      fixed,
      totalCost,
      variablePerMile,
    },
    profit: {
      operating,
      laborValue,
      economic,
      operatingMarginPct,
      economicMarginPct: safeDiv(economic, gross) * 100,
    },
    perMile: {
      grossPerLoaded: safeDiv(gross, loaded),
      grossPerTotal: safeDiv(gross, miles),
      costPerTotal: safeDiv(totalCost, miles),
      operatingPerTotal: safeDiv(operating, miles),
      economicPerTotal: safeDiv(economic, miles),
    },
    perHour: {
      gross: hasHours ? safeDiv(gross, hours.total) : null,
      operating: perHourOperating,
      economic: hasHours ? safeDiv(economic, hours.total) : null,
      operatingPerCalendarHour: hours.calendarHours ? safeDiv(operating, hours.calendarHours) : null,
    },
    breakEven,
    deadhead: { miles: dh, pct: dhPct, cost: r2(dh * variablePerMile) },
    tax: {
      ratePct: taxRate,
      tax,
      afterTaxOperating: r2(operating - tax),
      afterTaxEconomic: r2(economic - tax),
    },
    warnings,
    score,
    decision: decide(ready, gross, breakEven, score, a.maxNegotiationGapPct, operating),
  };
}

// ───────────────────────── Decision ─────────────────────────

export function decide(
  ready: boolean,
  gross: number,
  be: LoadResult['breakEven'],
  score: ScoreResult | null,
  maxGapPct: number,
  operating: number,
): LoadResult['decision'] {
  if (!ready || !score) {
    return { decision: null, headline: 'Enter gross and miles to see a decision.', reasons: [] };
  }
  const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
  const reasons: string[] = [];

  if (gross < be.cash) {
    reasons.push(`Loses ${money(-operating)} before paying yourself anything.`);
    reasons.push(`Cash break-even is ${money(be.cash)}.`);
    return { decision: 'REJECT', headline: `I would not take this load below ${money(be.minimumRounded)}.`, reasons };
  }
  if (score.total < 40) {
    reasons.push(`Load score ${score.total}/100 — too much risk for the money.`);
    return { decision: 'REJECT', headline: `I would not take this load below ${money(be.minimumRounded)}.`, reasons };
  }
  if (gross >= be.minimumAcceptable) {
    reasons.push(`Covers all costs, your labor and your ${money(be.targetProfit)} target profit.`);
    reasons.push(`Safety margin above minimum: ${money(be.safetyMargin)}.`);
    if (score.total < 55) {
      reasons.push(`But score is only ${score.total}/100 — ask for more to cover the risk.`);
      return { decision: 'NEGOTIATE', headline: `Ask for ${money(be.negotiationTarget)} to cover the risk.`, reasons };
    }
    return { decision: 'TAKE', headline: `Good to take at ${money(gross)}.`, reasons };
  }
  const gapPct = safeDiv(be.minimumAcceptable - gross, gross) * 100;
  if (gross < be.withLabor) {
    reasons.push(`Pays costs but less than your target hourly rate (break-even with labor ${money(be.withLabor)}).`);
  } else {
    reasons.push(`Profitable, but ${money(be.minimumAcceptable - gross)} short of your target profit.`);
  }
  if (gapPct <= maxGapPct) {
    reasons.push(`Needs +${gapPct.toFixed(0)}% — realistic to negotiate.`);
    return {
      decision: 'NEGOTIATE',
      headline: `Ask ${money(be.negotiationTarget)}. I would not take this load below ${money(be.minimumRounded)}.`,
      reasons,
    };
  }
  reasons.push(`Needs +${gapPct.toFixed(0)}% to reach your minimum — unlikely to get it.`);
  return { decision: 'REJECT', headline: `I would not take this load below ${money(be.minimumRounded)}.`, reasons };
}

// ───────────────────────── Sensitivity ─────────────────────────

export interface SensitivityRow {
  dieselPrice: number;
  fuelCost: number;
  operating: number;
  economic: number;
  deltaVsCurrent: number;
}

export function fuelSensitivity(load: LoadInput, config: ScoreConfig, prices: number[]): SensitivityRow[] {
  const base = calculateLoad(load, config);
  return prices.map((price) => {
    const r = calculateLoad({ ...load, fuel: { ...load.fuel, dieselPrice: price } }, config);
    return {
      dieselPrice: price,
      fuelCost: r.costs.fuel,
      operating: r.profit.operating,
      economic: r.profit.economic,
      deltaVsCurrent: r2(r.profit.operating - base.profit.operating),
    };
  });
}
