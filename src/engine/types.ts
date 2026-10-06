/**
 * Domain types for the load profitability engine.
 *
 * Design rule: a saved load carries a snapshot of every cost assumption it was
 * calculated with (`LoadInput.assumptions`). Changing Settings later only
 * affects NEW loads, so history stays reproducible and auditable.
 */

export type AllocationMethod = 'perMile' | 'perDay' | 'perLoad';
export type RevenueMode = 'itemized' | 'total';
export type HoursMode = 'auto' | 'total' | 'detailed';
export type LoadStatus = 'offer' | 'booked' | 'completed' | 'rejected' | 'cancelled';
export type TargetProfitMode = 'perLoad' | 'perMile';
export type Decision = 'TAKE' | 'NEGOTIATE' | 'REJECT';

// ───────────────────────── Equipment ─────────────────────────

export interface TruckSpec {
  year: string;
  make: string;
  model: string;
  engine: string;
  /** MPG of the truck WITHOUT a trailer. */
  mpg: number;
  tankGallons: number;
  currentMileage: number;
  monthlyPayment: number;
  /** Physical damage / equipment-specific insurance, $/month. */
  monthlyInsurance: number;
  maintenancePerMile: number;
  tirePerMile: number;
}

export interface TrailerSpec {
  type: string;
  lengthFt: number;
  gvwr: number;
  emptyWeight: number;
  /** Max practical payload in lbs (used for the load-weight score). */
  typicalPayload: number;
  /** MPG reduction caused by pulling the trailer, % (e.g. 30 = truck MPG × 0.70). */
  mpgImpactPct: number;
  monthlyPayment: number;
  monthlyInsurance: number;
  maintenancePerMile: number;
}

export interface EquipmentProfile {
  id: string;
  name: string;
  truck: TruckSpec;
  trailer: TrailerSpec;
}

// ───────────────────────── Settings ─────────────────────────

export interface BusinessFixedCosts {
  commercialInsurance: number;
  cargoInsurance: number;
  generalLiability: number;
  eldSoftware: number;
  phone: number;
  parking: number;
  permits: number;
  registration: number;
  accounting: number;
  llc: number;
  other: number;
}

export interface FixedAllocationSettings {
  method: AllocationMethod;
  expectedMonthlyMiles: number;
  workingDaysPerMonth: number;
  expectedLoadsPerMonth: number;
  /** Used to convert work hours into trip days for the per-day method. */
  workHoursPerDay: number;
}

export interface Targets {
  monthlyGross: number;
  monthlyProfit: number; // economic profit
  weeklyGross: number;
  weeklyProfit: number; // economic profit
  profitPerMile: number; // operating profit / total mile
  profitPerHour: number; // operating profit / work hour
}

/** A metric scored linearly: value at `bad` → 0 points, value at `good` → 100 points. */
export interface ScoreRange {
  weight: number;
  bad: number;
  good: number;
}

export interface ScoringSettings {
  profitPerMile: ScoreRange;
  profitPerHour: ScoreRange;
  economicProfit: ScoreRange;
  margin: ScoreRange; // operating margin, %
  revenuePerMile: ScoreRange; // gross / total mile
  deadheadPct: ScoreRange;
  fuelPctOfGross: ScoreRange;
  tollPctOfGross: ScoreRange;
  stops: ScoreRange;
  waitingHours: ScoreRange;
  weightPctOfPayload: ScoreRange;
  /** Trip length fit: 100 pts inside [preferredMin, preferredMax]. */
  tripLength: { weight: number; preferredMin: number; preferredMax: number };
}

export interface WarningThresholds {
  deadheadPct: number;
  marginPct: number;
  stops: number;
  waitingHours: number;
  tollPctOfGross: number;
  fuelPctOfGross: number;
  weightPctOfPayload: number;
}

export interface Settings {
  activeProfileId: string;
  dieselPrice: number;
  defPricePerGallon: number;
  /** DEF use as % of diesel gallons (≈2% for modern diesel pickups). */
  defPctOfDiesel: number;
  targetHourlyRate: number;
  avgSpeedMph: number;
  hoursPerStop: number;
  fuelStopHours: number;
  inspectionHoursPerLoad: number;
  factoringPct: number;
  businessFixed: BusinessFixedCosts;
  allocation: FixedAllocationSettings;
  targetProfit: { mode: TargetProfitMode; perLoad: number; perMile: number };
  negotiationBufferPct: number;
  /** Offer must be within this % of the recommended minimum to be "negotiable". */
  maxNegotiationGapPct: number;
  roundRatesTo: number;
  taxRatePct: number;
  fuelSensitivityPrices: number[];
  targets: Targets;
  scoring: ScoringSettings;
  warnings: WarningThresholds;
  riskPenalties: Record<ManualRiskKey, number>;
}

// ───────────────────────── Risks ─────────────────────────

export type AutoRiskKey =
  | 'highDeadhead'
  | 'tooManyStops'
  | 'longWaiting'
  | 'heavyLoad'
  | 'tollHeavy'
  | 'lowMargin'
  | 'highFuelExposure';

export type ManualRiskKey =
  | 'oversizePermit'
  | 'difficultPickup'
  | 'difficultDelivery'
  | 'badWeather'
  | 'weekendDelivery'
  | 'tightAppointment'
  | 'brokerPaymentRisk'
  | 'trailerCompatibility';

// ───────────────────────── Load ─────────────────────────

export interface Revenue {
  mode: RevenueMode;
  brokerRate: number;
  fuelSurcharge: number;
  detention: number;
  layover: number;
  tarpFee: number;
  stopOffFee: number;
  otherAccessorials: number;
  /** Used only when mode === 'total'. */
  totalGross: number;
}

export interface FuelInput {
  dieselPrice: number;
  /** Loaded MPG with trailer (prefilled from profile). */
  mpg: number;
  /** Load-specific MPG adjustment, % (e.g. -10 for a heavy load / headwind). */
  mpgAdjustmentPct: number;
  /** If set (> 0), replaces calculated gallons. */
  gallonsOverride: number | null;
  /** Fuel in the tank at the start, gallons (cash-flow info only). */
  startingFuel: number;
  tankGallons: number;
  defPricePerGallon: number;
  defPctOfDiesel: number;
}

export interface HoursInput {
  mode: HoursMode;
  total: number;
  driving: number;
  deadheadDriving: number;
  loading: number;
  unloading: number;
  waiting: number;
  fueling: number;
  inspection: number;
  other: number;
}

export interface TollsInput {
  estimated: number;
  transponderFees: number;
  roads: string;
}

export interface ExpenseItem {
  id: string;
  category: string;
  amount: number;
  notes: string;
}

/** Per-load snapshot of cost assumptions (copied from Settings + profile). */
export interface LoadAssumptions {
  maintenancePerMile: number;
  tirePerMile: number;
  trailerMaintenancePerMile: number;
  /** Trailer payload capacity (lbs) — used for the load-weight score. */
  payloadCapacityLbs: number;
  targetHourlyRate: number;
  avgSpeedMph: number;
  hoursPerStop: number;
  fuelStopHours: number;
  inspectionHoursPerLoad: number;
  factoringPct: number;
  monthlyFixedCosts: number;
  allocation: FixedAllocationSettings;
  targetProfitMode: TargetProfitMode;
  targetProfitPerLoad: number;
  targetProfitPerMile: number;
  negotiationBufferPct: number;
  maxNegotiationGapPct: number;
  roundRatesTo: number;
  taxRatePct: number;
}

export interface LoadInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: LoadStatus;
  profileId: string;
  broker: string;
  loadNumber: string;
  pickupCity: string;
  pickupState: string;
  deliveryCity: string;
  deliveryState: string;
  pickupAt: string; // datetime-local string
  deliveryAt: string;
  commodity: string;
  trailerType: string;
  weightLbs: number;
  stops: number; // total stops incl. pickup & delivery
  deadheadMiles: number;
  loadedMiles: number;
  revenue: Revenue;
  fuel: FuelInput;
  hours: HoursInput;
  tolls: TollsInput;
  expenses: ExpenseItem[];
  /** Optional manual override of the trip days used by per-day allocation. */
  tripDaysOverride: number | null;
  /** Optional per-load target profit override ($). */
  targetProfitOverride: number | null;
  risks: Partial<Record<ManualRiskKey, boolean>>;
  assumptions: LoadAssumptions;
  notes: string;
  // Payment tracking (for broker analytics)
  invoicedAt: string;
  paidAt: string;
}
