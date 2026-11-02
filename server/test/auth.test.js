import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { cleanKdf } from '../src/auth.js';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

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

let ipN = 0;
/** Every test from its own address: the per-address limits don't add up across tests. */
const freshIp = () => `10.3.${Math.floor(++ipN / 250)}.${ipN % 250}`;

async function call(method, path, body, token, ip = '10.0.0.1') {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

// What the phone would make from a password or a code (net/kdf.ts); the server only sees the result.
const kdf = (N = 2 ** 15) => ({ alg: 'scrypt', N, r: 8, p: 1, salt: randomBytes(16).toString('base64url') });
const key = () => randomBytes(32).toString('base64url');
/** Boxes of a data key (OYUUR-31): the server only checks their size (60 bytes, the key id 8). */
const box = () => randomBytes(60).toString('base64url');
const newKid = () => randomBytes(8).toString('base64url');
const boxes = (kid = newKid()) => ({ wrapP: box(), wrapR: box(), kid });
/** A new set of keys: the password's and the code's. */
const keys = () => ({ kdf: kdf(), auth: key(), recKdf: kdf(), recAuth: key() });

let n = 0;
const nextNick = () => `auth${++n}x`;
async function signupV2(extra = {}) {
  const nick = nextNick();
  const k = keys();
  const r = await call('POST', '/api/signup', { nick, ...k, name: 'Ли', avatar: 'owl', color: 2, ...extra }, null, freshIp());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { nick, token: r.body.token, user: r.body.user, body: r.body, ...k };
}
async function signupV1() {
  const nick = nextNick();
  const r = await call('POST', '/api/signup', { nick, password: 'secret12', name: 'Аня' }, null, freshIp());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { nick, token: r.body.token, code: r.body.recoveryCode, password: 'secret12' };
}
const row = (nick) => db.prepare('SELECT * FROM users WHERE nick = ?').get(nick);

describe('auth: parameters', () => {
  it('v2, v1 and a nick that doesn’t exist (a made-up salt, the same each time)', async () => {
    const v2 = await signupV2();
    const p2 = await call('GET', `/api/auth/params?nick=@${v2.nick.toUpperCase()}`);
    assert.deepEqual(p2.body, { v: 2, kdf: v2.kdf, recKdf: v2.recKdf });
    const v1 = await signupV1();
    assert.deepEqual((await call('GET', `/api/auth/params?nick=${v1.nick}`)).body, { v: 1, kdf: null, recKdf: null });
    const none1 = (await call('GET', '/api/auth/params?nick=nobody_here')).body;
    const none2 = (await call('GET', '/api/auth/params?nick=nobody_here')).body;
    assert.equal(none1.v, 2);
    assert.deepEqual(none1, none2);
    assert.ok(cleanKdf(none1.kdf) && cleanKdf(none1.recKdf));
    assert.notEqual(none1.kdf.salt, none1.recKdf.salt);
    assert.notEqual((await call('GET', '/api/auth/params?nick=nobody_else')).body.kdf.salt, none1.kdf.salt);
  });

  it('the shape of kdf and keys is checked', () => {
    assert.ok(cleanKdf(kdf(2 ** 13)) && cleanKdf(kdf(2 ** 17)));
    assert.equal(cleanKdf(kdf(2 ** 12)), null);
    assert.equal(cleanKdf(kdf(2 ** 18)), null);
    assert.equal(cleanKdf(kdf(3 * 2 ** 13)), null);
    assert.equal(cleanKdf({ ...kdf(), r: 16 }), null);
    assert.equal(cleanKdf({ ...kdf(), alg: 'argon2' }), null);
    assert.equal(cleanKdf({ ...kdf(), salt: randomBytes(15).toString('base64url') }), null);
    // Only the known fields are kept.
    assert.deepEqual(Object.keys(cleanKdf({ ...kdf(), extra: 1 })).sort(), ['N', 'alg', 'p', 'r', 'salt']);
  });
});

describe('auth: sign up and sign in v2', () => {
  it('signup v2 → login v2; no code in the answer; the password itself is refused', async () => {
    const b = boxes();
    const a = await signupV2(b);
    assert.equal(a.body.recoveryCode, undefined);
    assert.equal(a.user.authV, 2);
    assert.equal((await call('GET', '/api/me', null, a.token)).body.user.authV, 2);
    const ip = freshIp();
    const ok = await call('POST', '/api/login', { nick: a.nick, auth: a.auth }, null, ip);
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.body.wrapP, ok.body.kid, ok.body.user.nick, ok.body.legacy], [b.wrapP, b.kid, a.nick, undefined]);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: key() }, null, ip)).status, 401);
    // An old app with the password: never taken in clear text for a v2 account.
    assert.deepEqual((await call('POST', '/api/login', { nick: a.nick, password: 'secret12' }, null, ip)).body, { error: 'wrong_login' });
    // The hash of the key is kept, not the key.
    assert.notEqual(row(a.nick).pass_hash, a.auth);
    assert.deepEqual(JSON.parse(row(a.nick).kdf), a.kdf);
  });

  it('a bad kdf or key is refused at signup', async () => {
    const k = keys();
    assert.equal((await call('POST', '/api/signup', { nick: nextNick(), ...k, auth: 'short' }, null, freshIp())).body.error, 'bad_auth');
    assert.equal((await call('POST', '/api/signup', { nick: nextNick(), ...k, kdf: { ...k.kdf, N: 1000 } }, null, freshIp())).body.error, 'bad_kdf');
    assert.equal((await call('POST', '/api/signup', { nick: nextNick(), ...k, recAuth: undefined }, null, freshIp())).body.error, 'bad_recAuth');
    assert.equal((await call('POST', '/api/signup', { nick: nextNick(), ...k, wrapP: 'x'.repeat(201) }, null, freshIp())).body.error, 'bad_wrapP');
    // Boxes: exactly 60 bytes, the key id 8, all three or none.
    assert.equal((await call('POST', '/api/signup', { nick: nextNick(), ...k, ...boxes(), wrapP: randomBytes(59).toString('base64url') }, null, freshIp())).body.error, 'bad_wrapP');
    assert.equal((await call('POST', '/api/signup', { nick: nextNick(), ...k, ...boxes(), wrapR: 'bad box!' }, null, freshIp())).body.error, 'bad_wrapR');
    assert.equal((await call('POST', '/api/signup', { nick: nextNick(), ...k, ...boxes(), kid: 'a2lk' }, null, freshIp())).body.error, 'bad_kid');
    assert.equal((await call('POST', '/api/signup', { nick: nextNick(), ...k, ...boxes(), wrapR: undefined }, null, freshIp())).body.error, 'bad_keys');
    assert.equal((await call('POST', '/api/signup', { nick: nextNick(), ...k, kid: newKid() }, null, freshIp())).body.error, 'bad_keys');
  });

  it('wrong keys lock the nick from that address after 10 tries, like before', async () => {
    const a = await signupV2();
    const ip = freshIp();
    for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: key() }, null, ip)).status, 401);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: a.auth }, null, ip)).status, 429);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: a.auth }, null, freshIp())).status, 200);
  });
});

describe('auth: an old account moves to v2', () => {
  it('v1 login says legacy → upgrade → v2 from then on, the password itself no more', async () => {
    const a = await signupV1();
    assert.equal(row(a.nick).auth_v, 1);
    const ip = freshIp();
    const login = await call('POST', '/api/login', { nick: a.nick, password: a.password }, null, ip);
    assert.equal(login.status, 200);
    assert.equal(login.body.legacy, true);
    assert.equal(login.body.user.authV, 1);
    const k = keys();
    assert.equal((await call('POST', '/api/auth/upgrade', { password: 'wrong123', ...k }, login.body.token)).body.error, 'wrong_password');
    assert.equal((await call('POST', '/api/auth/upgrade', { password: a.password, ...k, kdf: null }, login.body.token)).body.error, 'bad_kdf');
    const up = await call('POST', '/api/auth/upgrade', { password: a.password, ...k }, login.body.token);
    assert.equal(up.status, 200, JSON.stringify(up.body));
    assert.equal(up.body.user.authV, 2);
    // The session it came from goes on.
    assert.equal((await call('GET', '/api/me', null, login.body.token)).status, 200);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: k.auth }, null, ip)).status, 200);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, password: a.password }, null, ip)).status, 401);
    // The old code is gone: the new one is the phone's.
    assert.equal((await call('POST', '/api/recover', { nick: a.nick, code: a.code }, null, freshIp())).status, 401);
    assert.equal((await call('POST', '/api/recover', { nick: a.nick, recAuth: k.recAuth }, null, freshIp())).status, 200);
    assert.equal((await call('POST', '/api/auth/upgrade', { password: a.password, ...keys() }, login.body.token)).body.error, 'already_v2');
  });

  it('two devices at once: one wins, the other gets 409 already_v2', async () => {
    const a = await signupV1();
    const t1 = (await call('POST', '/api/login', { nick: a.nick, password: a.password }, null, freshIp())).body.token;
    const t2 = (await call('POST', '/api/login', { nick: a.nick, password: a.password }, null, freshIp())).body.token;
    const k1 = keys();
    const k2 = keys();
    const [r1, r2] = await Promise.all([
      call('POST', '/api/auth/upgrade', { password: a.password, ...k1 }, t1),
      call('POST', '/api/auth/upgrade', { password: a.password, ...k2 }, t2),
    ]);
    assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
    const loser = r1.status === 409 ? r1 : r2;
    assert.equal(loser.body.error, 'already_v2');
    const winner = r1.status === 200 ? k1 : k2;
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: winner.auth }, null, freshIp())).status, 200);
    assert.deepEqual(JSON.parse(row(a.nick).kdf), winner.kdf);
  });
});

describe('auth: password and code', () => {
  it('a new password ends the other sessions; this one stays', async () => {
    const a = await signupV2();
    const other = (await call('POST', '/api/login', { nick: a.nick, auth: a.auth }, null, freshIp())).body.token;
    const k = { kdf: kdf(), auth: key() };
    assert.equal((await call('POST', '/api/password', { oldAuth: key(), ...k }, a.token)).body.error, 'wrong_password');
    const r = await call('POST', '/api/password', { oldAuth: a.auth, ...k }, a.token);
    assert.deepEqual([r.status, r.body], [200, { ok: true }]);
    assert.equal((await call('GET', '/api/me', null, a.token)).status, 200);
    assert.equal((await call('GET', '/api/me', null, other)).status, 401);
    const ip = freshIp();
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: a.auth }, null, ip)).status, 401);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: k.auth }, null, ip)).status, 200);
    assert.deepEqual((await call('GET', `/api/auth/params?nick=${a.nick}`)).body.kdf, k.kdf);
    // The code didn't change.
    assert.equal((await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth }, null, freshIp())).status, 200);
  });

  it('an old account changes the password only after the move', async () => {
    const a = await signupV1();
    assert.equal((await call('POST', '/api/password', { oldAuth: key(), kdf: kdf(), auth: key() }, a.token)).body.error, 'legacy');
    assert.equal((await call('POST', '/api/recovery-code', { auth: key(), recKdf: kdf(), recAuth: key() }, a.token)).body.error, 'legacy');
  });

  it('reset on a signed-in device: no old password, 3 a day, newDek erases the vault', async () => {
    const old = boxes();
    const a = await signupV2(old);
    const other = (await call('POST', '/api/login', { nick: a.nick, auth: a.auth }, null, freshIp())).body.token;
    await call('POST', '/api/sync', { epoch: 0, records: [{ key: 'vault', base: 0, body: { v: 1, kid: old.kid, seq: 1, n: 'bm9uY2U', c: 'Y2lwaGVy' } }] }, a.token);
    // Without newDek: new boxes of the same key (none, or another key — refused).
    const k1 = keys();
    assert.equal((await call('POST', '/api/password/reset-device', k1, a.token)).body.error, 'bad_keys');
    const other1 = await call('POST', '/api/password/reset-device', { ...k1, ...boxes() }, a.token);
    assert.deepEqual([other1.status, other1.body], [409, { error: 'wrong_kid', kid: old.kid }]);
    const same = boxes(old.kid);
    const r1 = await call('POST', '/api/password/reset-device', { ...k1, ...same }, a.token);
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    assert.equal((await call('GET', '/api/me', null, other)).status, 401);
    assert.equal((await call('GET', '/api/me', null, a.token)).status, 200);
    assert.deepEqual([row(a.nick).wrap_p, row(a.nick).key_id], [same.wrapP, old.kid]);
    assert.equal((await call('GET', '/api/sync?since=0', null, a.token)).body.records[0].deleted, false);
    // newDek: the chest can't be opened any more; a tombstone in its place, new key id.
    const k2 = keys();
    const fresh = boxes();
    const r2 = await call('POST', '/api/password/reset-device', { ...k2, newDek: true, ...fresh }, a.token);
    assert.equal(r2.status, 200);
    assert.deepEqual([row(a.nick).wrap_p, row(a.nick).wrap_r, row(a.nick).key_id], [fresh.wrapP, fresh.wrapR, fresh.kid]);
    assert.deepEqual([r2.body.user.kid, r2.body.user.vault], [fresh.kid, false]);
    const vault = (await call('GET', '/api/sync?since=0', null, a.token)).body.records.find((r) => r.key === 'vault');
    assert.deepEqual([vault.deleted, vault.body, vault.rev], [true, null, 2]);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: k2.auth }, null, freshIp())).status, 200);
    assert.equal((await call('POST', '/api/password/reset-device', { ...keys(), ...boxes(fresh.kid) }, a.token)).status, 200);
    assert.deepEqual((await call('POST', '/api/password/reset-device', { ...keys(), ...boxes(fresh.kid) }, a.token)).body, { error: 'too_many' });
  });

  it('reset on a signed-in device moves an old account to v2', async () => {
    const a = await signupV1();
    const k = keys();
    assert.equal((await call('POST', '/api/password/reset-device', k, a.token)).body.user.authV, 2);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: k.auth }, null, freshIp())).status, 200);
  });

  it('a new recovery code: the old one stops working', async () => {
    const old = boxes();
    const a = await signupV2(old);
    const fresh = { recKdf: kdf(), recAuth: key(), wrapR: box() };
    // With a data key the new box must come.
    assert.equal((await call('POST', '/api/recovery-code', { auth: a.auth, ...fresh, wrapR: undefined }, a.token)).body.error, 'bad_wrapR');
    assert.equal((await call('POST', '/api/recovery-code', { auth: key(), ...fresh }, a.token)).body.error, 'wrong_password');
    assert.equal((await call('POST', '/api/recovery-code', { auth: a.auth, ...fresh }, a.token)).status, 200);
    assert.equal((await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth }, null, freshIp())).status, 401);
    const r = await call('POST', '/api/recover', { nick: a.nick, recAuth: fresh.recAuth }, null, freshIp());
    assert.deepEqual([r.body.wrapR, r.body.kid], [fresh.wrapR, old.kid]);
    // The password's box stayed.
    assert.equal(row(a.nick).wrap_p, old.wrapP);
    assert.deepEqual((await call('GET', `/api/auth/params?nick=${a.nick}`)).body.recKdf, fresh.recKdf);
  });
});

describe('auth: forgot the password', () => {
  it('a ticket started before a new code, password or reset can’t be finished', async () => {
    const tryFinish = (ticket) => call('POST', '/api/recover/finish', { ticket, ...keys() }, null, freshIp());
    const start = async (a) => (await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth }, null, freshIp())).body.ticket;
    // A new code.
    const a = await signupV2();
    let ticket = await start(a);
    const fresh = { recKdf: kdf(), recAuth: key() };
    assert.equal((await call('POST', '/api/recovery-code', { auth: a.auth, ...fresh }, a.token)).status, 200);
    assert.equal((await tryFinish(ticket)).body.error, 'bad_ticket');
    // A new password.
    a.recAuth = fresh.recAuth;
    ticket = await start(a);
    assert.equal((await call('POST', '/api/password', { oldAuth: a.auth, kdf: kdf(), auth: key() }, a.token)).status, 200);
    assert.equal((await tryFinish(ticket)).body.error, 'bad_ticket');
    // A new password without the old one on a signed-in device.
    ticket = await start(a);
    const k = keys();
    assert.equal((await call('POST', '/api/password/reset-device', k, a.token)).status, 200);
    assert.equal((await tryFinish(ticket)).body.error, 'bad_ticket');
    // An old account moving to v2.
    const b = await signupV1();
    const legacy = (await call('POST', '/api/recover', { nick: b.nick, code: b.code }, null, freshIp())).body.ticket;
    assert.equal((await call('POST', '/api/auth/upgrade', { password: b.password, ...keys() }, b.token)).status, 200);
    assert.equal((await tryFinish(legacy)).body.error, 'bad_ticket');
  });

  it('the account’s id comes with it (a new account under the same nick is another one)', async () => {
    const a = await signupV2();
    const id = row(a.nick).id;
    assert.equal(a.user.id, id);
    assert.equal((await call('GET', '/api/me', null, a.token)).body.user.id, id);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: a.auth }, null, freshIp())).body.user.id, id);
  });

  it('v2: a finish refused for the wrong key keeps the ticket: the right boxes go with it after', async () => {
    const b = boxes();
    const a = await signupV2(b);
    const r = await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth }, null, freshIp());
    const k = keys();
    const wrong = await call('POST', '/api/recover/finish', { ticket: r.body.ticket, ...k, ...boxes() }, null, freshIp());
    assert.deepEqual([wrong.status, wrong.body.error], [409, 'wrong_kid']);
    const done = await call('POST', '/api/recover/finish', { ticket: r.body.ticket, ...k, ...boxes(b.kid) }, null, freshIp());
    assert.equal(done.status, 200, JSON.stringify(done.body));
    // Used up by the finish that passed.
    assert.equal((await call('POST', '/api/recover/finish', { ticket: r.body.ticket, ...keys(), ...boxes(b.kid) }, null, freshIp())).body.error, 'bad_ticket');
  });

  it('v2: a ticket, then new keys; every session ends; the ticket works once', async () => {
    const b = boxes();
    const a = await signupV2(b);
    const r = await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth }, null, freshIp());
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.kdf, r.body.wrapR, r.body.kid], [a.kdf, b.wrapR, b.kid]);
    assert.match(r.body.ticket, /^[A-Za-z0-9_-]{43}$/);
    const k = keys();
    const same = boxes(b.kid);
    // New boxes of the same key: another key or none — refused.
    const wrong = await call('POST', '/api/recover/finish', { ticket: r.body.ticket, ...k, ...boxes() }, null, freshIp());
    assert.deepEqual([wrong.status, wrong.body.error, wrong.body.kid], [409, 'wrong_kid', b.kid]);
    const r2 = await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth }, null, freshIp());
    assert.equal((await call('POST', '/api/recover/finish', { ticket: r2.body.ticket, ...k }, null, freshIp())).body.error, 'bad_keys');
    const r3 = await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth }, null, freshIp());
    r.body.ticket = r3.body.ticket;
    const done = await call('POST', '/api/recover/finish', { ticket: r3.body.ticket, ...k, ...same }, null, freshIp());
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.user.authV, 2);
    assert.equal((await call('GET', '/api/me', null, a.token)).status, 401);
    assert.equal((await call('GET', '/api/me', null, done.body.token)).status, 200);
    assert.equal((await call('POST', '/api/recover/finish', { ticket: r.body.ticket, ...keys() }, null, freshIp())).body.error, 'bad_ticket');
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: k.auth }, null, freshIp())).status, 200);
    assert.deepEqual([row(a.nick).key_id, row(a.nick).wrap_p, row(a.nick).wrap_r], [b.kid, same.wrapP, same.wrapR]);
  });

  it('a ticket ends after 10 minutes; a made-up one never works', async () => {
    const a = await signupV2();
    const r = await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth }, null, freshIp());
    clock = NOW + 10 * 60_000 + 1;
    try {
      assert.equal((await call('POST', '/api/recover/finish', { ticket: r.body.ticket, ...keys() }, null, freshIp())).body.error, 'bad_ticket');
    } finally {
      clock = NOW;
    }
    assert.equal((await call('POST', '/api/recover/finish', { ticket: key(), ...keys() }, null, freshIp())).body.error, 'bad_ticket');
    // Bad keys don't use the ticket up.
    const r2 = await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth }, null, freshIp());
    assert.equal((await call('POST', '/api/recover/finish', { ticket: r2.body.ticket, ...keys(), auth: 'x' }, null, freshIp())).body.error, 'bad_auth');
    assert.equal((await call('POST', '/api/recover/finish', { ticket: r2.body.ticket, ...keys() }, null, freshIp())).status, 200);
  });

  it('wrong recAuth: 401, locked after 5 from an address', async () => {
    const a = await signupV2();
    const ip = freshIp();
    for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/recover', { nick: a.nick, recAuth: key() }, null, ip)).body.error, 'wrong_code');
    assert.equal((await call('POST', '/api/recover', { nick: a.nick, recAuth: a.recAuth }, null, ip)).status, 429);
  });

  it('v1 from a new app: the code gives a ticket, the finish moves the account to v2', async () => {
    const a = await signupV1();
    const r = await call('POST', '/api/recover', { nick: a.nick, code: ` ${a.code.slice(0, 4).toUpperCase()}-${a.code.slice(4)} ` }, null, freshIp());
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.legacy, true);
    // Step 1 changes nothing yet.
    assert.equal((await call('GET', '/api/me', null, a.token)).status, 200);
    const k = keys();
    const done = await call('POST', '/api/recover/finish', { ticket: r.body.ticket, ...k }, null, freshIp());
    assert.equal(done.body.user.authV, 2);
    assert.equal((await call('GET', '/api/me', null, a.token)).status, 401);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: k.auth }, null, freshIp())).status, 200);
  });

  it('an old app ({nick, code, password}) works for v1 as before, and asks to update for v2', async () => {
    const a = await signupV1();
    const r = await call('POST', '/api/recover', { nick: a.nick, code: a.code, password: 'newpass1' }, null, freshIp());
    assert.equal(r.status, 200);
    assert.match(r.body.recoveryCode, /^[a-z0-9]{12}$/);
    assert.equal(r.body.user.authV, 1);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, password: 'newpass1' }, null, freshIp())).status, 200);
    const b = await signupV2();
    const old = await call('POST', '/api/recover', { nick: b.nick, code: 'abcdefghjkmn', password: 'newpass1' }, null, freshIp());
    assert.deepEqual([old.status, old.body.error], [409, 'upgrade_app']);
  });
});

describe('auth: deleting the account', () => {
  const forest = (token) =>
    call('POST', '/api/sync', {
      epoch: 0,
      records: [
        { key: 'tree:t1', base: 0, body: { id: 't1', lineageId: 't1', name: 'Run', kind: 'do', visibility: 'friends', skin: 'oak', plantedOn: '2026-10-01', checkins: ['2026-10-02'] } },
        { key: 'progress', base: 0, body: { ledger: {} } },
      ],
    }, token);
  const left = (nick) => {
    const id = db.prepare('SELECT id FROM users WHERE id = ? OR nick = ?').get(nick, nick)?.id;
    return {
      records: db.prepare('SELECT count(*) AS n FROM records WHERE user_id = ?').get(id).n,
      seen: db.prepare('SELECT count(*) AS n FROM watering_seen WHERE user_id = ?').get(id).n,
    };
  };

  it('v2 needs the key; the forest in the account goes, the keys too', async () => {
    const a = await signupV2(boxes());
    assert.equal((await forest(a.token)).status, 200);
    const id = row(a.nick).id;
    assert.deepEqual(left(a.nick), { records: 2, seen: 1 });
    assert.equal((await call('POST', '/api/me/delete', { password: 'secret12' }, a.token)).body.error, 'wrong_password');
    assert.equal((await call('POST', '/api/me/delete', { auth: key() }, a.token)).body.error, 'wrong_password');
    assert.equal((await call('POST', '/api/me/delete', { auth: a.auth }, a.token)).status, 200);
    assert.deepEqual(left(id), { records: 0, seen: 0 });
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    assert.deepEqual([u.deleted, u.kdf, u.rec_kdf, u.wrap_p, u.wrap_r, u.key_id, u.public], [1, null, null, null, null, null, null]);
    assert.equal((await call('POST', '/api/login', { nick: a.nick, auth: a.auth }, null, freshIp())).status, 401);
  });

  it('v1 with the password, as before; records go too', async () => {
    const a = await signupV1();
    await forest(a.token);
    const id = row(a.nick).id;
    assert.equal((await call('POST', '/api/me/delete', { password: 'secret12' }, a.token)).status, 200);
    assert.deepEqual(left(id), { records: 0, seen: 0 });
  });
});
