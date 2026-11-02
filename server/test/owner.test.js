import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

// The owner's page: /owner and /api/owner/*, signed in with OWNER_TOKEN.
const NOW = Date.parse('2026-10-28T12:00:00Z');
const KEY = 'owner-key-0123456789-abcdef';
let clock = NOW;

const servers = [];
async function start(opts) {
  const db = openDb(':memory:');
  const server = createApp({ db, now: () => clock, ...opts });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  servers.push(server);
  return { db, base: `http://127.0.0.1:${server.address().port}` };
}
after(() => servers.forEach((s) => s.close()));

let base;
let db;
before(async () => ({ base, db } = await start({ ownerToken: KEY })));

async function call(method, path, body, token, ip = '10.0.0.1', at = base) {
  const res = await fetch(at + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, text, headers: res.headers };
}

let n = 0;
async function signup(nick = `user${++n}x`) {
  const r = await call('POST', '/api/signup', { nick, password: 'secret12', name: 'Аня' }, null, `10.1.${n}.1`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { nick, token: r.body.token };
}
async function befriend(a, b) {
  await call('POST', '/api/friends/request', { nick: b.nick }, a.token);
  assert.equal((await call('POST', '/api/friends/accept', { nick: a.nick }, b.token)).body.relation, 'friend');
}
async function ownerLogin(ip = '10.7.0.1') {
  const r = await call('POST', '/api/owner/login', { key: KEY }, null, ip);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}
const tree = (id, nickname) => ({ id, name: 'Не курить', nickname, visibility: 'friends', plantedOn: '2026-10-20', checkins: ['2026-10-21'] });
async function openReports(owner, status = 'open') {
  const r = await call('GET', `/api/owner/reports?status=${status}`, null, owner);
  assert.equal(r.status, 200);
  return r.body;
}

describe('owner: the door', () => {
  it('without OWNER_TOKEN the page and the API do not exist', async () => {
    for (const ownerToken of [undefined, '', 'short-key']) {
      const off = await start({ ownerToken });
      for (const path of ['/owner', '/owner/', '/owner/owner.js']) assert.equal((await call('GET', path, null, null, '10.0.0.1', off.base)).status, 404, path);
      assert.equal((await call('POST', '/api/owner/login', { key: 'short-key' }, null, '10.0.0.1', off.base)).status, 404);
      assert.equal((await call('GET', '/api/owner/reports', null, null, '10.0.0.1', off.base)).status, 404);
    }
  });

  it('serves the page with strict headers; the key is never in the address', async () => {
    const page = await call('GET', '/owner');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.match(page.text, /Ключ владельца/);
    assert.ok(!page.text.includes(KEY));
    assert.equal((await call('GET', '/owner/owner.js')).status, 200);
    assert.equal((await call('GET', '/owner/nope')).status, 404);
    // Signing in is a POST with the key in the body; a GET is not a door.
    assert.equal((await call('GET', `/api/owner/login?key=${KEY}`)).status, 404);
  });

  it('a wrong key is refused; the right one gives a session', async () => {
    const wrong = await call('POST', '/api/owner/login', { key: `${KEY}x` }, null, '10.7.1.1');
    assert.deepEqual([wrong.status, wrong.body.error], [401, 'wrong_key']);
    assert.equal((await call('POST', '/api/owner/login', {}, null, '10.7.1.1')).status, 401);
    assert.equal((await call('POST', '/api/owner/login', { key: 12345 }, null, '10.7.1.1')).status, 401);
    const token = await ownerLogin('10.7.1.1');
    assert.equal((await call('GET', '/api/owner/me', null, token)).status, 200);
    // No CORS on the owner's answers.
    assert.equal((await call('GET', '/api/owner/me', null, token)).headers.get('access-control-allow-origin'), null);
  });

  it('without a session, with a made-up one or with a user’s token — 401', async () => {
    const user = await signup();
    assert.equal((await call('GET', '/api/owner/reports')).status, 401);
    assert.equal((await call('GET', '/api/owner/reports', null, 'made-up')).status, 401);
    assert.equal((await call('GET', '/api/owner/reports', null, user.token)).status, 401);
    assert.equal((await call('POST', '/api/owner/reports/1/ban', null, user.token)).status, 401);
    // And the owner's session is not a user's one.
    const owner = await ownerLogin('10.7.2.1');
    assert.equal((await call('GET', '/api/me', null, owner)).status, 401);
  });

  it('10 wrong keys from one address lock it, the right key too; other addresses still get in', async () => {
    for (let i = 0; i < 10; i++) assert.equal((await call('POST', '/api/owner/login', { key: `nope${i}` }, null, '10.7.3.1')).status, 401);
    assert.equal((await call('POST', '/api/owner/login', { key: KEY }, null, '10.7.3.1')).status, 429);
    await ownerLogin('10.7.3.2');
  });

  it('logout ends the session; a session lasts 12 hours; a new key ends old sessions', async () => {
    const a = await ownerLogin('10.7.4.1');
    assert.equal((await call('POST', '/api/owner/logout', null, a)).status, 200);
    assert.equal((await call('GET', '/api/owner/me', null, a)).status, 401);

    const b = await ownerLogin('10.7.4.1');
    clock = NOW + 13 * 3_600_000;
    assert.equal((await call('GET', '/api/owner/me', null, b)).status, 401);
    clock = NOW;

    const c = await ownerLogin('10.7.4.1');
    const rotated = createApp({ db, now: () => clock, ownerToken: 'another-owner-key-0123456789' });
    await new Promise((ok) => rotated.listen(0, '127.0.0.1', ok));
    servers.push(rotated);
    const at = `http://127.0.0.1:${rotated.address().port}`;
    assert.equal((await call('GET', '/api/owner/me', null, c, '10.0.0.1', at)).status, 401);
    assert.equal((await call('POST', '/api/owner/login', { key: KEY }, null, '10.0.0.1', at)).status, 401);
  });
});

describe('owner: reports', () => {
  it('lists reports newest first: about whom, which tree, who, why, how many about this person', async () => {
    const owner = await ownerLogin('10.7.5.1');
    const [bad, anna, boris] = [await signup(), await signup(), await signup()];
    await call('PUT', '/api/forest', { trees: [tree('t-bad', 'Гадость')] }, bad.token);
    await call('POST', '/api/report', { nick: bad.nick, reason: 'abuse', text: 'пишет гадости' }, anna.token);
    clock = NOW + 60_000;
    await call('POST', '/api/report', { nick: bad.nick, reason: 'name', treeId: 't-bad' }, boris.token);
    clock = NOW;

    const { reports, open } = await openReports(owner);
    assert.ok(open >= 2);
    const mine = reports.filter((r) => r.target.nick === bad.nick);
    assert.equal(mine.length, 2);
    const [byTree, byPerson] = mine;
    assert.ok(byTree.at > byPerson.at, 'newest first');
    assert.deepEqual(byTree.tree, { id: 't-bad', nickname: 'Гадость', habit: 'Не курить', found: true, hidden: false });
    assert.equal(byTree.reporter.nick, boris.nick);
    assert.deepEqual([byPerson.reason, byPerson.text, byPerson.tree, byPerson.reporter.nick], ['abuse', 'пишет гадости', null, anna.nick]);
    assert.deepEqual(byPerson.aboutTarget, { total: 2, open: 2 });
    assert.equal(byPerson.resolution, null);
  });

  it('dismiss: goes to the handled ones, marked who and how; can’t be handled twice', async () => {
    const owner = await ownerLogin('10.7.6.1');
    const [x, y] = [await signup(), await signup()];
    await call('POST', '/api/report', { nick: x.nick, reason: 'spam' }, y.token);
    const id = (await openReports(owner)).reports.find((r) => r.target.nick === x.nick).id;

    const r = await call('POST', `/api/owner/reports/${id}/dismiss`, null, owner);
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.report.resolution, r.body.report.resolvedBy, r.body.report.resolvedAt], ['dismissed', 'owner', clock]);
    assert.ok(!(await openReports(owner)).reports.some((q) => q.id === id));
    assert.ok((await openReports(owner, 'done')).reports.some((q) => q.id === id));
    assert.equal((await call('POST', `/api/owner/reports/${id}/ban`, null, owner)).status, 409);
    // Nothing happened to the person.
    assert.equal((await call('GET', `/api/users/${x.nick}`, null, y.token)).status, 200);
    assert.equal((await call('POST', '/api/owner/reports/99999/dismiss', null, owner)).status, 404);
    assert.equal((await call('POST', '/api/owner/reports/abc/dismiss', null, owner)).status, 404);
    assert.equal((await call('POST', `/api/owner/reports/${id}/delete`, null, owner)).status, 404);
    assert.equal((await call('POST', `/api/owner/reports/${id}/constructor`, null, owner)).status, 404);
  });

  it('hide a tree name: friends see a neutral one, the person still their own; undo brings it back', async () => {
    const owner = await ownerLogin('10.7.7.1');
    const [x, friend] = [await signup(), await signup()];
    await befriend(x, friend);
    await call('PUT', '/api/forest', { trees: [tree('t1', 'Гадость'), tree('t2', 'Дубок')] }, x.token);
    await call('POST', '/api/report', { nick: x.nick, reason: 'name', treeId: 't1' }, friend.token);
    await call('POST', '/api/report', { nick: x.nick, reason: 'abuse' }, friend.token);
    const reports = (await openReports(owner)).reports.filter((r) => r.target.nick === x.nick);
    const byTree = reports.find((r) => r.tree);
    const byPerson = reports.find((r) => !r.tree);
    // A report without a tree has no name to hide.
    assert.equal((await call('POST', `/api/owner/reports/${byPerson.id}/hide-name`, null, owner)).status, 400);

    const r = await call('POST', `/api/owner/reports/${byTree.id}/hide-name`, null, owner);
    assert.deepEqual([r.status, r.body.report.resolution, r.body.report.tree.hidden], [200, 'name_hidden', true]);
    const seen = async (who) => (await call('GET', `/api/users/${x.nick}`, null, who.token)).body.forest.trees;
    const [t1, t2] = await seen(friend);
    assert.deepEqual([t1.name, t1.nickname], ['…', null]);
    assert.deepEqual([t2.name, t2.nickname], ['Не курить', 'Дубок']);
    const inList = (await call('GET', '/api/friends', null, friend.token)).body.friends.find((f) => f.nick === x.nick).forest.trees[0];
    assert.deepEqual([inList.name, inList.nickname], ['…', null]);
    assert.equal((await seen(x))[0].nickname, 'Гадость');
    // Sending the forest again doesn't bring the name back.
    await call('PUT', '/api/forest', { trees: [tree('t1', 'Гадость')] }, x.token);
    assert.equal((await seen(friend))[0].nickname, null);
    // Nor does the next generation of that habit (planted from the seed).
    await call('PUT', '/api/forest', { trees: [{ ...tree('t1b', 'Гадость II'), lineageId: 't1' }, tree('t1', 'Гадость')] }, x.token);
    assert.equal((await seen(friend))[0].nickname, null);
    await call('PUT', '/api/forest', { trees: [tree('t1', 'Гадость')] }, x.token);
    // The other report is still open.
    assert.ok((await openReports(owner)).reports.some((q) => q.id === byPerson.id));

    assert.equal((await call('POST', `/api/owner/reports/${byTree.id}/show-name`, null, owner)).status, 200);
    assert.equal((await seen(friend))[0].nickname, 'Гадость');
  });

  it('block an account: can’t sign in, friends don’t see them; every open report on them is closed; unblock undoes', async () => {
    const owner = await ownerLogin('10.7.8.1');
    const [x, friend, other] = [await signup(), await signup(), await signup()];
    await befriend(x, friend);
    await call('POST', '/api/cheer', { nick: friend.nick, day: '2026-10-28' }, x.token);
    await call('POST', '/api/friends/request', { nick: other.nick }, x.token);
    const offer = (await call('POST', '/api/shared', { nick: friend.nick, name: 'Вместе' }, x.token)).body.tree;
    await call('POST', '/api/report', { nick: x.nick, reason: 'abuse' }, friend.token);
    await call('POST', '/api/report', { nick: x.nick, reason: 'spam' }, other.token);
    const [first, second] = (await openReports(owner)).reports.filter((r) => r.target.nick === x.nick);

    const r = await call('POST', `/api/owner/reports/${first.id}/ban`, null, owner);
    assert.deepEqual([r.status, r.body.report.resolution, r.body.report.target.banned], [200, 'banned', true]);
    assert.equal((await openReports(owner, 'done')).reports.find((q) => q.id === second.id).resolution, 'banned');

    // Can't sign in, and the old session stops.
    assert.equal((await call('POST', '/api/login', { nick: x.nick, password: 'secret12' }, null, '10.7.8.9')).status, 403);
    assert.equal((await call('POST', '/api/login', { nick: x.nick, password: 'wrong123' }, null, '10.7.8.9')).status, 401);
    assert.equal((await call('GET', '/api/me', null, x.token)).status, 401);
    // Friends and everyone else don't see them.
    const fr = (await call('GET', '/api/friends', null, friend.token)).body;
    assert.ok(!fr.friends.some((f) => f.nick === x.nick));
    assert.equal((await call('GET', `/api/users/${x.nick}`, null, friend.token)).status, 404);
    assert.equal((await call('GET', `/api/users?q=${x.nick}`, null, other.token)).body.users.length, 0);
    assert.equal((await call('POST', '/api/friends/request', { nick: x.nick }, other.token)).status, 404);
    const inbox = (await call('GET', '/api/inbox', null, friend.token)).body;
    assert.deepEqual([inbox.cheers.length, inbox.offers], [0, 0]);
    assert.equal((await call('GET', '/api/inbox', null, other.token)).body.requests, 0);
    assert.equal((await call('GET', '/api/friends', null, other.token)).body.incoming.length, 0);
    assert.equal((await call('GET', '/api/shared', null, friend.token)).body.trees.length, 0);
    assert.equal((await call('POST', `/api/shared/${offer.id}/accept`, { day: '2026-10-28' }, friend.token)).status, 404);

    // Unblock: everything is back, nothing was deleted.
    assert.equal((await call('POST', `/api/owner/reports/${first.id}/unban`, null, owner)).status, 200);
    assert.equal((await call('GET', '/api/me', null, x.token)).status, 200);
    assert.ok((await call('GET', '/api/friends', null, friend.token)).body.friends.some((f) => f.nick === x.nick));
    assert.equal((await call('GET', '/api/inbox', null, friend.token)).body.cheers.length, 1);
  });

  it('a deleted reported account shows as deleted, without its old nick', async () => {
    const owner = await ownerLogin('10.7.9.1');
    const [x, y] = [await signup(), await signup()];
    await call('POST', '/api/report', { nick: x.nick, reason: 'other', text: 'x' }, y.token);
    await call('POST', '/api/me/delete', { password: 'secret12' }, x.token);
    const r = (await openReports(owner)).reports.find((q) => q.text === 'x' && q.target.deleted);
    assert.deepEqual([r.target.nick, r.target.deleted], [null, true]);
  });
});

describe('owner: an old database', () => {
  it('gets the new columns', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'oyuur-'));
    const path = join(dir, 'old.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, nick TEXT NOT NULL UNIQUE, pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL, rec_salt TEXT, rec_hash TEXT, name TEXT, avatar TEXT NOT NULL DEFAULT 'fox', color INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, public TEXT, public_at INTEGER);
      CREATE TABLE reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter TEXT NOT NULL, target TEXT NOT NULL, tree_id TEXT, reason TEXT NOT NULL, text TEXT, created_at INTEGER NOT NULL);
      CREATE TABLE hidden_names (user_id TEXT NOT NULL, tree_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, tree_id));
      INSERT INTO reports (reporter, target, reason, created_at) VALUES ('a', 'b', 'spam', 1);`);
    old.close();
    const db2 = openDb(path);
    const cols = (t) => db2.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
    assert.ok(['deleted', 'banned_at'].every((c) => cols('users').includes(c)));
    assert.ok(['resolution', 'resolved_by', 'resolved_at'].every((c) => cols('reports').includes(c)));
    assert.ok(cols('hidden_names').includes('lineage_id'));
    assert.equal(db2.prepare('SELECT resolution FROM reports').get().resolution, null);
    db2.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
