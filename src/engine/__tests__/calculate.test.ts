import { describe, expect, it } from 'vitest';
import {
  allocateFixedCosts,
  calculateLoad,
  deadheadPct,
  effectiveMpg,
  fuelSensitivity,
  grossRevenue,
  linearPoints,
  scoreLabel,
  totalMiles,
  tripLengthPoints,
} from '../calculate';
import { ceilTo, r2 } from '../math';
import { compareScenario } from '../scenario';
import { config, referenceLoad } from './fixtures';

describe('miles', () => {
  it('total miles = loaded + deadhead', () => {
    expect(totalMiles(800, 200)).toBe(1000);
    expect(totalMiles(800, 0)).toBe(800);
    expect(totalMiles(NaN as unknown as number, 150)).toBe(150);
  });

  it('deadhead % = deadhead / total × 100', () => {
    expect(deadheadPct(200, 1000)).toBe(20);
    expect(deadheadPct(320, 1000)).toBe(32);
    expect(deadheadPct(0, 0)).toBe(0); // no division by zero
  });
});

describe('gross revenue', () => {
  it('sums broker rate and every accessorial', () => {
    const load = referenceLoad();
    load.revenue = {
      ...load.revenue,
      brokerRate: 3000,
      fuelSurcharge: 200,
      detention: 100,
      layover: 150,
      tarpFee: 75,
      stopOffFee: 50,
      otherAccessorials: 25,
    };
    expect(grossRevenue(load)).toBe(3600);
  });

  it('uses the single all-in number in total mode and ignores line items', () => {
    const load = referenceLoad();
    load.revenue = { ...load.revenue, mode: 'total', totalGross: 2750 };
    expect(grossRevenue(load)).toBe(2750);
  });
});

describe('reference load — full P&L', () => {
  const r = calculateLoad(referenceLoad(), config);

  it('fuel: 1,000 mi / 10 MPG = 100 gal × $4.00 = $400', () => {
    expect(r.fuel.gallons).toBe(100);
    expect(r.costs.fuel).toBe(400);
    expect(r.fuel.costPerMile).toBeCloseTo(0.4, 10);
  });

  it('DEF: 2% of 100 gal = 2 gal × $3.50 = $7', () => {
    expect(r.fuel.defGallons).toBeCloseTo(2, 10);
    expect(r.costs.def).toBe(7);
  });

  it('reserves: maintenance $0.12, tires $0.04, trailer $0.03 per mile', () => {
    expect(r.costs.maintenance).toBe(120);
    expect(r.costs.tires).toBe(40);
    expect(r.costs.trailerMaintenance).toBe(30);
  });

  it('tolls and other expenses', () => {
    expect(r.costs.tolls).toBe(30);
    expect(r.costs.otherExpenses).toBe(130);
    expect(r.costs.otherByCategory).toEqual({ Lodging: 90, Food: 40 });
  });

  it('trip expenses, fixed allocation and total cost', () => {
    expect(r.costs.tripExpenses).toBe(757); // 400+7+120+40+30+30+130
    expect(r.costs.fixed.rate).toBeCloseTo(0.3, 10); // $3,000 / 10,000 mi
    expect(r.costs.fixed.allocated).toBe(300);
    expect(r.costs.totalCost).toBe(1057);
  });

  it('operating profit, owner labor, economic profit', () => {
    expect(r.revenue.gross).toBe(3300);
    expect(r.profit.operating).toBe(2243);
    expect(r.profit.laborValue).toBe(500); // 20 h × $25
    expect(r.profit.economic).toBe(1743);
    expect(r.profit.operatingMarginPct).toBeCloseTo((2243 / 3300) * 100, 10);
    expect(r.profit.economicMarginPct).toBeCloseTo((1743 / 3300) * 100, 10);
  });

  it('per-mile metrics', () => {
    expect(r.perMile.grossPerLoaded).toBeCloseTo(4.125, 10);
    expect(r.perMile.grossPerTotal).toBeCloseTo(3.3, 10);
    expect(r.perMile.operatingPerTotal).toBeCloseTo(2.243, 10);
    expect(r.perMile.economicPerTotal).toBeCloseTo(1.743, 10);
  });

  it('per-hour metrics', () => {
    expect(r.perHour.gross).toBeCloseTo(165, 10);
    expect(r.perHour.operating).toBeCloseTo(112.15, 10);
    expect(r.perHour.economic).toBeCloseTo(87.15, 10);
  });

  it('break-even and minimum acceptable rate', () => {
    expect(r.breakEven.cash).toBe(1057);
    expect(r.breakEven.withLabor).toBe(1557);
    expect(r.breakEven.targetProfit).toBe(500); // $0.50 × 1,000 mi
    expect(r.breakEven.minimumAcceptable).toBe(2057);
    expect(r.breakEven.minimumRounded).toBe(2075);
    expect(r.breakEven.negotiationTarget).toBe(2275); // 2,057 × 1.10 = 2,262.70 → 2,275
    expect(r.breakEven.safetyMargin).toBe(1243);
  });

  it('deadhead cost = deadhead miles × variable cost per mile', () => {
    // variable = (400 + 7 + 120 + 40 + 30) / 1000 = $0.597/mi
    expect(r.costs.variablePerMile).toBeCloseTo(0.597, 10);
    expect(r.deadhead.cost).toBe(119.4);
    expect(r.deadhead.pct).toBe(20);
  });

  it('tax estimate is on operating profit', () => {
    expect(r.tax.tax).toBe(560.75);
    expect(r.tax.afterTaxOperating).toBe(1682.25);
    expect(r.tax.afterTaxEconomic).toBe(1182.25);
  });

  it('decision is TAKE with a positive safety margin', () => {
    expect(r.decision.decision).toBe('TAKE');
  });
});

describe('fuel options', () => {
  it('MPG adjustment reduces effective MPG', () => {
    expect(effectiveMpg(10, -10)).toBeCloseTo(9, 10);
    expect(effectiveMpg(10, 0)).toBe(10);
  });

  it('manual gallons override replaces calculated gallons', () => {
    const load = referenceLoad();
    load.fuel = { ...load.fuel, gallonsOverride: 120 };
    const r = calculateLoad(load, config);
    expect(r.fuel.calculatedGallons).toBe(100);
    expect(r.fuel.gallons).toBe(120);
    expect(r.fuel.isOverride).toBe(true);
    expect(r.costs.fuel).toBe(480);
  });

  it('starting fuel changes fuel to buy, not the cost of the load', () => {
    const load = referenceLoad();
    load.fuel = { ...load.fuel, startingFuel: 30 };
    const r = calculateLoad(load, config);
    expect(r.costs.fuel).toBe(400);
    expect(r.fuel.fuelToBuy).toBe(70);
    expect(r.fuel.fuelStops).toBe(2); // 70 gal / 52 gal tank
    expect(r.fuel.remainingAfterTrip).toBe(0);
  });

  it('fuel sensitivity: each $1/gal moves profit by gallons × $1', () => {
    const rows = fuelSensitivity(referenceLoad(), config, [3, 4, 5]);
    expect(rows.map((x) => x.fuelCost)).toEqual([300, 400, 500]);
    expect(rows.map((x) => x.deltaVsCurrent)).toEqual([100, 0, -100]);
  });
});

describe('fixed cost allocation', () => {
  it('per mile: monthly / expected miles × trip miles', () => {
    const r = allocateFixedCosts(referenceLoad(), 1000, 20);
    expect(r.allocated).toBe(300);
  });

  it('per working day: monthly / working days × (work hours / hours per day)', () => {
    const load = referenceLoad();
    load.assumptions.allocation = { ...load.assumptions.allocation, method: 'perDay' };
    const r = allocateFixedCosts(load, 1000, 22);
    expect(r.rate).toBeCloseTo(3000 / 22, 10);
    expect(r.basis).toBe(2);
    expect(r.allocated).toBe(272.73);
  });

  it('per working day honors a manual trip-days override', () => {
    const load = referenceLoad({ tripDaysOverride: 3 });
    load.assumptions.allocation = { ...load.assumptions.allocation, method: 'perDay' };
    expect(allocateFixedCosts(load, 1000, 22).allocated).toBe(409.09);
  });

  it('per load: monthly / expected loads', () => {
    const load = referenceLoad();
    load.assumptions.allocation = { ...load.assumptions.allocation, method: 'perLoad' };
    expect(allocateFixedCosts(load, 1000, 22).allocated).toBe(250);
  });

  it('zero denominators do not explode', () => {
    const load = referenceLoad();
    load.assumptions.allocation = { ...load.assumptions.allocation, expectedMonthlyMiles: 0 };
    expect(allocateFixedCosts(load, 1000, 20).allocated).toBe(0);
  });
});

describe('hours', () => {
  it('auto mode estimates from miles, stops, fuel stops and inspection', () => {
    const load = referenceLoad();
    load.hours = { ...load.hours, mode: 'auto', waiting: 2 };
    const r = calculateLoad(load, config);
    const b = r.hours.breakdown!;
    expect(b.driving).toBeCloseTo(800 / 55, 10);
    expect(b.deadheadDriving).toBeCloseTo(200 / 55, 10);
    expect(b.loading).toBe(1);
    expect(b.unloading).toBe(1);
    expect(b.fueling).toBeCloseTo(0.66, 10); // 2 stops × 0.33 h
    expect(b.inspection).toBe(0.5);
    expect(b.waiting).toBe(2);
    expect(r.hours.total).toBeCloseTo(1000 / 55 + 1 + 1 + 0.66 + 0.5 + 2, 10);
  });

  it('detailed mode sums the entered components', () => {
    const load = referenceLoad();
    load.hours = {
      mode: 'detailed',
      total: 0,
      driving: 14,
      deadheadDriving: 3,
      loading: 1,
      unloading: 1.5,
      waiting: 2,
      fueling: 0.5,
      inspection: 0.5,
      other: 0.5,
    };
    const r = calculateLoad(load, config);
    expect(r.hours.total).toBe(23);
    expect(r.profit.laborValue).toBe(575);
  });

  it('calendar duration = delivery − pickup + deadhead driving', () => {
    const load = referenceLoad({ pickupAt: '2026-10-06T08:00', deliveryAt: '2026-10-07T14:00' });
    const r = calculateLoad(load, config);
    expect(r.hours.calendarHours).toBeCloseTo(30 + 200 / 55, 10);
  });

  it('per-hour metrics are null when hours are zero', () => {
    const load = referenceLoad();
    load.hours = { ...load.hours, mode: 'total', total: 0 };
    const r = calculateLoad(load, config);
    expect(r.perHour.operating).toBeNull();
    expect(r.profit.laborValue).toBe(0);
  });
});

describe('factoring', () => {
  it('break-even solves for gross when factoring is a % of gross', () => {
    const load = referenceLoad();
    load.assumptions.factoringPct = 3;
    const r = calculateLoad(load, config);
    expect(r.costs.factoring).toBe(99);
    expect(r.costs.totalCost).toBe(1156);
    expect(r.breakEven.cash).toBe(r2(1057 / 0.97));
    // Verify: at break-even gross, operating profit ≈ 0
    const atBe = referenceLoad();
    atBe.assumptions.factoringPct = 3;
    atBe.revenue = { ...atBe.revenue, mode: 'total', totalGross: r.breakEven.cash };
    expect(Math.abs(calculateLoad(atBe, config).profit.operating)).toBeLessThanOrEqual(0.01);
  });
});

describe('decision', () => {
  const withGross = (g: number) => {
    const load = referenceLoad();
    load.revenue = { ...load.revenue, mode: 'total', totalGross: g };
    return calculateLoad(load, config);
  };

  it('REJECT below cash break-even', () => {
    expect(withGross(1000).decision.decision).toBe('REJECT');
  });

  it('NEGOTIATE when within reach of the minimum', () => {
    const r = withGross(1900); // min 2,057 → needs +8%
    expect(r.decision.decision).toBe('NEGOTIATE');
    expect(r.decision.headline).toContain('$2,075');
  });

  it('REJECT when the gap to minimum is unrealistic', () => {
    const r = withGross(1300); // needs +58%
    expect(r.decision.decision).toBe('REJECT');
  });

  it('no decision until gross and miles are entered', () => {
    expect(withGross(0).decision.decision).toBeNull();
  });
});

describe('load score', () => {
  it('linear points, including inverted metrics', () => {
    expect(linearPoints(1.5, { bad: 0, good: 1.5 })).toBe(100);
    expect(linearPoints(0.75, { bad: 0, good: 1.5 })).toBe(50);
    expect(linearPoints(-1, { bad: 0, good: 1.5 })).toBe(0);
    expect(linearPoints(20, { bad: 40, good: 5 })).toBeCloseTo((20 / 35) * 100, 10);
  });

  it('trip length fit', () => {
    expect(tripLengthPoints(500, 250, 1200)).toBe(100);
    expect(tripLengthPoints(125, 250, 1200)).toBe(0);
    expect(tripLengthPoints(1800, 250, 1200)).toBe(50);
  });

  it('labels follow the 85/70/55/40 bands', () => {
    expect(scoreLabel(85).label).toBe('EXCELLENT LOAD');
    expect(scoreLabel(84).label).toBe('GOOD LOAD');
    expect(scoreLabel(55).label).toBe('MARGINAL');
    expect(scoreLabel(40).label).toBe('RISKY');
    expect(scoreLabel(39).label).toBe('BAD LOAD');
  });

  it('score is a weighted average of components (weights renormalize)', () => {
    const r = calculateLoad(referenceLoad(), config);
    const s = r.score!;
    const w = s.components.reduce((a, c) => a + c.weight, 0);
    const expected = s.components.reduce((a, c) => a + c.points * c.weight, 0) / w;
    expect(s.base).toBeCloseTo(expected, 10);
    expect(s.total).toBe(Math.round(expected));
    // weight unknown (0 lbs) → weight component excluded
    expect(s.components.find((c) => c.key === 'weightPctOfPayload')).toBeUndefined();
  });

  it('manual risks subtract their penalty', () => {
    const base = calculateLoad(referenceLoad(), config).score!;
    const risky = calculateLoad(referenceLoad({ risks: { brokerPaymentRisk: true, badWeather: true } }), config).score!;
    expect(risky.penalty).toBe(18);
    expect(risky.total).toBe(Math.round(base.base - 18));
  });

  it('Load B ($2,800 / 450 mi) beats Load A ($4,000 / 1,000 mi)', () => {
    const a = referenceLoad({ loadedMiles: 800, deadheadMiles: 200 });
    a.revenue = { ...a.revenue, mode: 'total', totalGross: 4000 };
    a.hours = { ...a.hours, mode: 'auto' };
    const b = referenceLoad({ loadedMiles: 420, deadheadMiles: 30 });
    b.revenue = { ...b.revenue, mode: 'total', totalGross: 2800 };
    b.hours = { ...b.hours, mode: 'auto' };
    const ra = calculateLoad(a, config);
    const rb = calculateLoad(b, config);
    expect(ra.revenue.gross).toBeGreaterThan(rb.revenue.gross);
    expect(rb.perMile.operatingPerTotal).toBeGreaterThan(ra.perMile.operatingPerTotal);
    expect(rb.score!.total).toBeGreaterThan(ra.score!.total);
  });

  it('high deadhead triggers a warning and lowers the score', () => {
    const low = calculateLoad(referenceLoad({ loadedMiles: 800, deadheadMiles: 50 }), config);
    const high = calculateLoad(referenceLoad({ loadedMiles: 800, deadheadMiles: 400 }), config);
    expect(high.warnings.map((w) => w.key)).toContain('highDeadhead');
    expect(low.warnings.map((w) => w.key)).not.toContain('highDeadhead');
    expect(high.score!.total).toBeLessThan(low.score!.total);
  });
});

describe('scenario (what if)', () => {
  it('diesel +$1 on 100 gal reduces operating profit by $100', () => {
    const c = compareScenario(referenceLoad(), { dieselPrice: 5 }, config);
    expect(c.delta.operating).toBe(-100);
    expect(c.delta.economic).toBe(-100);
  });

  it('insurance +$500/month on per-mile allocation adds $50 to a 1,000 mi load', () => {
    const c = compareScenario(referenceLoad(), { insuranceMonthlyDelta: 500 }, config);
    expect(c.delta.totalCost).toBe(50);
  });

  it('broker rate change flows 1:1 into profit (no factoring)', () => {
    const c = compareScenario(referenceLoad(), { brokerRate: 3500 }, config);
    expect(c.delta.gross).toBe(500);
    expect(c.delta.operating).toBe(500);
  });

  it('does not mutate the original load', () => {
    const load = referenceLoad();
    compareScenario(load, { dieselPrice: 9, hours: 99 }, config);
    expect(load.fuel.dieselPrice).toBe(4);
    expect(load.hours.total).toBe(20);
  });
});

describe('math helpers', () => {
  it('r2 rounds half away from zero to cents', () => {
    expect(r2(1.005)).toBe(1.01);
    expect(r2(-1.005)).toBe(-1.01);
    expect(r2(0.1 + 0.2)).toBe(0.3);
    expect(r2(1e-9)).toBe(0);
  });
  it('ceilTo rounds up to a step', () => {
    expect(ceilTo(2843, 25)).toBe(2850);
    expect(ceilTo(2850, 25)).toBe(2850);
    expect(ceilTo(2850.01, 25)).toBe(2875);
  });
});
