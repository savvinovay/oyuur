// Tree pictures of the forest screen: on the map and in the list. `warmForest`
// draws them ahead of time, so the forest opens with its trees in place.
import type { Cell, Plot } from '@/game/plot';
import { growthDays, Habit, isCompleted, isDead } from '@/game/tree';
import { Palette } from '@/ui/theme';
import { TreeArtProps, warmThumb } from '@/ui/TreeArt';
import { CANVAS_H, CANVAS_W } from '@/ui/trees/layout';

/** Width of a tree picture on the map, in world px at zoom 1 (spec 1.5): 120×128. */
export const MAP_THUMB = 120;
/** Height of a tree picture in the list rows. */
export const LIST_THUMB = 48;
/**
 * Even a sprout on the map is big enough to see: 33–35 world px high (0.26 × the 128 px picture),
 * still about 24 px on screen when a 6×6 plot is shown whole. The model sizes its crown by it too.
 */
export const MAP_FILL = 0.26;
/** In a list row any tree fills most of its little square. */
const LIST_FILL = 0.58;

const base = (habit: Habit, palette: Palette) => {
  const tree = habit.current;
  return { days: growthDays(tree), dead: isDead(tree), completed: isCompleted(tree), palette, skin: tree.skin, seed: tree.id };
};

/** A habit's newest tree on the map. The ground draws the earth and shadow; the drop shows thirst. */
export function mapThumb(habit: Habit, palette: Palette): TreeArtProps {
  return { ...base(habit, palette), size: MAP_THUMB, fill: MAP_FILL, ground: false, night: palette.dark };
}

/** A habit's newest tree in a list row: `LIST_THUMB` high. */
export function listThumb(habit: Habit, palette: Palette): TreeArtProps {
  return { ...base(habit, palette), size: (LIST_THUMB * CANVAS_W) / CANVAS_H, fill: LIST_FILL };
}

/**
 * Draws the forest's pictures ahead of time, the trees nearest the plot's centre first
 * (they are on screen when the forest opens). Safe to call often: ready pictures are skipped.
 */
export async function warmForest(habits: Habit[], palette: Palette, plotSize: number, places: Plot['places']): Promise<void> {
  const mid = (plotSize - 1) / 2;
  const far = (cell: Cell | undefined) => (cell ? Math.hypot(cell.c - mid, cell.r - mid) : Infinity);
  const order = [...habits].sort((a, b) => far(places[a.lineageId]) - far(places[b.lineageId]));
  const thumbs = [...order.map((h) => mapThumb(h, palette)), ...order.map((h) => listThumb(h, palette))];
  // One picture at a time, with a frame between them, so a big forest never freezes the scene.
  for (const props of thumbs) {
    await warmThumb(props).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
