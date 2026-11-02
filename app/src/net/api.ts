// Talking to the Oyuur server (server/src/app.js). Plain fetch, JSON both ways, a bearer token.
// Every call either returns the server's answer or throws ApiError: status 0 — no network.
import type { DayKey } from '@/game/dates';
import type { Person, SharedTree } from '@/game/shared';
import { migrateOpenHours, type HabitKind, type OpenHourEntry, type Skin, type Tree } from '@/game/tree';
import type { SyncRecord } from '@/state/records';
import type { Kdf } from './kdf';

/**
 * The test server on the homelab. Change here when the own domain comes (oyuur.me).
 * For development a local server: `EXPO_PUBLIC_SERVER=http://localhost:8790 npx expo start`
 * with `server/` started as `DB_PATH=./dev.db PORT=8790 node src/main.js`.
 */
export const SERVER = process.env.EXPO_PUBLIC_SERVER || 'https://oyuur.ayaal.savvinov.me';

/** Invite link: opens the web version (or the app) on "add @nick". */
export const inviteLink = (nick: string) => `${SERVER}/i/${nick}`;

const TIMEOUT = 12_000;

export class ApiError extends Error {
  constructor(
    /** HTTP status; 0 — the server couldn't be reached. */
    public status: number,
    /** The server's error code ('nick_taken', 'wrong_login', 'signed_out', …) or 'offline' / 'server'. */
    public code: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export const isOffline = (e: unknown) => e instanceof ApiError && e.status === 0;
export const isSignedOut = (e: unknown) => e instanceof ApiError && e.status === 401 && e.code === 'signed_out';

async function call<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  let res: Response;
  try {
    res = await fetch(SERVER + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'offline');
  } finally {
    clearTimeout(timer);
  }
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    // An empty or broken answer: the status says enough.
  }
  if (!res.ok) {
    const { error, ...extra } = data;
    throw new ApiError(res.status, typeof error === 'string' ? error : 'server', extra);
  }
  return data as T;
}

// ---- What the server sends ----

/** Me, as the server knows me. */
export interface Account extends Person {
  /** The account's id: the same account even if the nick is taken again later. Missing — a session saved by an older version (friends.tsx asks /api/me). */
  id?: string;
  createdAt: number;
  /** 1 — the old sign-in (the password went to the server), 2 — the sign-in key (net/kdf.ts). Missing — an older server. */
  authV?: 1 | 2;
  /** The account's data key id (OYUUR-31), null — none yet. Missing — an older server. */
  kid?: string | null;
  /** The account keeps a chest of hidden trees (OYUUR-31). */
  vault?: boolean;
}

/** How to make the sign-in key for a nick (OYUUR-30): v1 — an old account, no parameters yet. */
export interface AuthParams {
  v: 1 | 2;
  kdf: Kdf | null;
  recKdf: Kdf | null;
}

/** One page of the account's records (GET /api/sync). */
export interface SyncPage {
  /** With `more`: the rev of the page's last record (ask again from it); else the account's rev. */
  rev: number;
  epoch: number;
  records: SyncRecord[];
  more: boolean;
  /** The account's data key id (OYUUR-31): a chest locked with another key is left alone. Missing — an older server. */
  kid?: string | null;
}

export interface SyncSaved {
  rev: number;
  epoch: number;
  saved: { key: string; rev: number }[];
  /** Records changed on the server since `base`: merge and send again. rev 0 — the server has none. */
  conflicts: SyncRecord[];
}

export interface SyncWrite {
  key: string;
  base: number;
  deleted?: boolean;
  body?: unknown;
}

/** The two keys of a new password and recovery code (net/kdf.ts). */
export interface NewKeys {
  kdf: Kdf;
  auth: string;
  recKdf: Kdf;
  recAuth: string;
}

/** The data key locked by the password and by the code, and its id (OYUUR-31, net/crypto.ts). */
export interface Boxes {
  wrapP: string;
  wrapR: string;
  kid: string;
}

/** The box the password opens; nulls — the account has no data key yet. */
export interface PasswordBox {
  wrapP: string | null;
  kid: string | null;
}

/** A friend's tree as the server keeps it (only trees marked "friends"). */
export interface PublicTree {
  id: string;
  lineageId: string;
  name: string;
  nickname: string | null;
  kind: HabitKind;
  skin: Skin;
  plantedOn: DayKey;
  checkins: DayKey[];
  frozen: DayKey[];
  chancesLeft: number;
  diedOn: DayKey | null;
  completedOn: DayKey | null;
  generation: number;
  /** Watering hours (OYUUR-34); missing from phones of older versions — any time. */
  openHours?: OpenHourEntry[];
}

export interface PublicForest {
  trees: PublicTree[];
  plot: { size: number; places: Record<string, { c: number; r: number }> };
  meadow: string;
  /** How many of their trees are hidden. */
  hidden: number;
}

export type Relation = 'self' | 'friend' | 'outgoing' | 'incoming' | 'blocked' | 'none';

export interface Friend extends Person {
  since: number;
  forest: PublicForest;
  /** When they last sent their forest; null — never. */
  forestAt: number | null;
  cheeredToday: boolean;
  cheeredMe: boolean;
}

export interface FriendLists {
  friends: Friend[];
  incoming: (Person & { at: number })[];
  outgoing: (Person & { at: number })[];
}

export interface Inbox {
  cheers: { from: Person; day: DayKey; at: number }[];
  requests: number;
  offers: number;
}

export type ReportReason = 'spam' | 'abuse' | 'name' | 'other';

/** A friend's tree as a game tree, for drawing and counting (their phone already settled it). */
export function friendTree(t: PublicTree): Tree {
  return {
    ...t,
    visibility: 'friends',
    refilledMonth: t.plantedOn.slice(0, 7),
    settledThrough: t.checkins[t.checkins.length - 1] ?? t.plantedOn,
    parentId: null,
    namedOn: null,
    nameAsks: 0,
    nameAskedOn: null,
    nameLaterOn: null,
    openHours: migrateOpenHours(t.openHours, t.plantedOn),
  };
}

// ---- The calls ----

type Auth = { token: string; user: Account; recoveryCode?: string };

export const api = {
  nick: (nick: string) => call<{ nick: string; valid: boolean; free: boolean; suggestions: string[] }>('GET', `/api/nick/${encodeURIComponent(nick)}`),
  signup: (p: { nick: string; password: string; name: string | null; avatar: string; color: number }) =>
    call<Auth & { recoveryCode: string }>('POST', '/api/signup', p),
  /** The old sign-in: an old account (v1) or an older server. A v1 account answers `legacy: true`. */
  login: (nick: string, password: string) => call<Auth & { legacy?: boolean }>('POST', '/api/login', { nick, password }),
  /** The old recovery (an older server). */
  recover: (nick: string, code: string, password: string) => call<Auth & { recoveryCode: string }>('POST', '/api/recover', { nick, code, password }),

  // ---- Sign-in v2 (OYUUR-30): the password never leaves the phone ----
  authParams: (nick: string) => call<AuthParams>('GET', `/api/auth/params?nick=${encodeURIComponent(nick)}`),
  signupV2: (p: NewKeys & Boxes & { nick: string; name: string | null; avatar: string; color: number }) => call<Auth>('POST', '/api/signup', p),
  loginV2: (nick: string, auth: string) => call<Auth & Partial<PasswordBox>>('POST', '/api/login', { nick, auth }),
  /** An old account moves to v2 (the password checked one last time on the server), with its first data key. 409 already_v2. */
  upgrade: (token: string, p: NewKeys & Boxes & { password: string }) => call<{ ok: true; user: Account }>('POST', '/api/auth/upgrade', p, token),
  /** OYUUR-31: the box the password opens, for a signed-in device without the data key. 401 wrong_password. */
  unlock: (token: string, auth: string) => call<PasswordBox>('POST', '/api/auth/unlock', { auth }, token),
  /**
   * OYUUR-31: the first data key of a v2 account, with a new recovery code. 409 has_keys — another
   * device was first: `extra` carries its {wrapP, kid}.
   */
  keys: (token: string, p: Boxes & { auth: string; recKdf: Kdf; recAuth: string }) => call<{ ok: true; user: Account }>('POST', '/api/auth/keys', p, token),
  /** With a data key, the new password's box (`wrapP`) must come. */
  changePassword: (token: string, p: { oldAuth: string; kdf: Kdf; auth: string; wrapP?: string }) => call<{ ok: true }>('POST', '/api/password', p, token),
  /**
   * "Forgot the password" on a signed-in phone: a new password and code, other phones signed out.
   * With the account's data key: its new boxes; `newDek` — a new key, the account's chest goes.
   */
  resetDevice: (token: string, p: NewKeys & Partial<Boxes> & { newDek: boolean }) =>
    call<{ ok: true; user: Account }>('POST', '/api/password/reset-device', p, token),
  /** With a data key, the new code's box (`wrapR`) must come. */
  recoveryCode: (token: string, p: { auth: string; recKdf: Kdf; recAuth: string; wrapR?: string }) => call<{ ok: true }>('POST', '/api/recovery-code', p, token),
  /** Recovery, step 1: v2 by the code's key (and the box the code opens); a v1 account by the code itself (`legacy`). */
  recoverStart: (p: { nick: string; recAuth: string } | { nick: string; code: string }) =>
    call<{ ticket: string; kdf?: Kdf; legacy?: boolean; wrapR?: string | null; kid?: string | null }>('POST', '/api/recover', p),
  /** Recovery, step 2: a new password and code (and new boxes); every session ends, a new one starts. */
  recoverFinish: (p: NewKeys & Partial<Boxes> & { ticket: string }) => call<Auth>('POST', '/api/recover/finish', p),

  // ---- The forest in the account (OYUUR-30) ----
  syncGet: (token: string, since: number) => call<SyncPage>('GET', `/api/sync?since=${since}`, undefined, token),
  syncPost: (token: string, p: { epoch: number; records: SyncWrite[] }) => call<SyncSaved>('POST', '/api/sync', p, token),
  /** "Erase everything": every record of the account goes, every phone follows (epoch). */
  syncWipe: (token: string) => call<{ rev: number; epoch: number }>('POST', '/api/sync/wipe', {}, token),
  logout: (token: string) => call<{ ok: true }>('POST', '/api/logout', {}, token),
  me: (token: string) => call<{ user: Account }>('GET', '/api/me', undefined, token),
  updateMe: (token: string, p: { name?: string | null; avatar?: string; color?: number }) => call<{ user: Account }>('PATCH', '/api/me', p, token),
  /** v2: `{auth}`; an old account: `{password}`. */
  deleteMe: (token: string, proof: { auth: string } | { password: string }) => call<{ ok: true }>('POST', '/api/me/delete', proof, token),
  search: (token: string, q: string) => call<{ users: (Person & { relation: Relation })[] }>('GET', `/api/users?q=${encodeURIComponent(q)}`, undefined, token),
  user: (token: string, nick: string) =>
    call<{ user: Person; relation: Relation; forest: PublicForest | null; forestAt: number | null }>('GET', `/api/users/${encodeURIComponent(nick)}`, undefined, token),
  friends: (token: string, day: DayKey) => call<FriendLists>('GET', `/api/friends?day=${day}`, undefined, token),
  request: (token: string, nick: string) => call<{ relation: Relation }>('POST', '/api/friends/request', { nick }, token),
  accept: (token: string, nick: string) => call<{ relation: Relation }>('POST', '/api/friends/accept', { nick }, token),
  /** Decline, cancel my request, or remove a friend. */
  remove: (token: string, nick: string) => call<{ relation: Relation }>('POST', '/api/friends/remove', { nick }, token),
  blocks: (token: string) => call<{ users: Person[] }>('GET', '/api/blocks', undefined, token),
  block: (token: string, nick: string) => call<{ relation: Relation }>('POST', '/api/block', { nick }, token),
  unblock: (token: string, nick: string) => call<{ relation: Relation }>('POST', '/api/unblock', { nick }, token),
  report: (token: string, p: { nick: string; reason: ReportReason; text?: string; treeId?: string }) => call<{ ok: true }>('POST', '/api/report', p, token),
  cheer: (token: string, nick: string, day: DayKey) => call<{ ok: true; already: boolean }>('POST', '/api/cheer', { nick, day }, token),
  inbox: (token: string) => call<Inbox>('GET', '/api/inbox', undefined, token),
  inboxSeen: (token: string) => call<{ ok: true }>('POST', '/api/inbox/seen', {}, token),
  shared: (token: string) => call<{ trees: SharedTree[] }>('GET', '/api/shared', undefined, token),
  propose: (token: string, p: { nick: string; name: string; kind: HabitKind; skin: Skin }) => call<{ tree: SharedTree }>('POST', '/api/shared', p, token),
  acceptShared: (token: string, id: string, day: DayKey) => call<{ tree: SharedTree }>('POST', `/api/shared/${id}/accept`, { day }, token),
  declineShared: (token: string, id: string) => call<{ ok: true }>('POST', `/api/shared/${id}/decline`, {}, token),
  endShared: (token: string, id: string) => call<{ ok: true }>('POST', `/api/shared/${id}/end`, {}, token),
  waterShared: (token: string, id: string, day: DayKey) => call<{ tree: SharedTree }>('POST', `/api/shared/${id}/water`, { day }, token),
};
