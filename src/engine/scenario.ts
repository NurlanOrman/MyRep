import { calculateLoad, type LoadResult, type ScoreConfig } from './calculate';
import { r2 } from './math';
import type { LoadInput } from './types';

/** "What if?" overrides. Undefined = keep the load's own value. */
export interface ScenarioOverrides {
  dieselPrice?: number;
  mpg?: number;
  /** Linehaul broker rate (or all-in total when revenue mode is 'total'). */
  brokerRate?: number;
  loadedMiles?: number;
  deadheadMiles?: number;
  /** Total work hours (switches hours to 'total' mode). */
  hours?: number;
  maintenancePerMile?: number;
  /** Change in monthly insurance, $/month (+ or −), added to fixed costs. */
  insuranceMonthlyDelta?: number;
  targetHourlyRate?: number;
}

export function applyScenario(load: LoadInput, o: ScenarioOverrides): LoadInput {
  const next: LoadInput = {
    ...load,
    revenue: { ...load.revenue },
    fuel: { ...load.fuel },
    hours: { ...load.hours },
    assumptions: { ...load.assumptions, allocation: { ...load.assumptions.allocation } },
  };
  if (o.dieselPrice !== undefined) next.fuel.dieselPrice = o.dieselPrice;
  if (o.mpg !== undefined) {
    next.fuel.mpg = o.mpg;
    next.fuel.gallonsOverride = null; // a manual gallons override would hide the MPG change
  }
  if (o.brokerRate !== undefined) {
    if (next.revenue.mode === 'total') next.revenue.totalGross = o.brokerRate;
    else next.revenue.brokerRate = o.brokerRate;
  }
  if (o.loadedMiles !== undefined) next.loadedMiles = o.loadedMiles;
  if (o.deadheadMiles !== undefined) next.deadheadMiles = o.deadheadMiles;
  if (o.hours !== undefined) {
    next.hours.mode = 'total';
    next.hours.total = o.hours;
  }
  if (o.maintenancePerMile !== undefined) next.assumptions.maintenancePerMile = o.maintenancePerMile;
  if (o.insuranceMonthlyDelta !== undefined)
    next.assumptions.monthlyFixedCosts = r2(next.assumptions.monthlyFixedCosts + o.insuranceMonthlyDelta);
  if (o.targetHourlyRate !== undefined) next.assumptions.targetHourlyRate = o.targetHourlyRate;
  return next;
}

export interface ScenarioComparison {
  base: LoadResult;
  scenario: LoadResult;
  delta: {
    gross: number;
    totalCost: number;
    operating: number;
    economic: number;
    operatingPerMile: number;
    operatingPerHour: number | null;
    score: number | null;
  };
}

export function compareScenario(load: LoadInput, o: ScenarioOverrides, config: ScoreConfig): ScenarioComparison {
  const base = calculateLoad(load, config);
  const scenario = calculateLoad(applyScenario(load, o), config);
  const ph =
    base.perHour.operating != null && scenario.perHour.operating != null
      ? scenario.perHour.operating - base.perHour.operating
      : null;
  return {
    base,
    scenario,
    delta: {
      gross: r2(scenario.revenue.gross - base.revenue.gross),
      totalCost: r2(scenario.costs.totalCost - base.costs.totalCost),
      operating: r2(scenario.profit.operating - base.profit.operating),
      economic: r2(scenario.profit.economic - base.profit.economic),
      operatingPerMile: scenario.perMile.operatingPerTotal - base.perMile.operatingPerTotal,
      operatingPerHour: ph,
      score: base.score && scenario.score ? scenario.score.total - base.score.total : null,
    },
  };
}
