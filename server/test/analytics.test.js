import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { cleanEvent, EVENTS, KEEP_MS } from '../src/analytics.js';
import { createApp } from '../src/app.js';
import { openDb } from '../src/db.js';

// A fixed clock: 2026-10-28 noon UTC.
const NOW = Date.parse('2026-10-28T12:00:00Z');

let db;
let server;
let base;

before(async () => {
  db = openDb(':memory:');
  server = createApp({ db, now: () => NOW });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function post(body, ip = '10.0.0.1', to = base) {
  const res = await fetch(`${to}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

let n = 0;
const install = () => `install-${String(++n).padStart(4, '0')}-abcdefgh`;
const event = (over = {}) => ({
  id: `ev${++n}abcdef`,
  name: 'water',
  at: NOW - 60_000,
  day: '2026-10-28',
  dayN: 3,
  tz: 'Asia/Yakutsk',
  mode: 'standalone',
  v: '1.0',
  lang: 'ru',
  ...over,
});
const rows = (inst) => db.prepare('SELECT * FROM events WHERE install = ? ORDER BY rowid').all(inst);

describe('events', () => {
  it('takes a batch without sign-in and keeps only listed fields', async () => {
    const inst = install();
    const r = await post({
      install: inst,
      events: [
        event({ name: 'first_launch', props: { existing: true, habit: 'не курить' }, nick: 'sasha', text: 'секрет' }),
        event({ name: 'purchase', props: { item: 'tree:birch' } }),
        event({ name: 'plant', props: { seed: true, generation: 2, name: 'Бросить пить' } }),
      ],
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { ok: true, added: 3, dropped: 0 });
    const got = rows(inst);
    assert.deepEqual(got.map((x) => x.name), ['first_launch', 'purchase', 'plant']);
    assert.deepEqual(JSON.parse(got[0].props), { existing: true });
    assert.deepEqual(JSON.parse(got[2].props), { seed: true, generation: 2 });
    // Times to the hour only: an exact one would match the account's creation time.
    assert.equal(got[0].at % 3_600_000, 0);
    assert.equal(got[0].received_at % 3_600_000, 0);
    assert.deepEqual(Object.keys(got[0]).sort(), ['at', 'day', 'day_n', 'id', 'install', 'lang', 'mode', 'name', 'props', 'received_at', 'tz', 'version']);
    // No address and no texts anywhere.
    const all = JSON.stringify(got);
    for (const word of ['10.0.0.1', 'не курить', 'sasha', 'секрет', 'Бросить']) assert.ok(!all.includes(word), word);
  });

  it('a repeated batch adds nothing (event ids)', async () => {
    const inst = install();
    const batch = { install: inst, events: [event(), event({ name: 'app_open' })] };
    assert.equal((await post(batch)).body.added, 2);
    const again = await post(batch);
    assert.deepEqual(again.body, { ok: true, added: 0, dropped: 0 });
    assert.equal(rows(inst).length, 2);
  });

  it('drops events that are not on the list or have bad fields, keeps the rest', async () => {
    const inst = install();
    const r = await post({
      install: inst,
      events: [
        event(),
        event({ name: 'habit_named' }),
        event({ mode: 'desktop' }),
        event({ day: 'вчера' }),
        event({ at: NOW + 30 * 86_400_000 }),
        event({ lang: 'russian' }),
        event({ dayN: -1 }),
        event({ id: 'x' }),
        event({ name: 'purchase', props: { item: 'Моё дерево' } }),
        'water',
        null,
      ],
    });
    assert.deepEqual(r.body, { ok: true, added: 2, dropped: 9 });
    const bought = rows(inst).find((x) => x.name === 'purchase');
    assert.equal(bought.props, null);
  });

  it('refuses a bad or too big batch', async () => {
    assert.equal((await post({ install: 'short', events: [] })).status, 400);
    assert.equal((await post({ install: install() })).status, 400);
    assert.equal((await post('{nope')).status, 400);
    const many = Array.from({ length: 51 }, () => event());
    assert.equal((await post({ install: install(), events: many })).status, 413);
    const huge = { install: install(), events: [event({ props: { pad: 'x'.repeat(30_000) } })] };
    assert.equal((await post(huge)).status, 413);
  });

  it('limits batches per install and per address', async () => {
    const inst = install();
    let last;
    for (let i = 0; i < 31; i++) last = await post({ install: inst, events: [] }, '10.7.0.1');
    assert.equal(last.status, 429);
    // Another install from another address is fine.
    assert.equal((await post({ install: install(), events: [] }, '10.7.0.2')).status, 200);
    for (let i = 0; i < 121; i++) last = await post({ install: install(), events: [] }, '10.8.0.1');
    assert.equal(last.status, 429);
    // Many installs from one address: at most 5000 events a day from it.
    let status = 200;
    for (let i = 0; i < 101 && status === 200; i++) {
      status = (await post({ install: install(), events: Array.from({ length: 50 }, () => event()) }, '10.9.0.1')).status;
    }
    assert.equal(status, 429);
  });

  it('every event name has a rule, and the cleaner keeps only the known fields', () => {
    for (const name of Object.keys(EVENTS)) assert.ok(cleanEvent(event({ name }), NOW), name);
    assert.equal(cleanEvent(event({ name: 'toString' }), NOW), null);
    assert.equal(cleanEvent(event({ name: '__proto__' }), NOW), null);
    const e = cleanEvent(event({ name: 'login', props: { recover: 'yes', extra: 1 } }), NOW);
    assert.equal(e.props, null);
  });

  it('events older than 180 days go in the housekeeping', async () => {
    const inst = install();
    await post({ install: inst, events: [event(), event()] });
    assert.equal(rows(inst).length, 2);
    // A day before the limit: still there.
    const early = createApp({ db, now: () => NOW + KEEP_MS - 86_400_000 });
    assert.equal(rows(inst).length, 2);
    // The server started 181 days later sweeps at once.
    const late = createApp({ db, now: () => NOW + KEEP_MS + 86_400_000 });
    assert.equal(rows(inst).length, 0);
    early.close();
    late.close();
  });
});
