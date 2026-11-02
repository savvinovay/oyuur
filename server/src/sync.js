// The forest in the account (OYUUR-30, design/oyuur-30/план.md, «Договорённость о формате»;
// design/oyuur-29/спец.md, Т1–Т2). The phone keeps its forest as records: one per open tree
// ('tree:<id>'), the open part of the plot ('plot'), acorns / shop / quests ('progress') and,
// from OYUUR-31, the locked chest of hidden trees ('vault'). The server never merges: a record
// is written only if the phone based its change on the record's current rev, otherwise the
// server's version goes back as a conflict and the phone merges it (app/src/game/merge.ts).
// Hidden trees never come here as trees: a 'tree:*' that isn't "friends" is refused.
// What friends see (users.public) is rebuilt from the records after every write.

/** Records a GET gives at a time: at most this many, and about this many bytes of bodies. */
const PAGE_RECORDS = 500;
const PAGE_BYTES = 2 * 1024 * 1024;
/** The body of POST /api/sync (app.js reads it with this limit). */
export const SYNC_BODY_LIMIT = 1.5 * 1024 * 1024;
/** One record's body, as JSON. */
// progress carries the acorn journal (a key per watering of the last 60 days): ~80 trees need
// about 256 KB, so it has room for a few times that (Т1.2).
const RECORD_LIMIT = { tree: 128 * 1024, plot: 256 * 1024, progress: 1024 * 1024, vault: 1024 * 1024 };
/** Live 'tree:*' records an account may have (tombstones don't count). */
const MAX_TREES = 1000;
/** Places on the plot are kept from its centre: -20…20 each way. */
const MAX_OFFSET = 20;
const MIN_PLOT = 4;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TREE_ID = /^[A-Za-z0-9_-]{1,40}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isDay = (v) => typeof v === 'string' && DAY.test(v);
const isStr = (v, max) => typeof v === 'string' && v.length <= max;
const orNull = (v, test) => v === null || v === undefined || test(v);
const bytes = (text) => Buffer.byteLength(text, 'utf8');
const kindOf = (key) => (key.startsWith('tree:') ? 'tree' : key);

/** A tree as the phone keeps it (Tree in app/src/game/tree.ts): types only, the fields are kept as sent. */
function goodTree(t, id) {
  return (
    isObj(t) &&
    t.id === id &&
    isStr(t.lineageId, 40) && t.lineageId.length > 0 &&
    isStr(t.name, 200) &&
    orNull(t.nickname, (v) => isStr(v, 60)) &&
    (t.kind === 'do' || t.kind === 'quit') &&
    isStr(t.skin, 20) &&
    isDay(t.plantedOn) &&
    Array.isArray(t.checkins) && t.checkins.length <= 20_000 && t.checkins.every(isDay) &&
    orNull(t.frozen, (v) => Array.isArray(v) && v.length <= 20_000 && v.every(isDay)) &&
    orNull(t.chancesLeft, Number.isInteger) &&
    orNull(t.generation, (v) => Number.isInteger(v) && v >= 1) &&
    orNull(t.diedOn, isDay) &&
    orNull(t.completedOn, isDay) &&
    orNull(t.openHours, Array.isArray) &&
    orNull(t.stamps, (s) => isObj(s) && Object.values(s).every((v) => isStr(v, 100)))
  );
}

/** The open part of the plot: { places: { lineageId: {dc, dr, at} } }, offsets from the centre. */
function goodPlot(p) {
  if (!isObj(p) || !isObj(p.places)) return false;
  const places = Object.entries(p.places);
  return (
    places.length <= 5000 &&
    places.every(
      ([id, at]) =>
        id.length <= 40 && isObj(at) &&
        Number.isInteger(at.dc) && Math.abs(at.dc) <= MAX_OFFSET &&
        Number.isInteger(at.dr) && Math.abs(at.dr) <= MAX_OFFSET &&
        orNull(at.at, (v) => isStr(v, 100)),
    )
  );
}

/** The chest (OYUUR-31): opaque to the server, only its envelope is checked. */
const goodVault = (v) =>
  isObj(v) && v.v === 1 && isStr(v.kid, 200) && B64URL.test(v.kid) && Number.isInteger(v.seq) && v.seq >= 0 &&
  isStr(v.n, 200) && B64URL.test(v.n) && typeof v.c === 'string' && B64URL.test(v.c);

/** Whether a record's body is right for its key. 'tree:*' must be open to friends. */
function goodBody(key, body) {
  const kind = kindOf(key);
  if (kind === 'tree') return goodTree(body, key.slice(5)) && body.visibility === 'friends';
  if (kind === 'plot') return goodPlot(body);
  if (kind === 'progress') return isObj(body);
  if (kind === 'vault') return goodVault(body);
  return false;
}

/**
 * What a tombstone of a tree may carry (OYUUR-30): when the phone took it out of the account
 * (its own clock, HLC) and the habit — so another phone compares clocks, not the server's time.
 */
const goodTomb = (key, body) =>
  key.startsWith('tree:') && isObj(body) && Object.keys(body).every((k) => k === 'at' || k === 'lineageId') &&
  isStr(body.at, 100) && orNull(body.lineageId, (v) => isStr(v, 40));

const goodKey = (key) => typeof key === 'string' && (['plot', 'progress', 'vault'].includes(key) || (key.startsWith('tree:') && TREE_ID.test(key.slice(5))));

/**
 * The smallest even side ≥ 4 that holds every place (c = dc + side/2 within 0…side-1), plus a ring
 * of one cell around it — so friends see the forest with a border, as on the phone.
 */
export function plotSide(places) {
  let side = MIN_PLOT;
  for (const { dc, dr } of places) {
    for (const d of [dc, dr]) while (d < -side / 2 || d > side / 2 - 1) side += 2;
  }
  return side + 2;
}

/**
 * The account's forest in the shape PUT /api/forest used to take, for publicView (app.js) to clean:
 * the live open trees, places from the plot's centre turned into cells, the meadow from progress.
 */
export function forestFromRecords(rows) {
  const trees = [];
  let plot = null;
  let progress = null;
  for (const row of rows) {
    if (row.deleted || row.body === null) continue;
    const body = JSON.parse(row.body);
    if (row.key.startsWith('tree:')) trees.push(body);
    else if (row.key === 'plot') plot = body;
    else if (row.key === 'progress') progress = body;
  }
  trees.sort((a, b) => (a.plantedOn < b.plantedOn ? -1 : a.plantedOn > b.plantedOn ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const lineages = new Set(trees.map((t) => (typeof t.lineageId === 'string' ? t.lineageId : t.id)));
  const open = Object.entries(isObj(plot?.places) ? plot.places : {}).filter(([id]) => lineages.has(id));
  const size = plotSide(open.map(([, p]) => p));
  const places = Object.fromEntries(open.map(([id, p]) => [id, { c: p.dc + size / 2, r: p.dr + size / 2 }]));
  const meadow = isObj(progress?.shop) ? progress.shop.meadow : undefined;
  return { trees, plot: { size, places }, meadow };
}

/** The sync routes for createApp, plus what other parts of the server need. */
export function createSync({ db, now, fail, limit, publicView }) {
  const q = {
    user: db.prepare('SELECT rev, epoch, key_id FROM users WHERE id = ?'),
    record: db.prepare('SELECT * FROM records WHERE user_id = ? AND key = ?'),
    since: db.prepare('SELECT * FROM records WHERE user_id = ? AND rev > ? ORDER BY rev LIMIT ?'),
    put: db.prepare(
      'INSERT INTO records (user_id, key, rev, deleted, body, updated_at) VALUES (?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT (user_id, key) DO UPDATE SET rev = excluded.rev, deleted = excluded.deleted, body = excluded.body, updated_at = excluded.updated_at',
    ),
    bump: db.prepare('UPDATE users SET rev = rev + 1 WHERE id = ? RETURNING rev'),
    trees: db.prepare("SELECT count(*) AS n FROM records WHERE user_id = ? AND key LIKE 'tree:%' AND deleted = 0"),
    forest: db.prepare("SELECT * FROM records WHERE user_id = ? AND (key LIKE 'tree:%' OR key IN ('plot', 'progress'))"),
    hasForest: db.prepare("SELECT 1 FROM records WHERE user_id = ? AND (key LIKE 'tree:%' OR key IN ('plot', 'progress')) LIMIT 1"),
    seen: db.prepare('INSERT OR IGNORE INTO watering_seen (user_id, tree_id, day, at) VALUES (?, ?, ?, ?)'),
    setPublic: db.prepare('UPDATE users SET public = ?, public_at = ? WHERE id = ?'),
  };

  /** A record as the phone gets it: the body parsed, the server's time of the write. */
  const out = (row) => ({ key: row.key, rev: row.rev, deleted: !!row.deleted, body: row.body === null ? null : JSON.parse(row.body), at: row.updated_at });

  /** What friends see, from the records: the open trees, their places, the meadow; no count of hidden ones. */
  function rebuildPublic(userId) {
    const forest = forestFromRecords(q.forest.all(userId));
    const view = publicView(forest);
    // publicView keeps sides of up to 30 (what old phones send); places from the centre may need a few more.
    view.plot.size = forest.plot.size;
    q.setPublic.run(JSON.stringify(view), now(), userId);
  }

  /** Writes one record with the next rev of the account; the caller holds the transaction. */
  function write(userId, key, deleted, body) {
    const { rev } = q.bump.get(userId);
    q.put.run(userId, key, rev, deleted ? 1 : 0, body, now());
    return rev;
  }

  /** The waterings the server hasn't seen in this tree before: when they first came. */
  function noteWaterings(userId, treeId, before, after) {
    const had = new Set(before?.checkins ?? []);
    const t = now();
    for (const day of after.checkins) if (!had.has(day)) q.seen.run(userId, treeId, day, t);
  }

  function inTransaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  const routes = [
    // Everything after `since` (0 — all), oldest first, in pages; `more` — ask again with since = rev.
    ['GET', '/api/sync', ({ user, query, ip }) => {
      limit(`sync:${user.id}`, 300, 60_000);
      limit(`syncip:${ip}`, 600, 60_000);
      const raw = query.get('since') ?? '0';
      if (!/^\d{1,15}$/.test(raw)) fail(400, 'bad_since');
      const rows = q.since.all(user.id, Number(raw), PAGE_RECORDS + 1);
      const records = [];
      let size = 0;
      for (const row of rows.slice(0, PAGE_RECORDS)) {
        // At least one record per page, however big.
        if (records.length > 0 && size + (row.body?.length ?? 0) > PAGE_BYTES) break;
        size += row.body?.length ?? 0;
        records.push(out(row));
      }
      const more = records.length < rows.length;
      const { rev, epoch, key_id: kid } = q.user.get(user.id);
      // With more to come, rev is where this page ends: the next page starts after it.
      // kid (OYUUR-31): the account's data key — a phone with another one leaves the chest alone.
      return { rev: more ? records[records.length - 1].rev : rev, epoch, records, more, kid: kid ?? null };
    }, true],

    // Changes from the phone: each one only over the rev it was based on (0 — a new record), all or nothing.
    ['POST', '/api/sync', ({ user, body, ip }) => {
      limit(`sync:${user.id}`, 300, 60_000);
      limit(`syncip:${ip}`, 600, 60_000);
      if (!Number.isInteger(body.epoch)) fail(400, 'bad_epoch');
      if (!Array.isArray(body.records)) fail(400, 'bad_records');
      // Checked before anything is written.
      const seen = new Set();
      const changes = body.records.map((r) => {
        const key = isObj(r) ? r.key : null;
        if (!goodKey(key) || seen.has(key)) fail(400, 'bad_record', { key: typeof key === 'string' ? key.slice(0, 50) : null });
        seen.add(key);
        if (!Number.isInteger(r.base) || r.base < 0) fail(400, 'bad_record', { key });
        const deleted = r.deleted === true;
        if (deleted) {
          if (r.body === undefined || r.body === null) return { key, base: r.base, deleted, text: null, body: null };
          // A tree's tombstone may say when it left (never counted as a tree, never shown to friends).
          if (!goodTomb(key, r.body)) fail(400, 'bad_record', { key });
          return { key, base: r.base, deleted, text: JSON.stringify(r.body), body: r.body };
        }
        if (!goodBody(key, r.body)) fail(400, 'bad_record', { key });
        const text = JSON.stringify(r.body);
        if (bytes(text) > RECORD_LIMIT[kindOf(key)]) fail(400, 'bad_record', { key, reason: 'too_big' });
        return { key, base: r.base, deleted, text, body: r.body };
      });
      return inTransaction(() => {
        const { epoch, key_id } = q.user.get(user.id);
        // Another device erased the forest in the account: this phone's changes are about the old one.
        if (body.epoch !== epoch) fail(409, 'wiped', { epoch });
        // A chest nobody could open (OYUUR-31): only one locked with the account's own data key.
        // Refused whole, before anything is written; the phone sends again without it.
        const vault = changes.find((c) => c.key === 'vault' && !c.deleted);
        if (vault && !key_id) fail(409, 'no_keys');
        if (vault && vault.body.kid !== key_id) fail(409, 'wrong_kid', { kid: key_id });
        const saved = [];
        const conflicts = [];
        let forestChanged = false;
        for (const c of changes) {
          const current = q.record.get(user.id, c.key);
          if ((current?.rev ?? 0) !== c.base) {
            // Nothing there (the base is from nowhere): an empty answer, not a tombstone that would win the merge.
            conflicts.push(current ? out(current) : { key: c.key, rev: 0, deleted: false, body: null, at: 0 });
            continue;
          }
          const rev = write(user.id, c.key, c.deleted, c.text);
          saved.push({ key: c.key, rev });
          if (c.key !== 'vault') forestChanged = true;
          if (!c.deleted && c.key.startsWith('tree:')) {
            const before = current?.body ? JSON.parse(current.body) : null;
            noteWaterings(user.id, c.key.slice(5), before, c.body);
          }
        }
        if (q.trees.get(user.id).n > MAX_TREES) fail(413, 'too_many_trees');
        if (forestChanged) rebuildPublic(user.id);
        const { rev } = q.user.get(user.id);
        return { rev, epoch, saved, conflicts };
      });
    }, true],

    // "Erase everything" with an account: every record goes for real, the epoch moves on, so the
    // other devices (they see a new epoch in GET) erase their forest too.
    ['POST', '/api/sync/wipe', ({ user }) => {
      limit(`wipe:${user.id}`, 10, 3_600_000);
      return inTransaction(() => {
        db.prepare('DELETE FROM records WHERE user_id = ?').run(user.id);
        db.prepare('DELETE FROM watering_seen WHERE user_id = ?').run(user.id);
        const row = db.prepare('UPDATE users SET rev = rev + 1, epoch = epoch + 1 WHERE id = ? RETURNING rev, epoch').get(user.id);
        q.setPublic.run(JSON.stringify(publicView(null)), now(), user.id);
        return { rev: row.rev, epoch: row.epoch };
      });
    }, true],
  ];

  return {
    routes,
    /** The account keeps its forest in records: the old PUT /api/forest would overwrite it. */
    hasForest: (userId) => !!q.hasForest.get(userId),
    /** The chest can't be opened any more (a new data key): a tombstone in its place, devices learn. */
    dropVault(userId) {
      const row = q.record.get(userId, 'vault');
      if (row && !row.deleted) write(userId, 'vault', true, null);
    },
  };
}
