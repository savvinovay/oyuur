// Where the "new" badges of the forest map may show (spec 5.2). A badge sits right over the
// real crown, like a drop. Badges and drops keep their size on screen while the trees come
// closer together as the camera goes out, so below some zoom two of them run into each other:
// then only the badge nearer the viewer stays, and a badge never covers a neighbour's drop.
// Each badge gets the zoom below which it hides, worked out once when the trees change.

/** A tree under a badge or a drop: feet `x`, crown top `top` (world px), `w` crown width. */
export interface MarkTree {
  id: string;
  x: number;
  top: number;
  w: number;
  depth: number;
}

/** Screen px: the badge's height, the drop's size, and room kept between marks. */
export const BADGE_H = 20;
export const BUBBLE = 26;
const ROOM = 4;

/** The zoom below which two marks `dx`, `dy` world px apart, needing `w`×`h` screen px between them, overlap. */
function apart(dx: number, dy: number, w: number, h: number): number {
  return Math.min(Math.abs(dx) > 0 ? w / Math.abs(dx) : Infinity, Math.abs(dy) > 0 ? h / Math.abs(dy) : Infinity);
}

/**
 * For each badge, the zoom below which it hides (0: always shown). Badges are settled front to
 * back: one hides under a nearer badge only where that one shows. Drops (`drops`: thirsty trees)
 * always win: a drop says "water me", the badge only "new". `badgeW` — a badge's width, px.
 */
export function badgeHideZoom(badges: MarkTree[], drops: MarkTree[], badgeW: number): Map<string, number> {
  const out = new Map<string, number>();
  const settled: { o: MarkTree; hide: number }[] = [];
  const front = [...badges].sort((a, b) => b.depth - a.depth || b.x - a.x);
  for (const b of front) {
    let below = 0;
    for (const d of drops) {
      if (d.id === b.id) continue;
      // The drop stands at the right shoulder of its crown, about 0.22 of the crown width out.
      const z = apart(b.x - (d.x + 0.22 * d.w), b.top - d.top, (badgeW + BUBBLE) / 2 + ROOM + 6, (BADGE_H + BUBBLE) / 2 + ROOM);
      below = Math.max(below, z);
    }
    for (const { o, hide } of settled) {
      const z = apart(b.x - o.x, b.top - o.top, badgeW + ROOM, BADGE_H + ROOM);
      // The nearer badge shows at every zoom from `hide` up; where they overlap and it shows, this one goes.
      if (z > hide) below = Math.max(below, z);
    }
    out.set(b.id, below);
    settled.push({ o: b, hide: below });
  }
  return out;
}
