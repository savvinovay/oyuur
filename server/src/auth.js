// Accounts: sign up, sign in, the recovery code, a new password, deleting the account.
// Sign-in v2 (OYUUR-30, design/oyuur-30/план.md «Вход v2»; design/oyuur-29/спец.md Т5): the password
// and the recovery code never leave the phone. The phone makes keys from them with scrypt + HKDF
// (parameters `kdf` / `recKdf`, kept here) and sends only the sign-in key (`auth`, `recAuth`,
// 32 bytes); the server keeps a scrypt hash of that key in pass_* / rec_*. The key that will lock
// hidden trees (OYUUR-31) is made from the password with another label: the server can't get it.
// Old accounts (auth_v = 1) still sign in with the password itself and move to v2 from the phone
// (/api/auth/upgrade). Old apps (APK 1.0) keep working with old accounts, byte for byte.
import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { serverSecret } from './db.js';

/** "Forgot the password": the ticket from step 1 lives this long, once. */
const TICKET_TTL = 10 * 60_000;
/** A new password without the old one on a signed-in device: this many a day per account. */
const RESETS_A_DAY = 3;
/** scrypt N for nicks that don't exist (the phone's default; spec Т4.2). */
const FAKE_N = 2 ** 15;
/** A box (OYUUR-31, AES-256-GCM): nonce 12 + data key 32 + tag 16. The key id: 8 bytes of its SHA-256. */
const BOX_BYTES = 60;
const KID_BYTES = 8;

// scrypt runs off the main thread: a password check doesn't stop the server for everyone.
const scryptAsync = (secret, salt) => new Promise((ok, no) => scrypt(secret, salt, 64, (e, key) => (e ? no(e) : ok(key))));
export async function hashSecret(secret, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: (await scryptAsync(secret, salt)).toString('hex') };
}
export async function secretMatches(secret, salt, hash) {
  if (!salt || !hash || typeof secret !== 'string') return false;
  const got = await scryptAsync(secret, salt);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}
const goodPassword = (p) => typeof p === 'string' && p.length >= 6 && p.length <= 200;

/** A one-time code to set a new password (there is no e-mail): 12 letters and digits, shown once. */
function newRecovery() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(12), (b) => abc[b % abc.length]).join('');
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const B64URL = /^[A-Za-z0-9_-]+$/;
/** base64url of exactly n bytes. */
const isBytes = (v, n) => typeof v === 'string' && v.length === Math.ceil((n * 4) / 3) && B64URL.test(v) && Buffer.from(v, 'base64url').length === n;
/** A sign-in key (`auth`, `recAuth`, `oldAuth`): 32 bytes. */
export const isKey = (v) => isBytes(v, 32);

/** How the phone makes its keys: scrypt, N a power of two 2^13…2^17, r 8, p 1, a 16-byte salt. Null — not that. */
export function cleanKdf(k) {
  if (!isObj(k) || k.alg !== 'scrypt' || k.r !== 8 || k.p !== 1 || !isBytes(k.salt, 16)) return null;
  if (!Number.isInteger(k.N) || k.N < 2 ** 13 || k.N > 2 ** 17 || (k.N & (k.N - 1)) !== 0) return null;
  return { alg: 'scrypt', N: k.N, r: 8, p: 1, salt: k.salt };
}

/**
 * The account routes for createApp. Shared bits of app.js come in `deps`; `sync` is the forest in
 * the account (sync.js): deleting the account and a new data key touch its records.
 */
export function createAuth({ db, now, fail, limit, count, failures, issueToken, hashToken, me, q, validNick, normNick, cleanName, avatars, freeLike, sync }) {
  const nickSecret = serverSecret(db, 'nick-salt');
  /** A salt for a nick that doesn't exist: made up, but the same every time (no "this nick is free" by a new salt). */
  const fakeSalt = (nick, what) => createHmac('sha256', nickSecret).update(`${what}:${nick}`).digest().subarray(0, 16).toString('base64url');
  const kdfOf = (text) => (text ? JSON.parse(text) : null);

  /**
   * A box (OYUUR-31): the data key locked with the password (wrapP) or the code (wrapR) —
   * 12 bytes of nonce, 32 of key, 16 of tag. Null — not sent.
   */
  function box(body, name) {
    const v = body[name];
    if (v === undefined || v === null) return null;
    if (!isBytes(v, BOX_BYTES)) fail(400, `bad_${name}`);
    return v;
  }
  /** Both boxes and the key id: all three or none (null). A part of them would lock the key away. */
  function boxes(body) {
    const wrapP = box(body, 'wrapP');
    const wrapR = box(body, 'wrapR');
    const kid = body.kid === undefined || body.kid === null ? null : body.kid;
    if (kid !== null && !isBytes(kid, KID_BYTES)) fail(400, 'bad_kid');
    const n = [wrapP, wrapR, kid].filter((v) => v !== null).length;
    if (n === 0) return null;
    if (n < 3) fail(400, 'bad_keys');
    return { wrapP, wrapR, kid };
  }
  /**
   * An account's data key never changes (only a new one on "forgot the password" without it,
   * reset-device with newDek): with a key, new boxes must come, and for the same key.
   */
  function sameKey(user, b) {
    if (!user.key_id) return;
    if (!b) fail(400, 'bad_keys');
    if (b.kid !== user.key_id) fail(409, 'wrong_kid', { kid: user.key_id });
  }
  function kdfField(body, name) {
    const k = cleanKdf(body[name]);
    if (!k) fail(400, `bad_${name}`);
    return k;
  }
  function keyField(body, name) {
    if (!isKey(body[name])) fail(400, `bad_${name}`);
    return body[name];
  }
  /** Everything a v2 account needs about the password and the code (and the boxes, if any). */
  function v2Fields(body) {
    return {
      kdf: kdfField(body, 'kdf'),
      auth: keyField(body, 'auth'),
      recKdf: kdfField(body, 'recKdf'),
      recAuth: keyField(body, 'recAuth'),
      boxes: boxes(body),
    };
  }

  /**
   * Sets sign-in v2 with new boxes for the account's key (or its first key). No boxes — the
   * account has no key and keeps none (`AND key_id IS NULL`: a key made meanwhile isn't locked
   * away by stale boxes). `replace` — a new data key (reset-device with newDek): whatever came.
   * Returns how many rows changed (0 — the account moved on meanwhile).
   */
  async function setV2(userId, f, { where = '', replace = false } = {}) {
    const pass = await hashSecret(f.auth);
    const rec = await hashSecret(f.recAuth);
    const b = f.boxes ?? { wrapP: null, wrapR: null, kid: null };
    const keyWhere = replace ? '' : f.boxes ? 'AND (key_id IS NULL OR key_id = ?)' : 'AND key_id IS NULL';
    const args = replace || !f.boxes ? [] : [b.kid];
    return db
      .prepare(`UPDATE users SET auth_v = 2, pass_salt = ?, pass_hash = ?, rec_salt = ?, rec_hash = ?, kdf = ?, rec_kdf = ?, wrap_p = ?, wrap_r = ?, key_id = ? WHERE id = ? ${where} ${keyWhere}`)
      .run(pass.salt, pass.hash, rec.salt, rec.hash, JSON.stringify(f.kdf), JSON.stringify(f.recKdf), b.wrapP, b.wrapR, b.kid, userId, ...args).changes;
  }
  /** The key changed under a write (another device made the first one): 409 with the account's key id. */
  const keyMoved = (userId) => fail(409, 'wrong_kid', { kid: q.userById.get(userId)?.key_id ?? null });

  const dropOtherSessions = (userId, token) => db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, hashToken(token));
  /** "Forgot the password" started before the password or the code changed can't be finished any more. */
  const dropTickets = (userId) => db.prepare('DELETE FROM recover_tickets WHERE user_id = ?').run(userId);

  /** The secret of the account matches: the sign-in key for v2, the password itself for v1. */
  const signInMatches = (user, body) =>
    user.auth_v === 2 ? isKey(body.auth) && secretMatches(body.auth, user.pass_salt, user.pass_hash) : secretMatches(body.password, user.pass_salt, user.pass_hash);

  function newTicket(userId) {
    const ticket = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO recover_tickets (token_hash, user_id, created_at) VALUES (?, ?, ?)').run(hashToken(ticket), userId, now());
    return ticket;
  }

  const routes = [
    // How the phone makes the keys for this nick. A nick that doesn't exist looks like a v2 one.
    ['GET', '/api/auth/params', ({ query, ip }) => {
      limit(`params:${ip}`, 60, 60_000);
      const nick = normNick(query.get('nick') ?? '').slice(0, 40);
      const user = validNick(nick) ? q.userByNick.get(nick) : null;
      if (user && !user.deleted) {
        if (user.auth_v === 2) return { v: 2, kdf: kdfOf(user.kdf), recKdf: kdfOf(user.rec_kdf) };
        return { v: 1, kdf: null, recKdf: null };
      }
      const fake = (what) => ({ alg: 'scrypt', N: FAKE_N, r: 8, p: 1, salt: fakeSalt(nick, what) });
      return { v: 2, kdf: fake('p'), recKdf: fake('r') };
    }, false],

    // v2: keys only, the code was made (and shown) by the phone. Old apps: the password, the code comes back.
    ['POST', '/api/signup', async ({ body, ip }) => {
      limit(`signup:${ip}`, 10, 3_600_000);
      const nick = normNick(body.nick);
      if (!validNick(nick)) fail(400, 'bad_nick');
      const v2 = body.password === undefined && body.auth !== undefined;
      const f = v2 ? v2Fields(body) : null;
      if (!v2 && !goodPassword(body.password)) fail(400, 'bad_password');
      if (q.userByNick.get(nick)) fail(409, 'nick_taken', { suggestions: freeLike(nick) });
      const id = randomUUID();
      const pass = await hashSecret(v2 ? f.auth : body.password);
      const recovery = v2 ? null : newRecovery();
      const rec = await hashSecret(v2 ? f.recAuth : recovery);
      if (q.userByNick.get(nick)) fail(409, 'nick_taken', { suggestions: freeLike(nick) });
      const avatar = avatars.has(body.avatar) ? body.avatar : 'fox';
      const color = Number.isInteger(body.color) && body.color >= 0 && body.color < 8 ? body.color : 0;
      db.prepare('INSERT INTO users (id, nick, pass_salt, pass_hash, rec_salt, rec_hash, name, avatar, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, nick, pass.salt, pass.hash, rec.salt, rec.hash, cleanName(body.name), avatar, color, now());
      if (v2) {
        const b = f.boxes ?? { wrapP: null, wrapR: null, kid: null };
        db.prepare('UPDATE users SET auth_v = 2, kdf = ?, rec_kdf = ?, wrap_p = ?, wrap_r = ?, key_id = ? WHERE id = ?')
          .run(JSON.stringify(f.kdf), JSON.stringify(f.recKdf), b.wrapP, b.wrapR, b.kid, id);
        return { token: issueToken(id), user: me(q.userById.get(id)) };
      }
      return { token: issueToken(id), user: me(q.userById.get(id)), recoveryCode: recovery };
    }, false],

    // Wrong passwords lock that nick from that address (10 in 10 min), and the nick from
    // everywhere only after many more (100 in an hour): a stranger can't lock someone out.
    // v2 accounts: only the sign-in key; the password itself is never taken for them.
    ['POST', '/api/login', async ({ body, ip }) => {
      limit(`login:${ip}`, 30, 600_000);
      const nick = normNick(body.nick);
      if (!validNick(nick)) fail(401, 'wrong_login');
      if (failures(`loginfail:${nick}:${ip}`) >= 10 || failures(`loginfail:${nick}`) >= 100) fail(429, 'too_many');
      const user = q.userByNick.get(nick);
      const v2 = body.auth !== undefined;
      // A v2 account and a password: not a guess at the key, just an old app — not counted as a try.
      if (user && !user.deleted && user.auth_v === 2 && !v2) fail(401, 'wrong_login');
      const ok = user && !user.deleted && (v2 ? user.auth_v === 2 : user.auth_v !== 2) && (await signInMatches(user, body));
      if (!ok) {
        count(`loginfail:${nick}:${ip}`, 600_000);
        count(`loginfail:${nick}`, 3_600_000);
        fail(401, 'wrong_login');
      }
      // Said only to someone who knows the password.
      if (user.banned_at) fail(403, 'banned');
      if (v2) return { token: issueToken(user.id), user: me(user), wrapP: user.wrap_p ?? null, kid: user.key_id ?? null };
      return { token: issueToken(user.id), user: me(user), legacy: true };
    }, false],

    // An old account moves to v2 from a phone that has just signed in with the password. Whoever is first wins.
    ['POST', '/api/auth/upgrade', async ({ user, body }) => {
      limit(`upgrade:${user.id}`, 10, 3_600_000);
      if (user.auth_v === 2) fail(409, 'already_v2');
      const f = v2Fields(body);
      if (!(await secretMatches(body.password, user.pass_salt, user.pass_hash))) fail(401, 'wrong_password');
      sameKey(user, f.boxes);
      if ((await setV2(user.id, f, { where: 'AND auth_v = 1' })) === 0) {
        if (q.userById.get(user.id)?.auth_v === 2) fail(409, 'already_v2');
        keyMoved(user.id);
      }
      dropTickets(user.id);
      return { ok: true, user: me(q.userById.get(user.id)) };
    }, true],

    // OYUUR-31: a device signed in without the data key (a tester since the update, or a key made on
    // another device) asks for the box the password opens. v2 only; 10 an hour per account.
    ['POST', '/api/auth/unlock', async ({ user, body }) => {
      limit(`unlock:${user.id}`, 10, 3_600_000);
      if (user.auth_v !== 2) fail(409, 'legacy');
      if (!(await signInMatches(user, body))) fail(401, 'wrong_password');
      return { wrapP: user.wrap_p ?? null, kid: user.key_id ?? null };
    }, true],

    // OYUUR-31: the first data key of a v2 account that has none (moved in OYUUR-30). Both boxes
    // need a new recovery code (the old code itself is known nowhere). The first device wins; the
    // second gets the box of the key that won (the password was checked), and opens that.
    ['POST', '/api/auth/keys', async ({ user, body }) => {
      limit(`keys:${user.id}`, 10, 3_600_000);
      if (user.auth_v !== 2) fail(409, 'legacy');
      const recKdf = kdfField(body, 'recKdf');
      const recAuth = keyField(body, 'recAuth');
      const b = boxes(body);
      if (!b) fail(400, 'bad_keys');
      if (!(await signInMatches(user, body))) fail(401, 'wrong_password');
      const rec = await hashSecret(recAuth);
      const changed = db
        .prepare('UPDATE users SET rec_salt = ?, rec_hash = ?, rec_kdf = ?, wrap_p = ?, wrap_r = ?, key_id = ? WHERE id = ? AND key_id IS NULL')
        .run(rec.salt, rec.hash, JSON.stringify(recKdf), b.wrapP, b.wrapR, b.kid, user.id).changes;
      if (changed === 0) {
        const now = q.userById.get(user.id);
        fail(409, 'has_keys', { wrapP: now.wrap_p ?? null, kid: now.key_id ?? null });
      }
      dropTickets(user.id);
      return { ok: true, user: me(q.userById.get(user.id)) };
    }, true],

    // A new password with the old one (v2). Other devices are signed out; this one stays.
    // With a data key, the new box for the password comes too (the code's box stays).
    ['POST', '/api/password', async ({ user, body, token }) => {
      limit(`password:${user.id}`, 10, 3_600_000);
      if (user.auth_v !== 2) fail(409, 'legacy');
      const kdf = kdfField(body, 'kdf');
      const auth = keyField(body, 'auth');
      const wrapP = box(body, 'wrapP');
      if (!isKey(body.oldAuth) || !(await secretMatches(body.oldAuth, user.pass_salt, user.pass_hash))) fail(401, 'wrong_password');
      if (!user.key_id !== !wrapP) fail(400, 'bad_wrapP');
      const pass = await hashSecret(auth);
      const changed = db
        .prepare('UPDATE users SET pass_salt = ?, pass_hash = ?, kdf = ?, wrap_p = ? WHERE id = ? AND key_id IS ?')
        .run(pass.salt, pass.hash, JSON.stringify(kdf), wrapP, user.id, user.key_id ?? null).changes;
      if (changed === 0) keyMoved(user.id);
      dropOtherSessions(user.id, token);
      dropTickets(user.id);
      return { ok: true };
    }, true],

    // "Forgot the password" on a device that is signed in (spec 3.7 A): a new password and code, no old one.
    // With the data key: its new boxes. newDek — the device has no data key: a new one (or none),
    // the chest can't be opened any more and goes.
    ['POST', '/api/password/reset-device', async ({ user, body, token }) => {
      const f = v2Fields(body);
      if (body.newDek !== undefined && typeof body.newDek !== 'boolean') fail(400, 'bad_newDek');
      if (!body.newDek) sameKey(user, f.boxes);
      limit(`reset:${user.id}`, RESETS_A_DAY, 86_400_000);
      if ((await setV2(user.id, f, { replace: !!body.newDek })) === 0) keyMoved(user.id);
      if (body.newDek) sync.dropVault(user.id);
      dropOtherSessions(user.id, token);
      dropTickets(user.id);
      return { ok: true, user: me(q.userById.get(user.id)) };
    }, true],

    // A new recovery code (spec 3.5): the old one stops working. v2 only. With a data key, its new box.
    ['POST', '/api/recovery-code', async ({ user, body }) => {
      limit(`reccode:${user.id}`, 10, 3_600_000);
      if (user.auth_v !== 2) fail(409, 'legacy');
      const recKdf = kdfField(body, 'recKdf');
      const recAuth = keyField(body, 'recAuth');
      const wrapR = box(body, 'wrapR');
      if (!isKey(body.auth) || !(await secretMatches(body.auth, user.pass_salt, user.pass_hash))) fail(401, 'wrong_password');
      if (!user.key_id !== !wrapR) fail(400, 'bad_wrapR');
      const rec = await hashSecret(recAuth);
      const changed = db
        .prepare('UPDATE users SET rec_salt = ?, rec_hash = ?, rec_kdf = ?, wrap_r = ? WHERE id = ? AND key_id IS ?')
        .run(rec.salt, rec.hash, JSON.stringify(recKdf), wrapR, user.id, user.key_id ?? null).changes;
      if (changed === 0) keyMoved(user.id);
      dropTickets(user.id);
      return { ok: true };
    }, true],

    // Forgot the password. v2: {nick, recAuth} → a ticket for /api/recover/finish. An old account from a
    // new app: {nick, code} → a ticket too (it moves to v2 at the finish). An old app: {nick, code, password}
    // sets the new password at once, as before — for old accounts only.
    ['POST', '/api/recover', async ({ body, ip }) => {
      limit(`recover:${ip}`, 10, 3_600_000);
      const nick = normNick(body.nick);
      if (!validNick(nick)) fail(401, 'wrong_code');
      if (failures(`recoverfail:${nick}:${ip}`) >= 5 || failures(`recoverfail:${nick}`) >= 50) fail(429, 'too_many');
      const oldApp = body.password !== undefined;
      if (oldApp && !goodPassword(body.password)) fail(400, 'bad_password');
      const user = q.userByNick.get(nick);
      const live = user && !user.deleted;
      if (oldApp && live && user.auth_v === 2) fail(409, 'upgrade_app');
      const v2 = body.recAuth !== undefined;
      const code = typeof body.code === 'string' ? body.code.trim().toLowerCase().replace(/[\s-]/g, '').slice(0, 40) : '';
      const ok =
        live &&
        (v2
          ? user.auth_v === 2 && isKey(body.recAuth) && (await secretMatches(body.recAuth, user.rec_salt, user.rec_hash))
          : user.auth_v !== 2 && !!code && (await secretMatches(code, user.rec_salt, user.rec_hash)));
      if (!ok) {
        count(`recoverfail:${nick}:${ip}`, 3_600_000);
        count(`recoverfail:${nick}`, 3_600_000);
        fail(401, 'wrong_code');
      }
      if (user.banned_at) fail(403, 'banned');
      if (v2) return { ticket: newTicket(user.id), kdf: kdfOf(user.kdf), wrapR: user.wrap_r ?? null, kid: user.key_id ?? null };
      if (!oldApp) return { ticket: newTicket(user.id), legacy: true };
      const pass = await hashSecret(body.password);
      const recovery = newRecovery();
      const rec = await hashSecret(recovery);
      db.prepare('UPDATE users SET pass_salt = ?, pass_hash = ?, rec_salt = ?, rec_hash = ? WHERE id = ?').run(pass.salt, pass.hash, rec.salt, rec.hash, user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      dropTickets(user.id);
      return { token: issueToken(user.id), user: me(user), recoveryCode: recovery };
    }, false],

    // Step 2: the new password and code (as keys). The account is v2 after it; every session ends, a new one starts.
    ['POST', '/api/recover/finish', async ({ body, ip }) => {
      limit(`finish:${ip}`, 20, 3_600_000);
      const f = v2Fields(body);
      if (typeof body.ticket !== 'string' || body.ticket.length > 100) fail(401, 'bad_ticket');
      const ticketHash = hashToken(body.ticket);
      const row = db.prepare('SELECT user_id, created_at FROM recover_tickets WHERE token_hash = ?').get(ticketHash);
      if (!row || row.created_at < now() - TICKET_TTL) fail(401, 'bad_ticket');
      const user = q.userById.get(row.user_id);
      if (!user || user.deleted) fail(401, 'bad_ticket');
      if (user.banned_at) fail(403, 'banned');
      // The code's box gives the same key back: new boxes for it (a box left behind would open nothing).
      // Checked before the ticket is used up: a refused finish can be sent again with the right boxes.
      sameKey(user, f.boxes);
      // Used up now, at once: two finishes with one ticket can't both pass.
      if (!db.prepare('DELETE FROM recover_tickets WHERE token_hash = ? RETURNING user_id').get(ticketHash)) fail(401, 'bad_ticket');
      if ((await setV2(user.id, f)) === 0) keyMoved(user.id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      db.prepare('DELETE FROM recover_tickets WHERE user_id = ?').run(user.id);
      return { token: issueToken(user.id), user: me(q.userById.get(user.id)) };
    }, false],

    // Everything about the person goes: name, password, the forest in the account, friends, blocks,
    // cheers, their reports. The row stays only as "a deleted account" so the other side's shared
    // trees end as memories (spec 8.7) instead of vanishing. v2: {auth}; v1: {password}.
    ['POST', '/api/me/delete', async ({ user, body }) => {
      limit(`delete:${user.id}`, 5, 3_600_000);
      if (!(await signInMatches(user, body))) fail(401, 'wrong_password');
      const t = now();
      db.prepare("UPDATE shared_trees SET status = 'ended', ended_at = ? WHERE status IN ('proposed', 'active') AND (proposer = ? OR partner = ?)").run(t, user.id, user.id);
      for (const sql of [
        'DELETE FROM sessions WHERE user_id = ?',
        'DELETE FROM friends WHERE a = ?1 OR b = ?1',
        'DELETE FROM blocks WHERE blocker = ?1 OR blocked = ?1',
        'DELETE FROM cheers WHERE sender = ?1 OR receiver = ?1',
        'DELETE FROM reports WHERE reporter = ?',
        'DELETE FROM shared_waterings WHERE user_id = ?',
        'DELETE FROM records WHERE user_id = ?',
        'DELETE FROM watering_seen WHERE user_id = ?',
        'DELETE FROM recover_tickets WHERE user_id = ?',
      ]) db.prepare(sql).run(user.id);
      db.prepare(
        "UPDATE users SET nick = ?, pass_salt = '', pass_hash = '', rec_salt = NULL, rec_hash = NULL, name = NULL, public = NULL, public_at = NULL, deleted = 1, " +
          'kdf = NULL, rec_kdf = NULL, wrap_p = NULL, wrap_r = NULL, key_id = NULL WHERE id = ?',
      ).run(`~${user.id}`, user.id);
      return { ok: true };
    }, true],
  ];

  return {
    routes,
    /** Housekeeping: old tickets go. */
    sweep: () => db.prepare('DELETE FROM recover_tickets WHERE created_at < ?').run(now() - TICKET_TTL),
  };
}
