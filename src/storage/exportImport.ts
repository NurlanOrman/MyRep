import { loadDateKey, type EvaluatedLoad } from '../engine/analytics';
import { newId } from '../engine/defaults';
import type { EquipmentProfile, LoadInput, LoadStatus, Settings } from '../engine/types';
import { normalizeAppData, normalizeLoad } from './normalize';
import { SCHEMA_VERSION, type AppData } from './types';

// ───────────────────────── CSV ─────────────────────────

interface Column {
  header: string;
  get: (row: EvaluatedLoad) => string | number;
}

const n2 = (v: number | null | undefined) => (v == null ? '' : Math.round(v * 100) / 100);

export const CSV_COLUMNS: Column[] = [
  { header: 'id', get: ({ load }) => load.id },
  { header: 'date', get: ({ load }) => loadDateKey(load) },
  { header: 'status', get: ({ load }) => load.status },
  { header: 'broker', get: ({ load }) => load.broker },
  { header: 'load_number', get: ({ load }) => load.loadNumber },
  { header: 'pickup_city', get: ({ load }) => load.pickupCity },
  { header: 'pickup_state', get: ({ load }) => load.pickupState },
  { header: 'delivery_city', get: ({ load }) => load.deliveryCity },
  { header: 'delivery_state', get: ({ load }) => load.deliveryState },
  { header: 'pickup_at', get: ({ load }) => load.pickupAt },
  { header: 'delivery_at', get: ({ load }) => load.deliveryAt },
  { header: 'commodity', get: ({ load }) => load.commodity },
  { header: 'weight_lbs', get: ({ load }) => load.weightLbs },
  { header: 'stops', get: ({ load }) => load.stops },
  { header: 'loaded_miles', get: ({ result }) => result.miles.loaded },
  { header: 'deadhead_miles', get: ({ result }) => result.miles.deadhead },
  { header: 'total_miles', get: ({ result }) => result.miles.total },
  { header: 'deadhead_pct', get: ({ result }) => n2(result.miles.deadheadPct) },
  { header: 'gross', get: ({ result }) => n2(result.revenue.gross) },
  { header: 'diesel_price', get: ({ load }) => load.fuel.dieselPrice },
  { header: 'mpg', get: ({ load }) => load.fuel.mpg },
  { header: 'fuel_cost', get: ({ result }) => n2(result.costs.fuel) },
  { header: 'def_cost', get: ({ result }) => n2(result.costs.def) },
  { header: 'maintenance_reserve', get: ({ result }) => n2(result.costs.maintenance + result.costs.trailerMaintenance) },
  { header: 'tire_reserve', get: ({ result }) => n2(result.costs.tires) },
  { header: 'tolls', get: ({ result }) => n2(result.costs.tolls) },
  { header: 'other_expenses', get: ({ result }) => n2(result.costs.otherExpenses) },
  { header: 'factoring', get: ({ result }) => n2(result.costs.factoring) },
  { header: 'trip_expenses', get: ({ result }) => n2(result.costs.tripExpenses) },
  { header: 'fixed_costs', get: ({ result }) => n2(result.costs.fixed.allocated) },
  { header: 'total_cost', get: ({ result }) => n2(result.costs.totalCost) },
  { header: 'operating_profit', get: ({ result }) => n2(result.profit.operating) },
  { header: 'work_hours', get: ({ result }) => n2(result.hours.total) },
  { header: 'owner_labor', get: ({ result }) => n2(result.profit.laborValue) },
  { header: 'economic_profit', get: ({ result }) => n2(result.profit.economic) },
  { header: 'margin_pct', get: ({ result }) => n2(result.profit.operatingMarginPct) },
  { header: 'gross_per_loaded_mile', get: ({ result }) => n2(result.perMile.grossPerLoaded) },
  { header: 'gross_per_total_mile', get: ({ result }) => n2(result.perMile.grossPerTotal) },
  { header: 'profit_per_mile', get: ({ result }) => n2(result.perMile.operatingPerTotal) },
  { header: 'profit_per_hour', get: ({ result }) => n2(result.perHour.operating) },
  { header: 'break_even', get: ({ result }) => n2(result.breakEven.cash) },
  { header: 'minimum_rate', get: ({ result }) => n2(result.breakEven.minimumAcceptable) },
  { header: 'score', get: ({ result }) => result.score?.total ?? '' },
  { header: 'decision', get: ({ result }) => result.decision.decision ?? '' },
  { header: 'invoiced_at', get: ({ load }) => load.invoicedAt },
  { header: 'paid_at', get: ({ load }) => load.paidAt },
  { header: 'notes', get: ({ load }) => load.notes },
];

function csvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows: EvaluatedLoad[], opts: { excel?: boolean } = {}): string {
  const eol = opts.excel ? '\r\n' : '\n';
  const lines = [CSV_COLUMNS.map((c) => c.header).join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(c.get(row))).join(','));
  // UTF-8 BOM makes Excel open the file with the right encoding.
  return (opts.excel ? '﻿' : '') + lines.join(eol) + eol;
}

/** RFC 4180 parser (quoted fields, escaped quotes, CRLF/LF, optional BOM). */
export function parseCSV(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const STATUSES: LoadStatus[] = ['offer', 'booked', 'completed', 'rejected', 'cancelled'];

/**
 * Import loads from a CSV in the export format. Only INPUT columns are read
 * (computed columns are recalculated). Gross becomes an all-in total; work
 * hours, if present, become a total-hours entry.
 */
export function loadsFromCSV(text: string, settings: Settings, profile: EquipmentProfile): LoadInput[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const get = (r: string[], name: string) => (idx(name) >= 0 ? (r[idx(name)] ?? '').trim() : '');
  const numOf = (r: string[], name: string) => {
    const v = parseFloat(get(r, name).replace(/[$,]/g, ''));
    return Number.isFinite(v) ? v : 0;
  };
  return rows.slice(1).map((r) => {
    const load = normalizeLoad({}, settings, profile);
    const status = get(r, 'status') as LoadStatus;
    const hours = numOf(r, 'work_hours');
    const raw: Partial<LoadInput> = {
      id: get(r, 'id') || newId(),
      status: STATUSES.includes(status) ? status : 'offer',
      broker: get(r, 'broker'),
      loadNumber: get(r, 'load_number'),
      pickupCity: get(r, 'pickup_city'),
      pickupState: get(r, 'pickup_state').toUpperCase(),
      deliveryCity: get(r, 'delivery_city'),
      deliveryState: get(r, 'delivery_state').toUpperCase(),
      pickupAt: get(r, 'pickup_at') || (get(r, 'date') ? `${get(r, 'date')}T08:00` : ''),
      deliveryAt: get(r, 'delivery_at'),
      commodity: get(r, 'commodity'),
      weightLbs: numOf(r, 'weight_lbs'),
      stops: numOf(r, 'stops') || 2,
      loadedMiles: numOf(r, 'loaded_miles'),
      deadheadMiles: numOf(r, 'deadhead_miles'),
      revenue: { ...load.revenue, mode: 'total', totalGross: numOf(r, 'gross') },
      fuel: {
        ...load.fuel,
        dieselPrice: numOf(r, 'diesel_price') || load.fuel.dieselPrice,
        mpg: numOf(r, 'mpg') || load.fuel.mpg,
      },
      hours: hours > 0 ? { ...load.hours, mode: 'total', total: hours } : load.hours,
      invoicedAt: get(r, 'invoiced_at'),
      paidAt: get(r, 'paid_at'),
      notes: get(r, 'notes'),
    };
    return { ...load, ...raw };
  });
}

// ───────────────────────── JSON ─────────────────────────

export function toJSON(data: AppData): string {
  return JSON.stringify({ ...data, version: SCHEMA_VERSION, exportedAt: new Date().toISOString() }, null, 2);
}

export function fromJSON(text: string): AppData {
  const parsed = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null) throw new Error('Not a backup file');
  return normalizeAppData(parsed);
}

/** Merge imported loads into existing ones by id (imported wins). */
export function mergeLoads(existing: LoadInput[], incoming: LoadInput[]): LoadInput[] {
  const map = new Map(existing.map((l) => [l.id, l]));
  for (const l of incoming) map.set(l.id, l);
  return [...map.values()];
}
