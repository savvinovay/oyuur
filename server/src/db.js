// The server's storage: one SQLite file (on the homelab's persistent disk), built into Node.
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nick TEXT NOT NULL UNIQUE,
  pass_salt TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  -- The recovery code (there is no e-mail), hashed like the password.
  rec_salt TEXT,
  rec_hash TEXT,
  name TEXT,
  avatar TEXT NOT NULL DEFAULT 'fox',
  color INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  -- What friends may see: trees marked "friends", their places, the meadow, the hidden count.
  public TEXT,
  public_at INTEGER,
  -- 1: the account was deleted; only the row is left (shared trees of others point to it).
  deleted INTEGER NOT NULL DEFAULT 0,
  -- Blocked by the owner after a report: can't sign in, friends don't see them. Nothing is deleted.
  banned_at INTEGER,
  -- The forest in the account (OYUUR-30): a counter of changes and the forest's "epoch" (+1 on "erase all").
  rev INTEGER NOT NULL DEFAULT 0,
  epoch INTEGER NOT NULL DEFAULT 0,
  -- Sign-in: 1 — the password itself comes to the server (old); 2 — only a key made from it on the
  -- phone (pass_* / rec_* then hold a hash of that key). kdf / rec_kdf: how the phone makes the keys.
  auth_v INTEGER NOT NULL DEFAULT 1,
  kdf TEXT,
  rec_kdf TEXT,
  -- The data key locked with the password / the code, and its id (OYUUR-31 fills them).
  wrap_p TEXT,
  wrap_r TEXT,
  key_id TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
-- One row per pair, a < b. Pending until the other side accepts.
CREATE TABLE IF NOT EXISTS friends (
  a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE TABLE IF NOT EXISTS blocks (
  blocker TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter TEXT NOT NULL,
  target TEXT NOT NULL,
  -- A report about a tree's name; null — about the person.
  tree_id TEXT,
  reason TEXT NOT NULL,
  text TEXT,
  created_at INTEGER NOT NULL,
  -- How the owner handled it: 'dismissed', 'name_hidden' or 'banned'; null — still open.
  resolution TEXT,
  resolved_by TEXT,
  resolved_at INTEGER
);
-- Tree names the owner hid after a report: friends see a neutral name instead.
CREATE TABLE IF NOT EXISTS hidden_names (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tree_id TEXT NOT NULL,
  -- The habit (lineageId): the next generation of the tree is hidden too.
  lineage_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, tree_id)
);
-- The owner's page (complaints now, analytics later): signed in with OWNER_TOKEN.
-- key_hash ties a session to the key it was opened with: a new key ends old sessions.
CREATE TABLE IF NOT EXISTS owner_sessions (
  token_hash TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cheers (
  sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (sender, receiver, day)
);
CREATE TABLE IF NOT EXISTS shared_trees (
  id TEXT PRIMARY KEY,
  proposer TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  skin TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'active', 'declined', 'ended')),
  planted_on TEXT,
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE TABLE IF NOT EXISTS shared_waterings (
  tree_id TEXT NOT NULL REFERENCES shared_trees(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (tree_id, user_id, day)
);
-- The forest in the account (OYUUR-30): one row per open tree ('tree:<id>'), 'plot', 'progress', 'vault'.
-- rev: the account's rev when it was written. deleted = 1 — a tombstone (body is null).
CREATE TABLE IF NOT EXISTS records (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  rev INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  body TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
-- When the server first saw each watering (late waterings, spec 4.2): kept, shown nowhere yet.
CREATE TABLE IF NOT EXISTS watering_seen (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tree_id TEXT NOT NULL,
  day TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user_id, tree_id, day)
);
-- "Forgot the password", step 2: a one-time ticket for 10 minutes (only its hash is kept).
CREATE TABLE IF NOT EXISTS recover_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
-- The server's own settings, e.g. its secret (made once, on the first start).
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_rev ON records(user_id, rev);
CREATE INDEX IF NOT EXISTS friends_b ON friends(b);
CREATE INDEX IF NOT EXISTS reports_target ON reports(target);
CREATE INDEX IF NOT EXISTS cheers_receiver ON cheers(receiver, seen);
CREATE INDEX IF NOT EXISTS shared_partner ON shared_trees(partner);
CREATE INDEX IF NOT EXISTS shared_proposer ON shared_trees(proposer);
`;

/** Opens (and creates) the database. ':memory:' for tests. */
export function openDb(path) {
  const db = new DatabaseSync(path);
  // secure_delete: what is deleted (a tree made private, an account) is overwritten with zeros in the file.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000; PRAGMA secure_delete = ON;');
  db.exec(SCHEMA);
  // Columns added after the first deploy.
  const cols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const users = cols('users');
  if (!users.includes('deleted')) db.exec('ALTER TABLE users ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0');
  if (!users.includes('banned_at')) db.exec('ALTER TABLE users ADD COLUMN banned_at INTEGER');
  for (const c of [
    'rev INTEGER NOT NULL DEFAULT 0',
    'epoch INTEGER NOT NULL DEFAULT 0',
    'auth_v INTEGER NOT NULL DEFAULT 1',
    'kdf TEXT',
    'rec_kdf TEXT',
    'wrap_p TEXT',
    'wrap_r TEXT',
    'key_id TEXT',
  ]) {
    if (!users.includes(c.split(' ')[0])) db.exec(`ALTER TABLE users ADD COLUMN ${c}`);
  }
  const reports = cols('reports');
  for (const c of ['resolution TEXT', 'resolved_by TEXT', 'resolved_at INTEGER']) {
    if (!reports.includes(c.split(' ')[0])) db.exec(`ALTER TABLE reports ADD COLUMN ${c}`);
  }
  if (!cols('hidden_names').includes('lineage_id')) db.exec('ALTER TABLE hidden_names ADD COLUMN lineage_id TEXT');
  return db;
}

/** A secret of this server, made at random the first time it is asked for and kept in the base. */
export function serverSecret(db, name) {
  db.prepare('INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)').run(`secret:${name}`, randomBytes(32).toString('hex'));
  return Buffer.from(db.prepare('SELECT value FROM meta WHERE key = ?').get(`secret:${name}`).value, 'hex');
}

/** How many copies made at start are kept (newest first); older ones go. */
const START_BACKUPS = 10;

/**
 * A copy of the base before this version opens it: <dir>/backups/start-<time>.db. Taken with
 * VACUUM INTO, so it is whole even while the previous version is still running on the same file.
 * Keeps the last 10. A failed copy is logged and the server starts anyway (no copy beats no server).
 */
export function backupBeforeStart(path, now = new Date()) {
  if (path === ':memory:' || !existsSync(path)) return null;
  const dir = join(dirname(path), 'backups');
  try {
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `start-${now.toISOString().replace(/[:.]/g, '-')}.db`);
    const src = new DatabaseSync(path);
    try {
      src.exec('PRAGMA busy_timeout = 10000;');
      src.prepare('VACUUM INTO ?').run(file);
    } finally {
      src.close();
    }
    const old = readdirSync(dir).filter((f) => /^start-.*\.db$/.test(f)).sort().reverse().slice(START_BACKUPS);
    for (const f of old) rmSync(join(dir, f), { force: true });
    console.log(`backup before start: ${file}`);
    return file;
  } catch (error) {
    console.error('BACKUP BEFORE START FAILED', error);
    return null;
  }
}
