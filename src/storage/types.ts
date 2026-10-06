import type { EquipmentProfile, LoadInput, Settings } from '../engine/types';

export const SCHEMA_VERSION = 1;

/** Everything the app persists. Mirrors the future SQL tables (see docs/ARCHITECTURE.md). */
export interface AppData {
  version: number;
  settings: Settings;
  profiles: EquipmentProfile[];
  loads: LoadInput[];
  /** Unsaved calculator state, so a broker call can be interrupted without losing input. */
  draft: LoadInput | null;
}

/**
 * Storage abstraction. The MVP uses localStorage; a Supabase/PostgreSQL
 * implementation only has to implement this interface (async on purpose).
 */
export interface DataRepository {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
}
