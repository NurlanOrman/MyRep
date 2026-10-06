import { createLoad, DEFAULT_PROFILE, DEFAULT_SETTINGS } from '../engine/defaults';
import type { EquipmentProfile, LoadInput, Settings } from '../engine/types';
import { SCHEMA_VERSION, type AppData } from './types';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Deep-merge saved data over a template: keeps every saved value whose type
 * matches the template, fills new fields with defaults (forward-compatible
 * with older saves and partial imports).
 */
export function mergeDeep<T>(template: T, saved: unknown): T {
  if (!isObj(template) || !isObj(saved)) {
    if (saved === undefined) return template;
    if (template === null || saved === null) return (saved ?? template) as T;
    if (Array.isArray(template)) return (Array.isArray(saved) ? saved : template) as T;
    return (typeof saved === typeof template ? saved : template) as T;
  }
  const out: Obj = { ...template };
  for (const key of Object.keys(saved)) {
    const t = (template as Obj)[key];
    out[key] = key in (template as Obj) ? mergeDeep(t, saved[key]) : saved[key];
  }
  return out as T;
}

export function normalizeSettings(raw: unknown): Settings {
  return mergeDeep(DEFAULT_SETTINGS, raw);
}

export function normalizeProfile(raw: unknown): EquipmentProfile {
  return mergeDeep(DEFAULT_PROFILE, raw);
}

export function normalizeLoad(raw: unknown, settings: Settings, profile: EquipmentProfile): LoadInput {
  const template = createLoad(settings, profile);
  const merged = mergeDeep(template, raw);
  if (!Array.isArray(merged.expenses)) merged.expenses = [];
  return merged;
}

export function normalizeAppData(raw: unknown): AppData {
  const r = isObj(raw) ? raw : {};
  const settings = normalizeSettings(r.settings);
  const profiles =
    Array.isArray(r.profiles) && r.profiles.length ? r.profiles.map(normalizeProfile) : [DEFAULT_PROFILE];
  if (!profiles.some((p) => p.id === settings.activeProfileId)) settings.activeProfileId = profiles[0].id;
  const profileFor = (id: unknown) => profiles.find((p) => p.id === id) ?? profiles[0];
  const loads = Array.isArray(r.loads)
    ? r.loads.map((l) => normalizeLoad(l, settings, profileFor(isObj(l) ? l.profileId : null)))
    : [];
  const draft = isObj(r.draft) ? normalizeLoad(r.draft, settings, profileFor(r.draft.profileId)) : null;
  return { version: SCHEMA_VERSION, settings, profiles, loads, draft };
}
