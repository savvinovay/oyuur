// Colors of the avatar circle (wave 5 spec, 12.2), by the index kept in the profile
// (AVATAR_COLORS = 8). At night a circle is darker, so a light one doesn't glow on a dark
// page; the drawing stays the same. Sand is a deeper tan than the spec's #F3D9B5, which
// melted into the cream sheet (wave 5 fixes).
import { AVATAR_COLORS } from '@/game/profile';

/** peach, mint, sky, lilac, butter, rose, sage, sand */
export const AVATAR_BG = {
  day: ['#FFD3A8', '#BDEBC8', '#BFE6FA', '#D9CCFF', '#FFE79A', '#FFC2D1', '#CFE3B0', '#E3C08F'],
  night: ['#C98F66', '#6FA884', '#6E9CC9', '#8E80CC', '#C9A84E', '#C9768E', '#86A26A', '#A88E6E'],
} as const;

/** The circle's color; an index out of range (old or foreign data) falls back to peach. */
export function avatarColor(index: number, night: boolean): string {
  const i = Number.isInteger(index) && index >= 0 && index < AVATAR_COLORS ? index : 0;
  return AVATAR_BG[night ? 'night' : 'day'][i];
}
