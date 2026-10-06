const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Whole dollars, e.g. $3,500 / −$240. */
export function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = usd0.format(Math.abs(v));
  return Math.round(v) < 0 ? `−${s}` : s;
}

/** Dollars and cents, e.g. $1,057.40. */
export function cents(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = usd2.format(Math.abs(v));
  return v < 0 && Math.abs(v) >= 0.005 ? `−${s}` : s;
}

/** Per-mile rate, e.g. $1.58. */
export function rate(v: number | null | undefined): string {
  return cents(v);
}

/** Small per-unit rates with 3 decimals, e.g. $0.328/mi. */
export function rate3(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(3)}`;
}

export function hourly(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${money(v)}/hr`;
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
}

export function miles(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return int.format(v);
}

export function hours(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${dec1.format(v)} h`;
}

export function signedMoney(v: number): string {
  if (Math.round(v) === 0) return '$0';
  return v > 0 ? `+${money(v)}` : money(v);
}

export function signed(v: number, fmt: (x: number) => string): string {
  if (Math.abs(v) < 0.005) return fmt(0);
  return v > 0 ? `+${fmt(v)}` : `−${fmt(Math.abs(v))}`;
}

export function shortDate(key: string): string {
  if (!key) return '—';
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function route(load: { pickupCity: string; pickupState: string; deliveryCity: string; deliveryState: string }): string {
  const a = [load.pickupCity, load.pickupState].filter(Boolean).join(', ');
  const b = [load.deliveryCity, load.deliveryState].filter(Boolean).join(', ');
  if (!a && !b) return '—';
  return `${a || '?'} → ${b || '?'}`;
}
