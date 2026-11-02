// The forest as records for the account (OYUUR-30, design/oyuur-30/план.md «Записи»). Pure functions:
// what goes to the server, what came back, and how it merges into the forest on the phone.
// - `tree:<id>` — an open tree ("Friends") whole, with its stamps. Hidden trees NEVER leave the phone:
//   when one becomes "Only me", its record becomes a tombstone that says when (`{at, lineageId}`,
//   the phone's clock): another phone compares that with its own choice, never with the server's time.
// - `plot` — places of open habits, as offsets from the centre.
// - `progress` — the acorn journal (without the rewards of hidden trees), the shop, quests,
//   achievements and deleted open habits.
// - `vault` (OYUUR-31) — the chest: every hidden tree with its places, its acorns and the deleted
//   hidden habits (`chestContent()`), locked on the phone (net/crypto.ts, state/vault.ts). Merged
//   like the open records: `Remote.chest`.
import { AchievementId, ACHIEVEMENT_IDS, Claimed, migrateClaimed } from '@/game/achievements';
import type { DayKey } from '@/game/dates';
import { isHiddenMonthKey, Ledger, mergeLedger, migrateShop, migrateWallet, Shop, treeOfKey } from '@/game/economy';
import {
  Hlc,
  hlcMax,
  hlcOfServer,
  isPlaceRecord,
  mergeAnnounced,
  mergeClaimed,
  mergePlot,
  mergeQuests,
  mergeShop,
  mergeTombs,
  mergeTrees,
  PlaceRecord,
  placesOf,
} from '@/game/merge';
import { emptyPlot, markShown, Plot } from '@/game/plot';
import { migrateQuests, newQuests, Quests } from '@/game/quests';
import { groupHabits, growthDays, migrateTrees, Tree } from '@/game/tree';
import type { SyncWrite } from '@/net/api';
import type { ForestSide, MiniTree } from './syncContract';

/** The part of the saved data that lives in the account (settings and the profile don't). */
export interface Forest {
  trees: Tree[];
  plot: Plot;
  ledger: Ledger;
  shop: Shop;
  quests: Quests;
  claimed: Claimed;
  announced: AchievementId[];
  /** Deleted open habits (lineageId → when): sent with `progress`. */
  tombs: Record<string, Hlc>;
  /**
   * Deleted hidden habits: stay on the phone (the chest's, OYUUR-31). lineageId → when; the ids of
   * the habit's trees are kept here too, so their acorns are still known as hidden (openLedger).
   */
  hiddenTombs: Record<string, Hlc>;
}

export const emptyForest = (): Forest => ({
  trees: [],
  plot: emptyPlot(),
  ledger: {},
  shop: { owned: [], meadow: 'summer', seenAffordable: [] },
  quests: newQuests(),
  claimed: {},
  announced: [],
  tombs: {},
  hiddenTombs: {},
});

export interface Progress {
  ledger: Ledger;
  shop: Shop;
  quests: Quests;
  claimed: Claimed;
  announced: AchievementId[];
  tombs: Record<string, Hlc>;
  /** Only when a whole forest of this phone is merged back (the copy of "Keep only the account's"). */
  hiddenTombs?: Record<string, Hlc>;
}

/** What came from the account (or another copy of a forest), ready to merge. */
export interface Remote {
  trees: Tree[];
  /** Tree records the account no longer has (made "Only me" on another phone): id → when. */
  hiddenElsewhere: Record<string, Hlc>;
  places: Record<string, PlaceRecord> | null;
  progress: Progress | null;
  /** The account's chest, opened here (OYUUR-31); missing — not there, or not opened. */
  chest?: Chest | null;
}

/** What the chest holds (OYUUR-31): the hidden part of a forest. */
export interface Chest {
  trees: Tree[];
  places: Record<string, PlaceRecord>;
  /** Rewards of hidden trees (and `mh:` month sums). */
  ledger: Ledger;
  /** Deleted hidden habits (and their trees' ids), as `Forest.hiddenTombs`. */
  tombs: Record<string, Hlc>;
}

export const emptyRemote = (): Remote => ({ trees: [], hiddenElsewhere: {}, places: null, progress: null });

/** A record as the server sends it. */
export interface SyncRecord {
  key: string;
  rev: number;
  deleted: boolean;
  body: unknown;
  /** Server time of the write, ms. */
  at: number;
}

// ---- Bodies and their hashes ----

/** JSON with keys in order: the same data gives the same text on every phone. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** A short fingerprint of a body (53-bit, cyrb53): "changed since sent" is a different hash. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + `.${text.length}`;
}

/** The hash a deleted record (tombstone) has. */
export const DELETED = 'x';
export const hashBody = (body: unknown) => (body === null || body === undefined ? DELETED : hashText(stableStringify(body)));

// ---- Out ----

const isOpen = (t: Tree) => t.visibility === 'friends';

/** Habits of open trees (every generation of a habit is seen by the same people). */
export const openLineages = (trees: Tree[]) => new Set(trees.filter(isOpen).map((t) => t.lineageId));

/** Trees whose acorns are the chest's: hidden ones here, and those of deleted hidden habits. */
export function hiddenTreeIds(f: Pick<Forest, 'trees' | 'hiddenTombs'>): Set<string> {
  return new Set([...f.trees.filter((t) => !isOpen(t)).map((t) => t.id), ...Object.keys(f.hiddenTombs)]);
}

/** A reward of a hidden tree, or the folded sum of such rewards (`mh:`): never sent. */
const isHiddenKey = (hidden: Set<string>) => (key: string) => isHiddenMonthKey(key) || hidden.has(treeOfKey(key) ?? '');

/** The journal without the rewards of hidden trees (those go to the chest in OYUUR-31). */
export function openLedger(f: Forest): Ledger {
  const hidden = isHiddenKey(hiddenTreeIds(f));
  const keys = Object.keys(f.ledger);
  if (!keys.some(hidden)) return f.ledger;
  return Object.fromEntries(Object.entries(f.ledger).filter(([key]) => !hidden(key)));
}

export const treeBody = (t: Tree) => ({ ...t, stamps: t.stamps ?? {} });

export function progressBody(f: Forest): Progress {
  return {
    ledger: openLedger(f),
    shop: { ...f.shop },
    quests: f.quests,
    claimed: f.claimed,
    announced: f.announced,
    tombs: f.tombs,
  };
}

/** Every live record this forest has in the account. Hidden trees are never here. */
export function buildRecords(f: Forest): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const t of f.trees) if (isOpen(t)) out.set(`tree:${t.id}`, treeBody(t));
  out.set('plot', { places: placesOf(f.plot, openLineages(f.trees)) });
  out.set('progress', progressBody(f));
  return out;
}

/**
 * Tree records that must become tombstones: the tree is here and hidden now, or its habit was
 * deleted. A tree missing here for another reason (not merged yet) is never deleted in the account.
 * `known` — tree records the account has: key → lineageId.
 */
export function goneRecords(f: Forest, known: Record<string, string>): string[] {
  const hidden = new Set(f.trees.filter((t) => !isOpen(t)).map((t) => `tree:${t.id}`));
  return Object.entries(known)
    .filter(([key, lineageId]) => hidden.has(key) || lineageId in f.tombs || lineageId in f.hiddenTombs)
    .map(([key]) => key);
}

/** The hidden part — what the chest holds (OYUUR-31). */
export function chestOf(f: Forest): Chest {
  const trees = f.trees.filter((t) => !isOpen(t));
  const lineages = new Set(trees.map((t) => t.lineageId));
  const hidden = isHiddenKey(hiddenTreeIds(f));
  return {
    trees,
    places: placesOf(f.plot, lineages),
    ledger: Object.fromEntries(Object.entries(f.ledger).filter(([key]) => hidden(key))),
    tombs: f.hiddenTombs,
  };
}

/**
 * What stays on this phone when the forest in the account is erased on another device: the hidden
 * trees were never in the account, so that erase doesn't touch them — with their places, their
 * acorns and the deleted hidden habits. Everything that was in the account goes.
 */
export function hiddenPart(f: Forest): Forest {
  const { trees, ledger, tombs } = chestOf(f);
  const keep = <T,>(m: Record<string, T> | undefined) =>
    Object.fromEntries(Object.entries(m ?? {}).filter(([id]) => trees.some((t) => t.lineageId === id)));
  const plot: Plot = { ...f.plot, places: keep(f.plot.places), seen: f.plot.seen.filter((id) => trees.some((t) => t.lineageId === id)) };
  if (f.plot.at) plot.at = keep(f.plot.at);
  return { ...emptyForest(), trees, plot, ledger, hiddenTombs: tombs };
}

/** The chest's content as it is locked: trees by id, the same data — the same JSON (stableStringify). */
export interface ChestContent {
  v: 1;
  trees: Tree[];
  places: Record<string, PlaceRecord>;
  ledger: Ledger;
  tombs: Record<string, Hlc>;
}

export function canonChest(c: Chest): ChestContent {
  const trees = [...c.trees].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(treeBody);
  return { v: 1, trees, places: c.places, ledger: c.ledger, tombs: c.tombs };
}

/** What this forest's chest holds now. */
export const chestContent = (f: Forest): ChestContent => canonChest(chestOf(f));

/** A chest with nothing in it: sent only to empty one the account already keeps. */
export const isEmptyChest = (c: ChestContent) =>
  c.trees.length === 0 && Object.keys(c.places).length === 0 && Object.keys(c.ledger).length === 0 && Object.keys(c.tombs).length === 0;

/** Hidden habits of a forest (as on the home screen: one per habit). */
export const hiddenHabits = (trees: Tree[]) => groupHabits(trees).filter((h) => h.current.visibility !== 'friends').length;

/** What a tree's tombstone says: when it left the account by this phone's clock, and its habit. */
export function tombBody(f: Forest, key: string, lineageId: string): { at: Hlc; lineageId: string } {
  const tree = f.trees.find((t) => `tree:${t.id}` === key);
  const at = tree && !isOpen(tree) ? (tree.stamps?.visibility ?? '') : (f.tombs[lineageId] ?? f.hiddenTombs[lineageId] ?? '');
  return { at, lineageId };
}

// ---- What the account has (sync.tsx keeps it in `oyuur/sync`) ----

/** What the phone knows about the account's records (`oyuur/sync`). */
export interface Meta {
  /** The account's id (a nick can be taken again by another account after a deletion). */
  userId: string;
  /** Its nick, for "Sign in again" with the nick filled in. */
  nick: string;
  /** Records up to this rev are merged. */
  lastRev: number;
  /** The account's epoch: it grows when the forest is erased there ("Erase everything"). */
  epoch: number | null;
  /** key → hash of the body the account has (DELETED — a tombstone). */
  sent: Record<string, string>;
  /** key → the record's rev in the account (the `base` of the next write). */
  revs: Record<string, number>;
  /** Live tree records in the account: key → lineageId (to tombstone a deleted habit's trees). */
  lineages: Record<string, string>;
  lastOkAt: number | null;
  /** Server refusals in a row (not "no network"). */
  failures: number;
  /** The server ended the session: "Sign in again to keep saving". */
  sessionLost: boolean;
  /** The first merge with this account is done (or "We found a forest" was answered). */
  decided: boolean;
  /** When this phone joined the account (for the quiet badge before the first save). */
  since: number;
  // ---- The chest (OYUUR-31). `sent.vault` is the hash of its OPEN content (the lock differs every time). ----
  /** The account's data key id (GET /api/sync); null — the account has none; undefined — not known yet. */
  kid?: string | null;
  /**
   * The highest chest version seen or written with the key `seqKid` (an older one is never taken).
   * Survives a re-read of the account (forest.gen); starts over with a new epoch or another key.
   */
  vaultSeq: number;
  seqKid: string | null;
  /** The account's chest didn't open (damaged): nothing is written over it; state 'error'. */
  vaultBroken: boolean;
  /** "Later" on the "Lock your hidden trees" sheet: it doesn't open by itself any more. */
  lockLaterAt: number | null;
}

// A tree's body is hashed once per tree object (trees are replaced, never changed in place).
const treeHashes = new WeakMap<Tree, string>();
const treeHash = (t: Tree) => {
  let h = treeHashes.get(t);
  if (h === undefined) {
    h = hashBody(treeBody(t));
    treeHashes.set(t, h);
  }
  return h;
};

/** Records that differ from what the account has: to send. */
export function dirtyWrites(f: Forest, m: Meta): (SyncWrite & { hash: string })[] {
  const out: (SyncWrite & { hash: string })[] = [];
  const byId = new Map(f.trees.map((t) => [t.id, t]));
  for (const [key, body] of buildRecords(f)) {
    const tree = key.startsWith('tree:') ? byId.get(key.slice(5)) : undefined;
    const hash = tree ? treeHash(tree) : hashBody(body);
    if (hash !== m.sent[key]) out.push({ key, base: m.revs[key] ?? 0, body, hash });
  }
  for (const key of goneRecords(f, m.lineages)) {
    if (m.sent[key] !== DELETED) out.push({ key, base: m.revs[key] ?? 0, deleted: true, body: tombBody(f, key, m.lineages[key]), hash: DELETED });
  }
  return out;
}

/** What a record from the server tells about the account. */
export function noteRecord(m: Meta, r: SyncRecord): void {
  if (r.rev === 0 && !r.deleted && r.body === null) {
    // "Nothing there" (a conflict over a base from nowhere): the next write starts from 0.
    delete m.revs[r.key];
    delete m.sent[r.key];
    delete m.lineages[r.key];
    return;
  }
  m.revs[r.key] = r.rev;
  if (r.key === 'vault') {
    // What is inside is known only once it is opened (state/vault.ts takeVault) or written here.
    if (r.deleted) m.sent.vault = DELETED;
    else delete m.sent.vault;
    return;
  }
  m.sent[r.key] = r.deleted ? DELETED : hashBody(r.body);
  const lineageId = (r.body as { lineageId?: unknown } | null)?.lineageId;
  if (r.key.startsWith('tree:') && !r.deleted && typeof lineageId === 'string') m.lineages[r.key] = lineageId;
  else delete m.lineages[r.key];
}

// ---- In ----

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (d: unknown): d is DayKey => typeof d === 'string' && DAY_RE.test(d);

/** A tree from the account, checked like saved data; anything broken — null (the record is skipped). */
export function parseTree(id: string, body: unknown): Tree | null {
  if (!body || typeof body !== 'object') return null;
  const { stamps, ...t } = body as Partial<Tree>;
  if (t.id !== id || typeof t.lineageId !== 'string' || typeof t.name !== 'string' || !isDay(t.plantedOn)) return null;
  if (!Array.isArray(t.checkins) || !t.checkins.every(isDay)) return null;
  if (t.kind !== 'do' && t.kind !== 'quit') return null;
  const frozen = Array.isArray(t.frozen) ? t.frozen.filter(isDay) : [];
  const [tree] = migrateTrees([
    {
      ...t,
      visibility: t.visibility === 'private' ? 'private' : 'friends',
      checkins: [...new Set(t.checkins)].sort(),
      frozen,
      chancesLeft: typeof t.chancesLeft === 'number' && t.chancesLeft >= 0 ? Math.min(3, Math.floor(t.chancesLeft)) : 0,
      settledThrough: isDay(t.settledThrough) ? t.settledThrough : t.plantedOn,
      diedOn: isDay(t.diedOn) ? t.diedOn : null,
      completedOn: isDay(t.completedOn) ? t.completedOn : null,
      generation: typeof t.generation === 'number' && t.generation >= 1 ? Math.floor(t.generation) : 1,
      parentId: typeof t.parentId === 'string' ? t.parentId : null,
      ...(stamps && typeof stamps === 'object' && Object.keys(stamps).length ? { stamps } : {}),
    },
  ]);
  return tree;
}

const stringMap = (v: unknown): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'))
    : {};

export function parseProgress(body: unknown): Progress | null {
  if (!body || typeof body !== 'object') return null;
  const p = body as Record<string, unknown>;
  const announced = Array.isArray(p.announced) ? (p.announced.filter((id) => ACHIEVEMENT_IDS.includes(id as AchievementId)) as AchievementId[]) : [];
  return {
    ledger: migrateWallet({ ledger: p.ledger && typeof p.ledger === 'object' ? p.ledger : {} }, [], ''),
    shop: migrateShop(p.shop as Partial<Shop> | undefined),
    quests: migrateQuests(p.quests as Partial<Quests> | undefined),
    claimed: migrateClaimed(p.claimed),
    announced,
    tombs: stringMap(p.tombs),
    ...(p.hiddenTombs ? { hiddenTombs: stringMap(p.hiddenTombs) } : {}),
  };
}

function parsePlaces(raw: unknown): Record<string, PlaceRecord> {
  const places: Record<string, PlaceRecord> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [id, p] of Object.entries(raw as Record<string, unknown>)) if (isPlaceRecord(p)) places[id] = { ...p, at: p.at ?? '' };
  }
  return places;
}

/**
 * An opened chest, checked like saved data: broken trees are skipped, the rest is cleaned.
 * Not a chest at all (a newer format, garbage) — null: never taken as an empty one.
 */
export function parseChest(content: unknown): Chest | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const c = content as Record<string, unknown>;
  if (c.v !== 1 || !Array.isArray(c.trees)) return null;
  const trees: Tree[] = [];
  for (const raw of c.trees) {
    const id = (raw as { id?: unknown } | null)?.id;
    const tree = typeof id === 'string' ? parseTree(id, raw) : null;
    if (tree && !trees.some((t) => t.id === tree.id)) trees.push(tree);
  }
  return {
    trees,
    places: parsePlaces(c.places),
    ledger: migrateWallet({ ledger: c.ledger && typeof c.ledger === 'object' ? c.ledger : {} }, [], ''),
    tombs: stringMap(c.tombs),
  };
}

/** Records from the server as one Remote (later records of the same key win: they come by rev). */
export function parseRecords(records: SyncRecord[]): Remote {
  const remote = emptyRemote();
  const trees = new Map<string, Tree>();
  for (const r of records) {
    if (r.key.startsWith('tree:')) {
      const id = r.key.slice(5);
      if (r.deleted) {
        trees.delete(id);
        // The phone's own time of hiding it; an older tombstone without one — the server's time.
        const said = (r.body as { at?: unknown } | null)?.at;
        const at = typeof said === 'string' && said.length <= 100 ? said : hlcOfServer(r.at);
        remote.hiddenElsewhere[id] = id in remote.hiddenElsewhere ? hlcMax(remote.hiddenElsewhere[id], at) : at;
      } else {
        const tree = parseTree(id, r.body);
        if (tree) {
          trees.set(id, tree);
          delete remote.hiddenElsewhere[id];
        }
      }
    } else if (r.key === 'plot' && !r.deleted && r.body && typeof r.body === 'object') {
      remote.places = parsePlaces((r.body as { places?: unknown }).places);
    } else if (r.key === 'progress' && !r.deleted) {
      remote.progress = parseProgress(r.body) ?? remote.progress;
    }
  }
  remote.trees = [...trees.values()];
  return remote;
}

/** A whole forest as a Remote (to merge a copy of this phone's forest back). */
export function forestAsRemote(f: Forest): Remote {
  return {
    trees: f.trees,
    hiddenElsewhere: {},
    places: placesOf(f.plot),
    progress: { ledger: f.ledger, shop: f.shop, quests: f.quests, claimed: f.claimed, announced: f.announced, tombs: f.tombs, hiddenTombs: f.hiddenTombs },
  };
}

/** Open and hidden places together; a habit in both (visibility changed meanwhile) — the later move. */
function laterPlaces(a: Record<string, PlaceRecord>, b: Record<string, PlaceRecord>): Record<string, PlaceRecord> {
  const out = { ...a };
  for (const [id, p] of Object.entries(b)) if (!(id in out) || p.at > out[id].at) out[id] = p;
  return out;
}

const plotHabitsOf = (trees: Tree[]) => groupHabits(trees).map((h) => ({ lineageId: h.lineageId, days: growthDays(h.current) }));

/**
 * The account's records merged into this phone's forest (спец 4, Т3). `firstLoad` — the phone had
 * no trees: everything that came counts as already seen in the forest (спец 4.4).
 */
export function mergeRemote(local: Forest, remote: Remote, today: DayKey): { forest: Forest; revived: DayKey[] } {
  const p = remote.progress;
  const chest = remote.chest ?? null;
  const tombs = p ? mergeTombs(local.tombs, p.tombs) : local.tombs;
  let hiddenTombs = p?.hiddenTombs ? mergeTombs(local.hiddenTombs, p.hiddenTombs) : local.hiddenTombs;
  if (chest) hiddenTombs = mergeTombs(hiddenTombs, chest.tombs);
  // A tree may come both open and in the chest (made visible or hidden again meanwhile): the two
  // copies become one first, the later choice of who sees it wins (mergeTree, stamps.visibility).
  const remoteTrees = chest?.trees.length ? (remote.trees.length ? mergeTrees(remote.trees, chest.trees, { today, tombs: {} }).trees : chest.trees) : remote.trees;
  const merged = mergeTrees(local.trees, remoteTrees, { today, tombs: { ...hiddenTombs, ...tombs }, hiddenElsewhere: remote.hiddenElsewhere });
  const habits = plotHabitsOf(merged.trees);
  let plot = mergePlot(local.plot, chest ? laterPlaces(remote.places ?? {}, chest.places) : (remote.places ?? {}), habits);
  if (local.trees.length === 0) plot = markShown(plot, habits.map((h) => h.lineageId));
  let ledger = p ? mergeLedger(local.ledger, p.ledger) : local.ledger;
  // One reward is one key: a watering paid on two phones is counted once.
  if (chest) ledger = mergeLedger(ledger, chest.ledger);
  const forest: Forest = {
    trees: merged.trees,
    plot,
    ledger,
    shop: p ? mergeShop(local.shop, p.shop) : local.shop,
    quests: p ? mergeQuests(local.quests, p.quests) : local.quests,
    claimed: p ? mergeClaimed(local.claimed, p.claimed) : local.claimed,
    announced: p ? mergeAnnounced(local.announced, p.announced) : local.announced,
    tombs,
    hiddenTombs,
  };
  return { forest, revived: merged.revived };
}

/** The latest time in a forest's stamps: the phone's clock catches up with it (merge.ts, HLC). */
export function latestStamp(f: Forest): Hlc {
  let max = '';
  const see = (s: string | undefined) => {
    if (s && s > max) max = s;
  };
  for (const t of f.trees) for (const s of Object.values(t.stamps ?? {})) see(s);
  for (const s of Object.values(f.plot.at ?? {})) see(s);
  for (const s of Object.values(f.tombs)) see(s);
  for (const s of Object.values(f.hiddenTombs)) see(s);
  see(f.shop.meadowAt);
  see(f.quests.rolledAt);
  // A time from the server is not a phone's: don't let it carry the clock.
  return max.endsWith('-server') ? '' : max;
}

// ---- "We found a forest in your account" (спец 5.1) ----

function biggest(trees: Tree[]): MiniTree[] {
  return groupHabits(trees)
    .map((h) => h.current)
    .sort((a, b) => growthDays(b) - growthDays(a))
    .slice(0, 3)
    .map((t) => ({ id: t.id, skin: t.skin, days: growthDays(t), dead: t.diedOn !== null }));
}

/** One side of the sheet: habits (as on the home screen), hidden ones, the three biggest. */
export function forestSide(trees: Tree[], today: DayKey, changedAt: number | null, onPhone: boolean): ForestSide {
  const habits = groupHabits(trees);
  return {
    trees: habits.length,
    hidden: habits.filter((h) => h.current.visibility !== 'friends').length,
    biggest: biggest(trees),
    changedAt,
    wateredToday: onPhone && trees.some((t) => t.checkins.includes(today)),
  };
}

/** Habits after "Merge": the same habit on both sides is one. */
export const mergedHabits = (a: Tree[], b: Tree[]) => new Set([...a, ...b].map((t) => t.lineageId)).size;

/** Days ago a backup or a copy ends (30 days). */
export const KEEP_COPY_MS = 30 * 24 * 60 * 60 * 1000;
export const keepUntil = (now: number) => now + KEEP_COPY_MS;
