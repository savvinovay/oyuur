import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';
import { forestFromRecords, plotSide } from '../src/sync.js';

// A clock the tests move: 2026-10-29 noon UTC.
const NOW = Date.parse('2026-10-29T12:00:00Z');
let clock = NOW;
let db;
let server;
let base;

before(async () => {
  db = openDb(':memory:');
  server = createApp({ db, now: () => clock });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, body, token, ip = '10.0.0.1') {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined || body === null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

let n = 0;
async function signup() {
  n += 1;
  const nick = `sync${n}x`;
  const r = await call('POST', '/api/signup', { nick, password: 'secret12', name: 'Аня' }, null, `10.2.${n}.1`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { nick, token: r.body.token, id: db.prepare('SELECT id FROM users WHERE nick = ?').get(nick).id };
}
async function befriend(a, b) {
  await call('POST', '/api/friends/request', { nick: b.nick }, a.token);
  const r = await call('POST', '/api/friends/accept', { nick: a.nick }, b.token);
  assert.equal(r.body.relation, 'friend');
}

const tree = (id, extra = {}) => ({
  id, lineageId: id, name: 'Run', kind: 'do', visibility: 'friends', skin: 'birch', plantedOn: '2026-10-01',
  checkins: ['2026-10-26', '2026-10-27'], frozen: [], chancesLeft: 3, refilledMonth: '2026-10', settledThrough: '2026-10-28',
  diedOn: null, completedOn: null, generation: 1, parentId: null, nickname: 'Дубок', namedOn: '2026-10-02', nameAsks: 1,
  nameAskedOn: null, nameLaterOn: null, openHours: [{ from: '2026-10-01', hour: 0 }],
  stamps: { nickname: '1761739200000-0000-devaaaaaaaaa', visibility: '' },
  ...extra,
});
const push = (token, records, epoch = 0) => call('POST', '/api/sync', { epoch, records }, token);
const pull = (token, since = 0) => call('GET', `/api/sync?since=${since}`, null, token);

describe('sync: records', () => {
  it('a new record, a conflict by base, the retry over the server’s rev', async () => {
    const a = await signup();
    const first = await push(a.token, [{ key: 'tree:t1', base: 0, body: tree('t1') }]);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.deepEqual(first.body, { rev: 1, epoch: 0, saved: [{ key: 'tree:t1', rev: 1 }], conflicts: [] });

    // Another device, also from nothing: the server's version comes back, nothing is written.
    const other = await push(a.token, [{ key: 'tree:t1', base: 0, body: tree('t1', { checkins: ['2026-10-28'] }) }]);
    assert.equal(other.status, 200);
    assert.deepEqual(other.body.saved, []);
    assert.equal(other.body.rev, 1);
    const [c] = other.body.conflicts;
    assert.deepEqual([c.key, c.rev, c.deleted, c.at], ['tree:t1', 1, false, NOW]);
    assert.deepEqual(c.body, tree('t1'));

    // Merged on the phone, sent again over rev 1.
    const retry = await push(a.token, [{ key: 'tree:t1', base: 1, body: tree('t1', { checkins: ['2026-10-26', '2026-10-27', '2026-10-28'] }) }]);
    assert.deepEqual(retry.body.saved, [{ key: 'tree:t1', rev: 2 }]);
    assert.deepEqual(retry.body.conflicts, []);

    const all = await pull(a.token);
    assert.equal(all.status, 200);
    assert.deepEqual([all.body.rev, all.body.epoch, all.body.more], [2, 0, false]);
    assert.equal(all.body.records.length, 1);
    // Kept as sent: every field of the tree, not only what friends see.
    assert.deepEqual(all.body.records[0].body, tree('t1', { checkins: ['2026-10-26', '2026-10-27', '2026-10-28'] }));
    assert.deepEqual((await pull(a.token, 2)).body, { rev: 2, epoch: 0, records: [], more: false, kid: null });
  });

  it('a record based on nothing the server has comes back empty, not as a tombstone', async () => {
    const a = await signup();
    const r = await push(a.token, [{ key: 'progress', base: 7, body: { ledger: {} } }]);
    assert.deepEqual(r.body.conflicts, [{ key: 'progress', rev: 0, deleted: false, body: null, at: 0 }]);
  });

  it('all or nothing: one bad record and none is written', async () => {
    const a = await signup();
    const r = await push(a.token, [
      { key: 'tree:ok', base: 0, body: tree('ok') },
      { key: 'tree:bad', base: 0, body: tree('bad', { plantedOn: 'yesterday' }) },
    ]);
    assert.deepEqual([r.status, r.body.error, r.body.key], [400, 'bad_record', 'tree:bad']);
    assert.deepEqual((await pull(a.token)).body.records, []);
  });

  it('pages of 500, oldest first; `more` and the rev to go on from', async () => {
    const a = await signup();
    const records = Array.from({ length: 501 }, (_, i) => ({ key: `tree:p${i}`, base: 0, body: tree(`p${i}`) }));
    assert.equal((await push(a.token, records)).body.saved.length, 501);
    const one = await pull(a.token);
    assert.equal(one.body.records.length, 500);
    assert.equal(one.body.more, true);
    assert.equal(one.body.rev, 500);
    assert.deepEqual(one.body.records.slice(0, 2).map((r) => r.rev), [1, 2]);
    const two = await pull(a.token, one.body.rev);
    assert.deepEqual([two.body.records.length, two.body.more, two.body.rev], [1, false, 501]);
    assert.equal(two.body.records[0].key, 'tree:p500');
  });

  it('a tombstone: deleted, no body; friends stop seeing the tree', async () => {
    const a = await signup();
    const b = await signup();
    await befriend(a, b);
    await push(a.token, [{ key: 'tree:t1', base: 0, body: tree('t1') }, { key: 'tree:t2', base: 0, body: tree('t2') }]);
    const r = await push(a.token, [{ key: 'tree:t1', base: 1, deleted: true }]);
    assert.deepEqual(r.body.saved, [{ key: 'tree:t1', rev: 3 }]);
    const got = (await pull(a.token, 2)).body.records;
    assert.deepEqual(got.map((x) => [x.key, x.deleted, x.body]), [['tree:t1', true, null]]);
    const seen = await call('GET', `/api/users/${a.nick}`, null, b.token);
    assert.deepEqual(seen.body.forest.trees.map((t) => t.id), ['t2']);
    // A tombstone may only say when the tree left (the phone's clock) and its habit; a tree as its body is a mistake.
    const bad = await push(a.token, [{ key: 'tree:t2', base: 2, deleted: true, body: tree('t2') }]);
    assert.deepEqual([bad.status, bad.body.error], [400, 'bad_record']);
    assert.equal((await push(a.token, [{ key: 'tree:t2', base: 2, deleted: true, body: { at: 'x'.repeat(101) } }])).body.error, 'bad_record');
    assert.equal((await push(a.token, [{ key: 'progress', base: 0, deleted: true, body: { at: '1' } }])).body.error, 'bad_record');
    const at = '1761825600000-0003-devbbbbbbbbb';
    const marked = await push(a.token, [{ key: 'tree:t2', base: 2, deleted: true, body: { at, lineageId: 't2' } }]);
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    const tomb = (await pull(a.token, 3)).body.records;
    assert.deepEqual(tomb.map((x) => [x.key, x.deleted, x.body]), [['tree:t2', true, { at, lineageId: 't2' }]]);
    // Not a tree for friends, not a live tree for the limit.
    assert.deepEqual((await call('GET', `/api/users/${a.nick}`, null, b.token)).body.forest.trees, []);
    assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE user_id = ? AND key LIKE 'tree:%' AND deleted = 0").get(a.id).n, 0);
  });

  it('a hidden tree never gets in', async () => {
    const a = await signup();
    const r = await push(a.token, [{ key: 'tree:t1', base: 0, body: tree('t1', { visibility: 'private' }) }]);
    assert.deepEqual([r.status, r.body.error, r.body.key], [400, 'bad_record', 'tree:t1']);
    // Nor under another tree's key, nor with a made-up key.
    assert.equal((await push(a.token, [{ key: 'tree:t2', base: 0, body: tree('t1') }])).body.error, 'bad_record');
    assert.equal((await push(a.token, [{ key: 'secrets', base: 0, body: {} }])).body.error, 'bad_record');
    assert.equal((await push(a.token, [{ key: 'tree:a/b', base: 0, body: tree('a/b') }])).body.error, 'bad_record');
    // The same key twice in one request.
    assert.equal((await push(a.token, [{ key: 'tree:t3', base: 0, body: tree('t3') }, { key: 'tree:t3', base: 0, body: tree('t3') }])).body.error, 'bad_record');
    assert.deepEqual((await pull(a.token)).body.records, []);
  });

  it('checks the shape: plot offsets, progress an object, the epoch', async () => {
    const a = await signup();
    assert.equal((await push(a.token, [{ key: 'plot', base: 0, body: { places: { x: { dc: 21, dr: 0, at: '' } } } }])).body.error, 'bad_record');
    assert.equal((await push(a.token, [{ key: 'plot', base: 0, body: { places: { x: { dc: 0.5, dr: 0 } } } }])).body.error, 'bad_record');
    assert.equal((await push(a.token, [{ key: 'progress', base: 0, body: [1, 2] }])).body.error, 'bad_record');
    assert.equal((await push(a.token, [{ key: 'tree:t1', base: -1, body: tree('t1') }])).body.error, 'bad_record');
    assert.equal((await call('POST', '/api/sync', { records: [] }, a.token)).body.error, 'bad_epoch');
    assert.equal((await call('GET', '/api/sync?since=abc', null, a.token)).body.error, 'bad_since');
    assert.equal((await call('GET', '/api/sync', null, null)).status, 401);
    // The chest (OYUUR-31): an opaque envelope.
    assert.equal((await push(a.token, [{ key: 'vault', base: 0, body: { v: 1, kid: 'abc', seq: 1, n: 'nonce', c: 'not base64!' } }])).body.error, 'bad_record');
    // Only with the account's data key (an account without one: 409 no_keys).
    assert.equal((await push(a.token, [{ key: 'vault', base: 0, body: { v: 1, kid: 'abc', seq: 1, n: 'bm9uY2U', c: 'Y2lwaGVy' } }])).body.error, 'no_keys');
    db.prepare('UPDATE users SET key_id = ? WHERE id = ?').run('abc', a.id);
    assert.equal((await push(a.token, [{ key: 'vault', base: 0, body: { v: 1, kid: 'abc', seq: 1, n: 'bm9uY2U', c: 'Y2lwaGVy' } }])).status, 200);
  });

  it('limits: a record’s size, the request’s size, 1000 live trees', async () => {
    const a = await signup();
    const big = await push(a.token, [{ key: 'tree:t1', base: 0, body: tree('t1', { notes: 'x'.repeat(130 * 1024) }) }]);
    assert.deepEqual([big.status, big.body.error, big.body.key], [400, 'bad_record', 'tree:t1']);
    // progress (the acorn journal) may be much bigger than a tree, up to 1 MB.
    assert.equal((await push(a.token, [{ key: 'progress', base: 0, body: { quests: 'x'.repeat(200 * 1024) } }])).status, 200);
    assert.equal((await push(a.token, [{ key: 'progress', base: 1, body: { quests: 'x'.repeat(900 * 1024) } }])).status, 200);
    const over1mb = await push(a.token, [{ key: 'progress', base: 2, body: { quests: 'x'.repeat(1025 * 1024) } }]);
    assert.deepEqual([over1mb.body.error, over1mb.body.reason], ['bad_record', 'too_big']);
    assert.equal((await push(a.token, [{ key: 'plot', base: 0, body: { places: {}, pad: 'x'.repeat(260 * 1024) } }])).body.error, 'bad_record');
    const huge = await call('POST', '/api/sync', JSON.stringify({ epoch: 0, records: [{ key: 'progress', base: 1, body: { x: 'x'.repeat(1.6 * 1024 * 1024) } }] }), a.token);
    assert.deepEqual([huge.status, huge.body.error], [413, 'too_big']);
    // Bigger than the old 20 KB limit of other doors is fine here.
    assert.equal((await push(a.token, [{ key: 'progress', base: 2, body: { quests: 'y'.repeat(100 * 1024) } }])).status, 200);

    const many = (from, count) => Array.from({ length: count }, (_, i) => ({ key: `tree:m${from + i}`, base: 0, body: tree(`m${from + i}`, { checkins: [] }) }));
    assert.equal((await push(a.token, many(0, 1000))).status, 200);
    const over = await push(a.token, many(1000, 1));
    assert.deepEqual([over.status, over.body.error], [413, 'too_many_trees']);
    // Nothing of the refused request stays; a tombstone frees a place.
    assert.equal(db.prepare("SELECT count(*) AS n FROM records WHERE user_id = ? AND key LIKE 'tree:%'").get(a.id).n, 1000);
    const rev = db.prepare("SELECT rev FROM records WHERE user_id = ? AND key = 'tree:m0'").get(a.id).rev;
    assert.equal((await push(a.token, [{ key: 'tree:m0', base: rev, deleted: true }, ...many(1000, 1)])).status, 200);
  });
});

describe('sync: what friends see', () => {
  it('rebuilt from the records: open trees, places from the centre, the meadow, no hidden count', async () => {
    const a = await signup();
    const b = await signup();
    await befriend(a, b);
    await push(a.token, [
      { key: 'tree:t1', base: 0, body: tree('t1') },
      { key: 'tree:t2', base: 0, body: tree('t2', { lineageId: 'l2', plantedOn: '2026-09-01', notes: 'mine only', stamps: {} }) },
      // A hidden habit's place is never sent by the phone; if it were, it has no open tree and is dropped.
      { key: 'plot', base: 0, body: { places: { t1: { dc: -1, dr: 0, at: '' }, l2: { dc: 2, dr: -3, at: '' }, secret: { dc: 0, dr: 1, at: '' } } } },
      { key: 'progress', base: 0, body: { ledger: { 'w:t1:2026-10-26': 1 }, shop: { owned: [], meadow: 'winter' }, tombs: {} } },
    ]);
    const list = await call('GET', '/api/friends?day=2026-10-29', null, b.token);
    const forest = list.body.friends[0].forest;
    assert.deepEqual(forest.trees.map((t) => t.id), ['t2', 't1']);
    // Cleaned as before: no visibility, no notes, no stamps.
    assert.deepEqual(Object.keys(forest.trees[0]).sort(), ['chancesLeft', 'checkins', 'completedOn', 'diedOn', 'frozen', 'generation', 'id', 'kind', 'lineageId', 'name', 'nickname', 'openHours', 'plantedOn', 'skin'].sort());
    // dc -1…2, dr -3…0 need a side of 6; a ring around makes 8: c = dc + 4, r = dr + 4.
    assert.deepEqual(forest.plot, { size: 8, places: { t1: { c: 3, r: 4 }, l2: { c: 6, r: 1 } } });
    assert.equal(forest.meadow, 'winter');
    assert.equal(forest.hidden, 0);
    assert.equal(list.body.friends[0].forestAt, NOW);
    const seen = await call('GET', `/api/users/${a.nick}`, null, b.token);
    assert.deepEqual(seen.body.forest, forest);
    // A stranger still sees nothing.
    const c = await signup();
    assert.equal((await call('GET', `/api/users/${a.nick}`, null, c.token)).body.forest, null);
  });

  it('the side of the plot', () => {
    assert.equal(plotSide([]), 6);
    assert.equal(plotSide([{ dc: -2, dr: 1 }]), 6);
    assert.equal(plotSide([{ dc: 2, dr: 0 }]), 8);
    assert.equal(plotSide([{ dc: -20, dr: 20 }]), 44);
    const f = forestFromRecords([{ key: 'plot', deleted: 0, body: JSON.stringify({ places: { x: { dc: 0, dr: 0 } } }) }]);
    // No open tree of that habit: no place.
    assert.deepEqual(f.plot, { size: 6, places: {} });
  });
});

describe('sync: erase everything', () => {
  it('wipe: records go, the epoch moves on, old devices are told', async () => {
    const a = await signup();
    const b = await signup();
    await befriend(a, b);
    await push(a.token, [{ key: 'tree:t1', base: 0, body: tree('t1') }, { key: 'progress', base: 0, body: { ledger: {} } }]);
    const w = await call('POST', '/api/sync/wipe', {}, a.token);
    assert.equal(w.status, 200);
    assert.deepEqual(w.body, { rev: 3, epoch: 1 });
    assert.equal(db.prepare('SELECT count(*) AS n FROM records WHERE user_id = ?').get(a.id).n, 0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM watering_seen WHERE user_id = ?').get(a.id).n, 0);
    // A device that didn't know: its changes are about the erased forest.
    const late = await push(a.token, [{ key: 'tree:t1', base: 1, body: tree('t1') }], 0);
    assert.deepEqual([late.status, late.body.error, late.body.epoch], [409, 'wiped', 1]);
    assert.deepEqual((await pull(a.token)).body, { rev: 3, epoch: 1, records: [], more: false, kid: null });
    assert.deepEqual((await call('GET', `/api/users/${a.nick}`, null, b.token)).body.forest.trees, []);
    // In the new epoch everything starts from nothing again.
    assert.deepEqual((await push(a.token, [{ key: 'tree:t1', base: 0, body: tree('t1') }], 1)).body.saved, [{ key: 'tree:t1', rev: 4 }]);
  });
});

describe('sync: late waterings', () => {
  it('the server keeps when it first saw each watering, and never moves it', async () => {
    const a = await signup();
    clock = NOW;
    await push(a.token, [{ key: 'tree:t1', base: 0, body: tree('t1') }]);
    clock = NOW + 3 * 86_400_000;
    await push(a.token, [{ key: 'tree:t1', base: 1, body: tree('t1', { checkins: ['2026-10-26', '2026-10-27', '2026-10-28'] }) }]);
    // A conflict writes nothing.
    await push(a.token, [{ key: 'tree:t1', base: 1, body: tree('t1', { checkins: ['2026-10-29'] }) }]);
    clock = NOW;
    const rows = db.prepare('SELECT day, at FROM watering_seen WHERE user_id = ? AND tree_id = ? ORDER BY day').all(a.id, 't1');
    assert.deepEqual(rows.map((r) => [r.day, r.at]), [
      ['2026-10-26', NOW],
      ['2026-10-27', NOW],
      ['2026-10-28', NOW + 3 * 86_400_000],
    ]);
  });
});

describe('sync: old apps (PUT /api/forest)', () => {
  it('works until the account keeps its forest in records, then asks to update the app', async () => {
    const a = await signup();
    const b = await signup();
    await befriend(a, b);
    const old = await call('PUT', '/api/forest', { trees: [tree('o1')], plot: { size: 4, places: { o1: { c: 1, r: 1 } } }, meadow: 'autumn', hidden: 2 }, a.token);
    assert.equal(old.status, 200);
    const seen = (await call('GET', `/api/users/${a.nick}`, null, b.token)).body.forest;
    assert.deepEqual([seen.trees.length, seen.meadow, seen.hidden], [1, 'autumn', 0]);
    // A forest saved by the server before OYUUR-30 still has the count: it isn't shown.
    db.prepare('UPDATE users SET public = ? WHERE id = ?').run(JSON.stringify({ ...seen, hidden: 3 }), a.id);
    assert.equal((await call('GET', `/api/users/${a.nick}`, null, b.token)).body.forest.hidden, 0);
    // A vault alone is not the forest (OYUUR-31): the old app may still send.
    db.prepare('UPDATE users SET key_id = ? WHERE id = ?').run('abc', a.id);
    await push(a.token, [{ key: 'vault', base: 0, body: { v: 1, kid: 'abc', seq: 1, n: 'bm9uY2U', c: 'Y2lwaGVy' } }]);
    assert.equal((await call('PUT', '/api/forest', { trees: [] }, a.token)).status, 200);
    await push(a.token, [{ key: 'tree:t1', base: 0, body: tree('t1') }]);
    const refused = await call('PUT', '/api/forest', { trees: [] }, a.token);
    assert.deepEqual([refused.status, refused.body.error], [409, 'upgrade_app']);
    // The records stay what friends see.
    assert.deepEqual((await call('GET', `/api/users/${a.nick}`, null, b.token)).body.forest.trees.map((t) => t.id), ['t1']);
  });
});

describe('sync: an old database', () => {
  it('gets the new tables and columns', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'oyuur-'));
    const path = join(dir, 'old.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, nick TEXT NOT NULL UNIQUE, pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL, rec_salt TEXT, rec_hash TEXT, name TEXT, avatar TEXT NOT NULL DEFAULT 'fox', color INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, public TEXT, public_at INTEGER, deleted INTEGER NOT NULL DEFAULT 0, banned_at INTEGER);
      INSERT INTO users (id, nick, pass_salt, pass_hash, created_at) VALUES ('u1', 'oldie', 's', 'h', 1);`);
    old.close();
    const db2 = openDb(path);
    const cols = db2.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
    assert.ok(['rev', 'epoch', 'auth_v', 'kdf', 'rec_kdf', 'wrap_p', 'wrap_r', 'key_id'].every((c) => cols.includes(c)));
    assert.deepEqual({ ...db2.prepare('SELECT rev, epoch, auth_v, kdf FROM users').get() }, { rev: 0, epoch: 0, auth_v: 1, kdf: null });
    const tables = db2.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
    assert.ok(['records', 'watering_seen', 'recover_tickets', 'meta'].every((t) => tables.includes(t)));
    assert.equal(db2.prepare('PRAGMA secure_delete').get().secure_delete, 1);
    // The server's secret is made once and kept.
    const { serverSecret } = await import('../src/db.js');
    const s1 = serverSecret(db2, 'x');
    db2.close();
    const db3 = openDb(path);
    assert.deepEqual(serverSecret(db3, 'x'), s1);
    assert.equal(s1.length, 32);
    db3.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
