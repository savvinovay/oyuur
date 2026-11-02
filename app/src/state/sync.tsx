// The forest in the account (OYUUR-30; design/oyuur-29/спец.md 4, 5.1, 7, Т2.3; design/oyuur-30/план.md).
// - Always "fetch first, then send": the server takes a record only over the version it was based
//   on (`base`), so nothing written by another phone is ever overwritten blindly; a conflict is
//   merged (state/records.ts → game/merge.ts) and sent again, at most 5 rounds.
// - When: 2 s after a change, on start, when the app comes back, every minute, on a tap.
// - What changed is what differs from what the account has (a hash per record, `oyuur/sync`).
// - Hidden trees never go open: a tree made "Only me" becomes a tombstone in the account and goes
//   into the chest (OYUUR-31, state/vault.ts), locked here with the account's data key. Without
//   that key here the chest isn't touched: state 'locked', the hidden trees stay on this phone.
// - The phone's forest changes only by merging (nothing is lost) or by the person's choice
//   ("We found a forest", "Erase everything", signing out with "remove") or by "Erase everything"
//   on another phone (the account's epoch moves on: what was in the account goes — the hidden trees
//   too if their chest was there, else they stay). Before each of these — a copy for 30 days.
// - Signing out, erasing, the account changing: the running round is dropped (`runId`): after each
//   await it checks it is still the current one, and a dropped round writes nothing anywhere.
// - The account is told by its id, not the nick: a nick taken again after a deletion is another account.
// - Without an account: not a single request.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { groupHabits, Tree } from '@/game/tree';
import { api, ApiError, isOffline, isSignedOut, SyncWrite } from '@/net/api';
import { isCryptoError } from '@/net/crypto';
import { loadDek, StoredDek } from '@/net/dekStore';
import { accountEvents } from './accountEvents';
import { dropLocalCopy, LocalCopy, readLocalCopy, writeLocalCopy } from './backup';
import { useFriends } from './friends';
import {
  Chest,
  dirtyWrites,
  emptyForest,
  forestAsRemote,
  forestSide,
  hiddenHabits,
  hiddenPart,
  isEmptyChest,
  mergedHabits,
  mergeRemote,
  Meta,
  noteRecord,
  parseRecords,
  Remote,
  SyncRecord,
} from './records';
import { useStore } from './store';
import type { FoundForest, Sync, SyncNotice, SyncState } from './syncContract';
import { accountHasChest, canSeal, noteChestGone, noteVaultSaved, readFrom, takeVaults, vaultChange, vaultWrite } from './vault';

const META_KEY = 'oyuur/sync';
/** The account (its id) this phone's forest belongs to: signing in to it again merges without asking. */
const BOUND_KEY = 'oyuur/bound';
const SAVE_DELAY = 2000;
const POLL = 60_000;
/** "Saving…" shows only when sending takes longer than this. */
const SAVING_AFTER = 400;
const MAX_ROUNDS = 5;
const MAX_FAILURES = 3;
const ATTENTION_AFTER = 24 * 60 * 60 * 1000;
/** One POST stays well under the server's 1.5 MB. */
const BATCH_RECORDS = 200;
const BATCH_BYTES = 1_000_000;

/** Sessions the server hasn't seen this long end by themselves (server: SESSION_TTL, 90 days). */
const SESSION_DAYS_MS = 85 * 24 * 60 * 60 * 1000;

const freshMeta = (userId: string, nick: string): Meta => ({
  userId, nick, lastRev: 0, epoch: null, sent: {}, revs: {}, lineages: {}, lastOkAt: null, failures: 0, sessionLost: false, decided: false, since: Date.now(),
  vaultSeq: 0, seqKid: null, vaultBroken: false, lockLaterAt: null,
});

/** What the account had is gone (an erase): its records, and the chest's versions start over. */
const wipedMeta = (): Partial<Meta> => ({ lastRev: 0, sent: {}, revs: {}, lineages: {}, vaultSeq: 0, vaultBroken: false });

/** A round dropped on the way (signed out, erased, another account): it stops without a trace. */
class Dropped extends Error {}

function readMeta(raw: string | null): Meta | null {
  if (!raw) return null;
  try {
    const m = JSON.parse(raw) as Partial<Meta>;
    if (typeof m.userId !== 'string') return null;
    return { ...freshMeta(m.userId, ''), ...m, sent: m.sent ?? {}, revs: m.revs ?? {}, lineages: m.lineages ?? {} };
  } catch {
    return null;
  }
}

const cloneMeta = (m: Meta): Meta => ({ ...m, sent: { ...m.sent }, revs: { ...m.revs }, lineages: { ...m.lineages } });

/** The account's trees: the open records and the chest (when it opened here), one per id. */
function accountTrees(records: SyncRecord[], chest: Chest | null): Tree[] {
  const open = parseRecords(records).trees;
  if (!chest) return open;
  const ids = new Set(open.map((t) => t.id));
  return [...open, ...chest.trees.filter((t) => !ids.has(t.id))];
}

/** 409 from a POST with the chest: the account has no data key, or another one. */
const keyRefused = (e: unknown) => e instanceof ApiError && e.status === 409 && (e.code === 'wrong_kid' || e.code === 'no_keys');

const SyncContext = createContext<Sync | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const friends = useFriends();
  const { forest, ready: storeReady, today } = store;
  const account = friends.account;

  const [loaded, setLoaded] = useState(false);
  const [meta, setMetaState] = useState<Meta | null>(null);
  const metaRef = useRef<Meta | null>(null);
  const setMeta = useCallback((next: Meta | null) => {
    metaRef.current = next;
    setMetaState(next);
    if (next) AsyncStorage.setItem(META_KEY, JSON.stringify(next)).catch(() => {});
    else AsyncStorage.removeItem(META_KEY).catch(() => {});
  }, []);
  const [slow, setSlow] = useState(false);
  const [offline, setOffline] = useState(false);
  const [found, setFoundState] = useState<FoundForest | null>(null);
  const foundRef = useRef<{ records: SyncRecord[]; lastRev: number; epoch: number; kid: string | null | undefined } | null>(null);
  const [localCopy, setLocalCopy] = useState<LocalCopy | null>(null);
  const [notice, setNotice] = useState<SyncNotice | null>(null);
  // The account's data key on this device (OYUUR-31): undefined — still being read.
  const [dek, setDekState] = useState<StoredDek | null | undefined>(undefined);
  const dekRef = useRef<StoredDek | null | undefined>(undefined);
  const setDek = useCallback((next: StoredDek | null | undefined) => {
    dekRef.current = next;
    setDekState(next);
  }, []);

  const forestRef = useRef(forest);
  forestRef.current = forest;
  const friendsRef = useRef(friends);
  friendsRef.current = friends;
  const todayRef = useRef(today);
  todayRef.current = today;

  // Load once.
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(META_KEY), readLocalCopy()])
      .then(([raw, copy]) => {
        const m = readMeta(raw);
        metaRef.current = m;
        setMetaState(m);
        if (copy && copy.until > Date.now()) setLocalCopy(copy);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // ---- The data key: read for the account, again when friends.tsx says a new one is kept ----
  const keyRead = useRef(0);
  const readKey = useCallback(
    async (userId: string | null) => {
      const n = ++keyRead.current;
      const key = userId ? await loadDek(userId) : null;
      // A later read (another account, a newer key) wins.
      if (n === keyRead.current) setDek(key);
      return key;
    },
    [setDek],
  );
  const accountId = account?.id ?? null;
  useEffect(() => {
    if (!friends.ready) return;
    setDek(undefined);
    readKey(accountId);
  }, [friends.ready, accountId, readKey, setDek]);

  // ---- Signing in and out ----
  const firstAccount = useRef(true);
  // Each round runs under a number; anything that makes it stale moves the number on.
  const runId = useRef(0);
  useEffect(() => {
    if (!loaded || !friends.ready || !storeReady) return;
    // A session saved by an older version has no id yet: friends.tsx asks the server for it.
    if (account && !account.id) return;
    const wasFirst = firstAccount.current;
    firstAccount.current = false;
    const m = metaRef.current;
    if (account?.id) {
      const userId = account.id;
      if (!m || m.userId !== userId) {
        // A tester who was signed in before this version (спец 5.2): this phone's forest is that account's.
        if (wasFirst && !m) AsyncStorage.setItem(BOUND_KEY, userId).catch(() => {});
        runId.current += 1;
        foundRef.current = null;
        setFoundState(null);
        setMeta(freshMeta(userId, account.nick));
      } else if (m.sessionLost || m.nick !== account.nick) {
        setMeta({ ...m, nick: account.nick, sessionLost: false, failures: 0 });
      }
    } else if (m && !m.sessionLost) {
      // Gone without signing out: the server ended the session (another phone changed the password).
      runId.current += 1;
      setMeta({ ...m, sessionLost: true });
      foundRef.current = null;
      setFoundState(null);
    }
  }, [loaded, friends.ready, storeReady, account, setMeta]);

  const syncNowRef = useRef<() => void>(() => {});
  useEffect(
    () =>
      accountEvents.on((e) => {
        if (e.kind === 'key') {
          // A data key is kept here now (signed in, locked, a new password): read it, and read the
          // account whole again — a chest that came before the key is opened now (merging twice
          // changes nothing). A chest that was damaged is looked at afresh.
          const userId = friendsRef.current.account?.id ?? metaRef.current?.userId ?? null;
          // A round on its way read the account with the old key: it is dropped, the next one starts over.
          runId.current += 1;
          readKey(userId).then(() => {
            const m = metaRef.current;
            if (m && m.userId === userId) setMeta({ ...m, lastRev: 0, vaultBroken: false, failures: 0 });
            syncNowRef.current();
          });
          return;
        }
        // Signed out on purpose: nothing to save any more. Told before the forest is touched, so a
        // round on its way can't bring the account's forest back or send a cleared one.
        runId.current += 1;
        keyRead.current += 1;
        setDek(null);
        foundRef.current = null;
        setFoundState(null);
        setMeta(null);
        setOffline(false);
        if (e.kind === 'deleted' || e.mode === 'wipe') AsyncStorage.removeItem(BOUND_KEY).catch(() => {});
        if (e.kind === 'logout' && e.mode === 'wipe') setLocalCopy(null);
      }),
    [setMeta, readKey, setDek],
  );

  // The forest was replaced or reset here: read the account whole again (merging brings it back).
  // The chest's versions seen are kept: an older chest is never taken after this either.
  const genSeen = useRef(forest.gen);
  useEffect(() => {
    if (forest.gen === genSeen.current) return;
    genSeen.current = forest.gen;
    const m = metaRef.current;
    if (m) setMeta({ ...m, lastRev: 0, sent: {}, revs: {}, lineages: {} });
  }, [forest.gen, setMeta]);

  // ---- One round: fetch, merge, send ----
  const busy = useRef(false);
  const again = useRef(false);

  /** Merges records (the chest opened with this device's key) into the forest; `m` learns about the chest. */
  const applyRemote = useCallback((records: SyncRecord[], m: Meta) => {
    if (records.length === 0) return;
    const remote: Remote = parseRecords(records);
    remote.chest = takeVaults(m, records, dekRef.current ?? null, m.userId);
    const { revived } = forestRef.current.mergeRemote(remote);
    if (revived.length) setNotice({ kind: 'late', days: revived });
  }, []);

  /**
   * Another phone erased the forest in the account: this phone follows, with a copy kept. Only what
   * was in the account goes: hidden trees go too if their chest was there (this phone had its key),
   * else they never were in the account and stay (with their places and acorns).
   */
  const followWipe = useCallback(
    async (epoch: number, id: number) => {
      const m = metaRef.current;
      if (!m || runId.current !== id || m.epoch === epoch) return;
      // An empty forest never replaces the copy (it may hold the forest from before an erase).
      if (forestRef.current.exportForest().trees.length > 0) await forestRef.current.backup('wiped', true).catch(() => {});
      if (runId.current !== id) return;
      const key = dekRef.current;
      const chestWasThere = !!key && key.kid === m.kid && accountHasChest(m);
      const kept = chestWasThere ? emptyForest() : hiddenPart(forestRef.current.exportForest());
      if (kept.trees.length > 0) forestRef.current.replaceForest(kept);
      else forestRef.current.resetForest('wiped');
      genSeen.current += 1;
      setMeta({ ...metaRef.current!, epoch, ...wipedMeta(), decided: true });
      setNotice({ kind: 'wiped' });
    },
    [setMeta],
  );

  const buildFound = useCallback((records: SyncRecord[], chest: Chest | null): FoundForest => {
    const remoteTrees = accountTrees(records, chest);
    const local = forestRef.current.exportForest();
    const changedAt = records.reduce((n, r) => Math.max(n, r.at || 0), 0);
    return {
      nick: friendsRef.current.account?.nick ?? '',
      account: forestSide(remoteTrees, todayRef.current, changedAt || null, false),
      phone: forestSide(local.trees, todayRef.current, null, true),
      merged: mergedHabits(local.trees, remoteTrees),
    };
  }, []);

  /** Returns false when the round stops to ask the person (the forest found in the account). */
  const runRound = useCallback(async (id: number): Promise<boolean> => {
    const authed = friendsRef.current.authed;
    let m = cloneMeta(metaRef.current!);
    /** After every await: still the round that counts, else nothing more is done or written. */
    const live = () => {
      if (runId.current !== id || !metaRef.current || metaRef.current.userId !== m.userId) throw new Dropped();
    };

    // Fetch everything new (a damaged chest: the whole account again — it may be gone or fixed).
    const records: SyncRecord[] = [];
    const whole = m.vaultBroken;
    let since = readFrom(m);
    let epoch = m.epoch;
    let kid = m.kid;
    for (let guard = 0; guard < 10_000; guard++) {
      const page = await authed((t) => api.syncGet(t, since));
      live();
      if (m.epoch !== null && page.epoch !== m.epoch) {
        await followWipe(page.epoch, id);
        return true;
      }
      epoch = page.epoch;
      if (page.kid !== undefined) kid = page.kid;
      records.push(...page.records);
      since = page.rev;
      if (!page.more) break;
    }

    // The first time with this account (спец 5.1).
    if (!m.decided) {
      const local = forestRef.current.exportForest();
      // The chest is opened on a scratch copy: nothing is taken until the person chooses.
      const probe = cloneMeta(m);
      probe.kid = kid;
      for (const r of records) noteRecord(probe, r);
      const chest = takeVaults(probe, records, dekRef.current ?? null, m.userId);
      const theirs = accountTrees(records, chest).length;
      const bound = await AsyncStorage.getItem(BOUND_KEY).catch(() => null);
      live();
      if (local.trees.length > 0 && theirs > 0 && bound !== m.userId) {
        foundRef.current = { records, lastRev: since, epoch: epoch ?? 0, kid };
        setFoundState(buildFound(records, chest));
        return false;
      }
      if (local.trees.length > 0) await forestRef.current.backup('merge', false).catch(() => {});
      live();
      await AsyncStorage.setItem(BOUND_KEY, m.userId).catch(() => {});
      live();
      m.decided = true;
    }

    m.kid = kid;
    for (const r of records) noteRecord(m, r);
    noteChestGone(m, records, whole);
    applyRemote(records, m);
    m = { ...m, lastRev: since, epoch: epoch ?? 0 };
    setMeta(m);

    // Send what differs, merging conflicts in between. The chest goes alone, after the rest.
    let skipVault = false;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const f = forestRef.current.exportForest();
      const writes: (SyncWrite & { hash: string; seq?: number })[] = dirtyWrites(f, m);
      if (!skipVault) {
        try {
          const vw = vaultWrite(f, m, dekRef.current ?? null, m.userId);
          if (vw) writes.push(vw);
        } catch (e) {
          // Too big for the server: the hidden trees stay here this time; everything else goes.
          if (!isCryptoError(e, 'too_big')) throw e;
          skipVault = true;
        }
      }
      if (writes.length === 0) {
        setMeta({ ...metaRef.current!, lastOkAt: Date.now(), failures: 0 });
        return true;
      }
      const conflicts: SyncRecord[] = [];
      let refused = false;
      for (let i = 0; i < writes.length; ) {
        const batch: SyncWrite[] = [];
        const meta: { hash: string; seq?: number }[] = [];
        let bytes = 0;
        while (i < writes.length && batch.length < BATCH_RECORDS) {
          const { hash, seq, ...w } = writes[i];
          const size = w.body === undefined ? 50 : JSON.stringify(w.body).length;
          if (batch.length > 0 && (bytes + size > BATCH_BYTES || w.key === 'vault')) break;
          batch.push(w);
          meta.push({ hash, seq });
          bytes += size;
          i++;
        }
        let res;
        try {
          res = await authed((t) => api.syncPost(t, { epoch: m.epoch ?? 0, records: batch }));
        } catch (e) {
          // The account's key isn't this device's (made anew elsewhere, or none): the chest waits —
          // state 'locked' — and everything else goes in the next round.
          if (!keyRefused(e) || !batch.some((w) => w.key === 'vault')) throw e;
          live();
          m = cloneMeta(metaRef.current!);
          m.kid = e instanceof ApiError && typeof e.extra.kid === 'string' ? e.extra.kid : null;
          setMeta(m);
          skipVault = true;
          refused = true;
          break;
        }
        live();
        m = cloneMeta(metaRef.current!);
        for (const s of res.saved) {
          const j = batch.findIndex((w) => w.key === s.key);
          if (j < 0) continue;
          if (s.key === 'vault') {
            noteVaultSaved(m, s.rev, meta[j].hash, meta[j].seq ?? 0, (batch[j].body as { kid: string }).kid);
            continue;
          }
          noteRecord(m, { key: s.key, rev: s.rev, deleted: !!batch[j].deleted, body: batch[j].body ?? null, at: 0 });
          m.sent[s.key] = meta[j].hash;
        }
        // Nobody else wrote in between: what was just saved needn't be fetched back.
        if (res.rev === m.lastRev + res.saved.length) m.lastRev = res.rev;
        for (const c of res.conflicts) noteRecord(m, c);
        conflicts.push(...res.conflicts.filter((c) => c.rev > 0));
        setMeta(m);
      }
      if (refused) continue;
      // A chest in a conflict is opened and merged like the rest; ours goes again as the next version.
      m = cloneMeta(metaRef.current!);
      applyRemote(conflicts, m);
      setMeta(m);
    }
    throw new ApiError(409, 'conflicts');
  }, [applyRemote, buildFound, followWipe, setMeta]);

  const syncNow = useCallback(async () => {
    const m = metaRef.current;
    if (!m || m.sessionLost || !friendsRef.current.account || foundRef.current) return;
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    const id = runId.current;
    const slowTimer = setTimeout(() => setSlow(true), SAVING_AFTER);
    try {
      await runRound(id);
      setOffline(false);
    } catch (e) {
      const now = metaRef.current;
      if (e instanceof Dropped || runId.current !== id) {
        // Signed out, erased or another account meanwhile: this round's answer means nothing now.
      } else if (isOffline(e)) setOffline(true);
      else if (e instanceof ApiError && e.status === 409 && e.code === 'wiped' && typeof e.extra.epoch === 'number') await followWipe(e.extra.epoch, id);
      else if (isSignedOut(e)) {
        if (now) setMeta({ ...now, sessionLost: true });
      } else {
        setOffline(false);
        if (now) setMeta({ ...now, failures: now.failures + 1 });
        // Only the kind of failure: never what was being saved.
        console.warn('Sync failed', e instanceof ApiError ? `${e.status} ${e.code}` : e instanceof Error ? e.name : 'unknown');
      }
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      busy.current = false;
      if (again.current) {
        again.current = false;
        setTimeout(() => syncNow(), 0);
      }
    }
  }, [runRound, followWipe, setMeta]);
  syncNowRef.current = () => {
    syncNow();
  };

  // ---- When ----
  const active = loaded && storeReady && !!account && !!meta && !meta.sessionLost && !found;
  const activeUser = active ? meta!.userId : null;
  // On start (and on sign-in), when the app comes back, every minute. Not before the key is read:
  // the first round would leave a chest it could open.
  const keyReady = dek !== undefined;
  useEffect(() => {
    if (!activeUser || !keyReady) return;
    syncNow();
    const timer = setInterval(() => AppState.currentState === 'active' && syncNow(), POLL);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && syncNow());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [activeUser, keyReady, syncNow]);

  // What waits to be sent, worked out after every change of the forest.
  const { trees, plot, wallet, shop, quests, achievements, announced, habits } = store;
  const pendingWrites = useMemo(() => {
    if (!meta || !meta.decided) return 0;
    const f = forest.exportForest();
    const change = vaultChange(f, meta);
    // The chest counts when it can go, or when hidden trees here aren't in the account yet.
    const chest = change && (canSeal(meta, dek ?? null) || !isEmptyChest(change.content)) ? 1 : 0;
    return dirtyWrites(f, meta).length + chest;
    // The store's values are what changes; exportForest() reads the same data from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, dek, forest, trees, plot, wallet, shop, quests, achievements, announced]);
  // 2 s after a change.
  useEffect(() => {
    if (!active || !keyReady || pendingWrites === 0) return;
    const timer = setTimeout(() => syncNow(), SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [active, keyReady, pendingWrites, trees, plot, wallet, shop, quests, syncNow]);

  // ---- The person's choices ----
  const resolveFound = useCallback<Sync['resolveFound']>(
    async (choice) => {
      const held = foundRef.current;
      const m = metaRef.current;
      if (!held || !m) return;
      if (choice === 'signOut') {
        foundRef.current = null;
        setFoundState(null);
        await friendsRef.current.logout('keep');
        return;
      }
      const f = forestRef.current;
      const id = runId.current;
      await f.backup('merge', false);
      if (runId.current !== id || foundRef.current !== held) return;
      const next = cloneMeta(m);
      next.kid = held.kid;
      for (const r of held.records) noteRecord(next, r);
      if (choice === 'keepAccount') {
        // This phone's forest is put aside for 30 days; the account's forest takes its place.
        const copy = await writeLocalCopy(f.exportForest());
        if (runId.current !== id || foundRef.current !== held) return;
        setLocalCopy(copy);
        const remote: Remote = parseRecords(held.records);
        remote.chest = takeVaults(next, held.records, dekRef.current ?? null, next.userId);
        f.replaceForest(mergeRemote(emptyForest(), remote, todayRef.current).forest);
        genSeen.current = f.gen + 1;
      } else {
        applyRemote(held.records, next);
      }
      await AsyncStorage.setItem(BOUND_KEY, m.userId);
      if (runId.current !== id) return;
      setMeta({ ...next, decided: true, lastRev: held.lastRev, epoch: held.epoch });
      foundRef.current = null;
      setFoundState(null);
      if (choice === 'merge') {
        setNotice({ kind: 'merged', trees: groupHabits(f.exportForest().trees).length, nick: friendsRef.current.account?.nick ?? '' });
      }
    },
    [applyRemote, setMeta],
  );

  const restoreLocal = useCallback<Sync['restoreLocal']>(async () => {
    const copy = await readLocalCopy();
    if (!copy) {
      setLocalCopy(null);
      return;
    }
    const f = forestRef.current;
    f.mergeRemote(forestAsRemote(copy.forest));
    await dropLocalCopy();
    setLocalCopy(null);
    setNotice({ kind: 'merged', trees: groupHabits(f.exportForest().trees).length, nick: metaRef.current?.nick || friendsRef.current.account?.nick || '' });
    syncNow();
  }, [syncNow]);

  const eraseEverywhere = useCallback<Sync['eraseEverywhere']>(async () => {
    const m = metaRef.current;
    if (!m || !friendsRef.current.account) throw new ApiError(401, 'signed_out');
    // A round on its way is dropped: it would follow this very erase (and copy an empty forest).
    runId.current += 1;
    // The account first: without network nothing is erased anywhere.
    const r = await friendsRef.current.authed((t) => api.syncWipe(t));
    // Everything here goes, hidden trees too: it is this phone's own choice.
    await forestRef.current.backup('erase', true).catch(() => {});
    runId.current += 1;
    forestRef.current.resetForest('wiped');
    genSeen.current += 1;
    const now = metaRef.current;
    if (now && now.userId === m.userId) setMeta({ ...now, ...wipedMeta(), epoch: r.epoch, lastRev: r.rev, decided: true, failures: 0 });
  }, [setMeta]);

  const lockLater = useCallback(() => {
    const m = metaRef.current;
    if (m && !m.lockLaterAt) setMeta({ ...m, lockLaterAt: Date.now() });
  }, [setMeta]);

  // ---- What the screens see ----
  // Until the first round with the account is decided (or "We found a forest" is answered) nothing
  // is saved yet: the row never says "saved" then.
  const undecided = !!meta && !meta.decided;
  const hidden = hiddenHabits(trees);
  // Hidden trees are in the chest when this device may lock it (its key is the account's).
  const sealing = !!meta && canSeal(meta, dek ?? null);
  // "Only here": no key, or not the account's (once the account's key is known).
  const lockedHere =
    !!meta && meta.decided && hidden > 0 && dek !== undefined && (dek === null || (meta.kid !== undefined && meta.kid !== dek.kid));
  const broken = !!meta?.vaultBroken;
  const state: SyncState = !meta
    ? 'off'
    : meta.sessionLost
      ? 'session'
      : !account
        ? 'off'
        : meta.failures >= MAX_FAILURES || broken
          ? 'error'
          : lockedHere
            ? 'locked'
            : offline && (pendingWrites > 0 || undecided)
              ? 'offline'
              : slow || undecided
                ? 'saving'
                : 'saved';
  const open = habits.filter((h) => h.current.visibility === 'friends').length;
  const locked = state !== 'off' && state !== 'locked' && sealing ? hidden : 0;
  const needsAttention =
    state === 'session' ||
    state === 'locked' ||
    (state !== 'off' && pendingWrites > 0 && Date.now() - (meta?.lastOkAt ?? meta?.since ?? Date.now()) > ATTENTION_AFTER);

  const value: Sync = {
    state,
    pending: state === 'off' ? 0 : pendingWrites,
    lastOkAt: meta?.lastOkAt ?? null,
    trees: open + locked,
    locked,
    hiddenHere: hidden - locked,
    errorWhy: state === 'error' ? (broken ? 'vault' : 'server') : null,
    lockPromptDue: state === 'locked' && !meta?.lockLaterAt,
    lockLater,
    syncNow: () => {
      syncNow();
    },
    needsAttention,
    found,
    resolveFound,
    localCopy: localCopy && localCopy.until > Date.now() ? { trees: groupHabits(localCopy.forest.trees).length, until: localCopy.until } : null,
    restoreLocal,
    eraseEverywhere,
    notice,
    clearNotice: () => setNotice(null),
    sessionNick: state === 'session' ? meta?.nick || null : null,
    // A session in use ends on the server only when the password changed elsewhere (or the account
    // went); one unused for 90 days ends by itself.
    sessionWhy: state === 'session' ? (meta?.lastOkAt && Date.now() - meta.lastOkAt < SESSION_DAYS_MS ? 'password' : 'expired') : null,
  };

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** The forest in the account (contract: syncContract.ts). Off without an account. */
export function useSync(): Sync {
  const s = useContext(SyncContext);
  if (!s) throw new Error('useSync must be used inside SyncProvider');
  return s;
}
