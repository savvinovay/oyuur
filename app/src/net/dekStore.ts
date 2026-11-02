// Where this device keeps the data key of the chest (OYUUR-31; design/oyuur-29/спец.md Т4.3, Т6).
// - A phone: the system's protected storage (expo-secure-store: Android Keystore / iOS Keychain),
//   readable after the first unlock, never copied to another device or a cloud backup.
// - The web: the site's storage (localStorage) — the forest itself already lies there open.
// One key per account (`oyuur.dek.<userId>`), with its id, so a key of another account or an old
// key is never taken for the current one. Signing out and deleting the account remove it.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { DEK_BYTES, kidOf } from './crypto';
import { fromBase64url, toBase64url } from './kdf';

const keyName = (userId: string) => `oyuur.dek.${userId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

function web(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

async function read(name: string): Promise<string | null> {
  if (Platform.OS === 'web') return web()?.getItem(name) ?? null;
  return SecureStore.getItemAsync(name, OPTIONS);
}

async function write(name: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    const s = web();
    if (!s) throw new Error('no_storage');
    s.setItem(name, value);
    return;
  }
  await SecureStore.setItemAsync(name, value, OPTIONS);
}

async function remove(name: string): Promise<void> {
  if (Platform.OS === 'web') {
    web()?.removeItem(name);
    return;
  }
  await SecureStore.deleteItemAsync(name, OPTIONS);
}

/** The key and its id. */
export interface StoredDek {
  dek: Uint8Array;
  kid: string;
}

/** This account's data key on this device, or null (none, or unreadable). */
export async function loadDek(userId: string): Promise<StoredDek | null> {
  try {
    const raw = await read(keyName(userId));
    if (!raw) return null;
    const { k, kid } = JSON.parse(raw) as { k?: unknown; kid?: unknown };
    if (typeof k !== 'string' || typeof kid !== 'string') return null;
    const dek = fromBase64url(k);
    // A damaged entry is the same as none: never a wrong key.
    if (dek.length !== DEK_BYTES || kidOf(dek) !== kid) return null;
    return { dek, kid };
  } catch {
    return null;
  }
}

/** Keeps the key; throws if it couldn't be kept (the caller must not count on it then). */
export async function saveDek(userId: string, dek: Uint8Array): Promise<StoredDek> {
  const kid = kidOf(dek);
  await write(keyName(userId), JSON.stringify({ k: toBase64url(dek), kid }));
  return { dek, kid };
}

/**
 * This device can keep a key at all (writes and removes a probe): asked before an account is made,
 * so an account is never made whose key this device would lose at once.
 */
export async function canKeepDek(): Promise<boolean> {
  const name = 'oyuur.dek.probe';
  try {
    await write(name, '1');
    await remove(name);
    return true;
  } catch {
    return false;
  }
}

export async function dropDek(userId: string): Promise<void> {
  await remove(keyName(userId)).catch(() => {});
}
