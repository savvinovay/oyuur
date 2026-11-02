// Friends, online (wave 5, design/волна-5/спец-друзья.md, sections 3, 11, 12).
// - The account is optional: without one the app works as before, Friends shows "sign in".
// - My open trees reach the account through the sync (sync.tsx, OYUUR-30); the server builds what
//   friends see from them. Hidden trees go only locked, in the chest (OYUUR-31).
// - Sign-in v2 (OYUUR-30, net/kdf.ts): the password never leaves the phone, the server gets a key
//   made from it. An old account moves to v2 the first time its password is typed again.
// - The data key of the chest of hidden trees (OYUUR-31, net/crypto.ts): made by the phone once per
//   account, kept on the server only in two boxes (opened by the password / by the code), kept here
//   in net/dekStore.ts — saved before a screen says "done", dropped on signing out and deleting.
// - Friends, requests and shared trees are fetched on start, when the app comes back, every
//   minute while it is open, and on pull; the last answer is kept on the phone with its time,
//   so without network the screens show it ("no internet · data from 14:05").
// - A cheer or my half of a shared tree's watering without network waits in a queue.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { DayKey } from '@/game/dates';
import type { AvatarId } from '@/game/profile';
import { SharedTree } from '@/game/shared';
import { HabitKind, Skin } from '@/game/tree';
import { passwordProblem } from '@/game/password';
import { analytics } from '@/net/analytics';
import { Account, api, ApiError, AuthParams, Boxes, FriendLists, Inbox, isOffline, isSignedOut, NewKeys, ReportReason } from '@/net/api';
import { kidOf, newDek, unwrapDek, wrapDek } from '@/net/crypto';
import { canKeepDek, dropDek, loadDek, saveDek } from '@/net/dekStore';
import { deriveKeys, isKdf, Kdf, newKdf, newRecoveryCode, normCode, normPassword, passwordAuth } from '@/net/kdf';
import { dropPending, loadPending, PendingCode, pendingFor, pendingState, savePending } from '@/net/pendingCode';
import { passwordMayGo, readV2Nicks, rememberV2 } from '@/net/v2nicks';
import { enqueue, failed, ownedBy, Queued, QueueItem, settled, waiting } from '@/net/queue';
import { forgetFriendForests } from '@/ui/together/friendForests';
import { accountEvents } from './accountEvents';
import { BACKUP_KEY, LOCAL_KEY } from './backup';
import { hiddenHabits } from './records';
import { useStore } from './store';
import type { AccountCalls } from './syncContract';

const SESSION_KEY = 'oyuur/session';
const CACHE_KEY = 'oyuur/friends';
const POLL = 60_000;

export type NetStatus = 'idle' | 'loading' | 'ok' | 'offline' | 'error';

interface Session {
  token: string;
  user: Account;
}

interface Cache {
  /** When the lists below came from the server (ms); 0 — never. */
  fetchedAt: number;
  lists: FriendLists;
  shared: SharedTree[];
  inbox: Inbox;
  queue: QueueItem[];
  /** The account prompt on first start was shown (spec 3.1). */
  promptSeen: boolean;
}

const EMPTY: Cache = {
  fetchedAt: 0,
  lists: { friends: [], incoming: [], outgoing: [] },
  shared: [],
  inbox: { cheers: [], requests: 0, offers: 0 },
  queue: [],
  promptSeen: false,
};

/** The keys of a password / a code: `authKey` for the server, `wrapKey` opens its box here. One scrypt each. */
const passwordKeys = (password: string, kdf: Kdf) => deriveKeys(normPassword(password), kdf);
const codeKeys = (code: string, kdf: Kdf) => deriveKeys(normCode(code), kdf);

/**
 * A new password and a new recovery code, as keys for the server (the code itself is shown once),
 * and the data key locked by both (OYUUR-31): the server gets the boxes, never the key.
 */
async function newKeys(password: string, dek: Uint8Array): Promise<{ keys: NewKeys & Boxes; code: string }> {
  const kdf = newKdf();
  const recKdf = newKdf();
  const code = newRecoveryCode();
  const p = await passwordKeys(password, kdf);
  const r = await codeKeys(code, recKdf);
  const keys = { kdf, auth: p.authKey, recKdf, recAuth: r.authKey, wrapP: wrapDek(dek, p.wrapKey, 'p'), wrapR: wrapDek(dek, r.wrapKey, 'r'), kid: kidOf(dek) };
  p.wrapKey.fill(0);
  r.wrapKey.fill(0);
  return { keys, code };
}

/**
 * The data key out of a box the account sent. A box that doesn't open with a secret the server
 * has just accepted is damaged: ApiError 'box_broken' (nothing is finished then).
 */
function openBox(wrap: string, wrapKey: Uint8Array, which: 'p' | 'r', kid: string): Uint8Array {
  try {
    return unwrapDek(wrap, wrapKey, which, kid);
  } catch {
    throw new ApiError(422, 'box_broken');
  }
}

/** Who a new recovery code is for (net/pendingCode.ts): asked about by nick. */
interface CodeOwner {
  nick: string;
  userId: string | null;
}

/** A call that made the code the account's went through, though its answer was lost on the way. */
const WENT = Symbol('went');

/**
 * Sends a call that makes `code` the account's recovery code (the old one dies with it). The code
 * is kept on the phone first (net/pendingCode.ts): if the answer is lost, nobody would know it.
 * A clear refusal (4xx) drops it. A lost answer (no network, a server error) is checked: the
 * account has the code's salt now — WENT (the code is the only one); it doesn't — dropped and the
 * error goes on; can't tell — it stays kept, and the next start or sign-in asks again.
 */
async function sendWithCode<T>(who: CodeOwner, code: string, recKdf: Kdf, run: () => Promise<T>): Promise<T | typeof WENT> {
  const hold: PendingCode = { nick: who.nick, userId: who.userId, code, recSalt: recKdf.salt, at: Date.now() };
  await savePending(hold);
  try {
    return await run();
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
      await dropPending(code);
      throw e;
    }
    let params: AuthParams | null | undefined;
    try {
      params = await paramsOf(who.nick);
    } catch {
      params = undefined;
    }
    if (params !== undefined) {
      if (pendingState(hold, params) === 'yes') return WENT;
      await dropPending(code);
    }
    throw e;
  }
}

/**
 * The account's first data key (a v2 account without one, /api/auth/keys): a new code comes with it.
 * Another device was first (409 has_keys): its key, from the box the password opens, and no new code.
 * An answer lost on the way is checked (sendWithCode): the key may have gone through.
 */
async function firstKey(token: string, auth: string, wrapKeyP: Uint8Array, who: CodeOwner): Promise<{ dek: Uint8Array; code: string | null }> {
  const dek = newDek();
  const recKdf = newKdf();
  const code = newRecoveryCode();
  const r = await codeKeys(code, recKdf);
  const kid = kidOf(dek);
  const boxes = { wrapP: wrapDek(dek, wrapKeyP, 'p'), wrapR: wrapDek(dek, r.wrapKey, 'r'), kid };
  r.wrapKey.fill(0);
  try {
    await sendWithCode(who, code, recKdf, () => api.keys(token, { auth, recKdf, recAuth: r.authKey, ...boxes }));
    return { dek, code };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && e.code === 'has_keys' && typeof e.extra.wrapP === 'string' && typeof e.extra.kid === 'string') {
      return { dek: openBox(e.extra.wrapP, wrapKeyP, 'p', e.extra.kid), code: null };
    }
    throw e;
  }
}

/** How the server wants this nick's keys; null — an older server without sign-in v2. */
async function paramsOf(nick: string): Promise<AuthParams | null> {
  try {
    return await api.authParams(nick);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

const kdfOrFail = (k: Kdf | null): Kdf => {
  if (!isKdf(k)) throw new ApiError(502, 'server');
  return k;
};

/**
 * An old account moved to sign-in v2, so the old recovery code is dead and `code` is the only one,
 * but the next step failed: the error carries the code (`extra.newCode`) for the screen to show.
 */
function withNewCode(e: unknown, code: string | null): unknown {
  if (!code) return e;
  if (e instanceof ApiError) {
    e.extra = { ...e.extra, newCode: code };
    return e;
  }
  return new ApiError(0, 'offline', { newCode: code });
}

/** The code an error carries (withNewCode), if any. */
export const newCodeOf = (e: unknown): string | null =>
  e instanceof ApiError && typeof e.extra.newCode === 'string' ? e.extra.newCode : null;

/** A new password too weak (спец 3.1): refused here as well as on the screen. */
function checkNewPassword(password: string, nick: string) {
  if (passwordProblem(password, nick)) throw new ApiError(400, 'bad_password');
}

export interface Friends extends AccountCalls {
  /** Storage read: until then nothing is known (don't show "sign in" yet). */
  ready: boolean;
  account: Account | null;
  status: NetStatus;
  /** When the friends data was fetched (ms), 0 — never. */
  fetchedAt: number;
  lists: FriendLists;
  shared: SharedTree[];
  inbox: Inbox;
  /** Things waiting for network. */
  queue: QueueItem[];
  isWaiting(action: Queued): boolean;
  promptSeen: boolean;
  markPromptSeen(): void;
  /**
   * A new recovery code the account has, whose screen never showed (its answer was lost, or the app
   * closed first; net/pendingCode.ts): found on start, to show once. Then pendingCodeTaken().
   */
  pendingCode: string | null;
  pendingCodeTaken(): void;

  // Account
  checkNick: typeof api.nick;
  /** Returns the one-time recovery code to show. */
  signup(nick: string, password: string): Promise<string>;
  /** Returns the new recovery code. */
  recover(nick: string, code: string, password: string): Promise<string>;
  deleteAccount(password: string): Promise<void>;
  /** Runs a call with my token (the sync uses it); a dead session signs out. */
  authed<T>(run: (token: string) => Promise<T>): Promise<T>;

  // Friends
  refresh(): Promise<void>;
  search: (q: string) => ReturnType<typeof api.search>;
  user: (nick: string) => ReturnType<typeof api.user>;
  requestFriend(nick: string): Promise<void>;
  acceptFriend(nick: string): Promise<void>;
  /** Decline a request, cancel mine, or remove a friend. */
  removeFriend(nick: string): Promise<void>;
  block(nick: string): Promise<void>;
  unblock(nick: string): Promise<void>;
  blocks: () => ReturnType<typeof api.blocks>;
  report(p: { nick: string; reason: ReportReason; text?: string; treeId?: string }): Promise<void>;
  /** Once a day per friend; works without network (queued). */
  cheer(nick: string): void;
  /** Cheers I got are seen (the dot goes). */
  cheersSeen(): Promise<void>;

  // Shared trees
  proposeShared(p: { nick: string; name: string; kind: HabitKind; skin: Skin }): Promise<SharedTree>;
  acceptShared(id: string): Promise<void>;
  declineShared(id: string): Promise<void>;
  endShared(id: string): Promise<void>;
  /**
   * My half today; works without network (queued). Pays acorns like a watering.
   * 'early' — my watering hour hasn't come yet: nothing happens, nothing goes to the server.
   */
  waterShared(id: string): 'ok' | 'early' | 'skip';
}

const FriendsContext = createContext<Friends | null>(null);

/**
 * What the server said, with what still waits in my queue laid over it: a cheer or a watering
 * done without network stays shown (and can't be done, or paid, twice) until it goes out.
 */
function withQueued(lists: FriendLists, shared: SharedTree[], queue: QueueItem[], me: string | null) {
  const cheers = new Set(queue.filter((q) => q.action.kind === 'cheer').map((q) => (q.action as { nick: string }).nick));
  const waters = queue.flatMap((q) => (q.action.kind === 'water' ? [q.action] : []));
  return {
    lists: cheers.size ? { ...lists, friends: lists.friends.map((f) => (cheers.has(f.nick) ? { ...f, cheeredToday: true } : f)) } : lists,
    shared:
      me && waters.length
        ? shared.map((t) => {
            const days = waters.filter((w) => w.treeId === t.id).map((w) => w.day);
            const mine = t.waterings[me] ?? [];
            const add = days.filter((d) => !mine.includes(d));
            return add.length ? { ...t, waterings: { ...t.waterings, [me]: [...mine, ...add].sort() } } : t;
          })
        : shared,
  };
}

export function FriendsProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { today, profile } = store;
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [cache, setCacheState] = useState<Cache>(EMPTY);
  const [status, setStatus] = useState<NetStatus>('idle');
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const cacheRef = useRef(cache);
  const setCache = useCallback((update: (prev: Cache) => Cache) => {
    const next = update(cacheRef.current);
    if (next === cacheRef.current) return;
    cacheRef.current = next;
    setCacheState(next);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);
  const todayRef = useRef(today);
  todayRef.current = today;

  // Load once.
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(SESSION_KEY), AsyncStorage.getItem(CACHE_KEY)])
      .then(([s, c]) => {
        if (s) setSession(JSON.parse(s) as Session);
        if (c) {
          const saved = { ...EMPTY, ...(JSON.parse(c) as Partial<Cache>) };
          cacheRef.current = saved;
          setCacheState(saved);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const saveSession = useCallback((next: Session | null) => {
    sessionRef.current = next;
    setSession(next);
    if (next) AsyncStorage.setItem(SESSION_KEY, JSON.stringify(next)).catch(() => {});
    else AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
  }, []);

  /**
   * Signed out (by me, or the session ended on the server): friends' data goes; what waits in
   * the queue stays — it goes out when the same account signs in again.
   */
  const signedOut = useCallback(() => {
    saveSession(null);
    forgetFriendForests();
    setCache((prev) => ({ ...EMPTY, promptSeen: true, queue: prev.queue }));
  }, [saveSession, setCache]);

  /** Runs a call with my token; a dead session signs out, no network marks offline. */
  const withToken = useCallback(
    async <T,>(run: (token: string) => Promise<T>): Promise<T> => {
      const s = sessionRef.current;
      if (!s) throw new ApiError(401, 'signed_out');
      try {
        return await run(s.token);
      } catch (e) {
        if (isSignedOut(e)) signedOut();
        if (isOffline(e)) setStatus('offline');
        throw e;
      }
    },
    [signedOut],
  );

  // ---- The queue ----
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || !sessionRef.current) return;
    flushing.current = true;
    try {
      const me = sessionRef.current?.user.nick ?? '';
      for (const item of ownedBy([...cacheRef.current.queue], me)) {
        const a = item.action;
        try {
          await withToken<unknown>((t) => (a.kind === 'cheer' ? api.cheer(t, a.nick, a.day) : api.waterShared(t, a.treeId, a.day)));
          setCache((prev) => ({ ...prev, queue: settled(prev.queue, a) }));
        } catch (e) {
          if (isOffline(e)) break;
          // A day too old, a tree that ended, a friend no more: it can never go.
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) setCache((prev) => ({ ...prev, queue: settled(prev.queue, a) }));
          else setCache((prev) => ({ ...prev, queue: failed(prev.queue, a) }));
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [withToken, setCache]);

  const signedIn = !!session;

  // ---- Fetching ----
  const refresh = useCallback(async () => {
    if (!sessionRef.current) return;
    setStatus((s) => (s === 'ok' ? s : 'loading'));
    try {
      await flush();
      // A session saved by an older version: the account's id (the sync tells accounts by it).
      const s = sessionRef.current;
      if (s && !s.user.id) {
        const r = await withToken((t) => api.me(t));
        if (sessionRef.current?.token === s.token) saveSession({ ...sessionRef.current, user: { ...sessionRef.current.user, ...r.user } });
      }
      const [lists, shared, inbox] = await withToken((t) =>
        Promise.all([api.friends(t, todayRef.current), api.shared(t), api.inbox(t)]),
      );
      setCache((prev) => ({
        ...prev,
        fetchedAt: Date.now(),
        ...withQueued(lists, shared.trees, ownedBy(prev.queue, sessionRef.current?.user.nick ?? ''), sessionRef.current?.user.nick ?? null),
        inbox,
      }));
      setStatus('ok');
    } catch (e) {
      setStatus(isOffline(e) ? 'offline' : 'error');
    }
  }, [flush, withToken, setCache, saveSession]);

  // On start, when the app comes back, and every minute while it is open.
  useEffect(() => {
    if (!ready || !signedIn) return;
    refresh();
    const timer = setInterval(() => AppState.currentState === 'active' && refresh(), POLL);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [ready, signedIn, refresh]);

  // My name and avatar follow the profile.
  useEffect(() => {
    const s = sessionRef.current;
    if (!ready || !s) return;
    const u = s.user;
    if (u.name === profile.name && u.avatar === profile.avatar && u.color === profile.color) return;
    withToken((t) => api.updateMe(t, { name: profile.name, avatar: profile.avatar, color: profile.color }))
      // Signed out meanwhile: the answer doesn't bring the session back.
      .then((r) => sessionRef.current?.token === s.token && saveSession({ ...sessionRef.current, user: r.user }))
      .catch(() => {});
  }, [ready, signedIn, profile.name, profile.avatar, profile.color, withToken, saveSession]);

  // Quests and achievements count friends and growing shared trees.
  const { setSocial } = store;
  useEffect(() => {
    setSocial({
      friends: session ? cache.lists.friends.length : 0,
      shared: session ? cache.shared.filter((x) => x.status === 'active').length : 0,
    });
  }, [session, cache.lists.friends.length, cache.shared, setSocial]);

  // ---- Account ----
  const begin = useCallback(
    (r: { token: string; user: Account }) => {
      // On a new phone the account's name and avatar come with it.
      store.updateProfile({ name: r.user.name, avatar: r.user.avatar as AvatarId, color: r.user.color });
      saveSession({ token: r.token, user: r.user });
      // Another account's waiting actions never go out from this one.
      setCache((prev) => ({ ...EMPTY, promptSeen: true, queue: ownedBy(prev.queue, r.user.nick) }));
    },
    [saveSession, setCache, store],
  );

  // An account on sign-in v2 is remembered as such: its password never goes to the server again.
  const v2Nick = session?.user.authV === 2 ? session.user.nick : null;
  useEffect(() => {
    if (v2Nick) rememberV2(v2Nick);
  }, [v2Nick]);

  /**
   * The old sign-in (the password itself goes to the server) for this nick: refused when this
   * phone knows the account is on v2 — the session says so, this device keeps its data key, or it
   * was seen on v2 before. A server saying "old account" then is not believed (ApiError 502).
   */
  const guardV1 = useCallback(async (params: AuthParams | null, nick: string, userId?: string | null) => {
    const s = sessionRef.current;
    const mine = s && s.user.nick === nick ? s.user : null;
    const id = userId ?? mine?.id ?? null;
    const known = mine?.authV === 2 || (!!id && !!(await loadDek(id))) || (await readV2Nicks()).includes(nick);
    if (!passwordMayGo(params, known)) throw new ApiError(502, 'server');
  }, []);

  /**
   * A recovery code kept on the phone for this account (net/pendingCode.ts) that the account has
   * now: the code to show. One the account never took is dropped. Null — none, or no network.
   * `params` — the account's parameters if just fetched.
   */
  const pendingNow = useCallback(async (nick: string, userId: string | null, params?: AuthParams | null): Promise<string | null> => {
    const p = await loadPending();
    if (!pendingFor(p, nick, userId)) return null;
    let now = params;
    if (now === undefined) {
      try {
        now = await paramsOf(nick);
      } catch {
        return null;
      }
    }
    if (pendingState(p, now) === 'yes') return p.code;
    await dropPending(p.code);
    return null;
  }, []);

  // On start, signed in: a code whose screen never showed (the answer was lost, or the app closed
  // before "I saved it") is shown now, if the account has it.
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const pendingChecked = useRef(false);
  useEffect(() => {
    // Once, on start: a code found later is the business of the screen that made it (signing in).
    if (!ready || pendingChecked.current) return;
    pendingChecked.current = true;
    const s = sessionRef.current;
    if (!s) return;
    pendingNow(s.user.nick, s.user.id ?? null)
      .then((code) => {
        if (code && sessionRef.current?.token === s.token) setPendingCode(code);
      })
      .catch(() => {});
  }, [ready, pendingNow]);

  /**
   * Keeps the account's data key on this device. Throws if it can't (the screen must not say
   * "done"); `code` — a new recovery code already in force: the error carries it (withNewCode).
   */
  const storeKey = useCallback(async (userId: string, dek: Uint8Array, code: string | null = null) => {
    try {
      await saveDek(userId, dek);
    } catch {
      throw withNewCode(new ApiError(500, 'key_store'), code);
    }
  }, []);
  /** The key is kept: the session knows its id, the sync reads it and saves the chest at once. */
  const keyKept = useCallback(
    (dek: Uint8Array) => {
      const s = sessionRef.current;
      const kid = kidOf(dek);
      if (s && s.user.kid !== kid) saveSession({ ...s, user: { ...s.user, kid } });
      accountEvents.emit({ kind: 'key' });
    },
    [saveSession],
  );

  /**
   * An old account moves to sign-in v2 with the password, with its first data key. Returns the new
   * recovery code, keys and the data key; throws when it didn't go. An answer lost on the way (no
   * network) is checked (sendWithCode): if the account now has the code's parameters made here, the
   * move went through and this code is the only one. Never for an account known to be on v2 here.
   */
  const moveToV2 = useCallback(
    async (token: string, nick: string, password: string): Promise<{ code: string; keys: NewKeys & Boxes; dek: Uint8Array }> => {
      const s0 = sessionRef.current;
      const userId = s0 && s0.token === token ? (s0.user.id ?? null) : null;
      await guardV1({ v: 1, kdf: null, recKdf: null }, nick, userId);
      const dek = newDek();
      const { keys, code } = await newKeys(password, dek);
      try {
        const r = await sendWithCode({ nick, userId }, code, keys.recKdf, () => api.upgrade(token, { ...keys, password }));
        const s = sessionRef.current;
        if (s && s.token === token) saveSession({ ...s, user: r === WENT ? { ...s.user, authV: 2, kid: keys.kid } : r.user });
      } catch (e) {
        if (isSignedOut(e)) signedOut();
        throw e;
      }
      rememberV2(nick);
      return { code, keys, dek };
    },
    [saveSession, signedOut, guardV1],
  );

  /**
   * The account's data key with the password, on a signed-in device (v2): the box the password
   * opens, or the account's first key (a new code). 401 wrong_password.
   */
  const keyByPassword = useCallback(
    async (token: string, nick: string, userId: string | null, password: string): Promise<{ dek: Uint8Array; code: string | null; auth: string }> => {
      const params = await api.authParams(nick);
      const pk = await passwordKeys(password, kdfOrFail(params.kdf));
      const box = await withToken((t) => api.unlock(t, pk.authKey));
      if (box.wrapP && box.kid) {
        // A first key sent from here whose answer was lost: its code is the account's now.
        return { dek: openBox(box.wrapP, pk.wrapKey, 'p', box.kid), code: await pendingNow(nick, userId, params), auth: pk.authKey };
      }
      return { ...(await firstKey(token, pk.authKey, pk.wrapKey, { nick, userId })), auth: pk.authKey };
    },
    [withToken, pendingNow],
  );

  /**
   * Sign-in with an old account: the move to v2 right away (спец 5.2), with the data key. The new
   * code, or null when it didn't go now (the next password will do it). Another device moved it
   * first: the key with the password, no new code.
   */
  const upgrade = useCallback(
    async (token: string, userId: string, nick: string, password: string): Promise<string | null> => {
      let got: { dek: Uint8Array; code: string | null } | null;
      try {
        got = await moveToV2(token, nick, password);
      } catch (e) {
        got = e instanceof ApiError && e.code === 'already_v2' ? await keyByPassword(token, nick, userId, password).catch(() => null) : null;
      }
      if (!got) return null;
      await storeKey(userId, got.dek, got.code);
      keyKept(got.dek);
      return got.code;
    },
    [moveToV2, keyByPassword, storeKey, keyKept],
  );

  const value: Friends = {
    ready,
    account: session?.user ?? null,
    status,
    fetchedAt: cache.fetchedAt,
    lists: cache.lists,
    shared: cache.shared,
    inbox: cache.inbox,
    queue: cache.queue,
    isWaiting: (a) => waiting(cache.queue, a),
    promptSeen: cache.promptSeen,
    markPromptSeen: () => setCache((prev) => (prev.promptSeen ? prev : { ...prev, promptSeen: true })),
    pendingCode,
    pendingCodeTaken: () => setPendingCode(null),

    checkNick: api.nick,
    signup: async (nick, password) => {
      checkNewPassword(password, nick);
      const look = { name: profile.name, avatar: profile.avatar, color: profile.color };
      const params = await paramsOf(nick);
      if (!params) {
        // An older server: the old sign-up (it makes the code).
        await guardV1(params, nick);
        const old = await api.signup({ nick, password, ...look });
        begin(old);
        analytics.track('signup');
        return old.recoveryCode;
      }
      // An account is never made whose data key this device couldn't keep.
      if (!(await canKeepDek())) throw new ApiError(500, 'key_store');
      // The phone makes the recovery code and the data key; the server only ever gets keys and boxes.
      const dek = newDek();
      const { keys, code } = await newKeys(password, dek);
      const r = await sendWithCode({ nick, userId: null }, code, keys.recKdf, () => api.signupV2({ nick, ...keys, ...look }));
      rememberV2(nick);
      // Made, but the answer was lost: the code is the only one — shown, then "Sign in".
      if (r === WENT) throw withNewCode(new ApiError(0, 'offline'), code);
      // The key couldn't be kept after all: signed in without it — the account has its boxes, and
      // "Lock" (state 'locked') gets it with the password later. The code is shown either way.
      const kept = r.user.id ? await saveDek(r.user.id, dek).then(() => true, () => false) : false;
      begin(r);
      if (kept) keyKept(dek);
      analytics.track('signup');
      return code;
    },
    login: async (nick, password) => {
      const params = await paramsOf(nick);
      if (params?.v === 2) {
        const pk = await passwordKeys(password, kdfOrFail(params.kdf));
        const r = await api.loginV2(nick, pk.authKey);
        rememberV2(nick);
        const who = { nick, userId: r.user.id ?? null };
        let dek: Uint8Array | null = null;
        let newCode: string | null = null;
        let known: AuthParams | undefined = params;
        if (r.wrapP && r.kid) {
          // A box that doesn't open (it shouldn't happen): signed in anyway, without the key ('locked').
          dek = (() => {
            try {
              return unwrapDek(r.wrapP!, pk.wrapKey, 'p', r.kid!);
            } catch {
              return null;
            }
          })();
        } else if (r.wrapP === null && r.user.id) {
          // The account has no data key yet (moved to v2 before OYUUR-31): the first one, with a new code.
          // Without network now: signed in without it ('locked', "Lock" later); the code waits kept.
          const made = await firstKey(r.token, pk.authKey, pk.wrapKey, who).catch(() => null);
          if (made) {
            dek = made.dek;
            newCode = made.code;
          }
          // The parameters fetched before are stale now: a kept code is asked about afresh.
          known = undefined;
        }
        // A code made here earlier whose screen never showed: the account has it (same parameters).
        newCode ??= await pendingNow(nick, who.userId, known);
        if (dek && r.user.id) {
          try {
            await storeKey(r.user.id, dek, newCode);
          } catch (e) {
            if (!newCode) await api.logout(r.token).catch(() => {});
            else begin(r);
            throw e;
          }
        }
        begin(dek ? { ...r, user: { ...r.user, kid: kidOf(dek) } } : r);
        if (dek) keyKept(dek);
        analytics.track('login');
        return { newCode };
      }
      await guardV1(params, nick);
      const r = await api.login(nick, password);
      begin(r);
      analytics.track('login');
      // An old account moves to v2 now, while the password is at hand (спец 5.2); a new code comes with it.
      return { newCode: params && r.legacy && r.user.id ? await upgrade(r.token, r.user.id, r.user.nick, password) : null };
    },
    recover: async (nick, code, password) => {
      checkNewPassword(password, nick);
      const params = await paramsOf(nick);
      if (!params) {
        await guardV1(params, nick);
        const old = await api.recover(nick, code, password);
        begin(old);
        analytics.track('login', { recover: true });
        return old.recoveryCode;
      }
      let ticket: string;
      let dek: Uint8Array;
      if (params.v === 2) {
        const rk = await codeKeys(code, kdfOrFail(params.recKdf));
        const start = await api.recoverStart({ nick, recAuth: rk.authKey });
        ticket = start.ticket;
        // The code's box gives the same data key back: the hidden trees come back too (спец 3.6).
        dek = start.wrapR && start.kid ? openBox(start.wrapR, rk.wrapKey, 'r', start.kid) : newDek();
      } else {
        // An old account: the old code itself goes (it is all the server knows); never for a v2 one.
        await guardV1(params, nick);
        ticket = (await api.recoverStart({ nick, code: normCode(code) })).ticket;
        dek = newDek();
      }
      const { keys, code: fresh } = await newKeys(password, dek);
      const r = await sendWithCode({ nick, userId: null }, fresh, keys.recKdf, () => api.recoverFinish({ ticket, ...keys }));
      rememberV2(nick);
      // Done, but the answer (and the session) was lost: the new code is the only one — shown, then "Sign in".
      if (r === WENT) throw withNewCode(new ApiError(0, 'offline'), fresh);
      // The new code is the only one now: shown even if the key couldn't be kept here.
      if (r.user.id) {
        try {
          await storeKey(r.user.id, dek, fresh);
        } catch (e) {
          begin(r);
          throw e;
        }
      }
      begin({ ...r, user: { ...r.user, kid: keys.kid } });
      keyKept(dek);
      analytics.track('login', { recover: true });
      return fresh;
    },
    changePassword: async (oldPassword, newPassword) => {
      const s = sessionRef.current;
      if (!s) throw new ApiError(401, 'signed_out');
      checkNewPassword(newPassword, s.user.nick);
      const params = await api.authParams(s.user.nick);
      let newCode: string | null = null;
      let oldAuth: string;
      let dek: Uint8Array | null = null;
      if (params.v === 1) {
        // An old account: first the move to v2 with the old password (a new code, the first key), then the change.
        const moved = await moveToV2(s.token, s.user.nick, oldPassword);
        newCode = moved.code;
        oldAuth = moved.keys.auth;
        dek = moved.dek;
      } else {
        const pk = await passwordKeys(oldPassword, kdfOrFail(params.kdf));
        oldAuth = pk.authKey;
        // The data key moves into the new password's box: from the old password's box.
        const box = await withToken((t) => api.unlock(t, oldAuth));
        if (box.wrapP && box.kid) dek = openBox(box.wrapP, pk.wrapKey, 'p', box.kid);
      }
      try {
        const kdf = newKdf();
        const nk = await passwordKeys(newPassword, kdf);
        const wrapP = dek ? wrapDek(dek, nk.wrapKey, 'p') : undefined;
        nk.wrapKey.fill(0);
        await withToken((t) => api.changePassword(t, { oldAuth, kdf, auth: nk.authKey, ...(wrapP ? { wrapP } : {}) }));
      } catch (e) {
        // The old code is already dead: the new one must still be shown.
        throw withNewCode(e, newCode);
      }
      const now = sessionRef.current;
      if (now) saveSession({ ...now, user: { ...now.user, authV: 2 } });
      // The password is changed whatever comes next. A key that can't be kept here isn't a failed
      // change: the sync shows "Lock" (state 'locked') and the password gets the key again later.
      if (dek && (await saveDek(s.user.id ?? '', dek).then(() => true, () => false))) keyKept(dek);
      return { newCode };
    },
    resetCheck: async () => {
      const s = sessionRef.current;
      if (!s) throw new ApiError(401, 'signed_out');
      const { user } = await withToken((t) => api.me(t));
      const own = user.id ? await loadDek(user.id) : null;
      const hiddenHere = hiddenHabits(store.forest.exportForest().trees);
      if (own && user.kid && own.kid === user.kid) return { key: 'ok', hiddenHere };
      return { key: user.vault ? 'lost' : 'none', hiddenHere };
    },
    resetPassword: async (newPassword) => {
      const s = sessionRef.current;
      if (!s) throw new ApiError(401, 'signed_out');
      checkNewPassword(newPassword, s.user.nick);
      // This device has the account's data key: nothing is lost. Without it a new key — the chest
      // in the account can't be opened any more and goes (frame 09); this phone's hidden trees go
      // into the new chest with the next save.
      const { user } = await withToken((t) => api.me(t));
      const userId = user.id ?? s.user.id ?? '';
      const own = userId ? await loadDek(userId) : null;
      const same = !!own && !!user.kid && own.kid === user.kid;
      const dek = same ? own!.dek : newDek();
      const { keys, code } = await newKeys(newPassword, dek);
      const r = await sendWithCode({ nick: s.user.nick, userId: userId || null }, code, keys.recKdf, () =>
        withToken((t) => api.resetDevice(t, { ...keys, newDek: !same })),
      );
      const now = sessionRef.current;
      if (now) saveSession({ ...now, user: r === WENT ? { ...now.user, authV: 2, kid: keys.kid } : r.user });
      if (userId) await storeKey(userId, dek, code);
      keyKept(dek);
      return code;
    },
    newRecoveryCode: async (password) => {
      const s = sessionRef.current;
      if (!s) throw new ApiError(401, 'signed_out');
      const who = { nick: s.user.nick, userId: s.user.id ?? null };
      const params = await api.authParams(s.user.nick);
      if (params.v === 1) {
        // The move to v2 makes a new code anyway (and the first data key).
        const moved = await moveToV2(s.token, s.user.nick, password);
        await storeKey(s.user.id ?? '', moved.dek, moved.code);
        keyKept(moved.dek);
        return moved.code;
      }
      const pk = await passwordKeys(password, kdfOrFail(params.kdf));
      const box = await withToken((t) => api.unlock(t, pk.authKey));
      let dek: Uint8Array | null = box.wrapP && box.kid ? openBox(box.wrapP, pk.wrapKey, 'p', box.kid) : null;
      if (!box.kid) {
        // No data key yet: the first one comes with a new code (or another device was just first).
        const made = await firstKey(s.token, pk.authKey, pk.wrapKey, who);
        dek = made.dek;
        if (made.code) {
          await storeKey(s.user.id ?? '', dek, made.code);
          keyKept(dek);
          return made.code;
        }
      }
      const recKdf = newKdf();
      const code = newRecoveryCode();
      const rk = await codeKeys(code, recKdf);
      const wrapR = dek ? wrapDek(dek, rk.wrapKey, 'r') : undefined;
      rk.wrapKey.fill(0);
      await sendWithCode(who, code, recKdf, () =>
        withToken((t) => api.recoveryCode(t, { auth: pk.authKey, recKdf, recAuth: rk.authKey, ...(wrapR ? { wrapR } : {}) })),
      );
      if (dek) {
        await storeKey(s.user.id ?? '', dek, code);
        keyKept(dek);
      }
      return code;
    },
    lockHidden: async (password) => {
      const s = sessionRef.current;
      if (!s) throw new ApiError(401, 'signed_out');
      const userId = s.user.id ?? '';
      const params = await api.authParams(s.user.nick);
      let got: { dek: Uint8Array; code: string | null } | null = null;
      if (params.v === 1) {
        // An old account: the move to v2 makes the first key (and a new code).
        try {
          got = await moveToV2(s.token, s.user.nick, password);
        } catch (e) {
          if (!(e instanceof ApiError && e.code === 'already_v2')) throw e;
        }
      }
      // v2: the box the password opens; none in the account — the first key (a new code).
      got ??= await keyByPassword(s.token, s.user.nick, userId || null, password);
      await storeKey(userId, got.dek, got.code);
      keyKept(got.dek);
      return { newCode: got.code };
    },
    logout: async (mode) => {
      const s = sessionRef.current;
      const userId = s?.user.id ?? null;
      if (mode === 'wipe' && store.forest.exportForest().trees.some((x) => x.visibility !== 'friends')) {
        // Hidden trees leave this phone only if their chest can be in the account: the key is here
        // (whether everything is saved, the screen checks with useSync().pending).
        const own = userId ? await loadDek(userId) : null;
        if (!own || (s?.user.kid != null && s.user.kid !== own.kid)) throw new ApiError(409, 'hidden_here');
      }
      // The sync stops first and the session goes at once: nothing of the account comes back into
      // a cleared phone, nothing of a cleared phone goes to the account.
      accountEvents.emit({ kind: 'logout', mode });
      signedOut();
      setPendingCode(null);
      // The data key leaves this phone either way (спец 5.3).
      if (userId) await dropDek(userId);
      if (mode === 'wipe') {
        // "Remove the forest from this phone" (спец 5.3): no copy is kept, and older copies go too —
        // on someone else's phone "removed" means removed.
        await Promise.all([BACKUP_KEY, LOCAL_KEY].map((key) => AsyncStorage.removeItem(key))).catch(() => {});
        store.forest.resetForest('signOut');
      }
      if (s) await api.logout(s.token).catch(() => {});
    },
    deleteAccount: async (password) => {
      const s = sessionRef.current;
      if (!s) throw new ApiError(401, 'signed_out');
      const params = await paramsOf(s.user.nick);
      if (params?.v !== 2) await guardV1(params, s.user.nick, s.user.id);
      const proof = params?.v === 2 ? { auth: await passwordAuth(password, kdfOrFail(params.kdf)) } : { password };
      await withToken((t) => api.deleteMe(t, proof));
      signedOut();
      setPendingCode(null);
      if (s.user.id) await dropDek(s.user.id);
      await dropPending();
      accountEvents.emit({ kind: 'deleted' });
    },
    authed: withToken,

    refresh,
    search: (q) => withToken((t) => api.search(t, q)),
    // Opening a friend's profile counts for the "visit a friend" quest.
    user: (nick) =>
      withToken((t) => api.user(t, nick)).then((r) => {
        if (r.relation === 'friend') store.questEvent('visitFriend');
        return r;
      }),
    requestFriend: async (nick) => {
      const r = await withToken((t) => api.request(t, nick));
      // A request to someone who had asked me first makes us friends at once.
      analytics.track(r.relation === 'friend' ? 'friend_added' : 'friend_request');
      await refresh();
    },
    acceptFriend: async (nick) => {
      await withToken((t) => api.accept(t, nick));
      analytics.track('friend_added');
      await refresh();
    },
    removeFriend: async (nick) => {
      await withToken((t) => api.remove(t, nick));
      await refresh();
    },
    block: async (nick) => {
      await withToken((t) => api.block(t, nick));
      await refresh();
    },
    unblock: async (nick) => {
      await withToken((t) => api.unblock(t, nick));
    },
    blocks: () => withToken((t) => api.blocks(t)),
    report: async (p) => {
      await withToken((t) => api.report(t, p));
    },
    cheer: (nick) => {
      const day = todayRef.current;
      setCache((prev) => ({
        ...prev,
        queue: enqueue(prev.queue, { kind: 'cheer', nick, day }, Date.now(), sessionRef.current?.user.nick ?? ''),
        lists: { ...prev.lists, friends: prev.lists.friends.map((f) => (f.nick === nick ? { ...f, cheeredToday: true } : f)) },
      }));
      store.questEvent('cheerFriend');
      flush();
    },
    cheersSeen: async () => {
      setCache((prev) => ({ ...prev, inbox: { ...prev.inbox, cheers: [] } }));
      await withToken((t) => api.inboxSeen(t)).catch(() => {});
    },

    proposeShared: async (p) => {
      const r = await withToken((t) => api.propose(t, p));
      analytics.track('shared_propose');
      setCache((prev) => ({ ...prev, shared: [...prev.shared, r.tree] }));
      return r.tree;
    },
    acceptShared: async (id) => {
      await withToken((t) => api.acceptShared(t, id, todayRef.current));
      analytics.track('shared_accept');
      await refresh();
    },
    declineShared: async (id) => {
      await withToken((t) => api.declineShared(t, id));
      await refresh();
    },
    endShared: async (id) => {
      await withToken((t) => api.endShared(t, id));
      await refresh();
    },
    waterShared: (id) => {
      const s = sessionRef.current;
      const tree = cacheRef.current.shared.find((x) => x.id === id);
      if (!s || !tree || tree.status !== 'active') return 'skip';
      const day: DayKey = todayRef.current;
      const mine = tree.waterings[s.user.nick] ?? [];
      if (mine.includes(day) || (tree.plantedOn !== null && day < tree.plantedOn)) return 'skip';
      if (!store.canWaterSharedNow(tree)) return 'early';
      // Shown as watered at once; the server hears about it now or when the network is back.
      setCache((prev) => ({
        ...prev,
        queue: enqueue(prev.queue, { kind: 'water', treeId: id, day }, Date.now(), s.user.nick),
        shared: prev.shared.map((x) => (x.id === id ? { ...x, waterings: { ...x.waterings, [s.user.nick]: [...mine, day] } } : x)),
      }));
      store.paySharedWatering(`shared:${id}`);
      store.questEvent('waterShared');
      flush();
      return 'ok';
    },
  };

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends(): Friends {
  const f = useContext(FriendsContext);
  if (!f) throw new Error('useFriends must be used inside FriendsProvider');
  return f;
}
