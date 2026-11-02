// The forest in the account, end to end without a network: two phones and a server that keeps
// records by rev and refuses a write over a version the phone hasn't seen (design/oyuur-30/план.md).
import { describe, expect, it } from '@jest/globals';
import { addDays } from '@/game/dates';
import { balanceOf, earnedOf, monthKey, pruneLedger, treeMonthKey, wateringReward } from '@/game/economy';
import { hlcNext } from '@/game/merge';
import { syncPlot } from '@/game/plot';
import { checkIn, groupHabits, growthDays, plantTree, settle, Tree } from '@/game/tree';
import type { SyncWrite } from '@/net/api';
import {
  buildRecords,
  chestOf,
  dirtyWrites,
  emptyForest,
  Forest,
  hashBody,
  hiddenPart,
  hiddenTreeIds,
  Meta,
  mergeRemote,
  noteRecord,
  parseRecords,
  stableStringify,
  SyncRecord,
} from '../records';

const D0 = '2026-10-01';
const day = (n: number) => addDays(D0, n);
const S = (ms: number, dev = 'A') => hlcNext('', ms, dev);

class FakeServer {
  rev = 0;
  epoch = 0;
  records = new Map<string, { rev: number; deleted: boolean; text: string | null; at: number }>();
  get(since: number) {
    const out: SyncRecord[] = [...this.records.entries()]
      .filter(([, r]) => r.rev > since)
      .sort((a, b) => a[1].rev - b[1].rev)
      .map(([key, r]) => ({ key, rev: r.rev, deleted: r.deleted, body: r.text === null ? null : JSON.parse(r.text), at: r.at }));
    return { rev: this.rev, epoch: this.epoch, records: out, more: false };
  }
  post(epoch: number, writes: SyncWrite[]) {
    if (epoch !== this.epoch) throw new Error('wiped');
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
      // A tombstone keeps what it says (when the tree left, by the phone's clock).
      this.records.set(w.key, { rev: this.rev, deleted: !!w.deleted, text: w.body === undefined ? null : JSON.stringify(w.body), at: 1_000 + this.rev });
      saved.push({ key: w.key, rev: this.rev });
    }
    return { rev: this.rev, epoch: this.epoch, saved, conflicts };
  }
}

interface Phone {
  forest: Forest;
  meta: Meta;
}

const newMeta = (): Meta => ({ userId: 'sasha', nick: 'sasha', lastRev: 0, epoch: null, sent: {}, revs: {}, lineages: {}, lastOkAt: null, failures: 0, sessionLost: false, decided: true, since: 0, vaultSeq: 0, seqKid: null, vaultBroken: false, lockLaterAt: null });

/** One sync round of a phone, as sync.tsx does it: fetch, merge, send, merge conflicts, send again. */
function sync(phone: Phone, server: FakeServer, today: string) {
  const page = server.get(phone.meta.lastRev);
  for (const r of page.records) noteRecord(phone.meta, r);
  phone.forest = mergeRemote(phone.forest, parseRecords(page.records), today).forest;
  phone.meta.lastRev = page.rev;
  phone.meta.epoch = page.epoch;
  for (let round = 0; round < 5; round++) {
    const writes = dirtyWrites(phone.forest, phone.meta);
    if (writes.length === 0) return;
    const res = server.post(phone.meta.epoch ?? 0, writes.map(({ hash: _hash, ...w }) => w));
    for (const s of res.saved) {
      const w = writes.find((x) => x.key === s.key)!;
      noteRecord(phone.meta, { key: s.key, rev: s.rev, deleted: !!w.deleted, body: w.body ?? null, at: 0 });
      phone.meta.sent[s.key] = w.hash;
    }
    for (const c of res.conflicts) noteRecord(phone.meta, c);
    const real = res.conflicts.filter((c) => c.rev > 0);
    if (real.length) phone.forest = mergeRemote(phone.forest, parseRecords(real), today).forest;
  }
  throw new Error('no agreement in 5 rounds');
}

const habitsOf = (trees: Tree[]) => groupHabits(trees).map((h) => ({ lineageId: h.lineageId, days: growthDays(h.current) }));
function forestOf(trees: Tree[]): Forest {
  return { ...emptyForest(), trees, plot: syncPlot(emptyForest().plot, habitsOf(trees)) };
}
const plant = (id: string, visibility: 'friends' | 'private' = 'friends') => plantTree({ id, name: id, kind: 'do', visibility, today: D0 });
/** Waters a tree of the phone on a day, with its acorns, as tapTree does. */
function water(phone: Phone, id: string, n: number) {
  const tree = phone.forest.trees.find((t) => t.id === id)!;
  const out = checkIn(settle(tree, day(n)), day(n));
  const reward = wateringReward(phone.forest.ledger, id, day(n), growthDays(out.tree));
  phone.forest = { ...phone.forest, trees: phone.forest.trees.map((t) => (t.id === id ? out.tree : t)), ledger: reward.ledger };
}
const sorted = (f: Forest) => stableStringify({ ...f, trees: [...f.trees].sort((a, b) => (a.id < b.id ? -1 : 1)), plot: { ...f.plot, seen: [] } });

describe('two phones and the account', () => {
  it('a watering offline on one phone comes to the other; both end the same', () => {
    const server = new FakeServer();
    const a: Phone = { forest: forestOf([plant('t1')]), meta: newMeta() };
    for (const n of [0, 1, 2]) water(a, 't1', n);
    sync(a, server, day(2));
    const b: Phone = { forest: emptyForest(), meta: newMeta() };
    sync(b, server, day(2));
    expect(b.forest.trees).toEqual(a.forest.trees);
    // A has no network on day 3 and waters; B opens on day 4 and sees day 3 missed.
    water(a, 't1', 3);
    b.forest = { ...b.forest, trees: b.forest.trees.map((t) => settle(t, day(4))) };
    expect(b.forest.trees[0].frozen).toEqual([day(3)]);
    water(b, 't1', 4);
    sync(b, server, day(4));
    sync(a, server, day(4));
    sync(b, server, day(4));
    const tb = b.forest.trees[0];
    expect(tb.checkins).toEqual([day(0), day(1), day(2), day(3), day(4)]);
    expect(tb.frozen).toEqual([]);
    expect(tb.chancesLeft).toBe(3);
    expect(sorted(a.forest)).toBe(sorted(b.forest));
    expect(balanceOf(a.forest.ledger, [])).toBe(balanceOf(b.forest.ledger, []));
    // Nothing left to send on either.
    expect(dirtyWrites(a.forest, a.meta)).toEqual([]);
    expect(dirtyWrites(b.forest, b.meta)).toEqual([]);
  });

  it('hidden trees and their acorns never reach the account', () => {
    const server = new FakeServer();
    const a: Phone = { forest: forestOf([plant('open'), plant('secret', 'private')]), meta: newMeta() };
    water(a, 'open', 0);
    water(a, 'secret', 0);
    sync(a, server, day(0));
    expect([...server.records.keys()].sort()).toEqual(['plot', 'progress', 'tree:open']);
    const all = JSON.stringify([...server.records.values()]);
    expect(all).not.toContain('secret');
    expect(chestOf(a.forest).trees.map((t) => t.id)).toEqual(['secret']);
    expect(Object.keys(chestOf(a.forest).ledger)).toEqual([`w:secret:${D0}`]);
  });

  it('a tree made "Only me" leaves the account; the other phone hides it too and never sends it back', () => {
    const server = new FakeServer();
    const a: Phone = { forest: forestOf([plant('t1')]), meta: newMeta() };
    sync(a, server, day(0));
    const b: Phone = { forest: emptyForest(), meta: newMeta() };
    sync(b, server, day(0));
    a.forest = { ...a.forest, trees: a.forest.trees.map((t) => ({ ...t, visibility: 'private' as const, stamps: { visibility: S(5_000) } })) };
    sync(a, server, day(0));
    expect(server.records.get('tree:t1')).toMatchObject({ deleted: true });
    expect(JSON.parse(server.records.get('tree:t1')!.text!)).toEqual({ at: S(5_000), lineageId: 't1' });
    sync(b, server, day(0));
    expect(b.forest.trees[0].visibility).toBe('private');
    expect(dirtyWrites(b.forest, b.meta).filter((w) => w.key === 'tree:t1' && !w.deleted)).toEqual([]);
    expect(server.records.get('tree:t1')!.deleted).toBe(true);
  });

  it('a phone whose clock runs a day ahead hides a tree: the other hides it too, nothing goes round', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const server = new FakeServer();
    // A's clock is a day ahead: its stamps are later than anything the server writes.
    const a: Phone = { forest: forestOf([{ ...plant('t1'), stamps: { visibility: S(DAY + 1_000) } }]), meta: newMeta() };
    sync(a, server, day(0));
    const b: Phone = { forest: emptyForest(), meta: newMeta() };
    sync(b, server, day(0));
    expect(b.forest.trees[0].visibility).toBe('friends');
    a.forest = { ...a.forest, trees: a.forest.trees.map((t) => ({ ...t, visibility: 'private' as const, stamps: { visibility: S(DAY + 5_000) } })) };
    sync(a, server, day(0));
    sync(b, server, day(0));
    sync(a, server, day(0));
    expect(a.forest.trees[0].visibility).toBe('private');
    expect(b.forest.trees[0].visibility).toBe('private');
    expect(b.forest.trees[0].stamps?.visibility).toBe(S(DAY + 5_000));
    // No live record of it in the account, and neither phone has anything to send.
    expect(server.records.get('tree:t1')!.deleted).toBe(true);
    const rev = server.rev;
    sync(b, server, day(0));
    sync(a, server, day(0));
    expect(server.rev).toBe(rev);
    expect(dirtyWrites(a.forest, a.meta)).toEqual([]);
    expect(dirtyWrites(b.forest, b.meta)).toEqual([]);
  });

  it('hidden at the same time (old trees without a stamp): "Only me" wins, nothing goes round', () => {
    const server = new FakeServer();
    const a: Phone = { forest: forestOf([plant('t1')]), meta: newMeta() };
    sync(a, server, day(0));
    const b: Phone = { forest: emptyForest(), meta: newMeta() };
    sync(b, server, day(0));
    a.forest = { ...a.forest, trees: a.forest.trees.map((t) => ({ ...t, visibility: 'private' as const })) };
    sync(a, server, day(0));
    sync(b, server, day(0));
    expect(b.forest.trees[0].visibility).toBe('private');
    expect(dirtyWrites(b.forest, b.meta)).toEqual([]);
  });

  it('acorns of a deleted hidden habit (every generation) never reach the account', () => {
    const server = new FakeServer();
    const second: Tree = { ...plant('s2', 'private'), lineageId: 's1', generation: 2, parentId: 's1' };
    const a: Phone = { forest: forestOf([plant('open'), second]), meta: newMeta() };
    water(a, 'open', 0);
    water(a, 's2', 0);
    water(a, 's2', 1);
    // Deleted as the store does it: the habit's tomb, and its trees' ids for their acorns.
    a.forest = { ...a.forest, trees: a.forest.trees.filter((t) => t.lineageId !== 's1'), hiddenTombs: { s1: S(3_000), s2: S(3_000) } };
    expect(hiddenTreeIds(a.forest).has('s2')).toBe(true);
    sync(a, server, day(1));
    expect(JSON.stringify([...server.records.values()])).not.toContain('s2');
    expect(Object.keys(a.forest.ledger)).toContain(`w:s2:${D0}`);
  });

  it('old months fold apart: the account never gets a sum with hidden acorns in it', () => {
    const server = new FakeServer();
    const a: Phone = { forest: forestOf([plant('open'), plant('secret', 'private')]), meta: newMeta() };
    for (const n of [0, 1, 2]) {
      water(a, 'open', n);
      water(a, 'secret', n);
    }
    const before = earnedOf(a.forest.ledger);
    const today = addDays(D0, 100);
    a.forest = { ...a.forest, ledger: pruneLedger(a.forest.ledger, today, hiddenTreeIds(a.forest)) };
    expect(earnedOf(a.forest.ledger)).toBe(before);
    const month = D0.slice(0, 7);
    // Each tree's waterings fold into its own sum (3 × 5 each); nothing else was earned that month.
    expect(a.forest.ledger[monthKey(month)]).toBe(0);
    expect(a.forest.ledger[treeMonthKey('open', month)]).toBe(15);
    expect(a.forest.ledger[treeMonthKey('secret', month)]).toBe(15);
    sync(a, server, today);
    const sent = JSON.parse(server.records.get('progress')!.text!).ledger as Record<string, number>;
    expect(sent[monthKey(month)]).toBe(0);
    expect(sent[treeMonthKey('open', month)]).toBe(15);
    expect(Object.keys(sent).some((k) => k.includes('secret'))).toBe(false);
    // The hidden tree's sum goes into the chest instead.
    expect(chestOf(a.forest).ledger[treeMonthKey('secret', month)]).toBe(15);

    // A month folded on another phone (OYUUR-30: one m: for the open part): this phone keeps its hidden part apart.
    const b: Phone = { forest: forestOf([plant('secret2', 'private')]), meta: newMeta() };
    for (const n of [0, 1]) water(b, 'secret2', n);
    const hiddenSum = earnedOf(b.forest.ledger);
    b.forest = { ...b.forest, ledger: { ...b.forest.ledger, [monthKey(month)]: 15 } };
    b.forest = { ...b.forest, ledger: pruneLedger(b.forest.ledger, today, hiddenTreeIds(b.forest)) };
    expect(earnedOf(b.forest.ledger)).toBe(15 + hiddenSum);
  });

  it('the account erased on another device: only what was in the account goes here', () => {
    const a: Phone = { forest: forestOf([plant('open'), plant('secret', 'private')]), meta: newMeta() };
    water(a, 'open', 0);
    water(a, 'secret', 0);
    a.forest = { ...a.forest, hiddenTombs: { gone: S(1_000) }, tombs: { old: S(1_000) }, shop: { ...a.forest.shop, owned: ['tree:birch'] } };
    const kept = hiddenPart(a.forest);
    expect(kept.trees.map((t) => t.id)).toEqual(['secret']);
    expect(Object.keys(kept.plot.places)).toEqual(['secret']);
    expect(Object.keys(kept.ledger)).toEqual([`w:secret:${D0}`]);
    expect(kept.hiddenTombs).toEqual({ gone: S(1_000) });
    expect(kept.tombs).toEqual({});
    expect(kept.shop.owned).toEqual([]);
  });

  it('a deleted habit goes from every phone, even watered elsewhere meanwhile', () => {
    const server = new FakeServer();
    const a: Phone = { forest: forestOf([plant('t1'), plant('t2')]), meta: newMeta() };
    sync(a, server, day(0));
    const b: Phone = { forest: emptyForest(), meta: newMeta() };
    sync(b, server, day(0));
    water(b, 't1', 1);
    a.forest = { ...a.forest, trees: a.forest.trees.filter((t) => t.lineageId !== 't1'), tombs: { t1: S(9_000) } };
    sync(a, server, day(1));
    sync(b, server, day(1));
    sync(a, server, day(1));
    expect(b.forest.trees.map((t) => t.id)).toEqual(['t2']);
    expect(a.forest.trees.map((t) => t.id)).toEqual(['t2']);
    expect(server.records.get('tree:t1')!.deleted).toBe(true);
  });

  it('a phone not opened for long (old rev, old data) does not take back newer changes', () => {
    const server = new FakeServer();
    const a: Phone = { forest: forestOf([plant('t1')]), meta: newMeta() };
    sync(a, server, day(0));
    const old: Phone = { forest: emptyForest(), meta: newMeta() };
    sync(old, server, day(0));
    for (const n of [0, 1, 2, 3]) water(a, 't1', n);
    a.forest = { ...a.forest, trees: a.forest.trees.map((t) => ({ ...t, nickname: 'Клён', namedOn: day(3), stamps: { nickname: S(7_000) } })) };
    sync(a, server, day(3));
    // The old phone renames nothing, only its days are judged: its copy is older in every way.
    old.forest = { ...old.forest, trees: old.forest.trees.map((t) => settle(t, day(3))) };
    sync(old, server, day(3));
    expect(old.forest.trees[0].nickname).toBe('Клён');
    expect(old.forest.trees[0].checkins).toHaveLength(4);
    sync(a, server, day(3));
    expect(a.forest.trees[0].nickname).toBe('Клён');
    expect(a.forest.trees[0].frozen).toEqual([]);
  });

  it('three phones, waterings everywhere, end in one forest', () => {
    const server = new FakeServer();
    const phones: Phone[] = [0, 1, 2].map(() => ({ forest: emptyForest(), meta: newMeta() }));
    phones[0].forest = forestOf([plant('t1'), plant('t2')]);
    sync(phones[0], server, day(0));
    phones.slice(1).forEach((p) => sync(p, server, day(0)));
    water(phones[0], 't1', 1);
    water(phones[1], 't2', 1);
    water(phones[2], 't1', 2);
    water(phones[1], 't1', 2);
    for (let i = 0; i < 2; i++) phones.forEach((p) => sync(p, server, day(2)));
    const first = sorted(phones[0].forest);
    phones.forEach((p) => expect(sorted(p.forest)).toBe(first));
    // t1 watered on day 2 on two phones: paid once.
    expect(Object.keys(phones[0].forest.ledger).filter((k) => k === `w:t1:${day(2)}`)).toHaveLength(1);
  });
});

describe('records', () => {
  it('a tree from the account is checked; a broken one is skipped', () => {
    const t = plant('t1');
    const remote = parseRecords([
      { key: 'tree:t1', rev: 1, deleted: false, body: JSON.parse(JSON.stringify({ ...t, stamps: {} })), at: 1 },
      { key: 'tree:bad', rev: 2, deleted: false, body: { id: 'bad', checkins: 'x' }, at: 2 },
      { key: 'tree:t3', rev: 3, deleted: true, body: null, at: 3 },
      { key: 'tree:t4', rev: 6, deleted: true, body: { at: S(9_000, 'B'), lineageId: 't4' }, at: 6 },
      { key: 'plot', rev: 4, deleted: false, body: { places: { t1: { dc: 0, dr: -1, at: '' }, x: { dc: 99, dr: 0 } } }, at: 4 },
      { key: 'progress', rev: 5, deleted: false, body: 'nonsense', at: 5 },
    ]);
    expect(remote.trees.map((x) => x.id)).toEqual(['t1']);
    expect(Object.keys(remote.hiddenElsewhere)).toEqual(['t3', 't4']);
    // A tombstone without the phone's time: the server's; with it: the phone's.
    expect(remote.hiddenElsewhere.t3).toBe('0000000000003-0000-server');
    expect(remote.hiddenElsewhere.t4).toBe(S(9_000, 'B'));
    expect(remote.places).toEqual({ t1: { dc: 0, dr: -1, at: '' } });
    expect(remote.progress).toBeNull();
  });

  it('the same data gives the same hash whatever the order of keys', () => {
    expect(hashBody({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(hashBody({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(hashBody({ a: 1 })).not.toBe(hashBody({ a: 2 }));
  });

  it('the first load on an empty phone shows nothing as new', () => {
    const a = forestOf([plant('t1'), plant('t2')]);
    const records: SyncRecord[] = [...buildRecords(a)].map(([key, body], i) => ({ key, rev: i + 1, deleted: false, body: JSON.parse(JSON.stringify(body)), at: 0 }));
    const { forest } = mergeRemote(emptyForest(), parseRecords(records), day(0));
    expect(forest.plot.seen.sort()).toEqual(['t1', 't2']);
    expect(forest.trees.map((t) => t.id)).toEqual(['t1', 't2']);
  });
});
