import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it, test } from 'node:test';
import { createApp } from '../src/app.js';
import { backupsDir, dailyBackup, dailyDue, listDaily, openSealed } from '../src/backup.js';
import { backupBeforeStart, openDb } from '../src/db.js';

test('backup before start: a whole copy of the base, the last 10 kept', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oyuur-backup-'));
  try {
    const path = join(dir, 'oyuur.db');
    assert.equal(backupBeforeStart(path), null, 'no base yet — nothing to copy');
    const db = openDb(path);
    db.prepare("INSERT INTO users (id, nick, pass_salt, pass_hash, created_at) VALUES ('u1', 'sasha', 's', 'h', 1)").run();
    // The previous version still has the file open while the copy is taken.
    const file = backupBeforeStart(path, new Date('2026-10-29T10:00:00Z'));
    const copy = openDb(file);
    assert.equal(copy.prepare('SELECT nick FROM users').get().nick, 'sasha');
    copy.close();
    for (let i = 1; i <= 12; i++) backupBeforeStart(path, new Date(Date.UTC(2026, 9, 29, 11, i)));
    const kept = readdirSync(join(dir, 'backups')).filter((f) => f.endsWith('.db'));
    assert.equal(kept.length, 10);
    assert.ok(!kept.includes('start-2026-10-29T10-00-00-000Z.db'), 'the oldest copies go');
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- The daily copy and the owner's download (OYUUR-36) ----

const KEY = 'owner-key-0123456789-abcdef';

function freshBase() {
  const dir = mkdtempSync(join(tmpdir(), 'oyuur-daily-'));
  const path = join(dir, 'oyuur.db');
  const db = openDb(path);
  db.prepare("INSERT INTO users (id, nick, pass_salt, pass_hash, created_at) VALUES ('u1', 'sasha', 's', 'h', 1)").run();
  return { dir, path, db, backups: backupsDir(path) };
}

test('daily copy: whole, with its checksum; 14 kept, start-* untouched', async () => {
  const { dir, path, db, backups } = freshBase();
  try {
    backupBeforeStart(path, new Date('2026-10-01T00:00:00Z'));
    const file = await dailyBackup(path, new Date(2026, 9, 1, 4, 0));
    assert.equal(file, join(backups, 'daily-2026-10-01.db'));
    const copy = openDb(file);
    assert.equal(copy.prepare('SELECT nick FROM users').get().nick, 'sasha');
    copy.close();
    assert.match(readFileSync(`${file}.sha256`, 'utf8'), /^[0-9a-f]{64}$/);
    for (let d = 2; d <= 20; d++) await dailyBackup(path, new Date(2026, 9, d, 4, 0));
    const daily = readdirSync(backups).filter((f) => /^daily-.*\.db$/.test(f)).sort();
    assert.equal(daily.length, 14);
    assert.equal(daily[0], 'daily-2026-10-07.db', 'the oldest go');
    assert.equal(readdirSync(backups).filter((f) => f.endsWith('.sha256')).length, 14, 'their checksums go too');
    assert.equal(readdirSync(backups).filter((f) => f.startsWith('start-')).length, 1);
    assert.ok(!readdirSync(backups).some((f) => f.endsWith('.tmp')));
    assert.equal(listDaily(backups)[0].day, '2026-10-20');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('daily copy: due after 4:00 once a day, or at once if yesterday was missed', async () => {
  const { dir, path, db, backups } = freshBase();
  try {
    assert.equal(dailyDue(backups, new Date(2026, 9, 29, 2, 0)), true, 'nothing at all — now');
    await dailyBackup(path, new Date(2026, 9, 28, 4, 0));
    assert.equal(dailyDue(backups, new Date(2026, 9, 29, 2, 0)), false, 'yesterday is there — wait for 4:00');
    assert.equal(dailyDue(backups, new Date(2026, 9, 29, 4, 0)), true);
    await dailyBackup(path, new Date(2026, 9, 29, 4, 0));
    assert.equal(dailyDue(backups, new Date(2026, 9, 29, 23, 0)), false, 'one a day');
    assert.equal(dailyDue(backups, new Date(2026, 10, 2, 1, 0)), true, 'the server was off for days');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('daily copy: half-made copies of a killed server are swept after an hour', async () => {
  const { dir, path, db, backups } = freshBase();
  try {
    await dailyBackup(path, new Date(2026, 9, 27, 4, 0));
    const stale = join(backups, 'daily-2026-10-28.db.123-abc.tmp');
    const fresh = join(backups, 'daily-2026-10-28.db.456-def.tmp');
    writeFileSync(stale, 'half');
    writeFileSync(fresh, 'half');
    const old = new Date(Date.now() - 2 * 3_600_000);
    utimesSync(stale, old, old);
    await dailyBackup(path, new Date(2026, 9, 28, 4, 0));
    const left = readdirSync(backups);
    assert.ok(!left.includes('daily-2026-10-28.db.123-abc.tmp'));
    assert.ok(left.includes('daily-2026-10-28.db.456-def.tmp'), 'a copy in the making right now is left alone');
    assert.deepEqual(listDaily(backups).map((c) => c.day), ['2026-10-28', '2026-10-27']);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('daily copy: a broken base is logged, not thrown', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oyuur-daily-'));
  try {
    const path = join(dir, 'oyuur.db');
    writeFileSync(path, 'not a database at all, just text');
    const error = console.error;
    console.error = () => {};
    try {
      assert.equal(await dailyBackup(path, new Date(2026, 9, 29, 4, 0)), null);
    } finally {
      console.error = error;
    }
    assert.deepEqual(listDaily(backupsDir(path)), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('owner: download the latest copy', () => {
  let base;
  let server;
  let off;
  let fresh;
  before(async () => {
    fresh = freshBase();
    await dailyBackup(fresh.path, new Date(2026, 9, 28, 4, 0));
    server = createApp({ db: fresh.db, ownerToken: KEY, backupDir: fresh.backups });
    await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${server.address().port}`;
    off = createApp({ db: fresh.db, backupDir: fresh.backups });
    await new Promise((ok) => off.listen(0, '127.0.0.1', ok));
  });
  after(() => {
    server.close();
    off.close();
    fresh.db.close();
    rmSync(fresh.dir, { recursive: true, force: true });
  });
  const login = async (key = KEY, ip = '10.9.0.1') =>
    fetch(`${base}/api/owner/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ key }) });
  const get = (path, token, at = base) => fetch(at + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  it('without OWNER_TOKEN — 404', async () => {
    const at = `http://127.0.0.1:${off.address().port}`;
    assert.equal((await get('/api/owner/backup/latest', null, at)).status, 404);
    assert.equal((await get('/api/owner/backup', 'x', at)).status, 404);
  });

  it('with a wrong key or no session — 401', async () => {
    assert.equal((await login('wrong-key-0123456789-zzzz')).status, 401);
    assert.equal((await get('/api/owner/backup/latest')).status, 401);
    assert.equal((await get('/api/owner/backup/latest', 'made-up-token')).status, 401);
  });

  it('with the key — what there is, and a file that opens with the same code', async () => {
    const { token } = await (await login()).json();
    const info = await (await get('/api/owner/backup', token)).json();
    assert.equal(info.latest.day, '2026-10-28');
    assert.equal(info.latest.name, 'daily-2026-10-28.db');
    assert.ok(info.latest.size > 0);

    const res = await get('/api/owner/backup/latest', token);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-disposition'), 'attachment; filename="oyuur-2026-10-28.oyuurbak"');
    assert.equal(res.headers.get('x-backup-sha256'), readFileSync(join(fresh.backups, 'daily-2026-10-28.db.sha256'), 'utf8'));
    const sealed = Buffer.from(await res.arrayBuffer());
    assert.equal(sealed.subarray(0, 8).toString(), 'OYUURBK1');
    assert.ok(!sealed.includes(Buffer.from('sasha')), 'nothing readable inside');

    const enc = join(fresh.dir, 'got.oyuurbak');
    const out = join(fresh.dir, 'restored.db');
    writeFileSync(enc, sealed);
    assert.equal(await openSealed(enc, KEY, out), res.headers.get('x-backup-sha256'));
    const restored = new DatabaseSync(out);
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(restored.prepare('SELECT nick FROM users').get().nick, 'sasha');
    restored.close();

    await assert.rejects(openSealed(enc, 'another-key-0123456789-abc', join(fresh.dir, 'x.db')), /wrong_key_or_damaged/);
    const broken = Buffer.from(sealed);
    broken[broken.length - 40] ^= 1;
    writeFileSync(enc, broken);
    await assert.rejects(openSealed(enc, KEY, join(fresh.dir, 'y.db')), /wrong_key_or_damaged/);
    assert.ok(!readdirSync(fresh.dir).some((f) => f.startsWith('x.db') || f.startsWith('y.db')), 'nothing half-written left');
  });

  it('a few downloads an hour', async () => {
    const { token } = await (await login(KEY, '10.9.0.2')).json();
    let last = 0;
    for (let i = 0; i < 12; i++) {
      const r = await get('/api/owner/backup/latest', token);
      await r.arrayBuffer();
      last = r.status;
    }
    assert.equal(last, 429);
  });
});
