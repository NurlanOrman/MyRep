import { createLoad, DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../defaults';
import type { LoadInput } from '../types';

export const config = DEFAULT_SETTINGS;

/**
 * Hand-checked reference load (see calculate.test.ts for the arithmetic):
 * 800 loaded + 200 deadhead = 1,000 mi; gross $3,300; diesel $4.00 @ 10 MPG.
 */
export function referenceLoad(overrides: Partial<LoadInput> = {}): LoadInput {
  const load = createLoad(DEFAULT_SETTINGS, DEFAULT_PROFILE);
  const base: LoadInput = {
    ...load,
    broker: 'ABC Logistics',
    pickupCity: 'Dallas',
    pickupState: 'TX',
    deliveryCity: 'Atlanta',
    deliveryState: 'GA',
    loadedMiles: 800,
    deadheadMiles: 200,
    stops: 2,
    revenue: { ...load.revenue, brokerRate: 3000, fuelSurcharge: 200, detention: 100 },
    fuel: {
      ...load.fuel,
      dieselPrice: 4,
      mpg: 10,
      mpgAdjustmentPct: 0,
      gallonsOverride: null,
      startingFuel: 0,
      tankGallons: 52,
      defPricePerGallon: 3.5,
      defPctOfDiesel: 2,
    },
    hours: { ...load.hours, mode: 'total', total: 20 },
    tolls: { estimated: 25, transponderFees: 5, roads: '' },
    expenses: [
      { id: 'e1', category: 'Lodging', amount: 90, notes: '' },
      { id: 'e2', category: 'Food', amount: 40, notes: '' },
    ],
    assumptions: {
      ...load.assumptions,
      maintenancePerMile: 0.12,
      tirePerMile: 0.04,
      trailerMaintenancePerMile: 0.03,
      payloadCapacityLbs: 16000,
      targetHourlyRate: 25,
      avgSpeedMph: 55,
      hoursPerStop: 1,
      fuelStopHours: 0.33,
      inspectionHoursPerLoad: 0.5,
      factoringPct: 0,
      monthlyFixedCosts: 3000,
      allocation: {
        method: 'perMile',
        expectedMonthlyMiles: 10000,
        workingDaysPerMonth: 22,
        expectedLoadsPerMonth: 12,
        workHoursPerDay: 11,
      },
      targetProfitMode: 'perMile',
      targetProfitPerLoad: 1000,
      targetProfitPerMile: 0.5,
      negotiationBufferPct: 10,
      maxNegotiationGapPct: 25,
      roundRatesTo: 25,
      taxRatePct: 25,
    },
  };
  return { ...base, ...overrides };
}
