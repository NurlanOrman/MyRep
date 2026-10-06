import type {
  AutoRiskKey,
  EquipmentProfile,
  LoadAssumptions,
  LoadInput,
  ManualRiskKey,
  Settings,
} from './types';

/**
 * Every default assumption lives here and is editable in Settings.
 * There are no other hidden coefficients in the engine.
 */

export const DEFAULT_PROFILE: EquipmentProfile = {
  id: 'profile-default',
  name: 'RAM 3500 DRW + 40’ Gooseneck',
  truck: {
    year: '2022',
    make: 'RAM',
    model: '3500 DRW',
    engine: '6.7 Cummins',
    mpg: 13.5,
    tankGallons: 52,
    currentMileage: 0,
    monthlyPayment: 1100,
    monthlyInsurance: 250,
    maintenancePerMile: 0.12,
    tirePerMile: 0.04,
  },
  trailer: {
    type: 'Gooseneck Flatbed',
    lengthFt: 40,
    gvwr: 24000,
    emptyWeight: 7500,
    typicalPayload: 16500,
    mpgImpactPct: 30,
    monthlyPayment: 450,
    monthlyInsurance: 50,
    maintenancePerMile: 0.03,
  },
};

export const DEFAULT_SETTINGS: Settings = {
  activeProfileId: DEFAULT_PROFILE.id,
  dieselPrice: 3.8,
  defPricePerGallon: 3.5,
  defPctOfDiesel: 2,
  targetHourlyRate: 25,
  avgSpeedMph: 55,
  hoursPerStop: 1,
  fuelStopHours: 0.33,
  inspectionHoursPerLoad: 0.5,
  factoringPct: 0,
  businessFixed: {
    commercialInsurance: 900,
    cargoInsurance: 120,
    generalLiability: 60,
    eldSoftware: 35,
    phone: 80,
    parking: 0,
    permits: 30,
    registration: 40,
    accounting: 100,
    llc: 15,
    other: 50,
  },
  allocation: {
    method: 'perMile',
    expectedMonthlyMiles: 10000,
    workingDaysPerMonth: 22,
    expectedLoadsPerMonth: 12,
    workHoursPerDay: 11,
  },
  targetProfit: { mode: 'perMile', perLoad: 1000, perMile: 0.5 },
  negotiationBufferPct: 10,
  maxNegotiationGapPct: 25,
  roundRatesTo: 25,
  taxRatePct: 25,
  fuelSensitivityPrices: [3.0, 3.5, 4.0, 4.5, 5.0],
  targets: {
    monthlyGross: 25000,
    monthlyProfit: 10000,
    weeklyGross: 6000,
    weeklyProfit: 2400,
    profitPerMile: 1.0,
    profitPerHour: 60,
  },
  scoring: {
    profitPerMile: { weight: 18, bad: 0, good: 2.0 },
    profitPerHour: { weight: 18, bad: 15, good: 100 },
    economicProfit: { weight: 10, bad: 0, good: 2000 },
    margin: { weight: 10, bad: 10, good: 50 },
    revenuePerMile: { weight: 8, bad: 1.25, good: 3.0 },
    deadheadPct: { weight: 10, bad: 40, good: 5 },
    fuelPctOfGross: { weight: 5, bad: 45, good: 15 },
    tollPctOfGross: { weight: 3, bad: 8, good: 0 },
    stops: { weight: 4, bad: 6, good: 2 },
    waitingHours: { weight: 4, bad: 8, good: 0 },
    weightPctOfPayload: { weight: 5, bad: 100, good: 60 },
    tripLength: { weight: 5, preferredMin: 250, preferredMax: 1200 },
  },
  warnings: {
    deadheadPct: 25,
    marginPct: 20,
    stops: 4,
    waitingHours: 4,
    tollPctOfGross: 5,
    fuelPctOfGross: 35,
    weightPctOfPayload: 90,
  },
  riskPenalties: {
    oversizePermit: 6,
    difficultPickup: 4,
    difficultDelivery: 4,
    badWeather: 8,
    weekendDelivery: 3,
    tightAppointment: 4,
    brokerPaymentRisk: 10,
    trailerCompatibility: 10,
  },
};

export const MANUAL_RISKS: { key: ManualRiskKey; label: string }[] = [
  { key: 'oversizePermit', label: 'Oversize / permit requirement' },
  { key: 'difficultPickup', label: 'Difficult pickup' },
  { key: 'difficultDelivery', label: 'Difficult delivery' },
  { key: 'badWeather', label: 'Bad weather' },
  { key: 'weekendDelivery', label: 'Weekend delivery' },
  { key: 'tightAppointment', label: 'Tight appointment' },
  { key: 'brokerPaymentRisk', label: 'Broker payment risk' },
  { key: 'trailerCompatibility', label: 'Trailer compatibility issue' },
];

export const AUTO_RISK_LABELS: Record<AutoRiskKey, string> = {
  highDeadhead: 'High deadhead',
  tooManyStops: 'Too many stops',
  longWaiting: 'Long waiting time',
  heavyLoad: 'Heavy load',
  tollHeavy: 'Toll-heavy route',
  lowMargin: 'Low margin',
  highFuelExposure: 'High fuel exposure',
};

export const EXPENSE_CATEGORIES = [
  'Lodging',
  'Food',
  'Parking',
  'Scale',
  'Wash',
  'Permits',
  'Escort',
  'Loading/unloading',
  'Lumper',
  'Tarp',
  'Chains/straps',
  'Repairs during trip',
  'Miscellaneous',
];

export const BUSINESS_FIXED_LABELS: Record<keyof Settings['businessFixed'], string> = {
  commercialInsurance: 'Commercial (auto liability) insurance',
  cargoInsurance: 'Cargo insurance',
  generalLiability: 'General liability',
  eldSoftware: 'ELD / software',
  phone: 'Phone',
  parking: 'Parking',
  permits: 'Permits (IFTA/IRP/UCR, monthly)',
  registration: 'Registration (monthly)',
  accounting: 'Accounting',
  llc: 'LLC expenses',
  other: 'Other monthly',
};

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Effective loaded MPG for a profile: truck MPG reduced by the trailer impact. */
export function profileLoadedMpg(profile: EquipmentProfile): number {
  return profile.truck.mpg * (1 - profile.trailer.mpgImpactPct / 100);
}

export function sumBusinessFixed(settings: Settings): number {
  return Object.values(settings.businessFixed).reduce((a, b) => a + (Number(b) || 0), 0);
}

/** Business fixed costs + this profile's truck/trailer payments and insurance. */
export function monthlyFixedCosts(settings: Settings, profile: EquipmentProfile): number {
  return (
    sumBusinessFixed(settings) +
    profile.truck.monthlyPayment +
    profile.truck.monthlyInsurance +
    profile.trailer.monthlyPayment +
    profile.trailer.monthlyInsurance
  );
}

export function buildAssumptions(settings: Settings, profile: EquipmentProfile): LoadAssumptions {
  return {
    maintenancePerMile: profile.truck.maintenancePerMile,
    tirePerMile: profile.truck.tirePerMile,
    trailerMaintenancePerMile: profile.trailer.maintenancePerMile,
    payloadCapacityLbs: profile.trailer.typicalPayload,
    targetHourlyRate: settings.targetHourlyRate,
    avgSpeedMph: settings.avgSpeedMph,
    hoursPerStop: settings.hoursPerStop,
    fuelStopHours: settings.fuelStopHours,
    inspectionHoursPerLoad: settings.inspectionHoursPerLoad,
    factoringPct: settings.factoringPct,
    monthlyFixedCosts: monthlyFixedCosts(settings, profile),
    allocation: { ...settings.allocation },
    targetProfitMode: settings.targetProfit.mode,
    targetProfitPerLoad: settings.targetProfit.perLoad,
    targetProfitPerMile: settings.targetProfit.perMile,
    negotiationBufferPct: settings.negotiationBufferPct,
    maxNegotiationGapPct: settings.maxNegotiationGapPct,
    roundRatesTo: settings.roundRatesTo,
    taxRatePct: settings.taxRatePct,
  };
}

export function createLoad(settings: Settings, profile: EquipmentProfile): LoadInput {
  const now = new Date().toISOString();
  return {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    status: 'offer',
    profileId: profile.id,
    broker: '',
    loadNumber: '',
    pickupCity: '',
    pickupState: '',
    deliveryCity: '',
    deliveryState: '',
    pickupAt: '',
    deliveryAt: '',
    commodity: '',
    trailerType: profile.trailer.type,
    weightLbs: 0,
    stops: 2,
    deadheadMiles: 0,
    loadedMiles: 0,
    revenue: {
      mode: 'itemized',
      brokerRate: 0,
      fuelSurcharge: 0,
      detention: 0,
      layover: 0,
      tarpFee: 0,
      stopOffFee: 0,
      otherAccessorials: 0,
      totalGross: 0,
    },
    fuel: {
      dieselPrice: settings.dieselPrice,
      mpg: Math.round(profileLoadedMpg(profile) * 100) / 100,
      mpgAdjustmentPct: 0,
      gallonsOverride: null,
      startingFuel: 0,
      tankGallons: profile.truck.tankGallons,
      defPricePerGallon: settings.defPricePerGallon,
      defPctOfDiesel: settings.defPctOfDiesel,
    },
    hours: {
      mode: 'auto',
      total: 0,
      driving: 0,
      deadheadDriving: 0,
      loading: 0,
      unloading: 0,
      waiting: 0,
      fueling: 0,
      inspection: 0,
      other: 0,
    },
    tolls: { estimated: 0, transponderFees: 0, roads: '' },
    expenses: [],
    tripDaysOverride: null,
    targetProfitOverride: null,
    risks: {},
    assumptions: buildAssumptions(settings, profile),
    notes: '',
    invoicedAt: '',
    paidAt: '',
  };
}
