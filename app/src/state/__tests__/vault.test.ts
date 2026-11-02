// The chest of hidden trees (OYUUR-31), end to end without a network: phones with the account's data
// key, a server that keeps records by rev, checks only the chest's key id and can read nothing of it.
import { describe, expect, it, jest } from '@jest/globals';
import { addDays } from '@/game/dates';
import { balanceOf, waterKey, wateringReward } from '@/game/economy';
import { hlcNext } from '@/game/merge';
import { syncPlot } from '@/game/plot';
import { checkIn, groupHabits, growthDays, plantTree, settle, Tree } from '@/game/tree';
import type { SyncWrite } from '@/net/api';
import { CryptoError, isCryptoError, kidOf, newDek, openVault, sealVault, unwrapDek, VaultEnvelope, wrapDek } from '@/net/crypto';
import type { StoredDek } from '@/net/dekStore';
import { deriveKeys, newKdf, normCode, normPassword } from '@/net/kdf';
import {
  chestContent,
  dirtyWrites,
  emptyForest,
  Forest,
  hashBody,
  Meta,
  mergeRemote,
  noteRecord,
  parseChest,
  parseRecords,
  Remote,
  stableStringify,
  SyncRecord,
} from '../records';
import { canSeal, noteChestGone, noteVaultSaved, readFrom, takeVault, takeVaults, vaultChange, vaultWrite } from '../vault';

jest.mock('expo-crypto', () => ({ getRandomValues: (a: Uint8Array) => require('node:crypto').randomFillSync(a) }));
declare function require(name: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any

const USER = 'u-sasha';
const D0 = '2026-10-01';
const day = (n: number) => addDays(D0, n);
const S = (ms: number, dev = 'A') => hlcNext('', ms, dev);

/** The server: records by rev; the chest only with the account's key id (server/src/sync.js). */
class FakeServer {
  rev = 0;
  epoch = 0;
  kid: string | null = null;
  records = new Map<string, { rev: number; deleted: boolean; text: string | null; at: number }>();
  /** Every request body that reached it, as text: what the server could ever see. */
  seen: string[] = [];
  get(since: number) {
    const out: SyncRecord[] = [...this.records.entries()]
      .filter(([, r]) => r.rev > since)
      .sort((a, b) => a[1].rev - b[1].rev)
      .map(([key, r]) => ({ key, rev: r.rev, deleted: r.deleted, body: r.text === null ? null : JSON.parse(r.text), at: r.at }));
    return { rev: this.rev, epoch: this.epoch, records: out, more: false, kid: this.kid };
  }
  post(epoch: number, writes: SyncWrite[]) {
    this.seen.push(JSON.stringify({ epoch, records: writes }));
    if (epoch !== this.epoch) throw new Error('wiped');
    const vault = writes.find((w) => w.key === 'vault' && !w.deleted);
    if (vault && !this.kid) return { refused: 'no_keys' as const, kid: null };
    if (vault && (vault.body as VaultEnvelope).kid !== this.kid) return { refused: 'wrong_kid' as const, kid: this.kid };
    const saved: { key: string; rev: number }[] = [];
    const conflicts: SyncRecord[] = [];
    for (const w of writes) {
      const cur = this.records.get(w.key);
      if ((cur?.rev ?? 0) !== w.base) {
        conflicts.push(cur ? { key: w.key, rev: cur.rev, deleted: cur.deleted, body: cur.text === null ? null : JSON.parse(cur.text), at: cur.at } : { key: w.key, rev: 0, deleted: false, body: null, at: 0 });
        continue;
      }
      if (w.key.startsWith('tree:') && !w.deleted && (w.body as Tree).visibility !== 'friends') throw new Error('bad_record');
      this.rev += 1;
      this.records.set(w.key, { rev: this.rev, deleted: !!w.deleted, text: w.body === undefined ? null : JSON.stringify(w.body), at: 1_000 + this.rev });
      saved.push({ key: w.key, rev: this.rev });
    }
    return { rev: this.rev, epoch: this.epoch, saved, conflicts };
  }
}

interface Phone {
  forest: Forest;
  meta: Meta;
  key: StoredDek | null;
}

const newMeta = (): Meta => ({
  userId: USER, nick: 'sasha', lastRev: 0, epoch: null, sent: {}, revs: {}, lineages: {}, lastOkAt: null, failures: 0, sessionLost: false,
  decided: true, since: 0, vaultSeq: 0, seqKid: null, vaultBroken: false, lockLaterAt: null,
});
const stored = (dek: Uint8Array): StoredDek => ({ dek, kid: kidOf(dek) });

/** What sync.tsx does with records: the open ones parsed, the chest opened with the phone's key. */
function remoteOf(phone: Phone, records: SyncRecord[]): Remote {
  const remote = parseRecords(records);
  remote.chest = takeVaults(phone.meta, records, phone.key, USER);
  return remote;
}

/** One round of a phone, as sync.tsx runs it: fetch, merge (with the chest), send, merge conflicts, send again. */
function sync(phone: Phone, server: FakeServer, today: string) {
  const page = server.get(phone.meta.lastRev);
  phone.meta.kid = page.kid;
  for (const r of page.records) noteRecord(phone.meta, r);
  phone.forest = mergeRemote(phone.forest, remoteOf(phone, page.records), today).forest;
  phone.meta.lastRev = page.rev;
  phone.meta.epoch = page.epoch;
  let skipVault = false;
  for (let round = 0; round < 5; round++) {
    const writes: (SyncWrite & { hash: string; seq?: number })[] = dirtyWrites(phone.forest, phone.meta);
    const vw = skipVault ? null : vaultWrite(phone.forest, phone.meta, phone.key, USER);
    if (vw) writes.push(vw);
    if (writes.length === 0) return;
    const res = server.post(phone.meta.epoch ?? 0, writes.map(({ hash: _h, seq: _s, ...w }) => w));
    if ('refused' in res) {
      phone.meta.kid = res.kid;
      skipVault = true;
      continue;
    }
    for (const s of res.saved) {
      const w = writes.find((x) => x.key === s.key)!;
      if (s.key === 'vault') {
        noteVaultSaved(phone.meta, s.rev, w.hash, w.seq!, (w.body as VaultEnvelope).kid);
        continue;
      }
      noteRecord(phone.meta, { key: s.key, rev: s.rev, deleted: !!w.deleted, body: w.body ?? null, at: 0 });
      phone.meta.sent[s.key] = w.hash;
    }
    // Nobody else wrote in between: what was just saved needn't be fetched back.
    if (res.rev === phone.meta.lastRev + res.saved.length) phone.meta.lastRev = res.rev;
    for (const c of res.conflicts) noteRecord(phone.meta, c);
    const real = res.conflicts.filter((c) => c.rev > 0);
    if (real.length) phone.forest = mergeRemote(phone.forest, remoteOf(phone, real), today).forest;
  }
  throw new Error('no agreement in 5 rounds');
}

const habitsOf = (trees: Tree[]) => groupHabits(trees).map((h) => ({ lineageId: h.lineageId, days: growthDays(h.current) }));
const forestOf = (trees: Tree[]): Forest => ({ ...emptyForest(), trees, plot: syncPlot(emptyForest().plot, habitsOf(trees)) });
/** The hidden habit's own days (none of them is a day the open tree has). */
const SECRET_PLANTED = '2026-09-17';
const plant = (id: string, name: string, visibility: 'friends' | 'private', today = D0) => plantTree({ id, name, kind: 'quit', visibility, today });
function water(phone: Phone, id: string, d: string) {
  const tree = phone.forest.trees.find((t) => t.id === id)!;
  const out = checkIn(settle(tree, d), d);
  const reward = wateringReward(phone.forest.ledger, id, d, growthDays(out.tree));
  phone.forest = { ...phone.forest, trees: phone.forest.trees.map((t) => (t.id === id ? out.tree : t)), ledger: reward.ledger };
}
function setVisibility(phone: Phone, lineageId: string, visibility: 'friends' | 'private', at: string) {
  phone.forest = {
    ...phone.forest,
    trees: phone.forest.trees.map((t) => (t.lineageId === lineageId ? { ...t, visibility, stamps: { ...t.stamps, visibility: at } } : t)),
  };
}
function deleteHabit(phone: Phone, lineageId: string, at: string) {
  const habit = phone.forest.trees.filter((t) => t.lineageId === lineageId);
  phone.forest = {
    ...phone.forest,
    trees: phone.forest.trees.filter((t) => t.lineageId !== lineageId),
    hiddenTombs: { ...phone.forest.hiddenTombs, ...Object.fromEntries(habit.map((t) => [t.id, at])), [lineageId]: at },
  };
}
const sorted = (f: Forest) => stableStringify({ ...f, trees: [...f.trees].sort((a, b) => (a.id < b.id ? -1 : 1)), plot: { ...f.plot, seen: [] } });

/** The account's boxes as signup makes them (friends.tsx newKeys): the password's and the code's. */
async function makeAccount(password: string, code: string) {
  const dek = newDek();
  const kdf = newKdf();
  const recKdf = newKdf();
  const p = await deriveKeys(normPassword(password), kdf);
  const r = await deriveKeys(normCode(code), recKdf);
  return { dek, kid: kidOf(dek), kdf, recKdf, wrapP: wrapDek(dek, p.wrapKey, 'p'), wrapR: wrapDek(dek, r.wrapKey, 'r') };
}

describe('the chest: what the server gets', () => {
  it('a hidden habit goes only locked; another device with the password gets the tree, its place and acorns', async () => {
    const SECRET = 'Не курить — тайна';
    const acc = await makeAccount('correct horse 1', 'abcd2345efgh');
    const server = new FakeServer();
    server.kid = acc.kid;
    const a: Phone = { forest: forestOf([plant('open1', 'Бегать', 'friends', '2026-09-01'), plant('sec1', SECRET, 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(acc.dek) };
    water(a, 'open1', '2026-09-01');
    for (const d of ['2026-09-18', '2026-09-19']) water(a, 'sec1', d);
    a.forest = { ...a.forest, trees: a.forest.trees.map((t) => (t.id === 'sec1' ? { ...t, nickname: 'Тихон' } : t)) };
    const TODAY = '2026-09-19';
    // Both phones judge the same day.
    a.forest = { ...a.forest, trees: a.forest.trees.map((t) => settle(t, TODAY)) };
    sync(a, server, TODAY);
    expect([...server.records.keys()].sort()).toEqual(['plot', 'progress', 'tree:open1', 'vault']);

    // Nothing of the hidden habit, in any form, in anything that reached the server.
    const wire = server.seen.join('\n');
    for (const needle of [SECRET, 'тайна', 'Тихон', 'sec1', SECRET_PLANTED, '2026-09-18', '2026-09-19', JSON.stringify(SECRET).slice(1, -1)]) {
      expect(wire.includes(needle)).toBe(false);
    }
    // The open one is there (the search does find what is there).
    expect(wire.includes('Бегать')).toBe(true);

    // Another device: the box opens with the password typed there (the key never travelled).
    const p = await deriveKeys(normPassword('correct horse 1'), acc.kdf);
    const dekB = unwrapDek(acc.wrapP, p.wrapKey, 'p', acc.kid);
    const b: Phone = { forest: emptyForest(), meta: newMeta(), key: stored(dekB) };
    sync(b, server, TODAY);
    const secret = b.forest.trees.find((t) => t.id === 'sec1')!;
    expect([secret.name, secret.nickname, secret.visibility, secret.checkins]).toEqual([SECRET, 'Тихон', 'private', ['2026-09-18', '2026-09-19']]);
    expect(b.forest.plot.places.sec1).toEqual(a.forest.plot.places.sec1);
    expect(b.forest.ledger[waterKey('sec1', '2026-09-18')]).toBe(5);
    expect(balanceOf(b.forest.ledger, [])).toBe(balanceOf(a.forest.ledger, []));
    expect(sorted(b.forest)).toBe(sorted(a.forest));
    // Nothing more to send on either: the chest's hash is of its open content.
    expect(vaultChange(b.forest, b.meta)).toBeNull();
    expect(dirtyWrites(b.forest, b.meta)).toEqual([]);
    sync(a, server, TODAY);
    expect(vaultChange(a.forest, a.meta)).toBeNull();
  });

  it('a device without the key leaves the chest alone; a chest of another key is refused whole', () => {
    const dek = newDek();
    const server = new FakeServer();
    server.kid = kidOf(dek);
    const a: Phone = { forest: forestOf([plant('sec1', 'Secret', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(dek) };
    sync(a, server, day(0));
    const before = server.records.get('vault')!;
    // No key here: opens nothing, writes nothing, the hidden trees here stay.
    const b: Phone = { forest: forestOf([plant('sec2', 'Other', 'private', SECRET_PLANTED)]), meta: newMeta(), key: null };
    sync(b, server, day(0));
    expect(b.forest.trees.map((t) => t.id)).toEqual(['sec2']);
    expect(server.records.get('vault')).toBe(before);
    expect(canSeal(b.meta, b.key)).toBe(false);
    // Another key (made on a phone that lost the old one): the POST is refused, the rest goes again without it.
    const c: Phone = { forest: forestOf([plant('open', 'Open', 'friends'), plant('sec3', 'Third', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(newDek()) };
    const rev = server.rev;
    sync(c, server, day(0));
    expect(server.records.get('vault')).toBe(before);
    expect(server.records.has('tree:open')).toBe(true);
    expect(server.rev).toBeGreaterThan(rev);
    expect(c.meta.kid).toBe(kidOf(dek));
  });
});

describe('the chest: damaged, wrong key, older', () => {
  it('a damaged chest: a clear error, the forest here unchanged, never written over', () => {
    const dek = newDek();
    const server = new FakeServer();
    server.kid = kidOf(dek);
    const a: Phone = { forest: forestOf([plant('sec1', 'Secret', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(dek) };
    sync(a, server, day(0));
    const rec = server.records.get('vault')!;
    const env = JSON.parse(rec.text!) as VaultEnvelope;
    // One flipped character of the lock.
    const bad = { ...env, c: (env.c[0] === 'A' ? 'B' : 'A') + env.c.slice(1) };
    expect(() => openVault(bad, dek, { userId: USER })).toThrow(CryptoError);
    expect((() => { try { openVault(bad, dek, { userId: USER }); } catch (e) { return (e as CryptoError).problem; } })()).toBe('broken');
    server.records.set('vault', { ...rec, rev: ++server.rev, text: JSON.stringify(bad) });

    const b: Phone = { forest: forestOf([plant('sec2', 'Mine', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(dek) };
    const forestBefore = b.forest;
    const seen = server.seen.length;
    sync(b, server, day(0));
    expect(b.meta.vaultBroken).toBe(true);
    expect(b.forest.trees).toEqual(forestBefore.trees);
    // Nothing went over it.
    expect(server.records.get('vault')!.text).toBe(JSON.stringify(bad));
    expect(server.seen.slice(seen).some((t) => t.includes('"vault"'))).toBe(false);
    expect(vaultWrite(b.forest, b.meta, b.key, USER)).toBeNull();
  });

  it('a damaged chest is looked at afresh every round: fixed — taken; removed — the error goes; still damaged — never written over', () => {
    const dek = newDek();
    const server = new FakeServer();
    server.kid = kidOf(dek);
    const a: Phone = { forest: forestOf([plant('sec1', 'Secret', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(dek) };
    sync(a, server, day(0));
    const good = server.records.get('vault')!;
    const env = JSON.parse(good.text!) as VaultEnvelope;
    const bad = { ...env, c: (env.c[0] === 'A' ? 'B' : 'A') + env.c.slice(1) };
    server.records.set('vault', { ...good, rev: ++server.rev, text: JSON.stringify(bad) });

    /** A round as sync.tsx runs it now: from readFrom, the chest's absence noted on a whole re-read. */
    const round = (phone: Phone) => {
      const whole = phone.meta.vaultBroken;
      const page = server.get(readFrom(phone.meta));
      phone.meta.kid = page.kid;
      for (const r of page.records) noteRecord(phone.meta, r);
      noteChestGone(phone.meta, page.records, whole);
      phone.forest = mergeRemote(phone.forest, remoteOf(phone, page.records), day(0)).forest;
      phone.meta.lastRev = page.rev;
    };
    const b: Phone = { forest: forestOf([plant('sec2', 'Mine', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(dek) };
    round(b);
    expect(b.meta.vaultBroken).toBe(true);
    expect(readFrom(b.meta)).toBe(0);
    // Still damaged on the next round: still the error, nothing goes over it.
    round(b);
    expect(b.meta.vaultBroken).toBe(true);
    expect(vaultWrite(b.forest, b.meta, b.key, USER)).toBeNull();
    // The record is put right in the account (no new rev — it's fixed in place): the next round takes it.
    server.records.set('vault', { ...server.records.get('vault')!, text: good.text });
    round(b);
    expect(b.meta.vaultBroken).toBe(false);
    expect(b.forest.trees.map((t) => t.id).sort()).toEqual(['sec1', 'sec2']);

    // Damaged again, then the record is removed from the account altogether: the error goes.
    const c: Phone = { forest: forestOf([plant('sec3', 'Other', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(dek) };
    server.records.set('vault', { ...good, rev: ++server.rev, text: JSON.stringify(bad) });
    round(c);
    expect(c.meta.vaultBroken).toBe(true);
    server.records.delete('vault');
    round(c);
    expect(c.meta.vaultBroken).toBe(false);
    expect(c.meta.revs.vault).toBeUndefined();
    // And this phone's chest can go again, as a new one.
    expect(vaultWrite(c.forest, c.meta, c.key, USER)?.base).toBe(0);
  });

  it('a wrong key never opens a chest or a box', async () => {
    const dek = newDek();
    const env = sealVault(chestContent(forestOf([plant('s', 'S', 'private')])), dek, { userId: USER, seq: 1 });
    const problem = (run: () => unknown) => {
      try {
        run();
      } catch (e) {
        return isCryptoError(e) ? e.problem : 'other';
      }
      return 'none';
    };
    expect(problem(() => openVault(env, newDek(), { userId: USER }))).toBe('wrong_kid');
    expect(problem(() => openVault({ ...env, kid: kidOf(newDek()) }, dek, { userId: USER }))).toBe('wrong_kid');
    // Another account's chest (the account is bound into the lock).
    expect(problem(() => openVault(env, dek, { userId: 'u-other' }))).toBe('broken');
    const kdf = newKdf();
    const p = await deriveKeys(normPassword('right password'), kdf);
    const q = await deriveKeys(normPassword('wrong password'), kdf);
    const box = wrapDek(dek, p.wrapKey, 'p');
    expect(problem(() => unwrapDek(box, q.wrapKey, 'p', kidOf(dek)))).toBe('bad_key');
    // The code's box is not the password's.
    expect(problem(() => unwrapDek(box, p.wrapKey, 'r', kidOf(dek)))).toBe('bad_key');
  });

  it('an older version of the chest is never taken; ours, newer, goes over it', () => {
    const dek = newDek();
    const server = new FakeServer();
    server.kid = kidOf(dek);
    const a: Phone = { forest: forestOf([plant('sec1', 'Secret', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(dek) };
    sync(a, server, day(0));
    const v1 = server.records.get('vault')!;
    water(a, 'sec1', '2026-09-18');
    sync(a, server, day(0));
    const v2 = JSON.parse(server.records.get('vault')!.text!) as VaultEnvelope;
    expect([JSON.parse(v1.text!).seq, v2.seq, a.meta.vaultSeq]).toEqual([1, 2, 2]);
    // The server serves the old one again (as a new write): refused, nothing merged.
    const old: SyncRecord = { key: 'vault', rev: 99, deleted: false, body: JSON.parse(v1.text!), at: 0 };
    noteRecord(a.meta, old);
    expect(takeVault(a.meta, old, a.key, USER)).toBeNull();
    expect(a.meta.vaultBroken).toBe(false);
    // Ours goes over it, as the next version.
    const w = vaultWrite(a.forest, a.meta, a.key, USER)!;
    expect([w.base, (w.body as VaultEnvelope).seq]).toEqual([99, 3]);
    // A new key starts its versions over.
    expect(vaultWrite(a.forest, { ...a.meta, seqKid: 'other' }, a.key, USER)!.seq).toBe(1);
  });
});

describe('the chest: keys of the account', () => {
  it('a new password: the new box opens the same key, the old one does not', async () => {
    const acc = await makeAccount('old password', 'abcd2345efgh');
    const oldP = await deriveKeys(normPassword('old password'), acc.kdf);
    const dek = unwrapDek(acc.wrapP, oldP.wrapKey, 'p', acc.kid);
    const kdf2 = newKdf();
    const newP = await deriveKeys(normPassword('new password'), kdf2);
    const wrapP2 = wrapDek(dek, newP.wrapKey, 'p');
    expect(kidOf(unwrapDek(wrapP2, newP.wrapKey, 'p', acc.kid))).toBe(acc.kid);
    expect(() => unwrapDek(wrapP2, oldP.wrapKey, 'p', acc.kid)).toThrow(CryptoError);
    // The code's box is untouched and still opens it.
    const r = await deriveKeys(normCode('ABCD-2345-EFGH'), acc.recKdf);
    expect(kidOf(unwrapDek(acc.wrapR, r.wrapKey, 'r', acc.kid))).toBe(acc.kid);
  });

  it('recovery: the code gives the same key, then new boxes for a new password and code', async () => {
    const acc = await makeAccount('forgotten', 'abcd2345efgh');
    const r = await deriveKeys(normCode('abcd 2345 efgh'), acc.recKdf);
    const dek = unwrapDek(acc.wrapR, r.wrapKey, 'r', acc.kid);
    const k2 = await deriveKeys(normPassword('brand new'), acc.kdf);
    const c2 = await deriveKeys(normCode('zzzz2345yyyy'), acc.recKdf);
    const boxes = { wrapP: wrapDek(dek, k2.wrapKey, 'p'), wrapR: wrapDek(dek, c2.wrapKey, 'r') };
    expect(kidOf(unwrapDek(boxes.wrapP, k2.wrapKey, 'p', acc.kid))).toBe(acc.kid);
    expect(kidOf(unwrapDek(boxes.wrapR, c2.wrapKey, 'r', acc.kid))).toBe(acc.kid);
    // A chest of before opens with it.
    const env = sealVault(chestContent(forestOf([plant('s', 'S', 'private')])), acc.dek, { userId: USER, seq: 4 });
    expect(parseChest(openVault(env, dek, { userId: USER }))!.trees[0].name).toBe('S');
  });

  it('a new password without the key (newDek): the account chest is lost, this phone’s hidden trees go into a new one', () => {
    const oldDek = newDek();
    const server = new FakeServer();
    server.kid = kidOf(oldDek);
    const a: Phone = { forest: forestOf([plant('sec1', 'Old one', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(oldDek) };
    sync(a, server, day(0));
    // Phone B never had the key; reset-device with newDek: the server drops the chest, a new key id.
    const fresh = newDek();
    server.kid = kidOf(fresh);
    server.records.set('vault', { rev: ++server.rev, deleted: true, text: null, at: 0 });
    const b: Phone = { forest: forestOf([plant('sec2', 'Mine', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(fresh) };
    sync(b, server, day(0));
    const env = JSON.parse(server.records.get('vault')!.text!) as VaultEnvelope;
    expect([env.kid, env.seq]).toEqual([kidOf(fresh), 1]);
    expect(parseChest(openVault(env, fresh, { userId: USER }))!.trees.map((t) => t.id)).toEqual(['sec2']);
    // The old key opens nothing now; that phone is "locked" until it signs in again.
    sync(a, server, day(0));
    expect(a.meta.kid).toBe(kidOf(fresh));
    expect(canSeal(a.meta, a.key)).toBe(false);
    expect(a.forest.trees.map((t) => t.id)).toEqual(['sec1']);
  });
});

describe('the chest: visibility and two devices', () => {
  it('"Only me": the open record becomes a tombstone without a name; "Friends": the record back, the chest without it', () => {
    const dek = newDek();
    const server = new FakeServer();
    server.kid = kidOf(dek);
    const a: Phone = { forest: forestOf([plant('t1', 'Swim daily', 'friends')]), meta: newMeta(), key: stored(dek) };
    water(a, 't1', day(0));
    sync(a, server, day(0));
    expect(server.records.has('vault')).toBe(false);

    setVisibility(a, 't1', 'private', S(2_000));
    sync(a, server, day(0));
    const tomb = server.records.get('tree:t1')!;
    expect(tomb.deleted).toBe(true);
    expect(tomb.text!.includes('Swim')).toBe(false);
    expect(JSON.parse(tomb.text!)).toEqual({ at: S(2_000), lineageId: 't1' });
    const chest1 = parseChest(openVault(JSON.parse(server.records.get('vault')!.text!), dek, { userId: USER }))!;
    expect(chest1.trees.map((t) => t.id)).toEqual(['t1']);
    expect(chest1.ledger[waterKey('t1', day(0))]).toBe(5);
    expect(JSON.parse(server.records.get('progress')!.text!).ledger[waterKey('t1', day(0))]).toBeUndefined();

    // Another phone follows: hidden there too, from the chest.
    const b: Phone = { forest: emptyForest(), meta: newMeta(), key: stored(dek) };
    sync(b, server, day(0));
    expect(b.forest.trees[0].visibility).toBe('private');

    setVisibility(b, 't1', 'friends', S(3_000, 'B'));
    sync(b, server, day(0));
    const open = server.records.get('tree:t1')!;
    expect([open.deleted, JSON.parse(open.text!).name]).toEqual([false, 'Swim daily']);
    const chest2 = parseChest(openVault(JSON.parse(server.records.get('vault')!.text!), dek, { userId: USER }))!;
    expect(chest2.trees).toEqual([]);
    expect(JSON.parse(server.records.get('progress')!.text!).ledger[waterKey('t1', day(0))]).toBe(5);
    // Phone A had it hidden: the open record (later choice) and the old chest both come — open wins, nothing lost.
    sync(a, server, day(0));
    expect(a.forest.trees.map((t) => [t.id, t.visibility, t.checkins])).toEqual([['t1', 'friends', [day(0)]]]);
    expect(sorted(a.forest)).toBe(sorted(b.forest));
  });

  it('both water different days offline: both days; one deletes the habit: the tombstone wins', () => {
    const dek = newDek();
    const server = new FakeServer();
    server.kid = kidOf(dek);
    const a: Phone = { forest: forestOf([plant('s1', 'S one', 'private', SECRET_PLANTED), plant('s2', 'S two', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(dek) };
    sync(a, server, '2026-09-17');
    const b: Phone = { forest: emptyForest(), meta: newMeta(), key: stored(dek) };
    sync(b, server, '2026-09-17');
    expect(b.forest.trees.length).toBe(2);
    water(a, 's1', '2026-09-18');
    water(b, 's1', '2026-09-19');
    deleteHabit(b, 's2', S(5_000, 'B'));
    sync(a, server, '2026-09-19');
    sync(b, server, '2026-09-19'); // conflict on the chest: opened, merged, written as the next version
    sync(a, server, '2026-09-19');
    for (const p of [a, b]) {
      expect(p.forest.trees.map((t) => t.id)).toEqual(['s1']);
      expect(p.forest.trees[0].checkins).toEqual(['2026-09-18', '2026-09-19']);
      expect(p.forest.hiddenTombs.s2).toBe(S(5_000, 'B'));
    }
    expect(sorted(a.forest)).toBe(sorted(b.forest));
    expect(a.meta.vaultSeq).toBe(b.meta.vaultSeq);
  });

  it('acorns are not doubled: one reward paid on two devices counts once, the balance is the same', () => {
    const dek = newDek();
    const server = new FakeServer();
    server.kid = kidOf(dek);
    const a: Phone = { forest: forestOf([plant('s1', 'S', 'private', SECRET_PLANTED)]), meta: newMeta(), key: stored(dek) };
    sync(a, server, '2026-09-17');
    const b: Phone = { forest: emptyForest(), meta: newMeta(), key: stored(dek) };
    sync(b, server, '2026-09-17');
    // The same day on both, offline: one reward key.
    water(a, 's1', '2026-09-18');
    water(b, 's1', '2026-09-18');
    const balance = balanceOf(a.forest.ledger, []);
    sync(a, server, '2026-09-18');
    sync(b, server, '2026-09-18');
    sync(a, server, '2026-09-18');
    expect(balanceOf(a.forest.ledger, [])).toBe(balance);
    expect(balanceOf(b.forest.ledger, [])).toBe(balance);
    expect(Object.keys(b.forest.ledger).filter((k) => k.startsWith('w:s1:'))).toEqual([waterKey('s1', '2026-09-18')]);
  });

  it('the chest content is the same JSON for the same data, and hashed open', () => {
    const f = forestOf([plant('b', 'B', 'private'), plant('a', 'A', 'private'), plant('o', 'O', 'friends')]);
    const g = { ...f, trees: [...f.trees].reverse() };
    expect(stableStringify(chestContent(f))).toBe(stableStringify(chestContent(g)));
    expect(chestContent(f).trees.map((t) => t.id)).toEqual(['a', 'b']);
    expect(hashBody(chestContent(f))).toBe(hashBody(chestContent(g)));
    // Not a chest: never taken as an empty one.
    expect(parseChest({ v: 2, trees: [] })).toBeNull();
    expect(parseChest([])).toBeNull();
    expect(parseChest({ v: 1, trees: [{ id: 'x' }], places: { x: { dc: 99, dr: 0 } }, ledger: { k: 'no' }, tombs: { l: 1 } })).toEqual({ trees: [], places: {}, ledger: {}, tombs: {} });
  });

  it('an empty chest goes only to empty one the account keeps', () => {
    const dek = newDek();
    const server = new FakeServer();
    server.kid = kidOf(dek);
    const a: Phone = { forest: forestOf([plant('o', 'O', 'friends')]), meta: newMeta(), key: stored(dek) };
    sync(a, server, day(0));
    expect(server.records.has('vault')).toBe(false);
    a.forest = forestOf([plant('o', 'O', 'friends'), plant('s', 'S', 'private')]);
    sync(a, server, day(0));
    expect(server.records.has('vault')).toBe(true);
    // The last hidden habit shown to friends: the chest is emptied in the account too.
    setVisibility(a, 's', 'friends', S(9_000));
    sync(a, server, day(0));
    const last = parseChest(openVault(JSON.parse(server.records.get('vault')!.text!), dek, { userId: USER }))!;
    expect(last).toEqual({ trees: [], places: {}, ledger: {}, tombs: {} });
    expect(vaultChange(a.forest, a.meta)).toBeNull();
  });
});
