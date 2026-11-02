// The owner's numbers (OYUUR-27): do people come back, where do they stop. Counted from the
// events table (analytics.js) on request, for GET /api/owner/stats. Days are the phone's own:
// an install's first day is its first_launch day (or day - day_n of any event, if that one is lost),
// and "day N" is day_n = N. A day counts as over by the install's own clock (its time zone).
// One pass over the table grouped by install, then plain arithmetic over installs: no event list in memory.

const DAY_MS = 86_400_000;
/** Retention days shown: "came back on day N" means any event with day_n = N. */
export const RETENTION_DAYS = [1, 2, 7, 14, 30];
/** Not seen this many whole days (by their own calendar, today not counted) — gone. */
export const GONE_AFTER = 3;
/** Watering days in a row that make a live streak, within the last week. */
export const STREAK_MIN = 3;
const STREAK_WINDOW = 7;
/** Periods the page offers: days back from today, or all of it. */
export const PERIODS = { 7: 7, 30: 30, all: null };
const MODES = ['browser', 'standalone', 'android', 'ios'];
/** Events live 180 days (analytics.js), plus phones that send late. */
const KEEP_DAYS = 200;
const CACHE_MS = 60_000;

/** 'YYYY-MM-DD' ↔ days since 1970 (UTC, no time zones involved). */
const toN = (day) => Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const toDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** Today by a time zone's calendar, as a day number; unknown zones fall back to UTC. */
function todayIn(cache, tz, now) {
  let f = cache.get(tz);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      f = null;
    }
    cache.set(tz, f);
  }
  return toN(f ? f.format(now) : new Date(now).toISOString().slice(0, 10));
}

export function createStats({ db, now }) {
  // The last event of each install; insertion order breaks ties within an hour.
  db.exec('CREATE INDEX IF NOT EXISTS events_install_at ON events(install, at)');
  const flags = ['plant', 'water'].map((n) => `MAX(name = '${n}' AND day_n = 0) AS d0_${n}`)
    .concat(RETENTION_DAYS.map((d) => `MAX(day_n = ${d}) AS r${d}`))
    .concat(['signup', 'login', 'friend_added'].map((n) => `MAX(name = '${n}') AS has_${n}`));
  const perInstall = db.prepare(`
    SELECT install,
      MIN(CASE WHEN name = 'first_launch' THEN day END) AS fl_day,
      MIN(date(day, printf('-%d days', day_n))) AS derived,
      MAX(name = 'first_launch' AND (json_extract(props, '$.existing') = 1 OR json_extract(props, '$.optIn') = 1)) AS old,
      MAX(name = 'first_launch') AS has_fl,
      MAX(day) AS last_day,
      ${flags.join(',\n      ')}
    FROM events GROUP BY install`);
  const lastEvents = db.prepare(`
    SELECT install, name, mode, tz FROM (
      SELECT install, name, mode, tz, ROW_NUMBER() OVER (PARTITION BY install ORDER BY at DESC, rowid DESC) AS k FROM events
    ) WHERE k = 1`);
  const waterDays = db.prepare("SELECT install, day FROM events WHERE name = 'water' AND day >= ? GROUP BY install, day");

  /** Answers are kept a minute: switching periods back and forth doesn't count it all again. */
  const cache = new Map();
  /** Everything for the page. `period`: '7', '30' or 'all'. */
  function stats(period) {
    const t = now();
    const kept = cache.get(period);
    if (kept && t >= kept.at && t - kept.at < CACHE_MS) return kept.answer;
    const answer = count(period, t);
    cache.set(period, { at: t, answer });
    return answer;
  }

  function count(period, t) {
    const zones = new Map();
    const lasts = new Map(lastEvents.all().map((r) => [r.install, r]));
    // Today by UTC; the earliest zone (UTC+14) can be a day ahead. Days outside what the table keeps
    // (a broken phone clock, a made-up date) are not counted at all.
    const utc = todayIn(zones, 'UTC', t);
    const all = [];
    for (const r of perInstall.all()) {
      const start = toN(r.fl_day ?? r.derived);
      const lastDay = toN(r.last_day);
      if (!Number.isFinite(start) || !Number.isFinite(lastDay) || start < utc - KEEP_DAYS || start > utc + 1) continue;
      const last = lasts.get(r.install);
      all.push({ ...r, start, lastDay, today: todayIn(zones, last.tz, t), last });
    }

    // The period: installs that arrived in its last N days, up to today (or tomorrow, if a phone is already there).
    let end = utc;
    let first = utc;
    for (const i of all) {
      if (i.start > end) end = i.start;
      if (i.start < first) first = i.start;
    }
    const span = PERIODS[period];
    const from = span ? end - span + 1 : first;
    const list = all.filter((i) => i.start >= from && i.start <= end);

    // New installs a day (updates and "statistics back on" count too, apart).
    const byDay = new Map();
    for (const i of list) {
      const d = byDay.get(i.start) ?? { day: toDay(i.start), installs: 0, old: 0 };
      d.installs++;
      if (i.old) d.old++;
      byDay.set(i.start, d);
    }
    const installsByDay = [];
    for (let n = from; n <= end; n++) installsByDay.push(byDay.get(n) ?? { day: toDay(n), installs: 0, old: 0 });

    // Came back on day N: of the installs whose day N is over (or who already came back).
    const cell = (group, d) => {
      let back = 0;
      let of = 0;
      for (const i of group) {
        const came = i[`r${d}`] === 1;
        if (came || i.start + d < i.today) of++;
        if (came) back++;
      }
      return { day: d, back, of };
    };
    const retention = RETENTION_DAYS.map((d) => cell(list, d));

    // By week of arrival (weeks start on Monday), newest first.
    const weeks = new Map();
    for (const i of list) {
      const monday = i.start - ((i.start + 3) % 7); // 1970-01-01 was a Thursday
      if (!weeks.has(monday)) weeks.set(monday, []);
      weeks.get(monday).push(i);
    }
    const cohorts = [...weeks.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([monday, group]) => ({ week: toDay(monday), installs: group.length, cells: RETENTION_DAYS.map((d) => cell(group, d)) }));

    // The first day, step by step: only new people (not an update, not statistics back on),
    // and only those whose next day is over, so "came back tomorrow" is known for all.
    const base = list.filter((i) => i.has_fl && !i.old && i.start + 1 < i.today);
    const planted = base.filter((i) => i.d0_plant);
    const watered = planted.filter((i) => i.d0_water);
    const returned = watered.filter((i) => i.r1);
    const funnel = { opened: base.length, planted: planted.length, watered: watered.length, returned: returned.length };

    // Gone: not seen GONE_AFTER days by their own calendar. On which day and after what they stopped.
    const gone = list.filter((i) => i.lastDay < i.today - GONE_AFTER);
    const buckets = [['d0', 0, 0], ['d1_2', 1, 2], ['d3_6', 3, 6], ['d7', 7, Infinity]];
    const goneDays = buckets.map(([key, lo, hi]) => ({
      key,
      count: gone.filter((i) => i.lastDay - i.start >= lo && i.lastDay - i.start <= hi).length,
    }));
    const lastNames = new Map();
    for (const i of gone) lastNames.set(i.last.name, (lastNames.get(i.last.name) ?? 0) + 1);
    const goneLast = [...lastNames.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));

    // Where they run: the mode of the latest event.
    const modes = MODES.map((mode) => ({ mode, installs: list.filter((i) => i.last.mode === mode).length }));

    const social = {
      signup: list.filter((i) => i.has_signup).length,
      login: list.filter((i) => i.has_login && !i.has_signup).length,
      friend: list.filter((i) => i.has_friend_added).length,
    };

    // Live, whenever they came: seen in the last week; a streak — watered STREAK_MIN+ days in a row within it.
    const inList = new Map(all.map((i) => [i.install, i]));
    const days = new Map();
    for (const r of waterDays.all(toDay(end - STREAK_WINDOW - 1))) {
      const i = inList.get(r.install);
      const n = toN(r.day);
      if (!i || n <= i.today - STREAK_WINDOW || n > i.today) continue;
      if (!days.has(i.install)) days.set(i.install, []);
      days.get(i.install).push(n);
    }
    let streaks = 0;
    for (const ns of days.values()) {
      ns.sort((a, b) => a - b);
      let run = 1;
      let best = 1;
      for (let k = 1; k < ns.length; k++) {
        run = ns[k] === ns[k - 1] + 1 ? run + 1 : 1;
        best = Math.max(best, run);
      }
      if (best >= STREAK_MIN) streaks++;
    }
    const active = all.filter((i) => i.lastDay > i.today - STREAK_WINDOW).length;

    return {
      period: span ? String(span) : 'all',
      from: toDay(from),
      to: toDay(end),
      installs: list.length,
      old: list.filter((i) => i.old).length,
      active,
      streaks,
      installsByDay,
      retention,
      cohorts,
      funnel,
      gone: { count: gone.length, days: goneDays, last: goneLast },
      modes,
      social,
    };
  }

  return { stats };
}
