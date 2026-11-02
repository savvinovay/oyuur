// A new recovery code on its way to the server (OYUUR-31). The phone makes the code; the server
// keeps only a key made from it. If the server takes a new code and its answer is lost, the old code
// is dead and nobody knows the new one — so the code is kept here BEFORE it is sent, and dropped
// once its screen was closed ("I saved it") or the account shows it never went through.
// Whether the account has it is told by the code's parameters: every new code comes with a new
// random salt (`recKdf.salt`), and GET /api/auth/params gives the account's current one.
// Kept like the data key (net/dekStore.ts): the system's protected storage on a phone, the site's
// storage on the web. One slot: a newer code replaces an older one that never went.
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { AuthParams } from './api';

const NAME = 'oyuur.pendingCode';
const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

export interface PendingCode {
  /** The account's nick (asked about with /api/auth/params). */
  nick: string;
  /** The account's id, when known (not yet for a new account). */
  userId: string | null;
  code: string;
  /** The salt of the code's parameters: the account has this code when its `recKdf.salt` is this one. */
  recSalt: string;
  at: number;
}

/**
 * What the account's parameters say about a code kept here: 'yes' — it is the account's code now
 * (show it); 'no' — the server never took it (drop it).
 */
export function pendingState(p: PendingCode, params: AuthParams | null): 'yes' | 'no' {
  return params?.v === 2 && params.recKdf?.salt === p.recSalt ? 'yes' : 'no';
}

/** A kept code that belongs to this nick (or account). */
export const pendingFor = (p: PendingCode | null, nick: string, userId?: string | null): p is PendingCode =>
  !!p && (p.nick === nick || (!!userId && p.userId === userId));

export function parsePending(raw: string | null): PendingCode | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<PendingCode>;
    if (typeof p.nick !== 'string' || typeof p.code !== 'string' || typeof p.recSalt !== 'string') return null;
    return { nick: p.nick, userId: typeof p.userId === 'string' ? p.userId : null, code: p.code, recSalt: p.recSalt, at: typeof p.at === 'number' ? p.at : 0 };
  } catch {
    return null;
  }
}

function web(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export async function loadPending(): Promise<PendingCode | null> {
  try {
    if (Platform.OS === 'web') return parsePending(web()?.getItem(NAME) ?? null);
    return parsePending(await SecureStore.getItemAsync(NAME, OPTIONS));
  } catch {
    return null;
  }
}

/** Keeps the code before it is sent. Never throws: a phone that can't keep it still goes on. */
export async function savePending(p: PendingCode): Promise<void> {
  try {
    const raw = JSON.stringify(p);
    if (Platform.OS === 'web') web()?.setItem(NAME, raw);
    else await SecureStore.setItemAsync(NAME, raw, OPTIONS);
  } catch {
    // Nothing to do: the screen still shows the code when the answer comes.
  }
}

/** Drops the kept code; `code` — only if it is that one (a newer one stays). */
export async function dropPending(code?: string): Promise<void> {
  try {
    if (code !== undefined) {
      const now = await loadPending();
      if (!now || now.code !== code) return;
    }
    if (Platform.OS === 'web') web()?.removeItem(NAME);
    else await SecureStore.deleteItemAsync(NAME, OPTIONS);
  } catch {
    // Gone or unreadable: the same.
  }
}
