// OYUUR-31: the chest of hidden trees and the data key's boxes, as the server sees them —
// opaque bytes it keeps, checks the size of, and never reads.
import assert from 'node:assert/strict';
import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

const NOW = Date.parse('2026-10-29T12:00:00Z');
let db;
let server;
let base;
let dir;

before(async () => {
  // A real file: the last test looks into its bytes.
  dir = mkdtempSync(join(tmpdir(), 'oyuur-vault-'));
  db = openDb(join(dir, 'test.db'));
  server = createApp({ db, now: () => NOW });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.close();
  try {
    db.close();
  } catch {}
  rmSync(dir, { recursive: true, force: true });
});

let ipN = 0;
const freshIp = () => `10.7.${Math.floor(++ipN / 250)}.${ipN % 250}`;
async function call(method, path, body, token, ip = freshIp()) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const kdf = () => ({ alg: 'scrypt', N: 2 ** 15, r: 8, p: 1, salt: randomBytes(16).toString('base64url') });
const key = () => randomBytes(32).toString('base64url');
const keys = () => ({ kdf: kdf(), auth: key(), recKdf: kdf(), recAuth: key() });
const box = () => randomBytes(60).toString('base64url');
const newKid = () => randomBytes(8).toString('base64url');
const boxes = (kid = newKid()) => ({ wrapP: box(), wrapR: box(), kid });

let n = 0;
async function signup(extra = {}) {
  const nick = `vault${++n}x`;
  const k = keys();
  const r = await call('POST', '/api/signup', { nick, ...k, ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { nick, token: r.body.token, id: r.body.user.id, ...k };
}
const row = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
const records = (id) => db.prepare('SELECT key, deleted FROM records WHERE user_id = ? ORDER BY key').all(id).map((r) => ({ ...r }));
const push = (token, list, epoch = 0) => call('POST', '/api/sync', { epoch, records: list }, token);
const pull = (token) => call('GET', '/api/sync?since=0', null, token);

/** A chest as a phone makes it: AES-256-GCM of the content under the data key (the server never sees the key). */
function seal(content, dek, kid, seq = 1) {
  const n = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', dek, n);
  c.setAAD(Buffer.from(`oyuur/vault/v1/u/${seq}/${kid}`));
  const out = Buffer.concat([c.update(Buffer.from(JSON.stringify(content))), c.final(), c.getAuthTag()]);
  return { v: 1, kid, seq, n: n.toString('base64url'), c: out.toString('base64url') };
}
const openTree = (id) => ({
  id, lineageId: id, name: 'Бегать', kind: 'do', visibility: 'friends', skin: 'oak', plantedOn: '2026-10-01', checkins: ['2026-10-02'],
});

describe('vault: unlock', () => {
  it('the right key gives the box, a wrong one 401, an old account 409 legacy', async () => {
    const b = boxes();
    const a = await signup(b);
    const ok = await call('POST', '/api/auth/unlock', { auth: a.auth }, a.token);
    assert.deepEqual([ok.status, ok.body], [200, { wrapP: b.wrapP, kid: b.kid }]);
    assert.deepEqual((await call('POST', '/api/auth/unlock', { auth: key() }, a.token)).body, { error: 'wrong_password' });
    assert.equal((await call('POST', '/api/auth/unlock', { auth: a.auth })).status, 401);
    // An account without a key: nulls.
    const none = await signup();
    assert.deepEqual((await call('POST', '/api/auth/unlock', { auth: none.auth }, none.token)).body, { wrapP: null, kid: null });
    const v1 = await call('POST', '/api/signup', { nick: `vault${++n}x`, password: 'secret12' });
    assert.deepEqual((await call('POST', '/api/auth/unlock', { password: 'secret12' }, v1.body.token)).body, { error: 'legacy' });
  });

  it('10 an hour per account', async () => {
    const a = await signup(boxes());
    for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/api/auth/unlock', { auth: key() }, a.token)).status, 401);
    assert.deepEqual((await call('POST', '/api/auth/unlock', { auth: a.auth }, a.token)).body, { error: 'too_many' });
  });
});

describe('vault: the first key (/api/auth/keys)', () => {
  it('the first device wins and the code changes; the second gets the winner’s box', async () => {
    const a = await signup();
    const t2 = (await call('POST', '/api/login', { nick: a.nick, auth: a.auth })).body.token;
    const code1 = { recKdf: kdf(), recAuth: key() };
    const code2 = { recKdf: kdf(), recAuth: key() };
    const b1 = boxes();
    const b2 = boxes();
    assert.equal((await call('POST', '/api/auth/keys', { auth: key(), ...code1, ...b1 }, a.token)).body.error, 'wrong_password');
    assert.equal((await call('POST', '/api/auth/keys', { auth: a.auth, ...code1 }, a.token)).body.error, 'bad_keys');
    assert.equal((await call('POST', '/api/auth/keys', { auth: a.auth, ...code1, ...b1, kid: undefined }, a.token)).body.error, 'bad_keys');
    const [r1, r2] = await Promise.all([
      call('POST', '/api/auth/keys', { auth: a.auth, ...code1, ...b1 }, a.token),
      call('POST', '/api/auth/keys', { auth: a.auth, ...code2, ...b2 }, t2),
    ]);
    assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
    const [won, lost, wonCode, lostCode] = r1.status === 200 ? [b1, r2, code1, code2] : [b2, r1, code2, code1];
    assert.deepEqual(lost.body, { error: 'has_keys', wrapP: won.wrapP, kid: won.kid });
    const u = row(a.id);
    assert.deepEqual([u.wrap_p, u.wrap_r, u.key_id], [won.wrapP, won.wrapR, won.kid]);
    // The winner's code works, the old one and the loser's don't.
    assert.equal((await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth })).status, 401);
    assert.equal((await call('POST', '/api/recover', { nick: a.nick, recAuth: lostCode.recAuth })).status, 401);
    const rec = await call('POST', '/api/recover', { nick: a.nick, recAuth: wonCode.recAuth });
    assert.deepEqual([rec.status, rec.body.wrapR, rec.body.kid], [200, won.wrapR, won.kid]);
    // The key is never replaced this way.
    assert.equal((await call('POST', '/api/auth/keys', { auth: a.auth, recKdf: kdf(), recAuth: key(), ...boxes() }, a.token)).body.error, 'has_keys');
  });

  it('a ticket of the old code dies with it', async () => {
    const a = await signup();
    const ticket = (await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth })).body.ticket;
    assert.equal((await call('POST', '/api/auth/keys', { auth: a.auth, recKdf: kdf(), recAuth: key(), ...boxes() }, a.token)).status, 200);
    assert.equal((await call('POST', '/api/recover/finish', { ticket, ...keys(), ...boxes(row(a.id).key_id) })).body.error, 'bad_ticket');
  });
});

describe('vault: the key never changes by itself', () => {
  it('password: the new box for the key; none without a key', async () => {
    const b = boxes();
    const a = await signup(b);
    const p = { oldAuth: a.auth, kdf: kdf(), auth: key() };
    assert.equal((await call('POST', '/api/password', p, a.token)).body.error, 'bad_wrapP');
    assert.equal((await call('POST', '/api/password', { ...p, wrapP: 'short' }, a.token)).body.error, 'bad_wrapP');
    const wrapP = box();
    assert.equal((await call('POST', '/api/password', { ...p, wrapP }, a.token)).status, 200);
    assert.deepEqual([row(a.id).wrap_p, row(a.id).wrap_r, row(a.id).key_id], [wrapP, b.wrapR, b.kid]);
    const none = await signup();
    assert.equal((await call('POST', '/api/password', { oldAuth: none.auth, kdf: kdf(), auth: key(), wrapP: box() }, none.token)).body.error, 'bad_wrapP');
    assert.equal((await call('POST', '/api/password', { oldAuth: none.auth, kdf: kdf(), auth: key() }, none.token)).status, 200);
  });

  it('upgrade: an old account gets its first key', async () => {
    const nick = `vault${++n}x`;
    const v1 = await call('POST', '/api/signup', { nick, password: 'secret12' });
    const b = boxes();
    assert.equal((await call('POST', '/api/auth/upgrade', { password: 'secret12', ...keys(), wrapP: b.wrapP }, v1.body.token)).body.error, 'bad_keys');
    const up = await call('POST', '/api/auth/upgrade', { password: 'secret12', ...keys(), ...b }, v1.body.token);
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.deepEqual([up.body.user.kid, up.body.user.vault], [b.kid, false]);
  });

  it('reset-device with newDek: a new key id, the chest goes', async () => {
    const dek = randomBytes(32);
    const b = boxes();
    const a = await signup(b);
    assert.equal((await push(a.token, [{ key: 'vault', base: 0, body: seal({ v: 1 }, dek, b.kid) }])).status, 200);
    assert.deepEqual((await call('GET', '/api/me', null, a.token)).body.user.vault, true);
    const fresh = boxes();
    const r = await call('POST', '/api/password/reset-device', { ...keys(), ...fresh, newDek: true }, a.token);
    assert.deepEqual([r.status, r.body.user.kid, r.body.user.vault], [200, fresh.kid, false]);
    assert.deepEqual(records(a.id), [{ key: 'vault', deleted: 1 }]);
    // The old key's chest is refused now.
    assert.deepEqual((await push(a.token, [{ key: 'vault', base: 2, body: seal({ v: 1 }, dek, b.kid, 2) }])).body, { error: 'wrong_kid', kid: fresh.kid });
  });
});

describe('vault: the chest in the sync', () => {
  it('kid in GET /api/sync and /api/me; vault: true once a chest is kept', async () => {
    const none = await signup();
    assert.equal((await pull(none.token)).body.kid, null);
    assert.deepEqual([(await call('GET', '/api/me', null, none.token)).body.user.kid, (await call('GET', '/api/me', null, none.token)).body.user.vault], [null, false]);
    const b = boxes();
    const a = await signup(b);
    assert.equal((await pull(a.token)).body.kid, b.kid);
    assert.equal((await push(a.token, [{ key: 'vault', base: 0, body: seal({ v: 1 }, randomBytes(32), b.kid) }])).status, 200);
    const me = (await call('GET', '/api/me', null, a.token)).body.user;
    assert.deepEqual([me.kid, me.vault], [b.kid, true]);
    // Signing in says it too.
    const login = await call('POST', '/api/login', { nick: a.nick, auth: a.auth });
    assert.deepEqual([login.body.user.kid, login.body.user.vault, login.body.kid], [b.kid, true, b.kid]);
  });

  it('another key or no key: the whole POST is refused, nothing written', async () => {
    const none = await signup();
    const t = openTree('t1');
    const r = await push(none.token, [{ key: 'tree:t1', base: 0, body: t }, { key: 'vault', base: 0, body: seal({}, randomBytes(32), newKid()) }]);
    assert.deepEqual([r.status, r.body], [409, { error: 'no_keys' }]);
    assert.deepEqual(records(none.id), []);
    assert.equal(row(none.id).rev, 0);

    const b = boxes();
    const a = await signup(b);
    const wrong = await push(a.token, [{ key: 'tree:t1', base: 0, body: t }, { key: 'vault', base: 0, body: seal({}, randomBytes(32), newKid()) }]);
    assert.deepEqual([wrong.status, wrong.body], [409, { error: 'wrong_kid', kid: b.kid }]);
    assert.deepEqual(records(a.id), []);
    // Without the chest it goes.
    assert.equal((await push(a.token, [{ key: 'tree:t1', base: 0, body: t }])).body.saved.length, 1);
  });

  it('deleting the account takes the chest and the boxes', async () => {
    const b = boxes();
    const a = await signup(b);
    await push(a.token, [{ key: 'vault', base: 0, body: seal({ v: 1 }, randomBytes(32), b.kid) }]);
    assert.equal((await call('POST', '/api/me/delete', { auth: a.auth }, a.token)).status, 200);
    assert.deepEqual(records(a.id), []);
    const u = row(a.id);
    assert.deepEqual([u.wrap_p, u.wrap_r, u.key_id], [null, null, null]);
  });

  it('the database file never holds what was only inside the chest', async () => {
    const SECRET = 'Не курить — секрет 7f3a';
    const SECRET_ID = 'hiddenTree9q';
    const dek = randomBytes(32);
    const b = boxes();
    const a = await signup(b);
    const content = {
      v: 1,
      trees: [{ ...openTree(SECRET_ID), name: SECRET, visibility: 'private', checkins: ['2026-10-03', '2026-10-04'] }],
      places: { [SECRET_ID]: { dc: 1, dr: 1, at: '' } },
      ledger: { [`w:${SECRET_ID}:2026-10-03`]: 5 },
      tombs: {},
    };
    const r = await push(a.token, [
      { key: 'tree:t1', base: 0, body: openTree('t1') },
      { key: 'plot', base: 0, body: { places: { t1: { dc: 0, dr: 0, at: '' } } } },
      { key: 'progress', base: 0, body: { ledger: { 'w:t1:2026-10-02': 5 } } },
      { key: 'vault', base: 0, body: seal(content, dek, b.kid) },
    ]);
    assert.equal(r.body.saved.length, 4);
    // Nothing of the chest anywhere the server builds things: public, watering_seen.
    const u = row(a.id);
    assert.ok(!u.public.includes(SECRET_ID) && !u.public.includes('2026-10-03'));
    assert.deepEqual(db.prepare('SELECT tree_id FROM watering_seen WHERE user_id = ?').all(a.id).map((x) => x.tree_id), ['t1']);
    // And in the file's bytes (the WAL too): neither the name nor the id, in any encoding JSON may use.
    db.exec('PRAGMA wal_checkpoint(FULL)');
    const bytes = Buffer.concat(readdirSync(dir).map((f) => readFileSync(join(dir, f))));
    const escaped = JSON.stringify(SECRET).slice(1, -1).replace(/[^\x00-\x7f]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
    for (const needle of [SECRET, SECRET_ID, escaped, Buffer.from(SECRET).toString('base64'), 'секрет']) {
      assert.equal(bytes.includes(Buffer.from(needle)), false, `found ${needle}`);
    }
    // The open tree is there (the search does find what is there).
    assert.ok(bytes.includes(Buffer.from('Бегать')));
  });
});
