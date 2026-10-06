import { describe, expect, it } from 'vitest';
import {
  bestIndex,
  brokerStats,
  compareInsight,
  evaluateLoads,
  filterLoads,
  inRange,
  monthRange,
  overallBest,
  summarize,
  weekRange,
} from '../analytics';
import { calculateLoad } from '../calculate';
import { config, referenceLoad } from './fixtures';

const total = (g: number) => ({ ...referenceLoad().revenue, mode: 'total' as const, totalGross: g });

const loads = [
  referenceLoad({ id: 'a', broker: 'ABC Logistics', status: 'completed', pickupAt: '2026-10-02T08:00', invoicedAt: '2026-10-04', paidAt: '2026-11-03' }),
  referenceLoad({ id: 'b', broker: 'abc logistics ', status: 'booked', pickupAt: '2026-10-10T08:00', revenue: total(2000), invoicedAt: '2026-10-12', paidAt: '2026-11-01' }),
  referenceLoad({ id: 'c', broker: 'XYZ Freight', status: 'cancelled', pickupAt: '2026-10-11T08:00', pickupState: 'OK' }),
  referenceLoad({ id: 'd', broker: 'XYZ Freight', status: 'offer', pickupAt: '2026-09-28T08:00', loadedMiles: 400, deadheadMiles: 20, revenue: total(1800) }),
];
const rows = evaluateLoads(loads, config);

describe('summarize', () => {
  it('sums money and computes rates from totals (not averages of ratios)', () => {
    const s = summarize(rows.slice(0, 2));
    const a = rows[0].result;
    const b = rows[1].result;
    expect(s.loads).toBe(2);
    expect(s.gross).toBe(3300 + 2000);
    expect(s.operating).toBeCloseTo(a.profit.operating + b.profit.operating, 2);
    expect(s.totalMiles).toBe(2000);
    expect(s.deadheadPct).toBe(20);
    expect(s.avgProfitPerMile).toBeCloseTo((a.profit.operating + b.profit.operating) / 2000, 10);
    expect(s.avgProfitPerHour).toBeCloseTo((a.profit.operating + b.profit.operating) / 40, 10);
  });
});

describe('date ranges', () => {
  it('month and Monday-based week ranges', () => {
    expect(monthRange(new Date(2026, 9, 6))).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(weekRange(new Date(2026, 9, 6))).toEqual({ from: '2026-10-05', to: '2026-10-11' }); // Tue → Mon..Sun
    expect(weekRange(new Date(2026, 9, 11))).toEqual({ from: '2026-10-05', to: '2026-10-11' }); // Sunday
  });

  it('dashboard counts only booked/completed loads in range', () => {
    const october = inRange(rows, '2026-10-01', '2026-10-31');
    expect(october.map((r) => r.load.id)).toEqual(['a', 'b']);
  });
});

describe('filters', () => {
  it('search, state, broker (case-insensitive), score and miles', () => {
    expect(filterLoads(rows, { state: 'ok' }).map((r) => r.load.id)).toEqual(['c']);
    expect(filterLoads(rows, { broker: 'ABC LOGISTICS' }).map((r) => r.load.id)).toEqual(['a', 'b']);
    expect(filterLoads(rows, { search: 'atlanta', maxMiles: 500 }).map((r) => r.load.id)).toEqual(['d']);
    expect(filterLoads(rows, { from: '2026-10-01', to: '2026-10-10' }).map((r) => r.load.id)).toEqual(['a', 'b']);
    expect(filterLoads(rows, { minProfit: 2000 }).map((r) => r.load.id)).toEqual(['a', 'c']);
  });
});

describe('brokers', () => {
  it('groups by normalized name, payment days and cancellation rate', () => {
    const stats = brokerStats(rows);
    const abc = stats.find((s) => s.broker === 'ABC Logistics')!;
    expect(abc.quotes).toBe(2);
    expect(abc.hauled).toBe(2);
    expect(abc.avgPaymentDays).toBe((30 + 20) / 2);
    expect(abc.cancellationRatePct).toBe(0);
    const xyz = stats.find((s) => s.broker === 'XYZ Freight')!;
    expect(xyz.cancelled).toBe(1);
    expect(xyz.cancellationRatePct).toBe(100);
    expect(xyz.avgGross).toBe(1800); // cancelled load excluded from rate stats
  });
});

describe('compare', () => {
  it('best index respects direction and ignores all-equal rows', () => {
    expect(bestIndex([1, 3, 2], true)).toBe(1);
    expect(bestIndex([30, 8, 20], false)).toBe(1);
    expect(bestIndex([5, 5], true)).toBe(-1);
    expect(bestIndex([5, 7], null)).toBe(-1);
  });

  it('flags when the biggest gross is not the best load', () => {
    const A = referenceLoad({ id: 'A', loadedMiles: 800, deadheadMiles: 200, revenue: total(4000) });
    A.hours = { ...A.hours, mode: 'auto' };
    const B = referenceLoad({ id: 'B', loadedMiles: 420, deadheadMiles: 30, revenue: total(2800) });
    B.hours = { ...B.hours, mode: 'auto' };
    const ev = [A, B].map((load) => ({ load, result: calculateLoad(load, config) }));
    expect(overallBest(ev)).toBe(1);
    const msg = compareInsight(ev, ['Load A', 'Load B']);
    expect(msg).toContain('Load B beats Load A despite $1,200 less gross');
    expect(msg).toContain('/mile');
  });
});
