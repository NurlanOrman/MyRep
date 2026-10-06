import { normalizeAppData } from './normalize';
import type { AppData, DataRepository } from './types';

const KEY = 'load-profit:data:v1';

export class LocalStorageRepository implements DataRepository {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage()) {}

  async load(): Promise<AppData> {
    try {
      const raw = this.storage?.getItem(KEY);
      return normalizeAppData(raw ? JSON.parse(raw) : {});
    } catch {
      return normalizeAppData({});
    }
  }

  async save(data: AppData): Promise<void> {
    try {
      this.storage?.setItem(KEY, JSON.stringify(data));
    } catch {
      // Quota / private mode: the app keeps working in memory.
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
