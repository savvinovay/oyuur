// The reminder settings (OYUUR-23), on this phone only, under their own key: the main save (`elevate/v1`)
// and the forest in the account don't carry them — each phone reminds by its own settings.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { clampDoHour, DEFAULT_PREFS, RemindPrefs } from './plan';

export const PREFS_KEY = 'oyuur/remind/v1';

export interface StoredPrefs extends RemindPrefs {
  /** The ask after the first watering was shown (any answer): it never comes by itself again. */
  asked: boolean;
}

const DEFAULT: StoredPrefs = { ...DEFAULT_PREFS, asked: false };

let current: StoredPrefs = DEFAULT;
let loaded = false;
/** Changes made before the saved settings were read: they go on top of them. */
let early: Partial<StoredPrefs> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Saved settings; anything damaged falls back to the default. */
export function parsePrefs(raw: string | null): StoredPrefs {
  if (!raw) return DEFAULT;
  try {
    const p = JSON.parse(raw) as Partial<StoredPrefs>;
    return {
      on: typeof p.on === 'boolean' ? p.on : DEFAULT.on,
      lastChance: typeof p.lastChance === 'boolean' ? p.lastChance : DEFAULT.lastChance,
      doHour: clampDoHour(p.doHour),
      asked: p.asked === true,
    };
  } catch {
    return DEFAULT;
  }
}

let loading: Promise<StoredPrefs> | null = null;
export function loadPrefs(): Promise<StoredPrefs> {
  loading ??= AsyncStorage.getItem(PREFS_KEY)
    .then(parsePrefs, () => DEFAULT)
    .then((p) => {
      current = { ...p, ...early };
      loaded = true;
      if (early) save();
      early = null;
      emit();
      return current;
    });
  return loading;
}

const save = () => {
  AsyncStorage.setItem(PREFS_KEY, JSON.stringify(current)).catch(() => {});
};

export function setPrefs(patch: Partial<StoredPrefs>): void {
  current = { ...current, ...patch };
  if (loaded) save();
  else {
    early = { ...early, ...patch };
    void loadPrefs();
  }
  emit();
}

export const getPrefs = () => current;
export const prefsLoaded = () => loaded;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The settings now; they load once on first use. */
export function useRemindPrefs(): StoredPrefs {
  if (!loaded) void loadPrefs();
  return useSyncExternalStore(subscribe, getPrefs, getPrefs);
}

/** Tests only. */
export function resetPrefsForTests(): void {
  current = DEFAULT;
  loaded = false;
  loading = null;
  early = null;
}
