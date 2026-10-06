import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildAssumptions, createLoad, DEFAULT_PROFILE, newId } from '../engine/defaults';
import type { EquipmentProfile, LoadInput, Settings } from '../engine/types';
import { LocalStorageRepository } from '../storage/localRepository';
import { normalizeAppData } from '../storage/normalize';
import type { AppData, DataRepository } from '../storage/types';

interface Store {
  data: AppData;
  draft: LoadInput;
  activeProfile: EquipmentProfile;
  profileById: (id: string) => EquipmentProfile;
  /** Is the draft identical to a saved load? */
  draftSaved: boolean;
  compareIds: string[];
  updateDraft: (fn: (d: LoadInput) => LoadInput) => void;
  newDraft: () => void;
  saveDraft: () => LoadInput;
  editLoad: (id: string) => void;
  duplicateLoad: (id: string) => void;
  deleteLoad: (id: string) => void;
  upsertLoad: (load: LoadInput) => void;
  setDraftProfile: (profileId: string) => void;
  refreshDraftAssumptions: () => void;
  updateSettings: (fn: (s: Settings) => Settings) => void;
  upsertProfile: (p: EquipmentProfile) => void;
  deleteProfile: (id: string) => void;
  replaceData: (data: AppData) => void;
  toggleCompare: (id: string) => void;
  setCompareIds: (ids: string[]) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}

export function StoreProvider({ children, repo }: { children: ReactNode; repo?: DataRepository }) {
  const repository = useMemo(() => repo ?? new LocalStorageRepository(), [repo]);
  const [data, setData] = useState<AppData | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    repository.load().then(setData);
  }, [repository]);

  // Persist (debounced) on every change.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!data) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void repository.save(data), 250);
  }, [data, repository]);
  useEffect(() => {
    const flush = () => data && void repository.save(data);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [data, repository]);

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => (d ? fn(d) : d)), []);

  const value = useMemo<Store | null>(() => {
    if (!data) return null;
    const profileById = (id: string) => data.profiles.find((p) => p.id === id) ?? data.profiles[0] ?? DEFAULT_PROFILE;
    const activeProfile = profileById(data.settings.activeProfileId);
    const draft = data.draft ?? createLoad(data.settings, activeProfile);
    const saved = data.loads.find((l) => l.id === draft.id);
    const draftSaved = !!saved && JSON.stringify(saved) === JSON.stringify(draft);

    const withDraft = (d: AppData, fn: (x: LoadInput) => LoadInput): AppData => {
      const current = d.draft ?? createLoad(d.settings, activeProfile);
      return { ...d, draft: fn(current) };
    };

    return {
      data,
      draft,
      activeProfile,
      profileById,
      draftSaved,
      compareIds,
      updateDraft: (fn) => update((d) => withDraft(d, fn)),
      newDraft: () => update((d) => ({ ...d, draft: createLoad(d.settings, profileById(d.settings.activeProfileId)) })),
      saveDraft: () => {
        const stamped = { ...draft, updatedAt: new Date().toISOString() };
        update((d) => {
          const exists = d.loads.some((l) => l.id === stamped.id);
          return {
            ...d,
            draft: stamped,
            loads: exists ? d.loads.map((l) => (l.id === stamped.id ? stamped : l)) : [stamped, ...d.loads],
          };
        });
        return stamped;
      },
      editLoad: (id) =>
        update((d) => {
          const l = d.loads.find((x) => x.id === id);
          return l ? { ...d, draft: structuredClone(l) } : d;
        }),
      duplicateLoad: (id) =>
        update((d) => {
          const l = d.loads.find((x) => x.id === id);
          if (!l) return d;
          const now = new Date().toISOString();
          return { ...d, draft: { ...structuredClone(l), id: newId(), status: 'offer', createdAt: now, updatedAt: now, invoicedAt: '', paidAt: '' } };
        }),
      deleteLoad: (id) => {
        setCompareIds((ids) => ids.filter((x) => x !== id));
        update((d) => ({ ...d, loads: d.loads.filter((l) => l.id !== id) }));
      },
      upsertLoad: (load) =>
        update((d) => ({
          ...d,
          loads: d.loads.some((l) => l.id === load.id) ? d.loads.map((l) => (l.id === load.id ? load : l)) : [load, ...d.loads],
          draft: d.draft?.id === load.id ? load : d.draft,
        })),
      setDraftProfile: (profileId) =>
        update((d) =>
          withDraft(d, (x) => {
            const p = profileById(profileId);
            const fresh = createLoad(d.settings, p);
            return { ...x, profileId, trailerType: p.trailer.type, fuel: { ...x.fuel, mpg: fresh.fuel.mpg, tankGallons: fresh.fuel.tankGallons }, assumptions: buildAssumptions(d.settings, p) };
          }),
        ),
      refreshDraftAssumptions: () =>
        update((d) =>
          withDraft(d, (x) => {
            const p = profileById(x.profileId);
            const fresh = createLoad(d.settings, p);
            return {
              ...x,
              fuel: { ...x.fuel, mpg: fresh.fuel.mpg, tankGallons: fresh.fuel.tankGallons, defPricePerGallon: fresh.fuel.defPricePerGallon, defPctOfDiesel: fresh.fuel.defPctOfDiesel },
              assumptions: buildAssumptions(d.settings, p),
            };
          }),
        ),
      updateSettings: (fn) => update((d) => ({ ...d, settings: fn(d.settings) })),
      upsertProfile: (p) =>
        update((d) => ({
          ...d,
          profiles: d.profiles.some((x) => x.id === p.id) ? d.profiles.map((x) => (x.id === p.id ? p : x)) : [...d.profiles, p],
        })),
      deleteProfile: (id) =>
        update((d) => {
          if (d.profiles.length <= 1) return d;
          const profiles = d.profiles.filter((p) => p.id !== id);
          const settings = d.settings.activeProfileId === id ? { ...d.settings, activeProfileId: profiles[0].id } : d.settings;
          return { ...d, profiles, settings };
        }),
      replaceData: (next) => setData(normalizeAppData(next)),
      toggleCompare: (id) => setCompareIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(-4))),
      setCompareIds,
    };
  }, [data, compareIds, update]);

  if (!value) return <div className="boot">Loading…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
