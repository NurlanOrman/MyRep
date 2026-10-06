/** Round a dollar amount to cents (half away from zero). */
export function r2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Shift via exponent notation to avoid binary artifacts (1.005 * 100 = 100.49999…).
  const abs = String(Math.abs(value));
  const shifted = abs.includes('e') ? Math.round(Math.abs(value) * 100) : Math.round(Number(`${abs}e2`));
  return (Math.sign(value) * shifted) / 100 || 0;
}

/** Division that returns `fallback` instead of Infinity / NaN. */
export function safeDiv(numerator: number, denominator: number, fallback = 0): number {
  if (!denominator || !Number.isFinite(denominator) || !Number.isFinite(numerator)) return fallback;
  return numerator / denominator;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Coerce any input into a finite, non-negative number (blank → 0). */
export function num(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Same as `num` but keeps negatives (used for signed adjustments). */
export function signedNum(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

/** Round UP to the nearest step (e.g. 2,843 → 2,850 for step 25). */
export function ceilTo(value: number, step: number): number {
  if (!step || step <= 0) return r2(value);
  return Math.ceil(r2(value) / step - 1e-9) * step;
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
