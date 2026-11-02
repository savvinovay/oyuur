// The person signed out on purpose or deleted the account (friends.tsx tells, sync.tsx listens).
// Without this the sync can't tell "signed out" from "the server ended the session" (спец 7:
// the latter shows "Sign in again to keep saving"). Plain listeners: a few events a year.

// 'key' (OYUUR-31): this device now keeps the account's data key (signed in, locked, a new password):
// the sync reads it and saves the chest at once.
export type AccountEvent = { kind: 'logout'; mode: 'wipe' | 'keep' } | { kind: 'deleted' } | { kind: 'key' };

const listeners = new Set<(e: AccountEvent) => void>();

export const accountEvents = {
  emit(e: AccountEvent) {
    listeners.forEach((l) => l(e));
  },
  on(listener: (e: AccountEvent) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
