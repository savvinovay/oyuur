// The forest in the account (OYUUR-30, design/oyuur-30/план.md): what the screens get from the
// sync engine (state/sync.tsx, useSync()) and the new account calls of useFriends().
// The contract between the sync logic and the screens: change only together.
import type { Skin } from '@/game/tree';

/**
 * The saving row in Settings → Account (spec 7):
 * 'off' — no account; 'saved' — everything is in the account; 'saving' — sending for over 400 ms;
 * 'offline' — changes wait for network; 'error' — the server refused 3 times in a row;
 * 'session' — the server said "signed out";
 * 'locked' (OYUUR-31) — there are hidden trees, and this device has no data key for the account's
 *   chest (a tester who hasn't typed the password since the update, or the key was renewed on
 *   another device): they stay only here — "Hidden trees are only on this device · Lock".
 */
export type SyncState = 'off' | 'saved' | 'saving' | 'offline' | 'error' | 'session' | 'locked';

/** One of the three biggest trees for the mini-forest on a card (thumbQueue draws it). */
export interface MiniTree {
  id: string;
  skin: Skin;
  /** Growth days: the stage to draw. */
  days: number;
  dead: boolean;
}

/** One side of the "We found a forest in your account" sheet (spec 5.1, frames 01–05). */
export interface ForestSide {
  /** Trees (each habit's current tree, as on the home screen). */
  trees: number;
  /** Of them hidden ("Only me"): locked in the chest (OYUUR-31). Account side: only if this device could open the chest. */
  hidden: number;
  /** The three biggest, for the mini-forest. */
  biggest: MiniTree[];
  /** Account: when it last changed (ms); phone: null. */
  changedAt: number | null;
  /** Phone: a tree was watered today. */
  wateredToday: boolean;
}

export interface FoundForest {
  nick: string;
  account: ForestSide;
  phone: ForestSide;
  /** Trees after "Merge" (account + phone). */
  merged: number;
}

/** What the screens show once (a toast), then call clearNotice(). */
export type SyncNotice =
  | { kind: 'merged'; trees: number; nick: string }
  /** Waterings from another device brought a "dead" tree back (spec 4.2); days as DayKey. */
  | { kind: 'late'; days: string[] }
  /** Another device erased the forest in the account ("Erase everything"): this phone followed. */
  | { kind: 'wiped' };

export interface Sync {
  state: SyncState;
  /** Changes not in the account yet. */
  pending: number;
  /** Last successful save (ms), null — never. */
  lastOkAt: number | null;
  /** Trees (habits) in the account, open and locked together ("13 trees, 5 locked"). */
  trees: number;
  /** Of them hidden and locked in the chest (OYUUR-31). */
  locked: number;
  /** Hidden trees that are only on this device (state 'locked'); 0 when they are in the chest. */
  hiddenHere: number;
  /**
   * 'error': why — 'server' (refused 3 times) or 'vault' (the chest in the account can't be opened:
   * damaged; nothing is written over it, everything on this device is safe).
   */
  errorWhy: 'server' | 'vault' | null;
  /**
   * The "Lock your hidden trees" sheet (spec 5.2, frames 14–17) should open by itself: state
   * 'locked' and the person hasn't answered "Later" yet. Shown once; "Later" calls lockLater().
   */
  lockPromptDue: boolean;
  /** "Later — keep them on this device": the sheet doesn't open by itself any more (the row stays). */
  lockLater(): void;
  /** Save now: pull → merge → push. Also the tap on the row. */
  syncNow(): void;
  /** The quiet badge on the Settings tile (spec 7): something is wrong for over 24 h. */
  needsAttention: boolean;

  /** Waiting for the person's choice after sign-in (the sync is paused until then). */
  found: FoundForest | null;
  /**
   * 'merge' — both forests together; 'keepAccount' — this phone's forest is put aside for 30 days
   * (localCopy) and the account's forest is used; 'signOut' — sign out, the phone's forest stays.
   * Throws on a server error (the sheet stays, nothing changed).
   */
  resolveFound(choice: 'merge' | 'keepAccount' | 'signOut'): Promise<void>;

  /** The phone's forest put aside by "Keep only the account's forest" (spec 5.1, frame 20). */
  localCopy: { trees: number; until: number } | null;
  /** Adds it back like "Merge". */
  restoreLocal(): Promise<void>;

  /**
   * "Erase everything" with an account (spec 4.3): the forest goes on this phone and in the
   * account (all devices). Throws without network — nothing is erased then.
   */
  eraseEverywhere(): Promise<void>;

  notice: SyncNotice | null;
  clearNotice(): void;

  /** 'session': the nick to sign in with again (the account is gone from useFriends() then). */
  sessionNick: string | null;
  /**
   * 'session': why — 'password' (changed on another device: a session in use ends only so) or
   * 'expired' (not used for months).
   */
  sessionWhy: 'password' | 'expired' | null;
}

/** New account calls in useFriends() (OYUUR-30). Passwords never leave the phone (net/kdf.ts). */
export interface AccountCalls {
  /**
   * Sign in. `newCode` — the account moved to the new sign-in (an old account): the recovery code
   * changed, show it and ask to save it (spec 5.2).
   */
  login(nick: string, password: string): Promise<{ newCode: string | null }>;
  /** Change the password (spec 3.4). Other devices are signed out. `newCode` as in login. */
  changePassword(oldPassword: string, newPassword: string): Promise<{ newCode: string | null }>;
  /**
   * "Forgot password" on a signed-in device (spec 3.7 A/Б, frames 08/09): returns the new recovery
   * code. Without the account's data key here (resetCheck → 'lost') the chest in the account goes.
   */
  resetPassword(newPassword: string): Promise<string>;
  /** A new recovery code (spec 3.5): the old one stops working. */
  newRecoveryCode(password: string): Promise<string>;
  /**
   * "Lock" (spec 5.2, frames 14–17): with the password, this device gets the account's data key
   * (or makes the first one) and the hidden trees go into the chest with the next save.
   * `newCode` — the recovery code had to change (an old account, or the account's first key): show
   * it. Throws ApiError 401 'wrong_password'; offline — ApiError status 0.
   */
  lockHidden(password: string): Promise<{ newCode: string | null }>;
  /**
   * Before "Forgot password" on a signed-in device (spec 3.7, frames 08/09): 'ok' — this device has
   * the account's data key, nothing is lost; 'lost' — the account has a chest this device can't
   * open: a new password loses it for good (frame 09); 'none' — no chest in the account yet.
   * `hiddenHere` — hidden trees on this device that will be locked again (they are never lost).
   * Needs network.
   */
  resetCheck(): Promise<{ key: 'ok' | 'lost' | 'none'; hiddenHere: number }>;
  /**
   * Sign out (spec 5.3): 'wipe' — the forest leaves this phone (first-start state, without the
   * first-start hints); 'keep' — it stays here without an account.
   */
  logout(mode: 'wipe' | 'keep'): Promise<void>;
}

/**
 * Rules for a new password (spec 3.1, owner's decision 12.3): at least 8 characters, not one of
 * the most common ones. Old passwords keep working.
 */
export type PasswordProblem = 'short' | 'common' | null;
