// A new recovery code handed from a sheet or host that lives over every screen (_layout.tsx) to the
// new-code screen, which shows it once. Kept in memory only, never in the route: a code in a URL
// would stay in the browser's history.
// `why`: 'lock' — "Lock your hidden trees" made it; 'pending' — made earlier, its screen never
// showed (net/pendingCode.ts), and the account has it.
export type HandedWhy = 'lock' | 'pending';

let handed: { code: string; why: HandedWhy } | null = null;

export function handCode(code: string, why: HandedWhy = 'lock') {
  handed = { code, why };
}

/** The handed code, once: a second read gets null. */
export function takeHandedCode(): { code: string; why: HandedWhy } | null {
  const out = handed;
  handed = null;
  return out;
}
