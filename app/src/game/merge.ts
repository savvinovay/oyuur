// Two forests become one (OYUUR-30; design/oyuur-29/спец.md 4.1–4.4, Т3). Pure functions: no
// storage, no clock. Every merge gives the same answer whatever the order (merge(a, b) = merge(b, a))
// and repeating it changes nothing (merge(a, a) = a), so any number of phones agree in the end.
// - Facts are added up: waterings, the lock-in, purchases, rewards, quests done.
// - What follows from the facts (chances, frozen days, death) is worked out again from the planting
//   day by the same settle() as on one phone, never copied from another phone.
// - Choices (the tree's name, kind, who sees it, the watering hour, a place, the meadow) — the
//   latest change wins, by a hybrid clock (HLC) per field.
// - A deleted habit (tomb) beats everything; a lock-in can't be undone; a death is final once the
//   next generation grows from its seed.
import { AchievementId, ACHIEVEMENT_IDS, Claimed } from './achievements';
import { DayKey } from './dates';
import { ItemId, Shop } from './economy';
import { Cell, cellKey, MAX_PLOT, Plot, PlotHabit, plotSizeFor, syncPlot } from './plot';
import { Quests } from './quests';
import { MAX_CHANCES, migrateOpenHours, OpenHourEntry, settle, Tree, TreeStamps, Visibility } from './tree';

// ---- The hybrid clock ----
// `<ms, 13 digits>-<counter, 4 digits>-<deviceId>`: compares as a plain string. A change takes
// max(the phone's clock, the latest time seen) + 1 in the counter, so a phone whose clock runs
// ahead doesn't win for ever: the others catch up with its time and their next change is newer.
// '' — no time (older data): loses to any change.

export type Hlc = string;

const HLC_RE = /^(\d{13})-(\d{4})-/;
const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** The time of a new change made on this phone. `last` — the latest time this phone has seen. */
export function hlcNext(last: Hlc, nowMs: number, deviceId: string): Hlc {
  const m = HLC_RE.exec(last);
  const lastMs = m ? Number(m[1]) : 0;
  let ms = Math.max(Math.floor(nowMs), lastMs);
  let n = m && lastMs === ms ? Number(m[2]) + 1 : 0;
  if (n > 9999) {
    ms += 1;
    n = 0;
  }
  return `${pad(ms, 13)}-${pad(n, 4)}-${deviceId}`;
}

export const hlcMax = (a: Hlc, b: Hlc): Hlc => (a >= b ? a : b);

/** A time the server wrote (ms): for changes the server tells about without a phone's stamp. */
export const hlcOfServer = (ms: number): Hlc => `${pad(Math.max(0, Math.floor(ms)), 13)}-0000-server`;

/** The later of two choices; equal times (two old ones) — the same pick on every phone. */
function lww<T>(sa: Hlc | undefined, va: T, sb: Hlc | undefined, vb: T): { value: T; stamp: Hlc; first: boolean } {
  const a = sa ?? '';
  const b = sb ?? '';
  if (a !== b) return a > b ? { value: va, stamp: a, first: true } : { value: vb, stamp: b, first: false };
  const first = JSON.stringify(va) >= JSON.stringify(vb);
  return { value: first ? va : vb, stamp: a, first };
}

const minDay = (a: DayKey | null, b: DayKey | null) => (a === null ? b : b === null ? a : a < b ? a : b);
const maxDay = (a: DayKey | null, b: DayKey | null) => (a === null ? b : b === null ? a : a > b ? a : b);
const union = (a: string[], b: string[]) => [...new Set([...a, ...b])].sort();
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---- One tree ----

/**
 * The watering hour. Past entries are facts (setOpenHour only changes days after today), so the
 * entries of both phones up to today are kept; a day both changed and the coming days come from
 * the phone whose change is later (stamps.openHours). Then cleaned like saved data.
 */
function mergeOpenHours(a: Tree, b: Tree, today: DayKey, aWins: boolean): OpenHourEntry[] {
  const [win, lose] = aWins ? [a, b] : [b, a];
  const byDay = new Map<DayKey, number>();
  for (const e of lose.openHours ?? []) if (e.from <= today) byDay.set(e.from, e.hour);
  for (const e of win.openHours ?? []) byDay.set(e.from, e.hour);
  const list = [...byDay.entries()].map(([from, hour]) => ({ from, hour }));
  return migrateOpenHours(list, a.plantedOn);
}

/** A tree without its stamps (the merged ones are put back; none — no field at all). */
function bare(t: Tree): Tree {
  const { stamps: _stamps, ...rest } = t;
  return rest;
}

/** What follows from the facts (worked out by settle) — compared when the facts are the same. */
const derived = (t: Tree) => JSON.stringify([t.settledThrough, t.diedOn, t.chancesLeft, t.refilledMonth, t.frozen]);

/**
 * One tree from two copies (the same id). `laterGeneration` — a tree already grows from this one's
 * seed: its death is then final, late waterings don't bring it back (спец 4.2).
 */
export function mergeTree(a: Tree, b: Tree, today: DayKey, laterGeneration = false): Tree {
  const sa: TreeStamps = a.stamps ?? {};
  const sb: TreeStamps = b.stamps ?? {};
  const nick = lww(sa.nickname, a.nickname, sb.nickname, b.nickname);
  const skin = lww(sa.skin, a.skin, sb.skin, b.skin);
  const vis = lww(sa.visibility, a.visibility, sb.visibility, b.visibility);
  const hours = lww(sa.openHours, a.openHours, sb.openHours, b.openHours);
  const stamps: TreeStamps = {};
  if (nick.stamp) stamps.nickname = nick.stamp;
  if (skin.stamp) stamps.skin = skin.stamp;
  if (vis.stamp) stamps.visibility = vis.stamp;
  if (hours.stamp) stamps.openHours = hours.stamp;
  const choices = {
    nickname: nick.value,
    // The day of the first name stays (withName keeps it on renames and on removing).
    namedOn: minDay(a.namedOn, b.namedOn),
    nameAsks: Math.max(a.nameAsks, b.nameAsks),
    nameAskedOn: maxDay(a.nameAskedOn, b.nameAskedOn),
    nameLaterOn: maxDay(a.nameLaterOn, b.nameLaterOn),
    skin: skin.value,
    visibility: vis.value,
    openHours: mergeOpenHours(a, b, today, hours.first),
    ...(Object.keys(stamps).length ? { stamps } : {}),
  };
  const checkins = union(a.checkins, b.checkins);
  const completedOn = minDay(a.completedOn, b.completedOn);

  // The same facts: nothing to work out again (old trees judged by older rules stay as they were).
  // The copy that has judged more days is kept, so phones a day apart agree.
  if (sameList([...a.checkins].sort(), checkins) && sameList([...b.checkins].sort(), checkins) && a.completedOn === b.completedOn) {
    const pick = a.settledThrough !== b.settledThrough ? (a.settledThrough > b.settledThrough ? a : b) : derived(a) >= derived(b) ? a : b;
    return settle({ ...bare(pick), ...choices, checkins }, today);
  }

  // Replay from the planting day with every watering of both, as if it all happened on one phone.
  const base: Tree = {
    ...bare(a),
    ...choices,
    checkins,
    completedOn: null,
    diedOn: null,
    frozen: [],
    chancesLeft: MAX_CHANCES,
    refilledMonth: a.plantedOn.slice(0, 7),
    settledThrough: a.plantedOn,
  };
  const died = minDay(a.diedOn, b.diedOn);
  if (laterGeneration && died) {
    // The seed is planted: the tree stays dead on the day it died; waterings from then on don't count.
    const r = settle({ ...base, checkins: checkins.filter((d) => d < died) }, died);
    return r.diedOn ? r : { ...r, diedOn: died, settledThrough: died };
  }
  if (completedOn) {
    // Locked in for good: judged up to that day, waterings after it don't count.
    const r = settle({ ...base, checkins: checkins.filter((d) => d <= completedOn) }, completedOn);
    return { ...r, diedOn: null, completedOn };
  }
  const r = settle(base, today);
  return r.diedOn ? { ...r, checkins: r.checkins.filter((d) => d < r.diedOn!) } : r;
}

// ---- The trees of a forest ----

export interface MergeTreesOptions {
  today: DayKey;
  /** Deleted habits (lineageId → when): their trees go, whatever happened to them elsewhere. */
  tombs: Record<string, Hlc>;
  /**
   * Trees another phone took out of the account without deleting the habit (they became "Only me"
   * there): id → when, by that phone's clock (HLC; older tombstones — the server's time). Here they
   * become "Only me" too, unless shown again later here; at the same time "Only me" wins.
   */
  hiddenElsewhere?: Record<string, Hlc>;
}

/**
 * Two lists of trees as one. `revived` — days of waterings that brought a tree back that was dead
 * here (the toast "waterings came from another phone — the tree is alive").
 */
export function mergeTrees(local: Tree[], remote: Tree[], o: MergeTreesOptions): { trees: Tree[]; revived: DayKey[] } {
  const mine = new Map(local.map((t) => [t.id, t]));
  const theirs = new Map(remote.map((t) => [t.id, t]));
  const all = [...local, ...remote.filter((t) => !mine.has(t.id))];
  const laterGeneration = (t: Tree) =>
    all.some((x) => x.lineageId === t.lineageId && x.id !== t.id && (x.generation > t.generation || x.parentId === t.id));

  let trees = all.map((t) => {
    const l = mine.get(t.id);
    const r = theirs.get(t.id);
    if (l && r) return mergeTree(l, r, o.today, laterGeneration(t));
    if (r) return mergeTree(r, r, o.today, laterGeneration(t));
    return t;
  });

  const hidden = o.hiddenElsewhere ?? {};
  trees = trees.map((t) => {
    const at = hidden[t.id];
    if (at === undefined || t.visibility === 'private' || (t.stamps?.visibility ?? '') > at) return t;
    return { ...t, visibility: 'private' as Visibility, stamps: { ...t.stamps, visibility: at } };
  });

  trees = trees.filter((t) => !(t.lineageId in o.tombs));

  // Every generation of a habit is seen by the same people: the latest choice among them.
  const choice = new Map<string, { stamp: Hlc; visibility: Visibility }>();
  for (const t of trees) {
    const stamp = t.stamps?.visibility ?? '';
    const prev = choice.get(t.lineageId);
    // Equal times: "Only me" wins — never show more than someone chose.
    if (!prev || stamp > prev.stamp || (stamp === prev.stamp && t.visibility === 'private')) choice.set(t.lineageId, { stamp, visibility: t.visibility });
  }
  trees = trees.map((t) => {
    const c = choice.get(t.lineageId)!;
    if (t.visibility === c.visibility && (t.stamps?.visibility ?? '') === c.stamp) return t;
    return { ...t, visibility: c.visibility, ...(c.stamp ? { stamps: { ...t.stamps, visibility: c.stamp } } : {}) };
  });

  const revived = new Set<DayKey>();
  for (const t of trees) {
    const before = mine.get(t.id);
    if (before?.diedOn && t.diedOn === null) for (const d of t.checkins) if (!before.checkins.includes(d)) revived.add(d);
  }
  return { trees, revived: [...revived].sort() };
}

// ---- The plot ----
// Places travel as offsets from the centre (dc = c − size/2): growing the plot moves every place by
// the same half, so offsets never change when a phone's plot grows.

export interface PlaceRecord {
  dc: number;
  dr: number;
  at: Hlc;
}

/** Furthest offset a place may have (the server checks the same). */
export const MAX_OFFSET = 20;

/** Places as offsets from the centre, for these habits only (all, if not given). */
export function placesOf(plot: Plot, lineages?: Set<string>): Record<string, PlaceRecord> {
  const half = plot.size / 2;
  const out: Record<string, PlaceRecord> = {};
  for (const [id, cell] of Object.entries(plot.places)) {
    if (lineages && !lineages.has(id)) continue;
    out[id] = { dc: cell.c - half, dr: cell.r - half, at: plot.at?.[id] ?? '' };
  }
  return out;
}

export const isPlaceRecord = (p: unknown): p is PlaceRecord => {
  if (!p || typeof p !== 'object') return false;
  const { dc, dr, at } = p as Partial<PlaceRecord>;
  const ok = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && Math.abs(v) <= MAX_OFFSET;
  return ok(dc) && ok(dr) && (at === undefined || typeof at === 'string');
};

/**
 * This phone's plot with another phone's places: per habit the later move wins; the plot grows
 * to hold every place (never shrinks); two habits on one cell — the later move keeps it and the
 * other gets a new place as if planted now; habits without a place are placed (syncPlot).
 */
export function mergePlot(local: Plot, remote: Record<string, PlaceRecord>, habits: PlotHabit[]): Plot {
  const wanted = new Set(habits.map((h) => h.lineageId));
  const mineRel = placesOf(local);
  const pick = new Map<string, PlaceRecord>();
  for (const id of new Set([...Object.keys(mineRel), ...Object.keys(remote)])) {
    if (!wanted.has(id)) continue;
    const a = mineRel[id];
    const b = isPlaceRecord(remote[id]) ? { ...remote[id], at: remote[id].at ?? '' } : undefined;
    if (!a || !b) {
      pick.set(id, (a ?? b)!);
      continue;
    }
    // Equal times: the same cell on every phone (the smaller row, then column).
    pick.set(id, a.at !== b.at ? (a.at > b.at ? a : b) : a.dr < b.dr || (a.dr === b.dr && a.dc <= b.dc) ? a : b);
  }
  let fit = 0;
  for (const p of pick.values()) fit = Math.max(fit, 2 * Math.max(-p.dc, p.dc + 1, -p.dr, p.dr + 1));
  const size = Math.min(MAX_PLOT, Math.max(local.size, fit, plotSizeFor(habits.length)));
  const half = size / 2;
  const order = [...pick.entries()].sort(([ia, a], [ib, b]) => (a.at !== b.at ? (a.at > b.at ? -1 : 1) : ia < ib ? -1 : ia > ib ? 1 : 0));
  const places: Record<string, Cell> = {};
  const at: Record<string, Hlc> = {};
  const taken = new Set<string>();
  for (const [id, p] of order) {
    const cell = { c: p.dc + half, r: p.dr + half };
    if (cell.c < 0 || cell.r < 0 || cell.c >= size || cell.r >= size || taken.has(cellKey(cell))) continue;
    taken.add(cellKey(cell));
    places[id] = cell;
    if (p.at) at[id] = p.at;
  }
  return syncPlot({ size, places, shownSize: Math.min(local.shownSize, size), seen: local.seen, ...(Object.keys(at).length ? { at } : {}) }, habits);
}

// ---- Shop, quests, achievements, tombs ----

/** Bought on any phone — owned (paid once, balanceOf); the meadow put on last wins. */
export function mergeShop(a: Shop, b: Shop): Shop {
  const owned = [...new Set([...a.owned, ...b.owned])] as ItemId[];
  const seenAffordable = [...new Set([...a.seenAffordable, ...b.seenAffordable])] as ItemId[];
  const meadow = lww(a.meadowAt, a.meadow, b.meadowAt, b.meadow);
  return { owned, seenAffordable, meadow: meadow.value, ...(meadow.stamp ? { meadowAt: meadow.stamp } : {}) };
}

/**
 * The same day: the set of quests picked first stays, done and claimed add up (within that set).
 * Different days: the later day whole. The streak and the best run — the larger.
 */
export function mergeQuests(a: Quests, b: Quests): Quests {
  const streak = { streak: Math.max(a.streak, b.streak), streakDay: maxDay(a.streakDay, b.streakDay), best: Math.max(a.best, b.best) };
  if (a.day !== b.day) return { ...((a.day ?? '') > (b.day ?? '') ? a : b), ...streak };
  const ra = a.rolledAt ?? '';
  const rb = b.rolledAt ?? '';
  const first = ra !== rb ? (ra < rb ? a : b) : JSON.stringify(a.ids) <= JSON.stringify(b.ids) ? a : b;
  const ids = first.ids;
  const within = (list: string[]) => ids.filter((id) => list.includes(id));
  return {
    ...first,
    done: within([...a.done, ...b.done]),
    claimed: within([...a.claimed, ...b.claimed]),
    bonus: a.bonus || b.bonus,
    ...streak,
  };
}

/** Achievements claimed anywhere, with the earlier day. */
export function mergeClaimed(a: Claimed, b: Claimed): Claimed {
  const out: Claimed = { ...a };
  for (const [id, day] of Object.entries(b) as [AchievementId, DayKey][]) out[id] = minDay(out[id] ?? null, day) ?? day;
  return out;
}

export const mergeAnnounced = (a: AchievementId[], b: AchievementId[]): AchievementId[] =>
  [...new Set([...a, ...b])].filter((id) => ACHIEVEMENT_IDS.includes(id));

/** Deleted habits from both, with the later time. */
export function mergeTombs(a: Record<string, Hlc>, b: Record<string, Hlc>): Record<string, Hlc> {
  const out = { ...a };
  for (const [id, at] of Object.entries(b)) out[id] = id in out ? hlcMax(out[id], at) : at;
  return out;
}
