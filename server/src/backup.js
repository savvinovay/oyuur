// Daily copies of the base (OYUUR-36) and the owner's encrypted download of the latest one.
//
// On the server: /data/backups/daily-YYYY-MM-DD.db (server's local date), made once a day after 4:00
// with VACUUM INTO in a worker thread (requests keep going), 14 kept. Next to each: <name>.sha256.
//
// The owner's file (.oyuurbak), everything after the header is AES-256-GCM:
//   "OYUURBK1"   8 bytes  — what this is, version 1
//   salt        16 bytes  — for scrypt
//   iv          12 bytes  — for AES-GCM
//   sha256      32 bytes  — of the plain .db, checked after unpacking
//   ciphertext   …        — AES-256-GCM(gzip(the .db))
//   tag         16 bytes  — GCM's seal over the header (as AAD) and the ciphertext
// key = scrypt(OWNER_TOKEN, salt, 32 bytes, N=2^14, r=8, p=1). A new salt and iv every download.
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt } from 'node:crypto';
import { closeSync, createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Worker } from 'node:worker_threads';
import { createGunzip, createGzip } from 'node:zlib';

export const DAILY_KEEP = 14;
/** From this hour (server's local time) today's copy is due. */
export const DAILY_HOUR = 4;
const DAILY = /^daily-(\d{4}-\d{2}-\d{2})\.db$/;

const MAGIC = Buffer.from('OYUURBK1');
const HEADER = MAGIC.length + 16 + 12 + 32;
const TAG = 16;
const KDF = { N: 2 ** 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const backupsDir = (dbPath) => join(dirname(dbPath), 'backups');
const dayOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Daily copies, newest first: { name, day, file, size, at }. */
export function listDaily(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => DAILY.test(f))
    .sort()
    .reverse()
    .map((name) => {
      const file = join(dir, name);
      const st = statSync(file);
      return { name, day: DAILY.exec(name)[1], file, size: st.size, at: st.mtimeMs };
    });
}

/**
 * Whether a copy should be made now: today's isn't there, and it's past 4:00 — or it's earlier
 * but yesterday's is missing too (the server was off): then right away, not waiting for 4:00.
 */
export function dailyDue(dir, now = new Date()) {
  const have = new Set(listDaily(dir).map((c) => c.day));
  if (have.has(dayOf(now))) return false;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  return now.getHours() >= DAILY_HOUR || !have.has(dayOf(yesterday));
}

// Runs in a worker thread: VACUUM INTO a temporary name, hash it, then give it its real name, so a
// half-made copy never looks like a copy. The main thread keeps answering requests meanwhile.
const WORKER = `
const { workerData: w, parentPort } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
// A name of its own: during a deploy the old and the new server may both be making today's copy.
const tmp = w.file + '.' + process.pid + '-' + Math.random().toString(36).slice(2) + '.tmp';
try {
  const src = new DatabaseSync(w.dbPath);
  try {
    src.exec('PRAGMA busy_timeout = 10000;');
    src.prepare('VACUUM INTO ?').run(tmp);
  } finally {
    src.close();
  }
  const hash = createHash('sha256');
  const buf = Buffer.alloc(1 << 20);
  const fd = fs.openSync(tmp, 'r');
  try {
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) hash.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, w.file);
  fs.writeFileSync(tmp + '.sha256', hash.digest('hex'));
  fs.renameSync(tmp + '.sha256', w.file + '.sha256');
} catch (error) {
  fs.rmSync(tmp, { force: true });
  fs.rmSync(tmp + '.sha256', { force: true });
  throw error;
}
parentPort.postMessage('ok');
`;

function vacuumInWorker(dbPath, file) {
  return new Promise((ok, no) => {
    const worker = new Worker(WORKER, { eval: true, workerData: { dbPath, file } });
    let done = false;
    worker.once('message', () => { done = true; ok(); });
    worker.once('error', no);
    worker.once('exit', (code) => { if (!done) no(new Error(`backup worker exited with ${code}`)); });
  });
}

/**
 * Makes today's copy (daily-YYYY-MM-DD.db) and keeps the newest 14. Never throws: a failed copy
 * is logged and the server goes on. Returns the file, or null.
 */
export async function dailyBackup(dbPath, now = new Date()) {
  if (dbPath === ':memory:' || !existsSync(dbPath)) return null;
  const dir = backupsDir(dbPath);
  const file = join(dir, `daily-${dayOf(now)}.db`);
  try {
    mkdirSync(dir, { recursive: true });
    sweepLeftovers(dir);
    // Not enough room for one more copy: let the oldest go first (13 stay), and if that's still
    // not enough, don't try at all — a full disk would break the base itself, not just the copy.
    const need = statSync(dbPath).size * 1.2 + 16 * 1024 * 1024;
    const daily = listDaily(dir);
    if (freeBytes(dir) < need && daily.length >= DAILY_KEEP) removeCopy(daily[daily.length - 1]);
    if (freeBytes(dir) < need) throw new Error(`not enough disk space: ${Math.round(freeBytes(dir) / 1048576)} MB free, need ${Math.round(need / 1048576)} MB`);
    await vacuumInWorker(dbPath, file);
    for (const c of listDaily(dir).slice(DAILY_KEEP)) removeCopy(c);
    console.log(`daily backup: ${file}`);
    return file;
  } catch (error) {
    console.error('DAILY BACKUP FAILED', error);
    return null;
  }
}

const removeCopy = (c) => {
  rmSync(c.file, { force: true });
  rmSync(`${c.file}.sha256`, { force: true });
};
const freeBytes = (dir) => {
  const s = statfsSync(dir);
  return s.bavail * s.bsize;
};
/** Half-made copies of a server that was killed mid-copy (out of memory, a deploy): over an hour old. */
function sweepLeftovers(dir) {
  const hour = Date.now() - 3_600_000;
  for (const f of readdirSync(dir)) {
    if (!/^daily-.*\.tmp(\.sha256)?$/.test(f)) continue;
    try {
      if (statSync(join(dir, f)).mtimeMs < hour) rmSync(join(dir, f), { force: true });
    } catch {}
  }
}

/** Checks every 10 minutes whether a copy is due (and once right away). Returns stop(). */
export function scheduleDailyBackups(dbPath, clock = () => new Date()) {
  if (dbPath === ':memory:') return () => {};
  const dir = backupsDir(dbPath);
  let running = false;
  // After a failure (a full disk, say) the next try is in an hour, not in 10 minutes.
  let retryAt = 0;
  const tick = async () => {
    if (running || Date.now() < retryAt) return;
    running = true;
    try {
      const now = clock();
      if (dailyDue(dir, now) && !(await dailyBackup(dbPath, now))) retryAt = Date.now() + 3_600_000;
    } catch (error) {
      console.error('DAILY BACKUP CHECK FAILED', error);
    } finally {
      running = false;
    }
  };
  tick();
  const timer = setInterval(tick, 10 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

/** The plain copy's sha256 (hex): from <name>.sha256, or counted now and kept there. */
export async function copyHash(file) {
  const side = `${file}.sha256`;
  if (existsSync(side)) {
    const hex = readFileSync(side, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(hex)) return hex;
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const hex = hash.digest('hex');
  try { writeFileSync(side, hex); } catch {}
  return hex;
}

const deriveKey = (secret, salt) => new Promise((ok, no) => scrypt(secret, salt, 32, KDF, (e, key) => (e ? no(e) : ok(key))));

/** The header and a cipher for one download of `sha256hex` (the plain copy's hash). */
export async function sealer(secret, sha256hex) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const header = Buffer.concat([MAGIC, salt, iv, Buffer.from(sha256hex, 'hex')]);
  const cipher = createCipheriv('aes-256-gcm', await deriveKey(secret, salt), iv);
  cipher.setAAD(header);
  return { header, cipher };
}

/**
 * Writes the copy `file` to `out` (a writable stream: the HTTP answer) as an .oyuurbak:
 * header, gzip + AES-256-GCM, tag at the end. Rejects if anything breaks on the way.
 */
export async function writeSealed(file, sha256hex, secret, out) {
  const { header, cipher } = await sealer(secret, sha256hex);
  out.write(header);
  await pipeline(createReadStream(file), createGzip(), cipher, out, { end: false });
  out.end(cipher.getAuthTag());
}

/**
 * Opens an .oyuurbak (the owner's computer, tests): checks the seal, unpacks to `outFile` and
 * checks the sha256. Throws 'not_a_backup', 'wrong_key_or_damaged' or 'checksum'. Returns the sha256.
 */
export async function openSealed(inFile, secret, outFile) {
  const size = statSync(inFile).size;
  if (size < HEADER + TAG) throw new Error('not_a_backup');
  const fd = openSync(inFile, 'r');
  const header = Buffer.alloc(HEADER);
  const tag = Buffer.alloc(TAG);
  try {
    readSync(fd, header, 0, HEADER, 0);
    readSync(fd, tag, 0, TAG, size - TAG);
  } finally {
    closeSync(fd);
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not_a_backup');
  const salt = header.subarray(8, 24);
  const iv = header.subarray(24, 36);
  const want = header.subarray(36, 68).toString('hex');
  const decipher = createDecipheriv('aes-256-gcm', await deriveKey(secret, salt), iv);
  decipher.setAAD(header);
  decipher.setAuthTag(tag);
  const hash = createHash('sha256');
  const tmp = `${outFile}.part`;
  try {
    await pipeline(
      createReadStream(inFile, { start: HEADER, end: size - TAG - 1 }),
      decipher,
      createGunzip(),
      async function* (chunks) {
        for await (const c of chunks) {
          hash.update(c);
          yield c;
        }
      },
      createWriteStream(tmp),
    );
  } catch (error) {
    rmSync(tmp, { force: true });
    // A wrong key or a damaged file shows as a broken seal (or as broken gzip before it).
    throw new Error('wrong_key_or_damaged', { cause: error });
  }
  const got = hash.digest('hex');
  if (got !== want) {
    rmSync(tmp, { force: true });
    throw new Error('checksum');
  }
  rmSync(outFile, { force: true });
  renameSync(tmp, outFile);
  return got;
}
