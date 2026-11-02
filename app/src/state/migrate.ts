// Saved data of version 5 (OYUUR-34, watering time) and 6 (OYUUR-30, the forest in the account):
// what store.tsx reads. Any older save loads: damaged fields get defaults, never a crash.
import { AchievementId, ACHIEVEMENT_IDS, Claimed, migrateClaimed } from '@/game/achievements';
import type { DayKey } from '@/game/dates';
import { Ledger, migrateShop, migrateWallet, Shop } from '@/game/economy';
import { migratePlot, Plot } from '@/game/plot';
import { migrateProfile, Profile } from '@/game/profile';
import { migrateQuests, Quests } from '@/game/quests';
import { groupHabits, growthDays, isGrowing, migrateOpenHours, migrateTrees, OpenHourEntry, Tree } from '@/game/tree';

export type EveningOffer = 'pending' | 'done';

/**
 * The evening offer goes to those who had growing "Quit" trees before the watering time
 * (they all got "any time"); new players get "from 18:00" when planting and never see it.
 */
export function migrateEveningOffer(saved: { version?: number; eveningOffer?: unknown }, trees: Tree[]): EveningOffer {
  if (saved.eveningOffer === 'pending' || saved.eveningOffer === 'done') return saved.eveningOffer;
  if ((saved.version ?? 1) >= 5) return 'done';
  return trees.some((x) => x.kind === 'quit' && isGrowing(x)) ? 'pending' : 'done';
}

export function migrateSharedHours(saved: unknown): Record<string, OpenHourEntry[]> {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
  const out: Record<string, OpenHourEntry[]> = {};
  for (const [id, list] of Object.entries(saved as Record<string, unknown>)) {
    // The first entry's day is the shared tree's planting day; without a valid one the hours are dropped.
    const first = Array.isArray(list) ? (list[0] as { from?: unknown } | undefined)?.from : null;
    if (typeof first === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(first)) out[id] = migrateOpenHours(list, first);
  }
  return out;
}

/**
 * The day the phone moved to the watering time (kept once set): shared trees planted by then
 * get "any time" like old trees of one's own. A new player (no older save) has none.
 */
export function migrateOldSharedUntil(saved: { version?: number; oldSharedUntil?: unknown }, today: DayKey): DayKey | null {
  if (typeof saved.oldSharedUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.oldSharedUntil)) return saved.oldSharedUntil;
  return (saved.version ?? 1) < 5 ? today : null;
}

/** Deleted habits from saved data (version 6): lineageId → time; anything else is dropped. */
export function migrateTombs(saved: unknown): Record<string, string> {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
  return Object.fromEntries(Object.entries(saved as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/** Everything of a save but the settings (store.tsx reads those with the developer tools in mind). */
export interface LoadedSave {
  trees: Tree[];
  plot: Plot;
  ledger: Ledger;
  shop: Shop;
  quests: Quests;
  claimed: Claimed;
  announced: AchievementId[];
  profile: Profile;
  eveningOffer: EveningOffer;
  sharedHours: Record<string, OpenHourEntry[]>;
  oldSharedUntil: DayKey | null;
  tombs: Record<string, string>;
  hiddenTombs: Record<string, string>;
  hlc: string;
}

/**
 * A save of any version as version 6. `deviceId` — this phone's (the old acorns become
 * `legacy:<deviceId>`); `today` — the game day now (for the move to version 5).
 */
export function migrateSave(raw: unknown, deviceId: string, today: DayKey): LoadedSave {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown> & { version?: number };
  const trees = migrateTrees(Array.isArray(saved.trees) ? saved.trees : []);
  const shop = migrateShop(saved.shop as Partial<Shop> | undefined);
  return {
    trees,
    plot: migratePlot(saved.plot, groupHabits(trees).map((h) => ({ lineageId: h.lineageId, days: growthDays(h.current) }))),
    ledger: migrateWallet(saved.wallet, shop.owned, deviceId),
    shop,
    quests: migrateQuests(saved.quests as Partial<Quests> | undefined),
    claimed: migrateClaimed(saved.achievements),
    announced: Array.isArray(saved.announced) ? (saved.announced.filter((id) => ACHIEVEMENT_IDS.includes(id as AchievementId)) as AchievementId[]) : [],
    profile: migrateProfile(saved.profile as Partial<Profile> | undefined),
    eveningOffer: migrateEveningOffer(saved, trees),
    sharedHours: migrateSharedHours(saved.sharedHours),
    oldSharedUntil: migrateOldSharedUntil(saved, today),
    tombs: migrateTombs(saved.tombs),
    hiddenTombs: migrateTombs(saved.hiddenTombs),
    hlc: typeof saved.hlc === 'string' ? saved.hlc : '',
  };
}
