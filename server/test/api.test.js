import assert from 'node:assert/strict';
import { mkdtempSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { request } from 'node:http';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createApp, publicView, validNick } from '../src/app.js';
import { openDb } from '../src/db.js';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

// A fixed clock: 2026-10-28 noon UTC.
const NOW = Date.parse('2026-10-28T12:00:00Z');
const TODAY = '2026-10-28';

let server;
let base;

before(async () => {
  server = createApp({ db: openDb(':memory:'), now: () => NOW });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(method, path, body, token, ip = '10.0.0.1') {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

let n = 0;
async function signup(nick = `user${++n}x`) {
  const r = await call('POST', '/api/signup', { nick, password: 'secret12', name: 'Аня' }, null, `10.1.${n}.1`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { nick, token: r.body.token, code: r.body.recoveryCode };
}
async function befriend(a, b) {
  await call('POST', '/api/friends/request', { nick: b.nick }, a.token);
  const r = await call('POST', '/api/friends/accept', { nick: a.nick }, b.token);
  assert.equal(r.body.relation, 'friend');
}

describe('nicks', () => {
  it('rules', () => {
    assert.equal(validNick('sasha_t'), true);
    assert.equal(validNick('ab'), false);
    assert.equal(validNick('1sasha'), false);
    assert.equal(validNick('sa__sha'), false);
    assert.equal(validNick('sasha_'), false);
    assert.equal(validNick('admin'), false);
    assert.equal(validNick('Sasha'), false);
  });

  it('free / taken with suggestions', async () => {
    await signup('mei');
    const taken = await call('GET', '/api/nick/MEI');
    assert.deepEqual([taken.body.valid, taken.body.free], [true, false]);
    assert.equal(taken.body.suggestions.length, 3);
    assert.ok(taken.body.suggestions.every((s) => validNick(s)));
    const free = await call('GET', '/api/nick/@lucas');
    assert.deepEqual([free.body.nick, free.body.free], ['lucas', true]);
    const again = await call('POST', '/api/signup', { nick: 'Mei', password: 'secret12' }, null, '10.9.9.9');
    assert.equal(again.status, 409);
    assert.equal(again.body.suggestions.length, 3);
  });
});

describe('accounts', () => {
  it('sign up, log in, wrong password', async () => {
    const a = await signup('anya');
    assert.match(a.code, /^[a-z0-9]{12}$/);
    assert.equal((await call('GET', '/api/me', null, a.token)).body.user.nick, 'anya');
    assert.equal((await call('POST', '/api/login', { nick: '@Anya', password: 'secret12' })).status, 200);
    assert.equal((await call('POST', '/api/login', { nick: 'anya', password: 'nope123' })).status, 401);
    assert.equal((await call('GET', '/api/me', null, 'bogus')).status, 401);
  });

  it('short password refused', async () => {
    assert.equal((await call('POST', '/api/signup', { nick: 'shorty', password: '123' }, null, '10.8.8.8')).body.error, 'bad_password');
  });

  it('recovery code sets a new password once, old sessions end', async () => {
    const a = await signup('forgetful');
    const r = await call('POST', '/api/recover', { nick: 'forgetful', code: a.code.toUpperCase(), password: 'newpass1' });
    assert.equal(r.status, 200);
    assert.notEqual(r.body.recoveryCode, a.code);
    assert.equal((await call('GET', '/api/me', null, a.token)).status, 401);
    assert.equal((await call('POST', '/api/login', { nick: 'forgetful', password: 'newpass1' })).status, 200);
    assert.equal((await call('POST', '/api/recover', { nick: 'forgetful', code: a.code, password: 'again12' })).status, 401);
  });

  it('profile edit cleans the name', async () => {
    const a = await signup();
    const r = await call('PATCH', '/api/me', { name: '  Аня🌳 ', avatar: 'owl', color: 3 }, a.token);
    assert.deepEqual([r.body.user.name, r.body.user.avatar, r.body.user.color], ['Аня', 'owl', 3]);
    const bad = await call('PATCH', '/api/me', { avatar: 'dragon', color: 99 }, a.token);
    assert.deepEqual([bad.body.user.avatar, bad.body.user.color], ['owl', 3]);
  });

  it('delete needs the password and removes everything', async () => {
    const a = await signup();
    const b = await signup();
    await befriend(a, b);
    assert.equal((await call('POST', '/api/me/delete', { password: 'wrong' }, a.token)).status, 401);
    assert.equal((await call('POST', '/api/me/delete', { password: 'secret12' }, a.token)).status, 200);
    assert.equal((await call('GET', '/api/me', null, a.token)).status, 401);
    assert.equal((await call('GET', '/api/friends', null, b.token)).body.friends.length, 0);
  });
});

const tree = (id, visibility, extra = {}) => ({
  id, lineageId: id, name: 'Run', nickname: null, kind: 'do', visibility, skin: 'birch', plantedOn: '2026-10-01',
  checkins: ['2026-10-26', '2026-10-27'], frozen: [], chancesLeft: 3, diedOn: null, completedOn: null, generation: 1, ...extra,
});

describe('what friends see', () => {
  it('only trees marked "friends"; nothing else of the save', () => {
    const v = publicView({
      trees: [tree('a', 'friends'), tree('b', 'private'), { id: 'x' }],
      plot: { size: 6, places: { a: { c: 1, r: 2 }, b: { c: 3, r: 3 } }, seen: ['a'] },
      meadow: 'winter',
      hidden: 1,
      wallet: { acorns: 999 },
    });
    assert.deepEqual(v.trees.map((t) => t.id), ['a']);
    assert.deepEqual(v.plot, { size: 6, places: { a: { c: 1, r: 2 } } });
    assert.equal(v.meadow, 'winter');
    // Friends no longer see how many trees are hidden (OYUUR-30, owner's decision 12.1): always 0.
    assert.equal(v.hidden, 0);
    assert.equal('wallet' in v, false);
    assert.equal('visibility' in v.trees[0], false);
  });

  it('watering hours go to friends, cleaned; old phones send none', () => {
    const v = publicView({
      trees: [
        tree('a', 'friends', { openHours: [{ from: '2026-10-01', hour: 18 }, { from: 'x', hour: 6 }, { from: '2026-10-05', hour: 30 }, { from: '2026-10-06', hour: 6, extra: 1 }] }),
        tree('b', 'friends'),
      ],
    });
    assert.deepEqual(v.trees[0].openHours, [{ from: '2026-10-01', hour: 18 }, { from: '2026-10-06', hour: 6 }]);
    assert.equal(JSON.parse(JSON.stringify(v)).trees[1].openHours, undefined);
  });

  it('friends see the forest, strangers don’t', async () => {
    const a = await signup();
    const b = await signup();
    const c = await signup();
    await call('PUT', '/api/forest', { trees: [tree('t1', 'friends'), tree('t2', 'private')], plot: { size: 4, places: {} }, hidden: 1 }, a.token);
    await befriend(a, b);
    const seen = await call('GET', `/api/users/${a.nick}`, null, b.token);
    assert.equal(seen.body.relation, 'friend');
    assert.deepEqual(seen.body.forest.trees.map((t) => t.id), ['t1']);
    const stranger = await call('GET', `/api/users/${a.nick}`, null, c.token);
    assert.equal(stranger.body.forest, null);
    const list = await call('GET', `/api/friends?day=${TODAY}`, null, b.token);
    assert.equal(list.body.friends[0].forest.trees.length, 1);
  });
});

describe('friends', () => {
  it('request, accept, remove; asking back is a yes', async () => {
    const a = await signup();
    const b = await signup();
    assert.equal((await call('POST', '/api/friends/request', { nick: b.nick }, a.token)).body.relation, 'outgoing');
    const lists = await call('GET', '/api/friends', null, b.token);
    assert.deepEqual(lists.body.incoming.map((u) => u.nick), [a.nick]);
    assert.equal((await call('GET', '/api/inbox', null, b.token)).body.requests, 1);
    assert.equal((await call('POST', '/api/friends/request', { nick: a.nick }, b.token)).body.relation, 'friend');
    assert.equal((await call('POST', '/api/friends/remove', { nick: a.nick }, b.token)).body.relation, 'none');
    assert.equal((await call('GET', '/api/friends', null, a.token)).body.friends.length, 0);
  });

  it('search by the start of a nick, from 3 letters, without blocked', async () => {
    const me = await signup('searcher');
    await signup('lucas_a');
    await signup('lucas_b');
    const lb = await signup('lucky');
    assert.deepEqual((await call('GET', '/api/users?q=lu', null, me.token)).body.users, []);
    const found = await call('GET', '/api/users?q=@LUC', null, me.token);
    assert.deepEqual(found.body.users.map((u) => u.nick), ['lucky', 'lucas_a', 'lucas_b']);
    await call('POST', '/api/block', { nick: 'searcher' }, lb.token);
    const after = await call('GET', '/api/users?q=luc', null, me.token);
    assert.deepEqual(after.body.users.map((u) => u.nick), ['lucas_a', 'lucas_b']);
  });

  it('block ends the friendship and shared trees; the blocked can’t ask again', async () => {
    const a = await signup();
    const b = await signup();
    await befriend(a, b);
    const s = await call('POST', '/api/shared', { nick: b.nick, name: 'Run', kind: 'do', skin: 'oak' }, a.token);
    await call('POST', '/api/block', { nick: b.nick }, a.token);
    assert.equal((await call('GET', '/api/friends', null, a.token)).body.friends.length, 0);
    assert.equal((await call('POST', '/api/friends/request', { nick: a.nick }, b.token)).status, 404);
    assert.equal((await call('GET', `/api/users/${a.nick}`, null, b.token)).status, 404);
    const shared = (await call('GET', '/api/shared', null, b.token)).body.trees;
    assert.equal(shared.find((t) => t.id === s.body.tree.id).status, 'ended');
    assert.deepEqual((await call('GET', '/api/blocks', null, a.token)).body.users.map((u) => u.nick), [b.nick]);
    await call('POST', '/api/unblock', { nick: b.nick }, a.token);
    assert.equal((await call('POST', '/api/friends/request', { nick: a.nick }, b.token)).body.relation, 'outgoing');
  });

  it('report a person or a tree name', async () => {
    const a = await signup();
    const b = await signup();
    assert.equal((await call('POST', '/api/report', { nick: b.nick, reason: 'name', treeId: 't1', text: 'bad' }, a.token)).status, 200);
    assert.equal((await call('POST', '/api/report', { nick: b.nick, reason: 'whatever' }, a.token)).status, 400);
  });
});

describe('cheers', () => {
  it('once a day, friends only, shows in the inbox until seen', async () => {
    const a = await signup();
    const b = await signup();
    const c = await signup();
    await befriend(a, b);
    assert.equal((await call('POST', '/api/cheer', { nick: b.nick, day: TODAY }, a.token)).body.already, false);
    assert.equal((await call('POST', '/api/cheer', { nick: b.nick, day: TODAY }, a.token)).body.already, true);
    assert.equal((await call('POST', '/api/cheer', { nick: b.nick, day: TODAY }, c.token)).status, 403);
    assert.equal((await call('POST', '/api/cheer', { nick: b.nick, day: '2026-11-15' }, a.token)).status, 400);
    const inbox = await call('GET', '/api/inbox', null, b.token);
    assert.deepEqual(inbox.body.cheers.map((x) => x.from.nick), [a.nick]);
    const list = await call('GET', `/api/friends?day=${TODAY}`, null, b.token);
    assert.equal(list.body.friends[0].cheeredMe, true);
    await call('POST', '/api/inbox/seen', {}, b.token);
    assert.equal((await call('GET', '/api/inbox', null, b.token)).body.cheers.length, 0);
  });
});

describe('shared trees', () => {
  it('offer, accept (planted that day), each waters their half', async () => {
    const a = await signup();
    const b = await signup();
    await befriend(a, b);
    const offer = await call('POST', '/api/shared', { nick: b.nick, name: 'Читать', kind: 'do', skin: 'maple' }, a.token);
    assert.equal(offer.body.tree.status, 'proposed');
    assert.equal((await call('GET', '/api/inbox', null, b.token)).body.offers, 1);
    const id = offer.body.tree.id;
    assert.equal((await call('POST', `/api/shared/${id}/accept`, { day: TODAY }, a.token)).status, 404);
    const acc = await call('POST', `/api/shared/${id}/accept`, { day: TODAY }, b.token);
    assert.deepEqual([acc.body.tree.status, acc.body.tree.plantedOn], ['active', TODAY]);
    await call('POST', `/api/shared/${id}/water`, { day: TODAY }, a.token);
    await call('POST', `/api/shared/${id}/water`, { day: TODAY }, a.token);
    const w = await call('POST', `/api/shared/${id}/water`, { day: TODAY }, b.token);
    assert.deepEqual(w.body.tree.waterings, { [a.nick]: [TODAY], [b.nick]: [TODAY] });
    assert.equal((await call('POST', `/api/shared/${id}/water`, { day: '2026-10-27' }, b.token)).status, 400);
  });

  it('one per pair, at most 3 each, friends only', async () => {
    const a = await signup();
    const [b, c, d, e] = [await signup(), await signup(), await signup(), await signup()];
    for (const x of [b, c, d, e]) await befriend(a, x);
    assert.equal((await call('POST', '/api/shared', { nick: b.nick, name: 'A' }, a.token)).status, 200);
    assert.equal((await call('POST', '/api/shared', { nick: b.nick, name: 'B' }, a.token)).body.error, 'shared_exists');
    await call('POST', '/api/shared', { nick: c.nick, name: 'C' }, a.token);
    await call('POST', '/api/shared', { nick: d.nick, name: 'D' }, a.token);
    assert.equal((await call('POST', '/api/shared', { nick: e.nick, name: 'E' }, a.token)).body.error, 'too_many_shared');
    const stranger = await signup();
    assert.equal((await call('POST', '/api/shared', { nick: stranger.nick, name: 'X' }, a.token)).status, 403);
  });

  it('leaving ends it for both; removing a friend too', async () => {
    const a = await signup();
    const b = await signup();
    await befriend(a, b);
    const id = (await call('POST', '/api/shared', { nick: b.nick, name: 'Run' }, a.token)).body.tree.id;
    await call('POST', `/api/shared/${id}/accept`, { day: TODAY }, b.token);
    await call('POST', `/api/shared/${id}/end`, {}, b.token);
    const t = (await call('GET', '/api/shared', null, a.token)).body.trees.find((x) => x.id === id);
    assert.equal(t.status, 'ended');
    assert.equal((await call('POST', `/api/shared/${id}/water`, { day: TODAY }, a.token)).status, 404);
  });
});

describe('the door', () => {
  it('health, unknown api, bad json, too many logins', async () => {
    assert.equal((await call('GET', '/healthz')).body.ok, true);
    assert.equal((await call('GET', '/api/nope')).status, 404);
    const res = await fetch(`${base}/api/login`, { method: 'POST', body: '{nope', headers: { 'x-forwarded-for': '10.7.7.7' } });
    assert.equal(res.status, 400);
    let last;
    for (let i = 0; i < 12; i++) last = await call('POST', '/api/login', { nick: 'mei', password: 'x' }, null, '10.6.6.6');
    assert.equal(last.status, 429);
  });
});

describe('hardening (review)', () => {
  it('a broken request line does not take the server down', async () => {
    const { connect } = await import('node:net');
    const { port } = server.address();
    await new Promise((ok) => {
      const sock = connect(port, '127.0.0.1', () => sock.end(['GET http://[ HTTP/1.1', 'Host: x', '', ''].join(String.fromCharCode(13, 10))));
      sock.on('data', () => {});
      sock.on('close', ok);
      sock.on('error', ok);
    });
    assert.equal((await call('GET', '/healthz')).body.ok, true);
  });

  it('a spoofed first X-Forwarded-For does not dodge the limit', async () => {
    let last;
    for (let i = 0; i < 12; i++) last = await call('POST', '/api/login', { nick: 'mei', password: 'x' }, null, `1.2.3.${i}, 10.5.5.5`);
    assert.equal(last.status, 429);
  });

  it('a stranger’s wrong passwords don’t lock the owner out', async () => {
    const a = await signup('lockme');
    for (let i = 0; i < 12; i++) await call('POST', '/api/login', { nick: a.nick, password: 'wrong' }, null, '10.66.0.1');
    assert.equal((await call('POST', '/api/login', { nick: a.nick, password: 'secret12' }, null, '10.66.0.2')).status, 200);
  });

  it('a deleted account leaves shared trees as memories, its nick is free', async () => {
    const a = await signup('leaving');
    const b = await signup();
    await befriend(a, b);
    const id = (await call('POST', '/api/shared', { nick: b.nick, name: 'Run' }, a.token)).body.tree.id;
    await call('POST', `/api/shared/${id}/accept`, { day: TODAY }, b.token);
    await call('POST', '/api/me/delete', { password: 'secret12' }, a.token);
    const t = (await call('GET', '/api/shared', null, b.token)).body.trees.find((x) => x.id === id);
    assert.equal(t.status, 'ended');
    assert.equal(t.proposer, null);
    assert.equal((await call('GET', '/api/users/leaving', null, b.token)).status, 404);
    assert.equal((await call('GET', '/api/nick/leaving')).body.free, true);
    assert.equal((await call('POST', '/api/login', { nick: 'leaving', password: 'secret12' }, null, '10.67.0.1')).status, 401);
  });

  it('a too big forest is refused', async () => {
    const a = await signup();
    const big = { trees: [{ id: 'x', visibility: 'friends', plantedOn: '2026-01-01', name: 'a'.repeat(400_000) }] };
    assert.equal((await call('PUT', '/api/forest', big, a.token)).status, 413);
  });
});


describe('web files', () => {
  it('the APK downloads under its own name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'oyuur-public-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    writeFileSync(join(dir, 'oyuur-1.0.apk'), 'apk');
    writeFileSync(join(dir, 'ойуур.apk'), 'apk');
    const web = createApp({ db: openDb(':memory:'), publicDir: dir, now: () => NOW });
    await new Promise((ok) => web.listen(0, '127.0.0.1', ok));
    try {
      const at = `http://127.0.0.1:${web.address().port}`;
      const apk = await fetch(`${at}/oyuur-1.0.apk`);
      assert.equal(apk.headers.get('content-type'), 'application/vnd.android.package-archive');
      assert.equal(apk.headers.get('content-disposition'), `attachment; filename="oyuur-1.0.apk"; filename*=UTF-8''oyuur-1.0.apk`);
      assert.equal(await apk.text(), 'apk');
      const ru = await fetch(`${at}/${encodeURIComponent('ойуур.apk')}`);
      assert.equal(ru.status, 200);
      assert.equal(ru.headers.get('content-disposition'), `attachment; filename="_____.apk"; filename*=UTF-8''${encodeURIComponent('ойуур.apk')}`);
      await ru.text();
      const page = await fetch(`${at}/`);
      assert.equal(page.headers.get('content-disposition'), null);
      await page.text();
    } finally {
      web.close();
    }
  });

  // OYUUR-35: the web version opened in 10–20 s, the 8 MB wasm downloaded unpacked every time.
  describe('packing and caching', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oyuur-pack-'));
    const page = `<!doctype html><title>Oyuur</title>${'<p>forest</p>'.repeat(200)}`;
    const wasm = Buffer.alloc(50_000, 'canvaskit ');
    const png = Buffer.alloc(5_000, 7);
    writeFileSync(join(dir, 'index.html'), page);
    writeFileSync(join(dir, 'canvaskit.wasm'), wasm);
    writeFileSync(join(dir, 'icon.png'), png);
    let web;
    let port;
    before(async () => {
      web = createApp({ db: openDb(':memory:'), publicDir: dir, now: () => NOW });
      await new Promise((ok) => web.listen(0, '127.0.0.1', ok));
      port = web.address().port;
    });
    after(() => web.close());
    // fetch() unpacks by itself and sends its own Accept-Encoding, so plain http here.
    const get = (path, headers = {}, method = 'GET') =>
      new Promise((ok, fail) => {
        request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
          const parts = [];
          res.on('data', (c) => parts.push(c));
          res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
        })
          .on('error', fail)
          .end();
      });

    it('brotli to a browser that takes it, gzip to one that takes only gzip, the file as is to the rest', async () => {
      const br = await get('/canvaskit.wasm?v=2.14.0', { 'accept-encoding': 'gzip, deflate, br' });
      assert.equal(br.headers['content-encoding'], 'br');
      assert.equal(br.headers.vary, 'accept-encoding');
      assert.equal(br.headers['content-type'], 'application/wasm');
      assert.equal(Number(br.headers['content-length']), br.body.length);
      assert.ok(br.body.length < wasm.length / 10);
      assert.deepEqual(brotliDecompressSync(br.body), wasm);
      const gz = await get('/canvaskit.wasm', { 'accept-encoding': 'gzip' });
      assert.equal(gz.headers['content-encoding'], 'gzip');
      assert.deepEqual(gunzipSync(gz.body), wasm);
      const plain = await get('/canvaskit.wasm');
      assert.equal(plain.headers['content-encoding'], undefined);
      assert.deepEqual(plain.body, wasm);
      const refused = await get('/canvaskit.wasm', { 'accept-encoding': 'br;q=0, gzip;q=0' });
      assert.equal(refused.headers['content-encoding'], undefined);
      assert.deepEqual(refused.body, wasm);
    });

    it('the app page is packed too, also for paths the app routes itself', async () => {
      for (const path of ['/', '/tree/abc']) {
        const res = await get(path, { 'accept-encoding': 'br' });
        assert.equal(res.headers['content-encoding'], 'br');
        assert.equal(res.headers['cache-control'], 'no-cache');
        assert.equal(brotliDecompressSync(res.body).toString(), page);
      }
    });

    it('a picture goes as it is, whatever the browser takes', async () => {
      const res = await get('/icon.png', { 'accept-encoding': 'gzip, br' });
      assert.equal(res.headers['content-encoding'], undefined);
      assert.equal(res.headers.vary, undefined);
      assert.deepEqual(res.body, png);
      assert.ok(res.headers.etag);
    });

    it('a browser that has the file gets 304 and no body; wasm keeps for a day', async () => {
      const first = await get('/canvaskit.wasm', { 'accept-encoding': 'br' });
      assert.equal(first.headers['cache-control'], 'public, max-age=86400');
      const etag = first.headers.etag;
      assert.match(etag, /^W\/".+"$/);
      const again = await get('/canvaskit.wasm', { 'accept-encoding': 'br', 'if-none-match': etag });
      assert.equal(again.status, 304);
      assert.equal(again.body.length, 0);
      assert.equal(again.headers.etag, etag);
      // A strong form of the same tag and a list with it count too; another tag does not.
      assert.equal((await get('/canvaskit.wasm', { 'if-none-match': `"x", ${etag.slice(2)}` })).status, 304);
      assert.equal((await get('/icon.png', { 'if-none-match': etag })).status, 200);
      const pic = await get('/icon.png');
      assert.equal((await get('/icon.png', { 'if-none-match': pic.headers.etag })).status, 304);
    });

    it('a changed file gets a new tag and is packed anew', async () => {
      const before = await get('/index.html', { 'accept-encoding': 'br' });
      writeFileSync(join(dir, 'index.html'), `${page}<p>new</p>`);
      const after = await get('/index.html', { 'accept-encoding': 'br', 'if-none-match': before.headers.etag });
      assert.equal(after.status, 200);
      assert.notEqual(after.headers.etag, before.headers.etag);
      assert.equal(brotliDecompressSync(after.body).toString(), `${page}<p>new</p>`);
    });

    it('the tag is by content: a new build with the same size and file time still gets a new tag', async () => {
      const one = mkdtempSync(join(tmpdir(), 'oyuur-tag-'));
      const file = join(one, 'index.html');
      writeFileSync(file, '<p>build A</p>');
      const { mtime } = statSync(file);
      const tagOf = async () => {
        const app = createApp({ db: openDb(':memory:'), publicDir: one, now: () => NOW });
        await new Promise((ok) => app.listen(0, '127.0.0.1', ok));
        try {
          return (await fetch(`http://127.0.0.1:${app.address().port}/`)).headers.get('etag');
        } finally {
          app.close();
        }
      };
      const a = await tagOf();
      writeFileSync(file, '<p>build B</p>');
      utimesSync(file, mtime, mtime);
      assert.notEqual(await tagOf(), a);
    });

    it('HEAD answers the headers only; the API is not packed or tagged', async () => {
      const head = await get('/canvaskit.wasm', { 'accept-encoding': 'br' }, 'HEAD');
      assert.equal(head.status, 200);
      assert.equal(head.headers['content-encoding'], 'br');
      assert.equal(head.body.length, 0);
      const api = await get('/api/me', { 'accept-encoding': 'br, gzip' });
      assert.equal(api.status, 401);
      assert.equal(api.headers['content-encoding'], undefined);
      assert.equal(api.headers.etag, undefined);
      assert.equal(api.headers['cache-control'], 'no-store');
      assert.equal(JSON.parse(api.body).error, 'signed_out');
    });
  });
});
