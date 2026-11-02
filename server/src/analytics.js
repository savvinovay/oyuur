// Usage statistics (OYUUR-26): do testers come back on day 1/2/7/14, where do they stop.
// The phone sends batches of events to POST /api/events, no sign-in. Each phone has its own
// random install id that is not tied to the account or the @nick. The server keeps only the
// fields listed below: no names of habits or trees, no nicks, no texts, not even the address.
// The same list lives on the phone: app/src/net/events.ts (keep them in step).
// Nothing is given out here: the owner's page is OYUUR-27.

/** Events and the extra fields each may carry: 'bool', 'int' (0…100 000) or a RegExp. Anything else is dropped. */
export const EVENTS = {
  first_launch: { existing: 'bool', optIn: 'bool' },
  app_open: {},
  plant: { seed: 'bool', generation: 'int' },
  water: {},
  chance_used: { days: 'int' },
  tree_died: { days: 'int' },
  lock_in: { days: 'int' },
  signup: {},
  login: { recover: 'bool' },
  friend_request: {},
  friend_added: {},
  shared_propose: {},
  shared_accept: {},
  purchase: { item: /^(tree|meadow):[a-z]{2,12}$/ },
  install_card_shown: {},
  install_card_closed: {},
};
const MODES = new Set(['browser', 'standalone', 'android', 'ios']);

/** One batch: at most this many events (the phone sends 50). */
export const BATCH_MAX = 50;
/** Batches an hour from one address (friends behind one router share it) and from one install. */
const PER_IP_HOUR = 120;
const PER_INSTALL_HOUR = 30;
/** Events a day from one install (more is not a person), from one address, and from everyone: the disk is small. */
const PER_INSTALL_DAY = 2000;
const PER_IP_DAY = 5000;
const ALL_DAY = 200_000;
/** Times are kept to the hour: an exact time would match the account's own creation time and undo the anonymity. */
const HOUR = 3_600_000;
const toHour = (ms) => Math.floor(ms / HOUR) * HOUR;
/** Events are kept this long. */
export const KEEP_MS = 180 * 86_400_000;
/** An event's own time may be this far back (a phone offline for weeks) or ahead (a wrong clock). */
const PAST_MS = 90 * 86_400_000;
const FUTURE_MS = 2 * 86_400_000;

const INSTALL = /^[A-Za-z0-9_-]{16,40}$/;
const EVENT_ID = /^[A-Za-z0-9_-]{6,40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TZ = /^[A-Za-z0-9_+\-/]{1,40}$/;
const VERSION = /^\d{1,3}(\.\d{1,3}){0,2}$/;
const LANG = /^[a-z]{2}$/;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  install TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  -- The phone's time (ms, to the hour) and its own calendar day, time zone, days since the first launch.
  at INTEGER NOT NULL,
  day TEXT NOT NULL,
  day_n INTEGER NOT NULL,
  tz TEXT NOT NULL,
  -- browser / standalone (Home Screen) / android / ios.
  mode TEXT NOT NULL,
  version TEXT NOT NULL,
  lang TEXT NOT NULL,
  -- The event's own fields from EVENTS, as JSON; null — none.
  props TEXT,
  received_at INTEGER NOT NULL,
  PRIMARY KEY (install, id)
);
CREATE INDEX IF NOT EXISTS events_name_day ON events(name, day);
CREATE INDEX IF NOT EXISTS events_received ON events(received_at);
`;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The event's own fields that are on the list; the rest is dropped. null — none left. */
function cleanProps(name, raw) {
  if (!isObj(raw)) return null;
  const out = {};
  for (const [key, rule] of Object.entries(EVENTS[name])) {
    const v = raw[key];
    if (rule === 'bool' ? typeof v === 'boolean' : rule === 'int' ? Number.isInteger(v) && v >= 0 && v <= 100_000 : typeof v === 'string' && rule.test(v)) {
      out[key] = v;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** One event as the table keeps it, or null if it doesn't pass. */
export function cleanEvent(e, now) {
  if (!isObj(e) || typeof e.name !== 'string' || !Object.hasOwn(EVENTS, e.name)) return null;
  const ok =
    typeof e.id === 'string' && EVENT_ID.test(e.id) &&
    Number.isInteger(e.at) && e.at > now - PAST_MS && e.at < now + FUTURE_MS &&
    typeof e.day === 'string' && DAY.test(e.day) &&
    Number.isInteger(e.dayN) && e.dayN >= 0 && e.dayN <= 10_000 &&
    typeof e.tz === 'string' && TZ.test(e.tz) &&
    MODES.has(e.mode) &&
    typeof e.v === 'string' && VERSION.test(e.v) &&
    typeof e.lang === 'string' && LANG.test(e.lang);
  if (!ok) return null;
  const props = cleanProps(e.name, e.props);
  return { id: e.id, name: e.name, at: toHour(e.at), day: e.day, dayN: e.dayN, tz: e.tz, mode: e.mode, v: e.v, lang: e.lang, props };
}

/**
 * The events table and the door to it. `fail(status, code)` throws the server's own error;
 * `limit(key, max, windowMs)` is the server's rate limit (throws 429).
 */
export function createAnalytics({ db, now, fail, limit }) {
  db.exec(SCHEMA);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO events (install, id, name, at, day, day_n, tz, mode, version, lang, props, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const purge = db.prepare('DELETE FROM events WHERE received_at < ?');

  /** POST /api/events: { install, events: [...] } → how many were new, and how many didn't pass. */
  function accept(body, ip) {
    limit(`ev-ip:${ip}`, PER_IP_HOUR, 3_600_000);
    const install = body.install;
    if (typeof install !== 'string' || !INSTALL.test(install) || !Array.isArray(body.events)) fail(400, 'bad_events');
    if (body.events.length > BATCH_MAX) fail(413, 'too_big');
    limit(`ev-in:${install}`, PER_INSTALL_HOUR, 3_600_000);
    const t = now();
    const events = body.events.map((e) => cleanEvent(e, t));
    const good = events.filter(Boolean);
    // Counts every event that passed, new or a repeat: a phone resending the same batch still adds up.
    for (let i = 0; i < good.length; i++) {
      limit(`ev-day:${install}`, PER_INSTALL_DAY, 86_400_000);
      limit(`ev-ipday:${ip}`, PER_IP_DAY, 86_400_000);
      limit('ev-all', ALL_DAY, 86_400_000);
    }
    let added = 0;
    const received = toHour(t);
    db.exec('BEGIN');
    try {
      for (const e of good) {
        const r = insert.run(install, e.id, e.name, e.at, e.day, e.dayN, e.tz, e.mode, e.v, e.lang, e.props ? JSON.stringify(e.props) : null, received);
        added += Number(r.changes);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { ok: true, added, dropped: events.length - good.length };
  }

  /** Housekeeping: events older than 180 days go. */
  const sweep = () => purge.run(now() - KEEP_MS);

  return { accept, sweep };
}
