import { describe, expect, it } from 'vitest';
import { evaluateLoads } from '../engine/analytics';
import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../engine/defaults';
import { calculateLoad } from '../engine/calculate';
import { config, referenceLoad } from '../engine/__tests__/fixtures';
import { fromJSON, loadsFromCSV, parseCSV, toCSV, toJSON } from './exportImport';
import { LocalStorageRepository } from './localRepository';
import { mergeDeep, normalizeAppData } from './normalize';

describe('CSV', () => {
  it('escapes commas, quotes and newlines and parses them back', () => {
    const load = referenceLoad({ notes: 'Call "Mike", gate 3\nno tarps' });
    const csv = toCSV(evaluateLoads([load], config));
    const parsed = parseCSV(csv);
    const notesIdx = parsed[0].indexOf('notes');
    expect(parsed[1][notesIdx]).toBe('Call "Mike", gate 3\nno tarps');
  });

  it('Excel flavor has a BOM and CRLF line endings', () => {
    const csv = toCSV(evaluateLoads([referenceLoad()], config), { excel: true });
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('\r\n');
  });

  it('round-trips the key numbers through export → import', () => {
    const original = referenceLoad({ id: 'x1', status: 'completed' });
    const csv = toCSV(evaluateLoads([original], config));
    const [imported] = loadsFromCSV(csv, DEFAULT_SETTINGS, DEFAULT_PROFILE);
    expect(imported.id).toBe('x1');
    expect(imported.status).toBe('completed');
    expect(imported.broker).toBe('ABC Logistics');
    const a = calculateLoad(original, config);
    const b = calculateLoad(imported, config);
    expect(b.revenue.gross).toBe(a.revenue.gross);
    expect(b.miles.total).toBe(a.miles.total);
    expect(b.hours.total).toBe(a.hours.total);
    expect(b.costs.fuel).toBe(a.costs.fuel);
  });
});

describe('JSON backup', () => {
  it('round-trips all data', () => {
    const data = normalizeAppData({ loads: [referenceLoad({ id: 'j1' })] });
    const restored = fromJSON(toJSON(data));
    expect(restored.loads[0].id).toBe('j1');
    expect(restored.loads[0].revenue.brokerRate).toBe(3000);
    expect(restored.settings.dieselPrice).toBe(DEFAULT_SETTINGS.dieselPrice);
  });

  it('fills missing fields of older / partial data with defaults', () => {
    const restored = normalizeAppData({ settings: { dieselPrice: 4.25 }, loads: [{ id: 'old', broker: 'Q' }] });
    expect(restored.settings.dieselPrice).toBe(4.25);
    expect(restored.settings.targets.monthlyGross).toBe(DEFAULT_SETTINGS.targets.monthlyGross);
    expect(restored.loads[0].fuel.mpg).toBeGreaterThan(0);
    expect(restored.loads[0].broker).toBe('Q');
  });

  it('mergeDeep ignores type-mismatched values', () => {
    expect(mergeDeep({ a: 1, b: { c: 2 } }, { a: 'x', b: { c: 5 } })).toEqual({ a: 1, b: { c: 5 } });
    expect(mergeDeep({ v: null as number | null }, { v: 3 })).toEqual({ v: 3 });
  });
});

describe('LocalStorageRepository', () => {
  it('saves and loads', async () => {
    const mem = new Map<string, string>();
    const repo = new LocalStorageRepository({
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
    });
    const data = normalizeAppData({ loads: [referenceLoad({ id: 'r1' })] });
    await repo.save(data);
    const back = await repo.load();
    expect(back.loads.map((l) => l.id)).toEqual(['r1']);
  });

  it('survives corrupted storage', async () => {
    const repo = new LocalStorageRepository({ getItem: () => '{not json', setItem: () => {} });
    const back = await repo.load();
    expect(back.loads).toEqual([]);
    expect(back.profiles.length).toBe(1);
  });
});
