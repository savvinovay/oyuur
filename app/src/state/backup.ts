// Copies of the forest kept on the phone for 30 days (OYUUR-30, спец 5.1, 5.2, Т6, risk 1):
// - `elevate/v1-backup` — the saved data as it was before the first merge with an account, before
//   the move to version 6, and before an erase; nothing reads it back automatically, it is there
//   so a lost forest can still be found.
// - `elevate/v1-local` — this phone's forest put aside by "Keep only the account's forest";
//   Settings can add it back (sync.tsx, restoreLocal).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Forest } from './records';
import { keepUntil } from './records';

export const STORAGE_KEY = 'elevate/v1';
export const BACKUP_KEY = 'elevate/v1-backup';
export const LOCAL_KEY = 'elevate/v1-local';

interface Backup {
  at: number;
  until: number;
  reason: string;
  /** The saved data exactly as it was stored. */
  raw: string;
}

export interface LocalCopy {
  until: number;
  forest: Forest;
}

/**
 * Keeps a copy of the saved data. `overwrite` false: a copy younger than 30 days stays (the first
 * one is the one worth keeping: the forest before anything was merged into it).
 */
export async function saveBackup(reason: string, overwrite: boolean, raw?: string | null): Promise<void> {
  const now = Date.now();
  const data = raw ?? (await AsyncStorage.getItem(STORAGE_KEY));
  if (!data) return;
  if (!overwrite) {
    const old = await AsyncStorage.getItem(BACKUP_KEY).catch(() => null);
    try {
      if (old && (JSON.parse(old) as Backup).until > now) return;
    } catch {
      // A broken copy is replaced.
    }
  }
  const backup: Backup = { at: now, until: keepUntil(now), reason, raw: data };
  await AsyncStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
}

export async function readLocalCopy(): Promise<LocalCopy | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const copy = JSON.parse(raw) as LocalCopy;
    return copy && typeof copy.until === 'number' && copy.forest && Array.isArray(copy.forest.trees) ? copy : null;
  } catch {
    return null;
  }
}

export const writeLocalCopy = (forest: Forest) => {
  const copy: LocalCopy = { until: keepUntil(Date.now()), forest };
  return AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(copy)).then(() => copy);
};

export const dropLocalCopy = () => AsyncStorage.removeItem(LOCAL_KEY);

/** Copies past their 30 days go by themselves. */
export async function sweepCopies(): Promise<void> {
  const now = Date.now();
  for (const key of [BACKUP_KEY, LOCAL_KEY]) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw && !((JSON.parse(raw) as { until?: number }).until! > now)) await AsyncStorage.removeItem(key);
    } catch {
      // Unreadable: left alone.
    }
  }
}
