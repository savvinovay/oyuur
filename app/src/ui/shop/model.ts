// What the shop screens show, as pure functions (wave 5 spec, sections 6–8): the order of
// the cards, a card's label, the stages of the growth show and the numbers of acorns.
// The rules of buying live in game/economy.ts; here is only how they look.
import { CATALOG, ItemId, itemOf, MeadowId, meadowOfItem, missing, owns, Shop, skinOfItem, Wallet } from '@/game/economy';
import { Skin, Stage, STAGES } from '@/game/tree';
import type { Lang } from '@/i18n';
import { CANVAS_H, CANVAS_W, lookOf, SIZES, treeZoom } from '@/ui/trees/layout';

/** Trees: the paid ones first (spec 6.2), each group in the catalog's order. Cards never jump after a purchase. */
export const SHOP_TREES: ItemId[] = [
  ...CATALOG.filter((i) => i.kind === 'tree' && i.price > 0),
  ...CATALOG.filter((i) => i.kind === 'tree' && i.price === 0),
].map((i) => i.id);

/** Meadows in the catalog's order: summer, autumn, winter, bloom. */
export const SHOP_MEADOWS: ItemId[] = CATALOG.filter((i) => i.kind === 'meadow').map((i) => i.id);

export type ShopTab = 'trees' | 'meadows';

/** The label under a card (table 6.2) and the action in the item window (7.3). */
export type CardState = 'afford' | 'poor' | 'owned' | 'selected';

export function cardState(shop: Shop, wallet: Wallet, id: ItemId): CardState {
  const meadow = meadowOfItem(id);
  if (meadow && shop.meadow === meadow) return 'selected';
  if (owns(shop, id)) return 'owned';
  return missing(wallet, id) > 0 ? 'poor' : 'afford';
}

export const priceOf = (id: ItemId) => itemOf(id)?.price ?? 0;

/** A link's `?item=` turned into an item, or null if there is no such thing. */
export function parseItem(raw: unknown): ItemId | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && itemOf(value as ItemId) ? (value as ItemId) : null;
}

/** The kind a link's `?skin=` names, or null. */
export function parseSkin(raw: unknown, skins: readonly Skin[]): Skin | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && skins.includes(value as Skin) ? (value as Skin) : null;
}

export const treeItem = (skin: Skin): ItemId => `tree:${skin}`;
export const meadowItem = (id: MeadowId): ItemId => `meadow:${id}`;
export { meadowOfItem, skinOfItem };

/** Days of growth each stage square shows: well inside the stage, so it looks like itself. */
export const STAGE_SHOW_DAYS: Record<Stage, number> = { sprout: 1, seedling: 4, bush: 10, young: 30, tree: 70, grand: 150 };
/** The stage cards and the window open on (spec 6.2: "дерево", 70 days). */
export const SHOWN_STAGE: Stage = 'tree';
/** The growth show (7.2): sprout to "tree", one step every 450 ms. */
export const SHOW_STEP = 450;
export const SHOW_STAGES: Stage[] = STAGES.slice(0, STAGES.findIndex((s) => s.stage === SHOWN_STAGE) + 1).map((s) => s.stage);

/** The day a stage starts, as the caption says it: a sprout "from day 1", not 0. */
export function stageFromDay(stage: Stage): number {
  return Math.max(1, STAGES.find((s) => s.stage === stage)!.from);
}

/** Russian says «со 100-го дня» but «с 50-го дня». */
export const stageFromSo = (day: number) => day === 100;

/**
 * Acorns as a number with groups (spec 1.3): RU "1 240" with a narrow no-break space,
 * EN "1,240". Never shortened below ten million.
 */
export function formatAcorns(n: number, lang: Lang): string {
  const whole = Math.max(0, Math.floor(n));
  const sep = lang === 'ru' ? ' ' : ',';
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** The number in the item window's wallet while acorns are spent: old to new in `duration`, out-cubic. */
export function countDown(from: number, to: number, elapsed: number, duration: number): number {
  if (elapsed <= 0) return from;
  if (elapsed >= duration) return to;
  const t = elapsed / duration;
  const eased = 1 - (1 - t) ** 3;
  return Math.round(from + (to - from) * eased);
}

/** Where a tree picture goes so the tree fills `share` of a box's height with its feet `feet` px from the top. */
export function treeBox(
  { boxW, boxH, feet, share, treeShare, treeWidthShare, maxWidth = 0.96 }:
  { boxW: number; boxH: number; feet: number; share: number; treeShare: number; treeWidthShare: number; maxWidth?: number },
): { size: number; left: number; top: number } {
  // The picture is 300 × 320, the feet stand at 312 (trees/layout.ts).
  const byHeight = (share * boxH) / Math.max(0.05, treeShare);
  const byWidth = (maxWidth * boxW) / Math.max(0.05, treeWidthShare) * (320 / 300);
  const pictureH = Math.min(byHeight, byWidth);
  const size = (pictureH * 300) / 320;
  return { size, left: (boxW - size) / 2, top: feet - (pictureH * 312) / 320 };
}

/** How much of its picture's height and width a tree of this kind and age takes. */
export function treeShares(skin: Skin, days: number, fill = 1): { treeShare: number; treeWidthShare: number } {
  const size = SIZES[skin][lookOf(days, false)];
  const zoom = treeZoom(skin, days, false) * fill;
  return { treeShare: (zoom * size.h) / CANVAS_H, treeWidthShare: (zoom * size.w) / CANVAS_W };
}
