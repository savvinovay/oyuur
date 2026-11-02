// The Oyuur server: accounts by @nick, friends, a friend's forest, cheers, shared trees.
// No dependencies: Node's own http, crypto and sqlite. No admin functions in the app: the owner
// has a page of their own on the server (/owner, signed in with OWNER_TOKEN) to handle reports.
//
// The game itself runs on the phone. Only trees marked "friends" ever reach the server as they
// are: hidden trees never leave the phone (habits can be about health). Since OYUUR-30 the open
// trees live here as records of the account (sync.js), sign-in is in auth.js.
// Shared trees live here: each side's waterings by their own calendar; the game rules on
// the phone turn them into a tree (it grows on days both watered).
// Rules decided for wave 5: design/волна-5/спец-друзья.md, sections 3.4, 5, 8, 12, 17.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, extname, join, normalize, resolve } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants as Z, gzip } from 'node:zlib';
import { createAnalytics } from './analytics.js';
import { createAuth } from './auth.js';
import { copyHash, listDaily, writeSealed } from './backup.js';
import { createStats, PERIODS } from './stats.js';
import { createSync, SYNC_BODY_LIMIT } from './sync.js';

const RESERVED = new Set([
  'admin', 'administrator', 'root', 'oyuur', 'ojuur', 'support', 'help', 'api', 'system', 'moderator', 'official',
  'null', 'undefined', 'me', 'elevate', 'tree', 'derevo', 'mas', 'team', 'staff', 'security',
]);
const AVATARS = new Set(['fox', 'owl', 'bear', 'hedgehog', 'rabbit', 'squirrel', 'deer', 'frog', 'leaf', 'acorn', 'mushroom', 'flower']);
const SKINS = new Set(['oak', 'sakura', 'spruce', 'birch', 'maple', 'apple', 'palm']);
const MEADOWS = new Set(['summer', 'autumn', 'winter', 'bloom']);
const REPORT_REASONS = new Set(['spam', 'abuse', 'name', 'other']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** A forest of ~50 trees with a year of days each fits; more is not a phone. */
const FOREST_LIMIT = 300_000;
const BODY_LIMIT = 20_000;
/** Doors that take more than BODY_LIMIT. */
const BODY_LIMITS = { '/api/forest': FOREST_LIMIT, '/api/sync': SYNC_BODY_LIMIT };
const MAX_FRIENDS = 100;
/** Sessions not used for this long end; requests not answered for this long go. */
const SESSION_TTL = 90 * 86_400_000;
const REQUEST_TTL = 30 * 86_400_000;
/** Shared trees: one per pair, at most 3 growing (or offered) each. */
const MAX_SHARED = 3;
/** Search: by the start of a nick, from 3 characters, up to 10 results. */
const SEARCH_MIN = 3;
const SEARCH_MAX = 10;
/** The owner's key: shorter is too easy to guess, so the page stays off. A session lasts 12 hours. */
const OWNER_KEY_MIN = 16;
const OWNER_SESSION_TTL = 12 * 3_600_000;
/** What friends see instead of a tree name the owner hid. */
const HIDDEN_NAME = '…';
const RESOLUTIONS = { dismiss: 'dismissed', 'hide-name': 'name_hidden', ban: 'banned' };
/** The owner's page: plain files in ./owner, no build step. */
const OWNER_FILES = Object.fromEntries(
  [
    ['/owner', 'index.html', 'text/html; charset=utf-8'],
    ['/owner/owner.js', 'owner.js', 'text/javascript; charset=utf-8'],
    ['/owner/owner.css', 'owner.css', 'text/css; charset=utf-8'],
  ].map(([path, file, type]) => [path, { body: readFileSync(new URL(`./owner/${file}`, import.meta.url)), type }]),
);
/**
 * Web files that shrink 3–4× on the way (OYUUR-35): the Skia engine canvaskit.wasm is 8 MB as is, ~2.5 MB packed.
 * Pictures and sounds are packed already. Packed copies are made once per file and kept in memory.
 */
const PACKABLE = new Set(['.html', '.js', '.css', '.json', '.webmanifest', '.svg', '.wasm', '.ttf', '.txt']);
const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);
/** The best brotli with a 1 MB window: ~100 MB of memory at its peak instead of ~150 (the homelab gives 256), 3 % bigger. */
const brotliAt = (quality, buf) => ({
  params: { [Z.BROTLI_PARAM_QUALITY]: quality, [Z.BROTLI_PARAM_LGWIN]: 20, [Z.BROTLI_PARAM_SIZE_HINT]: buf.length },
});
/** Whether Accept-Encoding takes this coding (and not with q=0). */
const takes = (header, coding) =>
  String(header ?? '').split(',').some((part) => {
    const [name, ...opts] = part.trim().toLowerCase().split(';');
    return name.trim() === coding && !opts.some((o) => /^\s*q\s*=\s*0(\.0*)?\s*$/.test(o));
  });
/** A handler's answer when it has written the response itself (a file, not JSON). */
const ANSWERED = Symbol('answered');
const OWNER_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
};

/** A @nick: a–z, 0–9 and _, 3–20, starts with a letter, no "__", doesn't end with "_" (spec 3.4). */
export function validNick(nick) {
  return typeof nick === 'string' && /^[a-z][a-z0-9_]{2,19}$/.test(nick) && !nick.includes('__') && !nick.endsWith('_') && !RESERVED.has(nick);
}
const normNick = (raw) => (typeof raw === 'string' ? raw.trim().toLowerCase().replace(/^@/, '') : '');

// ---- Small helpers ----

class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const fail = (status, code, extra) => {
  throw new HttpError(status, code, extra);
};

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** "Today" of the phone: a real day, at most a couple of days off the server's date (time zones). */
function checkDay(day, now) {
  if (typeof day !== 'string' || !DAY.test(day)) fail(400, 'bad_day');
  const ms = Date.parse(`${day}T12:00:00Z`);
  if (!Number.isFinite(ms) || Math.abs(ms - now) > 2.5 * 86_400_000) fail(400, 'bad_day');
  return day;
}

/** Same rules as a tree's name on the phone (nameText.ts): letters, numbers, ' - . and spaces, 1–20. */
function cleanName(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') fail(400, 'bad_name');
  const value = Array.from(raw.replace(/\s+/g, ' ').trim())
    .filter((ch) => /^[\p{L}\p{N}\p{M} '’.-]$/u.test(ch))
    .slice(0, 20)
    .join('')
    .trim();
  return value || null;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
const days = (v) => (Array.isArray(v) ? v.filter((d) => typeof d === 'string' && DAY.test(d)).slice(-5000) : []);
const isDay = (v) => typeof v === 'string' && DAY.test(v);
// Watering hours of a tree (OYUUR-34): from which hour of the day it can be watered, by day. Older phones don't send them.
const openHours = (v) =>
  Array.isArray(v) ? v.filter((e) => isObj(e) && isDay(e.from) && Number.isInteger(e.hour) && e.hour >= 0 && e.hour <= 23).slice(-50).map((e) => ({ from: e.from, hour: e.hour })) : undefined;

/**
 * What friends see: the trees marked "friends", their places on the plot and the meadow.
 * Whatever else the phone sends is dropped. `hidden` (how many trees are hidden) is always 0
 * since OYUUR-30 (owner's decision, spec 12.1); the field stays for old apps.
 */
export function publicView(forest) {
  const trees = (Array.isArray(forest?.trees) ? forest.trees : [])
    .filter((t) => isObj(t) && t.visibility === 'friends' && typeof t.id === 'string' && isDay(t.plantedOn))
    .slice(0, 500)
    .map((t) => ({
      id: str(t.id, 40),
      lineageId: str(t.lineageId, 40) ?? str(t.id, 40),
      name: str(t.name, 60) ?? '',
      nickname: str(t.nickname, 20),
      kind: t.kind === 'quit' ? 'quit' : 'do',
      skin: SKINS.has(t.skin) ? t.skin : 'oak',
      plantedOn: t.plantedOn,
      checkins: days(t.checkins),
      frozen: days(t.frozen),
      chancesLeft: Number.isInteger(t.chancesLeft) ? Math.max(0, Math.min(3, t.chancesLeft)) : 0,
      diedOn: isDay(t.diedOn) ? t.diedOn : null,
      completedOn: isDay(t.completedOn) ? t.completedOn : null,
      generation: Number.isInteger(t.generation) ? Math.max(1, t.generation) : 1,
      openHours: openHours(t.openHours),
    }));
  const lineages = new Set(trees.map((t) => t.lineageId));
  const places = {};
  const plot = isObj(forest?.plot) ? forest.plot : {};
  if (isObj(plot.places)) {
    for (const [id, cell] of Object.entries(plot.places)) {
      if (lineages.has(id) && isObj(cell) && Number.isInteger(cell.c) && Number.isInteger(cell.r)) places[id] = { c: cell.c, r: cell.r };
    }
  }
  const size = Number.isInteger(plot.size) ? Math.max(4, Math.min(30, plot.size)) : 4;
  const meadow = MEADOWS.has(forest?.meadow) ? forest.meadow : 'summer';
  return { trees, plot: { size, places }, meadow, hidden: 0 };
}

// ---- The API ----

/**
 * ownerToken: the owner's secret key (OWNER_TOKEN). Without it (or shorter than 16) the
 * owner's page and /api/owner/* don't exist (404).
 * backupDir: where the daily copies are (backup.js); the owner downloads the latest, encrypted.
 */
export function createApp({ db, publicDir = null, now = () => Date.now(), ownerToken = null, backupDir = null }) {
  // Only a hash of the key is kept and compared: always the same length, compared in constant time.
  const ownerKey = typeof ownerToken === 'string' && ownerToken.length >= OWNER_KEY_MIN ? createHash('sha256').update(ownerToken).digest() : null;
  const ownerKeyHex = ownerKey?.toString('hex') ?? null;
  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByNick: db.prepare('SELECT * FROM users WHERE nick = ?'),
    // A blocked account's sessions just stop working (nothing is deleted: an unblock brings them back).
    session: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.banned_at IS NULL'),
    ownerSession: db.prepare('SELECT 1 FROM owner_sessions WHERE token_hash = ? AND key_hash = ? AND created_at > ?'),
    hiddenNames: db.prepare('SELECT tree_id, lineage_id FROM hidden_names WHERE user_id = ?'),
    touch: db.prepare('UPDATE sessions SET seen_at = ? WHERE token_hash = ?'),
    newSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, seen_at) VALUES (?, ?, ?, ?)'),
    dropSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    pair: db.prepare('SELECT * FROM friends WHERE a = ? AND b = ?'),
    blockedEither: db.prepare('SELECT 1 FROM blocks WHERE (blocker = ? AND blocked = ?) OR (blocker = ? AND blocked = ?)'),
    blockedByMe: db.prepare('SELECT 1 FROM blocks WHERE blocker = ? AND blocked = ?'),
    shared: db.prepare('SELECT * FROM shared_trees WHERE id = ?'),
    hasVault: db.prepare("SELECT 1 FROM records WHERE user_id = ? AND key = 'vault' AND deleted = 0"),
  };

  const view = (u) => ({ nick: u.nick, name: u.name, avatar: u.avatar, color: u.color });
  // `id` — the phone tells "the same account" from "a new one with the same nick" (OYUUR-30).
  // `kid`, `vault` (OYUUR-31): the account's data key and whether a chest is kept — a phone without
  // that key would lose the chest with a new password ("Forgot the password" on a signed-in phone).
  const me = (u) => ({
    ...view(u), id: u.id, createdAt: u.created_at, authV: u.auth_v ?? 1, kid: u.key_id ?? null, vault: !!q.hasVault.get(u.id),
  });
  const pairKey = (x, y) => (x < y ? [x, y] : [y, x]);
  const friendRow = (x, y) => q.pair.get(...pairKey(x, y));
  const areFriends = (x, y) => friendRow(x, y)?.status === 'accepted';
  const blocked = (x, y) => !!q.blockedEither.get(x, y, y, x);
  const emptyForest = () => publicView(null);
  /** A forest as `viewer` sees it: names the owner hid are neutral for everyone but the person. */
  function forestOf(u, viewer) {
    // Forests saved before OYUUR-30 may still carry how many trees are hidden: friends don't see it any more.
    const forest = u.public ? { ...JSON.parse(u.public), hidden: 0 } : emptyForest();
    if (viewer === u.id) return forest;
    // By the tree and by its habit: the next generation (planted from the seed) stays hidden too.
    const rows = q.hiddenNames.all(u.id);
    if (rows.length === 0) return forest;
    const trees = new Set(rows.map((r) => r.tree_id));
    const lineages = new Set(rows.map((r) => r.lineage_id).filter(Boolean));
    const hide = (t) => trees.has(t.id) || lineages.has(t.lineageId);
    return { ...forest, trees: forest.trees.map((t) => (hide(t) ? { ...t, name: HIDDEN_NAME, nickname: null } : t)) };
  }

  function relation(meId, other) {
    if (other.id === meId) return 'self';
    if (q.blockedByMe.get(meId, other.id)) return 'blocked';
    const row = friendRow(meId, other.id);
    if (!row) return 'none';
    if (row.status === 'accepted') return 'friend';
    return row.requester === meId ? 'outgoing' : 'incoming';
  }

  function issueToken(userId) {
    const token = randomBytes(32).toString('base64url');
    const t = now();
    q.newSession.run(hashToken(token), userId, t, t);
    return token;
  }

  function otherByNick(nick) {
    const user = q.userByNick.get(normNick(nick));
    if (!user || user.deleted || user.banned_at) fail(404, 'no_user');
    return user;
  }

  /** Up to 3 free nicks like this one. */
  function freeLike(nick) {
    const base = nick.replace(/_+$/, '').slice(0, 16);
    const out = [];
    for (let i = 0; out.length < 3 && i < 40; i++) {
      const n = i < 3 ? `${base}_${i + 1}` : `${base}${10 + (randomBytes(2).readUInt16BE() % 990)}`;
      if (validNick(n) && !q.userByNick.get(n) && !out.includes(n)) out.push(n);
    }
    return out;
  }

  // Rate limits for the doors a stranger can knock on. Keys are short (checked input only);
  // the table never grows past HITS_MAX: expired keys go first, then everything.
  const hits = new Map();
  const HITS_MAX = 20_000;
  function count(key, windowMs) {
    const t = now();
    const h = hits.get(key);
    if (!h || h.reset < t) {
      if (hits.size >= HITS_MAX) {
        for (const [k, v] of hits) if (v.reset < t) hits.delete(k);
        if (hits.size >= HITS_MAX) hits.clear();
      }
      const fresh = { n: 1, reset: t + windowMs };
      hits.set(key, fresh);
      return fresh.n;
    }
    return ++h.n;
  }
  function limit(key, max, windowMs) {
    if (count(key, windowMs) > max) fail(429, 'too_many');
  }
  // Usage statistics (OYUUR-26): its own table, door and housekeeping in analytics.js.
  const analytics = createAnalytics({ db, now, fail, limit });
  const ownerStats = createStats({ db, now });
  /** Failed tries so far (without counting this one). */
  const failures = (key) => {
    const h = hits.get(key);
    return h && h.reset >= now() ? h.n : 0;
  };
  // The forest in the account (OYUUR-30) and sign-in v2: sync.js, auth.js.
  const sync = createSync({ db, now, fail, limit, publicView });
  const auth = createAuth({
    db, now, fail, limit, count, failures, issueToken, hashToken, me, q, validNick, normNick, cleanName, avatars: AVATARS, freeLike, sync,
  });

  function sharedView(row) {
    const waterings = {};
    for (const w of db.prepare('SELECT user_id, day FROM shared_waterings WHERE tree_id = ? ORDER BY day').all(row.id)) {
      const u = q.userById.get(w.user_id);
      if (u) (waterings[u.nick] ??= []).push(w.day);
    }
    const proposer = q.userById.get(row.proposer);
    const partner = q.userById.get(row.partner);
    // A deleted account shows as nobody (the tree is a memory by then).
    const shown = (u) => (u && !u.deleted && !u.banned_at ? view(u) : null);
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      skin: row.skin,
      status: row.status,
      plantedOn: row.planted_on,
      createdAt: row.created_at,
      endedAt: row.ended_at,
      proposer: shown(proposer),
      partner: shown(partner),
      waterings,
    };
  }

  /** Ends the shared trees of two people who are no longer friends. */
  const endShared = (x, y) =>
    db
      .prepare("UPDATE shared_trees SET status = 'ended', ended_at = ? WHERE status IN ('proposed', 'active') AND ((proposer = ? AND partner = ?) OR (proposer = ? AND partner = ?))")
      .run(now(), x, y, y, x);

  const openShared = (id) =>
    db.prepare("SELECT count(*) AS n FROM shared_trees WHERE (proposer = ? OR partner = ?) AND status IN ('proposed', 'active')").get(id, id).n;

  // [method, path pattern, handler(ctx), needs a signed-in user]
  const routes = [
    ['GET', '/healthz', () => ({ ok: true }), false],

    ['GET', '/api/nick/:nick', ({ params, ip }) => {
      limit(`nick:${ip}`, 120, 60_000);
      const nick = normNick(params.nick);
      const valid = validNick(nick);
      const free = valid && !q.userByNick.get(nick);
      return { nick, valid, free, suggestions: valid && !free ? freeLike(nick) : [] };
    }, false],

    ...auth.routes,
    ...sync.routes,

    ['POST', '/api/logout', ({ token }) => {
      q.dropSession.run(hashToken(token));
      return { ok: true };
    }, true],

    ['POST', '/api/events', ({ body, ip }) => analytics.accept(body, ip)],

    ['GET', '/api/me', ({ user }) => ({ user: me(user) }), true],

    ['PATCH', '/api/me', ({ user, body }) => {
      const name = 'name' in body ? cleanName(body.name) : user.name;
      const avatar = AVATARS.has(body.avatar) ? body.avatar : user.avatar;
      const color = Number.isInteger(body.color) && body.color >= 0 && body.color < 8 ? body.color : user.color;
      db.prepare('UPDATE users SET name = ?, avatar = ?, color = ? WHERE id = ?').run(name, avatar, color, user.id);
      return { user: me(q.userById.get(user.id)) };
    }, true],

    // My open trees, for friends to see: { trees, plot, meadow, hidden }. Old apps only: once the
    // account keeps its forest as records (a new app synced), this would overwrite it — "update the app".
    ['PUT', '/api/forest', ({ user, body }) => {
      if (sync.hasForest(user.id)) fail(409, 'upgrade_app');
      const t = now();
      db.prepare('UPDATE users SET public = ?, public_at = ? WHERE id = ?').run(JSON.stringify(publicView(body)), t, user.id);
      return { forestAt: t };
    }, true],

    ['GET', '/api/users', ({ user, query, ip }) => {
      limit(`search:${ip}`, 60, 60_000);
      const text = normNick(query.get('q') ?? '');
      if (text.length < SEARCH_MIN || !/^[a-z0-9_]+$/.test(text)) return { users: [] };
      const rows = db
        .prepare("SELECT * FROM users WHERE nick LIKE ? ESCAPE '\\' AND id != ? AND deleted = 0 AND banned_at IS NULL ORDER BY (nick = ?) DESC, length(nick), nick LIMIT ?")
        .all(`${text.replace(/_/g, '\\_')}%`, user.id, text, SEARCH_MAX * 2);
      return { users: rows.filter((u) => !blocked(user.id, u.id)).slice(0, SEARCH_MAX).map((u) => ({ ...view(u), relation: relation(user.id, u) })) };
    }, true],

    ['GET', '/api/users/:nick', ({ user, params }) => {
      const other = otherByNick(params.nick);
      const rel = relation(user.id, other);
      // Someone who blocked me doesn't exist for me.
      if (rel !== 'self' && rel !== 'blocked' && blocked(user.id, other.id)) fail(404, 'no_user');
      const open = rel === 'friend' || rel === 'self';
      return { user: view(other), relation: rel, forest: open ? forestOf(other, user.id) : null, forestAt: open ? other.public_at : null };
    }, true],

    // Friends with their open forests; requests both ways. `day` — my today, for the cheer marks.
    ['GET', '/api/friends', ({ user, query }) => {
      const day = query.get('day');
      const rows = db.prepare('SELECT * FROM friends WHERE a = ? OR b = ? ORDER BY created_at').all(user.id, user.id);
      const friends = [];
      const incoming = [];
      const outgoing = [];
      for (const row of rows) {
        const other = q.userById.get(row.a === user.id ? row.b : row.a);
        // Blocked by the owner: friends don't see them (the friendship stays for an unblock).
        if (!other || other.banned_at) continue;
        if (row.status === 'pending') {
          (row.requester === user.id ? outgoing : incoming).push({ ...view(other), at: row.created_at });
          continue;
        }
        const cheers = isDay(day)
          ? db.prepare('SELECT sender FROM cheers WHERE day = ? AND ((sender = ? AND receiver = ?) OR (sender = ? AND receiver = ?))').all(day, user.id, other.id, other.id, user.id)
          : [];
        friends.push({
          ...view(other),
          since: row.created_at,
          forest: forestOf(other, user.id),
          forestAt: other.public_at,
          cheeredToday: cheers.some((c) => c.sender === user.id),
          cheeredMe: cheers.some((c) => c.sender === other.id),
        });
      }
      return { friends, incoming, outgoing };
    }, true],

    ['POST', '/api/friends/request', ({ user, body }) => {
      const other = otherByNick(body.nick);
      if (other.id === user.id) fail(400, 'self');
      if (blocked(user.id, other.id)) fail(404, 'no_user');
      const [a, b] = pairKey(user.id, other.id);
      const row = q.pair.get(a, b);
      if (row?.status === 'accepted') return { relation: 'friend' };
      if (row && row.requester !== user.id) {
        // They asked first: this is a yes.
        db.prepare("UPDATE friends SET status = 'accepted', created_at = ? WHERE a = ? AND b = ?").run(now(), a, b);
        return { relation: 'friend' };
      }
      if (row) return { relation: 'outgoing' };
      const count = db.prepare('SELECT count(*) AS n FROM friends WHERE a = ? OR b = ?').get(user.id, user.id).n;
      if (count >= MAX_FRIENDS) fail(409, 'too_many_friends');
      db.prepare("INSERT INTO friends (a, b, requester, status, created_at) VALUES (?, ?, ?, 'pending', ?)").run(a, b, user.id, now());
      return { relation: 'outgoing' };
    }, true],

    ['POST', '/api/friends/accept', ({ user, body }) => {
      const other = otherByNick(body.nick);
      const [a, b] = pairKey(user.id, other.id);
      const row = q.pair.get(a, b);
      if (!row || row.status !== 'pending' || row.requester === user.id) fail(404, 'no_request');
      db.prepare("UPDATE friends SET status = 'accepted', created_at = ? WHERE a = ? AND b = ?").run(now(), a, b);
      return { relation: 'friend' };
    }, true],

    // Decline a request, cancel mine, or remove a friend: the pair is gone either way.
    ['POST', '/api/friends/remove', ({ user, body }) => {
      const other = otherByNick(body.nick);
      db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').run(...pairKey(user.id, other.id));
      endShared(user.id, other.id);
      return { relation: 'none' };
    }, true],

    ['GET', '/api/blocks', ({ user }) => ({
      users: db.prepare('SELECT u.* FROM blocks b JOIN users u ON u.id = b.blocked WHERE b.blocker = ? ORDER BY b.created_at').all(user.id).map(view),
    }), true],

    ['POST', '/api/block', ({ user, body }) => {
      const other = otherByNick(body.nick);
      if (other.id === user.id) fail(400, 'self');
      db.prepare('INSERT OR IGNORE INTO blocks (blocker, blocked, created_at) VALUES (?, ?, ?)').run(user.id, other.id, now());
      db.prepare('DELETE FROM friends WHERE a = ? AND b = ?').run(...pairKey(user.id, other.id));
      endShared(user.id, other.id);
      return { relation: 'blocked' };
    }, true],

    ['POST', '/api/unblock', ({ user, body }) => {
      const other = otherByNick(body.nick);
      db.prepare('DELETE FROM blocks WHERE blocker = ? AND blocked = ?').run(user.id, other.id);
      return { relation: 'none' };
    }, true],

    // About a person, or about one of their trees' names (treeId). The reported person is never told who.
    ['POST', '/api/report', ({ user, body }) => {
      limit(`report:${user.id}`, 20, 3_600_000);
      const other = otherByNick(body.nick);
      if (!REPORT_REASONS.has(body.reason)) fail(400, 'bad_reason');
      db.prepare('INSERT INTO reports (reporter, target, tree_id, reason, text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(user.id, other.id, str(body.treeId, 40), body.reason, str(body.text, 500), now());
      return { ok: true };
    }, true],

    // Once a day per friend (by the sender's calendar).
    ['POST', '/api/cheer', ({ user, body }) => {
      const other = otherByNick(body.nick);
      if (!areFriends(user.id, other.id)) fail(403, 'not_friends');
      const day = checkDay(body.day, now());
      const added = db.prepare('INSERT OR IGNORE INTO cheers (sender, receiver, day, created_at) VALUES (?, ?, ?, ?)').run(user.id, other.id, day, now()).changes;
      return { ok: true, already: added === 0 };
    }, true],

    // News for the menu dots: cheers not seen yet, requests waiting, shared trees offered.
    ['GET', '/api/inbox', ({ user }) => {
      const cheers = db
        .prepare('SELECT c.day, c.created_at AS at, u.* FROM cheers c JOIN users u ON u.id = c.sender WHERE c.receiver = ? AND c.seen = 0 AND u.banned_at IS NULL ORDER BY c.created_at DESC LIMIT 50')
        .all(user.id)
        .map((r) => ({ from: view(r), day: r.day, at: r.at }));
      const requests = db
        .prepare("SELECT count(*) AS n FROM friends f JOIN users u ON u.id = f.requester WHERE (f.a = ? OR f.b = ?) AND f.status = 'pending' AND f.requester != ? AND u.banned_at IS NULL")
        .get(user.id, user.id, user.id).n;
      const offers = db
        .prepare("SELECT count(*) AS n FROM shared_trees s JOIN users u ON u.id = s.proposer WHERE s.partner = ? AND s.status = 'proposed' AND u.banned_at IS NULL")
        .get(user.id).n;
      return { cheers, requests, offers };
    }, true],

    ['POST', '/api/inbox/seen', ({ user }) => {
      db.prepare('UPDATE cheers SET seen = 1 WHERE receiver = ? AND seen = 0').run(user.id);
      return { ok: true };
    }, true],

    ['GET', '/api/shared', ({ user }) => ({
      trees: db
        .prepare("SELECT * FROM shared_trees WHERE (proposer = ? OR partner = ?) AND status IN ('proposed', 'active', 'ended') ORDER BY created_at")
        .all(user.id, user.id)
        // An offer from or to someone blocked by the owner waits unseen (an unblock brings it back).
        .filter((row) => row.status !== 'proposed' || !q.userById.get(row.proposer === user.id ? row.partner : row.proposer)?.banned_at)
        .map(sharedView),
    }), true],

    ['POST', '/api/shared', ({ user, body }) => {
      const other = otherByNick(body.nick);
      if (!areFriends(user.id, other.id)) fail(403, 'not_friends');
      const name = typeof body.name === 'string' ? body.name.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
      if (!name) fail(400, 'bad_name');
      const pairOpen = db
        .prepare("SELECT 1 FROM shared_trees WHERE status IN ('proposed', 'active') AND ((proposer = ? AND partner = ?) OR (proposer = ? AND partner = ?))")
        .get(user.id, other.id, other.id, user.id);
      if (pairOpen) fail(409, 'shared_exists');
      if (openShared(user.id) >= MAX_SHARED) fail(409, 'too_many_shared');
      if (openShared(other.id) >= MAX_SHARED) fail(409, 'friend_too_many_shared');
      const id = randomUUID();
      db.prepare("INSERT INTO shared_trees (id, proposer, partner, name, kind, skin, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?)")
        .run(id, user.id, other.id, name, body.kind === 'quit' ? 'quit' : 'do', SKINS.has(body.skin) ? body.skin : 'oak', now());
      return { tree: sharedView(q.shared.get(id)) };
    }, true],

    // Accepted: planted on the accepting side's today, for both.
    ['POST', '/api/shared/:id/accept', ({ user, params, body }) => {
      const row = db.prepare("SELECT * FROM shared_trees WHERE id = ? AND partner = ? AND status = 'proposed'").get(params.id, user.id);
      if (!row || q.userById.get(row.proposer)?.banned_at) fail(404, 'no_tree');
      if (!areFriends(row.proposer, row.partner)) fail(403, 'not_friends');
      db.prepare("UPDATE shared_trees SET status = 'active', planted_on = ? WHERE id = ?").run(checkDay(body.day, now()), row.id);
      return { tree: sharedView(q.shared.get(row.id)) };
    }, true],

    ['POST', '/api/shared/:id/decline', ({ user, params }) => {
      const row = db.prepare("SELECT * FROM shared_trees WHERE id = ? AND partner = ? AND status = 'proposed'").get(params.id, user.id);
      if (!row) fail(404, 'no_tree');
      db.prepare("UPDATE shared_trees SET status = 'declined', ended_at = ? WHERE id = ?").run(now(), row.id);
      return { ok: true };
    }, true],

    // Leave a shared tree (or take back an offer): it stops for both and stays as a memory.
    ['POST', '/api/shared/:id/end', ({ user, params }) => {
      const row = db.prepare("SELECT * FROM shared_trees WHERE id = ? AND (proposer = ? OR partner = ?) AND status IN ('proposed', 'active')").get(params.id, user.id, user.id);
      if (!row) fail(404, 'no_tree');
      db.prepare("UPDATE shared_trees SET status = 'ended', ended_at = ? WHERE id = ?").run(now(), row.id);
      return { ok: true };
    }, true],

    ['POST', '/api/shared/:id/water', ({ user, params, body }) => {
      const row = db.prepare("SELECT * FROM shared_trees WHERE id = ? AND (proposer = ? OR partner = ?) AND status = 'active'").get(params.id, user.id, user.id);
      if (!row) fail(404, 'no_tree');
      const day = checkDay(body.day, now());
      if (day < row.planted_on) fail(400, 'bad_day');
      db.prepare('INSERT OR IGNORE INTO shared_waterings (tree_id, user_id, day, created_at) VALUES (?, ?, ?, ?)').run(row.id, user.id, day, now());
      return { tree: sharedView(row) };
    }, true],

    // ---- The owner (auth 'owner'; all of it is 404 without OWNER_TOKEN) ----
    // One sign-in for every owner page (reports now, analytics later). Limits like /api/login:
    // 10 wrong keys from an address in 10 min, 100 from everywhere in an hour.
    ['POST', '/api/owner/login', ({ body, ip }) => {
      limit(`owner:${ip}`, 30, 600_000);
      if (failures(`ownerfail:${ip}`) >= 10 || failures('ownerfail') >= 100) fail(429, 'too_many');
      const got = createHash('sha256').update(typeof body.key === 'string' ? body.key : '').digest();
      if (!timingSafeEqual(got, ownerKey)) {
        count(`ownerfail:${ip}`, 600_000);
        count('ownerfail', 3_600_000);
        fail(401, 'wrong_key');
      }
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO owner_sessions (token_hash, key_hash, created_at) VALUES (?, ?, ?)').run(hashToken(token), ownerKeyHex, now());
      return { token };
    }, 'owner-door'],

    ['POST', '/api/owner/logout', ({ token }) => {
      db.prepare('DELETE FROM owner_sessions WHERE token_hash = ?').run(hashToken(token));
      return { ok: true };
    }, 'owner'],

    ['GET', '/api/owner/me', () => ({ ok: true }), 'owner'],

    // The latest daily copy of the base (OYUUR-36): what there is, and the file itself, encrypted
    // with a key from OWNER_TOKEN (format in backup.js). A few downloads an hour: it's 1 file a day.
    ['GET', '/api/owner/backup', () => {
      const c = backupDir ? listDaily(backupDir)[0] : null;
      return { latest: c ? { name: c.name, day: c.day, at: Math.round(c.at), size: c.size } : null };
    }, 'owner'],

    ['GET', '/api/owner/backup/latest', async ({ res, ip }) => {
      limit(`backup:${ip}`, 10, 3_600_000);
      limit('backup', 30, 3_600_000);
      const c = backupDir ? listDaily(backupDir)[0] : null;
      if (!c) fail(404, 'no_backup');
      const sha = await copyHash(c.file);
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-disposition': `attachment; filename="oyuur-${c.day}.oyuurbak"`,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-backup-name': c.name,
        'x-backup-day': c.day,
        'x-backup-size': String(c.size),
        'x-backup-sha256': sha,
      });
      try {
        await writeSealed(c.file, sha, ownerToken, res);
      } catch (error) {
        // The headers are gone already: cut the answer, so the half file can't pass for a whole one.
        console.error('BACKUP DOWNLOAD FAILED', error);
        res.destroy();
      }
      return ANSWERED;
    }, 'owner'],

    // The owner's numbers (OYUUR-27): installs, coming back, the first day, where they stop. period: 7, 30 or all.
    ['GET', '/api/owner/stats', ({ query }) => {
      const period = query.get('period') ?? '30';
      if (!Object.hasOwn(PERIODS, period)) fail(400, 'bad_period');
      return ownerStats.stats(period);
    }, 'owner'],

    // Reports, newest first: `status` open (default) or done (latest handled first).
    ['GET', '/api/owner/reports', ({ query }) => {
      const done = query.get('status') === 'done';
      const rows = db
        .prepare(`SELECT * FROM reports WHERE resolution IS ${done ? 'NOT NULL ORDER BY resolved_at' : 'NULL ORDER BY created_at'} DESC, id DESC LIMIT 200`)
        .all();
      const counts = db.prepare('SELECT count(*) - count(resolution) AS open, count(resolution) AS done FROM reports').get();
      return { reports: rows.map(reportView), open: counts.open, done: counts.done };
    }, 'owner'],

    // Undo, nothing is ever deleted: the tree's name back for friends, the account unblocked.
    ['POST', '/api/owner/reports/:id/show-name', ({ params }) => {
      const row = reportById(params.id);
      if (!row.tree_id) fail(400, 'no_tree');
      db.prepare('DELETE FROM hidden_names WHERE user_id = ? AND tree_id = ?').run(row.target, row.tree_id);
      return { report: reportView(row) };
    }, 'owner'],

    ['POST', '/api/owner/reports/:id/unban', ({ params }) => {
      const row = reportById(params.id);
      db.prepare('UPDATE users SET banned_at = NULL WHERE id = ?').run(row.target);
      return { report: reportView(row) };
    }, 'owner'],

    // dismiss / hide-name / ban. Hiding a name closes every open report on that tree; a block —
    // every open report on that person.
    ['POST', '/api/owner/reports/:id/:action', ({ params }) => {
      const resolution = Object.hasOwn(RESOLUTIONS, params.action) ? RESOLUTIONS[params.action] : null;
      if (!resolution) fail(404, 'not_found');
      const row = reportById(params.id);
      if (row.resolution) fail(409, 'resolved');
      const t = now();
      const close = (where, ...args) =>
        db.prepare(`UPDATE reports SET resolution = ?, resolved_by = 'owner', resolved_at = ? WHERE resolution IS NULL AND ${where}`).run(resolution, t, ...args);
      if (resolution === 'dismissed') close('id = ?', row.id);
      if (resolution === 'name_hidden') {
        if (!row.tree_id) fail(400, 'no_tree');
        const target = q.userById.get(row.target);
        const found = target?.public ? JSON.parse(target.public).trees.find((x) => x.id === row.tree_id) : null;
        db.prepare('INSERT OR IGNORE INTO hidden_names (user_id, tree_id, lineage_id, created_at) VALUES (?, ?, ?, ?)').run(row.target, row.tree_id, found?.lineageId ?? null, t);
        close('target = ? AND tree_id = ?', row.target, row.tree_id);
      }
      if (resolution === 'banned') {
        db.prepare('UPDATE users SET banned_at = ? WHERE id = ? AND banned_at IS NULL').run(t, row.target);
        close('target = ?', row.target);
      }
      return { report: reportView(reportById(row.id)) };
    }, 'owner'],
  ];

  function reportById(id) {
    const row = /^\d{1,15}$/.test(String(id)) ? db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(id)) : null;
    if (!row) fail(404, 'no_report');
    return row;
  }

  /** A report for the owner: who about whom, the tree's name as it is on the server, how it ended. */
  function reportView(r) {
    const person = (u) => (u ? { nick: u.deleted ? null : u.nick, name: u.name, deleted: !!u.deleted, banned: !!u.banned_at } : null);
    const target = q.userById.get(r.target);
    let tree = null;
    if (r.tree_id) {
      const found = target?.public ? JSON.parse(target.public).trees.find((t) => t.id === r.tree_id) : null;
      const hidden = !!db.prepare('SELECT 1 FROM hidden_names WHERE user_id = ? AND tree_id = ?').get(r.target, r.tree_id);
      tree = { id: r.tree_id, nickname: found?.nickname ?? null, habit: found?.name ?? null, found: !!found, hidden };
    }
    const about = db.prepare('SELECT count(*) AS total, count(*) - count(resolution) AS open FROM reports WHERE target = ?').get(r.target);
    return {
      id: r.id,
      at: r.created_at,
      reason: r.reason,
      text: r.text,
      reporter: person(q.userById.get(r.reporter)),
      target: person(target),
      tree,
      aboutTarget: { total: about.total, open: about.open },
      resolution: r.resolution,
      resolvedBy: r.resolved_by,
      resolvedAt: r.resolved_at,
    };
  }

  /** The owner's session from "Authorization: Bearer …": opened with the current key, under 12 hours old. */
  const ownerSignedIn = (token) => !!token && !!q.ownerSession.get(hashToken(token), ownerKeyHex, now() - OWNER_SESSION_TTL);

  const compiled = routes.map(([method, path, handler, auth]) => {
    const names = [];
    const re = new RegExp(`^${path.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)'))}$`);
    return { method, re, names, handler, auth };
  });

  async function readJson(req, max) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > max) fail(413, 'too_big');
      chunks.push(chunk);
    }
    if (size === 0) return {};
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      fail(400, 'bad_json');
    }
    if (!isObj(body)) fail(400, 'bad_json');
    return body;
  }

  // The owner's answers are for the owner's page only (same address): no CORS for them.
  function send(res, status, body, owner = false) {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(owner ? { 'x-content-type-options': 'nosniff' } : { 'access-control-allow-origin': '*' }),
    });
    res.end(JSON.stringify(body));
  }

  const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
    '.webmanifest': 'application/manifest+json', '.apk': 'application/vnd.android.package-archive', '.txt': 'text/plain; charset=utf-8',
  };

  /**
   * Packed copies of a file, made once: a quick brotli (half a second for the 8 MB wasm) at once, and the
   * best brotli (half a minute) later in the background, one file at a time, which then replaces it.
   * The tag is by content: a new build is a new tag even if its files have the old size and time.
   */
  const packed = new Map();
  let bestQueue = Promise.resolve();
  function pack(file, st) {
    const key = `${st.size}-${st.mtimeMs}`;
    let p = packed.get(file);
    if (p?.key === key) return p;
    p = { key };
    packed.set(file, p);
    p.ready = readFile(file)
      .then(async (buf) => {
        p.etag = `W/"${createHash('sha1').update(buf).digest('base64url').slice(0, 20)}"`;
        [p.br, p.gzip] = await Promise.all([brotli(buf, brotliAt(5, buf)), gzipped(buf, { level: 9 })]);
        bestQueue = bestQueue.then(() => brotli(buf, brotliAt(11, buf)).then((best) => (p.br = best), () => {}));
      })
      .catch(() => {
        if (packed.get(file) === p) packed.delete(file);
      });
    return p;
  }
  // Pack the web version when the server starts, one file after another (memory and the thread pool
  // stay free for sign-ins), so the first visitors already get small files.
  if (publicDir && existsSync(publicDir)) {
    const files = readdirSync(publicDir, { recursive: true })
      .map((name) => join(resolve(publicDir), String(name)))
      .filter((file) => PACKABLE.has(extname(file).toLowerCase()));
    (async () => {
      for (const file of files) {
        try {
          const st = statSync(file);
          if (st.isFile()) await pack(file, st).ready;
        } catch {}
      }
    })();
  }

  /**
   * The web version of the app: files as they are; any other path gets the app (it routes itself).
   * Text and wasm go packed (brotli or gzip, as the browser takes); every file has an ETag, so a browser
   * that has it gets 304 and nothing more. Hashed bundles keep for a year; canvaskit.wasm for a day — the
   * app asks for it with ?v=<Skia version> (index.web.ts), so a new Skia is a new address anyway.
   */
  async function serveStatic(req, res, pathname) {
    if (!publicDir) return false;
    const root = resolve(publicDir);
    let file;
    try {
      file = resolve(join(root, normalize(decodeURIComponent(pathname))));
    } catch {
      file = root;
    }
    if (!file.startsWith(root)) file = root;
    if (!existsSync(file) || !statSync(file).isFile()) {
      const html = `${file}.html`;
      file = existsSync(html) && statSync(html).isFile() ? html : join(root, 'index.html');
    }
    if (!existsSync(file)) return false;
    const st = statSync(file);
    const ext = extname(file).toLowerCase();
    const type = TYPES[ext] ?? 'application/octet-stream';
    const immutable = pathname.startsWith('/_expo/') || pathname.startsWith('/assets/');
    const cache = immutable ? 'public, max-age=31536000, immutable' : ext === '.wasm' ? 'public, max-age=86400' : 'no-cache';
    const p = PACKABLE.has(ext) ? pack(file, st) : null;
    if (p) await p.ready;
    // Big files that go as they are (the APK, pictures) are tagged by size and time, not read through.
    const etag = p?.etag ?? `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const headers = { 'content-type': type, 'cache-control': cache, etag };
    // The app for Android friends: the phone saves it under its own name (oyuur-1.0.apk), not "download".
    if (ext === '.apk') {
      const name = basename(file);
      headers['content-disposition'] = `attachment; filename="${name.replace(/[^ -~]|"/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
    }
    if (p) headers.vary = 'accept-encoding';
    const seen = String(req.headers['if-none-match'] ?? '').split(',').map((t) => t.trim().replace(/^W\//, ''));
    if (seen.includes('*') || seen.includes(etag.slice(2))) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    let body = null;
    const accept = req.headers['accept-encoding'];
    const coding = p && (takes(accept, 'br') && p.br ? 'br' : takes(accept, 'gzip') && p.gzip ? 'gzip' : null);
    if (coding) {
      body = p[coding];
      headers['content-encoding'] = coding;
    }
    headers['content-length'] = body ? body.length : st.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else if (body) res.end(body);
    else
      createReadStream(file)
        .on('error', () => res.destroy())
        .pipe(res);
    return true;
  }

  /**
   * The caller's address: the last one in X-Forwarded-For is what the homelab's own proxy saw
   * (anything before it the caller could have written). Without the header — the socket.
   */
  const clientIp = (req) => {
    const fwd = req.headers['x-forwarded-for'];
    const last = typeof fwd === 'string' ? fwd.split(',').pop().trim() : '';
    return (last || req.socket.remoteAddress || '').slice(0, 64);
  };

  async function handle(req, res) {
    const ip = clientIp(req);
    let owner = false;
    try {
      let url;
      try {
        url = new URL(req.url, 'http://local');
      } catch {
        fail(400, 'bad_path');
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, PUT, PATCH',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-max-age': '86400',
        });
        return res.end();
      }
      // The owner's page: the files themselves are no secret, the key is. Off without a key.
      const page = ownerKey && (req.method === 'GET' || req.method === 'HEAD') && OWNER_FILES[url.pathname === '/owner/' ? '/owner' : url.pathname];
      if (page) {
        res.writeHead(200, { 'content-type': page.type, ...OWNER_HEADERS });
        return res.end(req.method === 'HEAD' ? undefined : page.body);
      }
      if (url.pathname === '/owner' || url.pathname.startsWith('/owner/')) fail(404, 'not_found');
      for (const r of compiled) {
        const m = r.method === req.method && r.re.exec(url.pathname);
        if (!m) continue;
        const ownerRoute = r.auth === 'owner' || r.auth === 'owner-door';
        if (ownerRoute && !ownerKey) fail(404, 'not_found');
        owner = ownerRoute;
        let params;
        try {
          params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
        } catch {
          fail(400, 'bad_path');
        }
        let user = null;
        let token = null;
        if (r.auth === 'owner') {
          const header = req.headers.authorization ?? '';
          token = header.startsWith('Bearer ') ? header.slice(7) : null;
          if (!ownerSignedIn(token)) fail(401, 'signed_out');
        } else if (r.auth === true) {
          const header = req.headers.authorization ?? '';
          token = header.startsWith('Bearer ') ? header.slice(7) : null;
          user = token ? q.session.get(hashToken(token)) : null;
          if (!user) fail(401, 'signed_out');
          q.touch.run(now(), hashToken(token));
        }
        const body = req.method === 'GET' ? {} : await readJson(req, BODY_LIMITS[url.pathname] ?? BODY_LIMIT);
        const out = await r.handler({ user, token, body, params, query: url.searchParams, ip, res });
        if (out === ANSWERED) return;
        return send(res, 200, out, owner);
      }
      if (url.pathname.startsWith('/api/')) fail(404, 'not_found');
      if ((req.method === 'GET' || req.method === 'HEAD') && (await serveStatic(req, res, url.pathname))) return;
      fail(404, 'not_found');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code, ...e.extra }, owner);
      console.error(e);
      return send(res, 500, { error: 'server' }, owner);
    }
  }

  // Housekeeping once an hour: old sessions, unanswered requests and statistics older than 180 days go.
  const sweep = () => {
    const t = now();
    analytics.sweep();
    auth.sweep();
    db.prepare('DELETE FROM sessions WHERE seen_at < ?').run(t - SESSION_TTL);
    db.prepare("DELETE FROM friends WHERE status = 'pending' AND created_at < ?").run(t - REQUEST_TTL);
    db.prepare('DELETE FROM owner_sessions WHERE created_at < ? OR key_hash != ?').run(t - OWNER_SESSION_TTL, ownerKeyHex ?? '');
  };
  sweep();
  const sweeper = setInterval(sweep, 3_600_000);
  sweeper.unref();

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) send(res, 500, { error: 'server' });
      else res.destroy();
    });
  });
  server.on('close', () => clearInterval(sweeper));
  return server;
}
