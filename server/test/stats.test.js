import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

// The owner's numbers (OYUUR-27): GET /api/owner/stats over prepared events.
const NOW = Date.parse('2026-10-28T12:00:00Z');
const KEY = 'owner-key-0123456789-abcdef';

const servers = [];
async function start(opts) {
  const db = openDb(':memory:');
  const server = createApp({ db, now: () => NOW, ...opts });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  servers.push(server);
  return { db, base: `http://127.0.0.1:${server.address().port}` };
}
after(() => servers.forEach((s) => s.close()));

async function call(base, path, token, method = 'GET', body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.9.0.1', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const DAY = 86_400_000;
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
let seq = 0;
/** One install's events: [dayN, name, props?]; the first day is `first`. */
function seed(db, install, first, events, { mode = 'browser', tz = 'UTC' } = {}) {
  const ins = db.prepare('INSERT INTO events (install, id, name, at, day, day_n, tz, mode, version, lang, props, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const [n, name, props] of events) {
    const day = addDays(first, n);
    const at = Date.parse(`${day}T10:00:00Z`) + (seq % 50) * 1000;
    ins.run(install.padEnd(16, 'x'), `ev${++seq}`, name, at, day, n, tz, mode, '1.2', 'ru', props ? JSON.stringify(props) : null, NOW);
  }
}

let base;
let db;
let owner;
before(async () => {
  ({ base, db } = await start({ ownerToken: KEY }));
  owner = (await call(base, '/api/owner/login', null, 'POST', { key: KEY })).body.token;
  // A: planted and watered on the first day, back on days 1, 2 and 7, then gone; made an account.
  seed(db, 'A', '2026-10-01', [[0, 'first_launch'], [0, 'app_open'], [0, 'plant', { seed: false, generation: 1 }], [0, 'water'], [0, 'signup'], [1, 'water'], [2, 'app_open'], [7, 'app_open']]);
  // B: planted, never watered, never back.
  seed(db, 'B', '2026-10-01', [[0, 'first_launch'], [0, 'app_open'], [0, 'plant', { seed: false, generation: 1 }]], { mode: 'standalone' });
  // C: the whole first day, back tomorrow, waters 4 days in a row this week, account and a friend.
  seed(db, 'C', '2026-10-20', [[0, 'first_launch'], [0, 'plant', { seed: false, generation: 1 }], [0, 'water'], [1, 'app_open'], [1, 'signup'], [2, 'friend_added'], [4, 'water'], [5, 'water'], [6, 'water'], [7, 'water']], { mode: 'android' });
  // D: an update of an old version (already had trees), signed in, back today.
  seed(db, 'D', '2026-10-27', [[0, 'first_launch', { existing: true }], [0, 'app_open'], [0, 'login'], [1, 'water']], { mode: 'standalone' });
  // E: arrived today in Yakutsk: too early for anything but "installed".
  seed(db, 'E', '2026-10-28', [[0, 'first_launch'], [0, 'app_open']], { tz: 'Asia/Yakutsk' });
  // F: its first_launch got lost: the first day comes from day - day_n (10-12); gone after day 3.
  seed(db, 'F', '2026-10-12', [[3, 'app_open'], [3, 'water']], { mode: 'ios' });
});

const stats = async (period) => {
  const r = await call(base, `/api/owner/stats${period ? `?period=${period}` : ''}`, owner);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};

describe('owner stats: the door', () => {
  it('without signing in — 401; a wrong period — 400', async () => {
    assert.equal((await call(base, '/api/owner/stats')).status, 401);
    assert.equal((await call(base, '/api/owner/stats', 'not-a-session')).status, 401);
    assert.equal((await call(base, '/api/owner/stats?period=5', owner)).status, 400);
  });

  it('without OWNER_TOKEN it does not exist — 404', async () => {
    const off = await start({});
    assert.equal((await call(off.base, '/api/owner/stats')).status, 404);
  });

  it('no events — zeros, no cohorts', async () => {
    const empty = await start({ ownerToken: KEY });
    const t = (await call(empty.base, '/api/owner/login', null, 'POST', { key: KEY })).body.token;
    const s = (await call(empty.base, '/api/owner/stats?period=all', t)).body;
    assert.equal(s.installs, 0);
    assert.deepEqual(s.cohorts, []);
    assert.deepEqual(s.funnel, { opened: 0, planted: 0, watered: 0, returned: 0 });
    assert.equal(s.gone.count, 0);
  });
});

describe('owner stats: the numbers', () => {
  it('installs by the day they arrived, updates apart', async () => {
    const s = await stats('all');
    assert.equal(s.installs, 6);
    assert.equal(s.old, 1);
    assert.equal(s.from, '2026-10-01');
    assert.equal(s.to, '2026-10-28');
    assert.equal(s.installsByDay.length, 28);
    const by = Object.fromEntries(s.installsByDay.filter((d) => d.installs).map((d) => [d.day, [d.installs, d.old]]));
    assert.deepEqual(by, { '2026-10-01': [2, 0], '2026-10-12': [1, 0], '2026-10-20': [1, 0], '2026-10-27': [1, 1], '2026-10-28': [1, 0] });
  });

  it('came back on day N: of those whose day N is over or who already came', async () => {
    const s = await stats('all');
    const r = Object.fromEntries(s.retention.map((c) => [c.day, [c.back, c.of]]));
    // Day 1: A, C, D back (D — today, already counted); B and F not; E's tomorrow hasn't come.
    assert.deepEqual(r[1], [3, 5]);
    assert.deepEqual(r[2], [2, 4]);
    assert.deepEqual(r[7], [2, 4]);
    assert.deepEqual(r[14], [0, 3]);
    assert.deepEqual(r[30], [0, 0]);
  });

  it('cohorts by week of arrival (from Monday), newest first', async () => {
    const s = await stats('all');
    assert.deepEqual(s.cohorts.map((c) => [c.week, c.installs]), [['2026-10-26', 2], ['2026-10-19', 1], ['2026-10-12', 1], ['2026-09-28', 2]]);
    const first = s.cohorts[3].cells.map((c) => [c.day, c.back, c.of]);
    assert.deepEqual(first, [[1, 1, 2], [2, 1, 2], [7, 1, 2], [14, 0, 2], [30, 0, 0]]);
    assert.deepEqual(s.cohorts[1].cells.map((c) => [c.back, c.of]), [[1, 1], [1, 1], [1, 1], [0, 0], [0, 0]]);
  });

  it('the first day step by step: only new people whose next day is over', async () => {
    const s = await stats('all');
    // A, B, C (not the update D, not E who came today, not F without first_launch).
    assert.deepEqual(s.funnel, { opened: 3, planted: 3, watered: 2, returned: 2 });
  });

  it('where they stop: gone 3+ days, on which day and after what', async () => {
    const s = await stats('all');
    assert.equal(s.gone.count, 3);
    assert.deepEqual(Object.fromEntries(s.gone.days.map((d) => [d.key, d.count])), { d0: 1, d1_2: 0, d3_6: 1, d7: 1 });
    assert.deepEqual(s.gone.last, [{ name: 'app_open', count: 1 }, { name: 'plant', count: 1 }, { name: 'water', count: 1 }]);
  });

  it('browser / Home Screen / Android / iOS, accounts, friends, live streaks', async () => {
    const s = await stats('all');
    assert.deepEqual(Object.fromEntries(s.modes.map((m) => [m.mode, m.installs])), { browser: 2, standalone: 2, android: 1, ios: 1 });
    assert.deepEqual(s.social, { signup: 2, login: 1, friend: 1 });
    assert.equal(s.streaks, 1);
    assert.equal(s.active, 3);
  });

  it('the period: only installs that arrived in it', async () => {
    const week = await stats('7');
    assert.equal(week.from, '2026-10-22');
    assert.equal(week.installsByDay.length, 7);
    assert.equal(week.installs, 2);
    assert.deepEqual(week.funnel, { opened: 0, planted: 0, watered: 0, returned: 0 });
    const month = await stats();
    assert.equal(month.period, '30');
    assert.equal(month.installs, 6);
  });

  it('made-up days (a broken clock, a date that does not exist) are left out, not a crash', async () => {
    const odd = await start({ ownerToken: KEY });
    const t = (await call(odd.base, '/api/owner/login', null, 'POST', { key: KEY })).body.token;
    seed(odd.db, 'real', '2026-10-20', [[0, 'first_launch'], [1, 'app_open']]);
    odd.db.prepare("INSERT INTO events (install, id, name, at, day, day_n, tz, mode, version, lang, props, received_at) VALUES ('badmonth00000000', 'x1', 'first_launch', ?, '2026-13-40', 0, 'UTC', 'browser', '1.2', 'ru', NULL, ?)").run(NOW, NOW);
    seed(odd.db, 'future', '2099-01-01', [[0, 'first_launch']]);
    seed(odd.db, 'ancient', '1970-01-01', [[0, 'first_launch']]);
    for (const period of ['7', '30', 'all']) {
      const r = await call(odd.base, `/api/owner/stats?period=${period}`, t);
      assert.equal(r.status, 200, period);
      assert.equal(r.body.to, '2026-10-28', period);
    }
    const all = (await call(odd.base, '/api/owner/stats?period=all', t)).body;
    assert.equal(all.installs, 1);
    assert.equal(all.from, '2026-10-20');
  });

  it('100 000 events in well under a second and a half', async () => {
    const big = await start({ ownerToken: KEY });
    const t = (await call(big.base, '/api/owner/login', null, 'POST', { key: KEY })).body.token;
    big.db.exec('BEGIN');
    for (let i = 0; i < 2000; i++) {
      const evs = [[0, 'first_launch'], [0, 'plant', { seed: false, generation: 1 }]];
      for (let k = 0; k < 48; k++) evs.push([k % 25, k % 3 ? 'water' : 'app_open']);
      seed(big.db, `big${i}`, addDays('2026-09-01', i % 40), evs, { mode: ['browser', 'standalone', 'android'][i % 3] });
    }
    big.db.exec('COMMIT');
    const started = performance.now();
    const r = await call(big.base, '/api/owner/stats?period=all', t);
    const took = performance.now() - started;
    assert.equal(r.status, 200);
    assert.equal(r.body.installs, 2000);
    assert.ok(took < 1500, `took ${Math.round(took)} ms`);
  });
});
