// The old palette, kept for the code written before wave 2. It has no colors of its
// own: interface colors come from ds/tokens.ts, the sky from sky/colors.ts and the
// tree paint from trees/colors.ts. New code uses colorsFor(night) from '@/ui/ds'.
import { Colors, colorsDay, colorsNight, scene } from './ds/tokens';
import type { MeadowId } from '@/game/economy';
import { groundOf } from './meadow/themes';
import { treeDay, treeNight, TreePaint } from './trees/colors';

export interface Palette extends TreePaint {
  dark: boolean;
  skyTop: string;
  skyBottom: string;
  sheet: string;
  sheetBorder: string;
  card: string;
  cardText: string;
  text: string;
  textSoft: string;
  screen: string;
  header: string;
  button: string;
  buttonText: string;
  accent: string;
  accentText: string;
  danger: string;
  frozen: string;
  pill: string;
  pillText: string;
  /** Sheets of past generations peeking out behind a forest card. */
  stack: string;
}

function palette(dark: boolean, c: Colors, tree: TreePaint): Palette {
  const sky = dark ? scene.sky.night : scene.sky.day;
  return {
    dark,
    ...tree,
    skyTop: sky.top,
    skyBottom: sky.horizon,
    sheet: c.sheet,
    sheetBorder: c.outline,
    card: c.card,
    cardText: c.text,
    text: c.text,
    textSoft: c.textSoft,
    screen: c.page,
    header: c.header,
    button: c.secondary,
    buttonText: c.text,
    accent: c.accent,
    accentText: c.onAccent,
    danger: c.danger,
    frozen: c.frozen,
    pill: c.pill,
    pillText: colorsDay.text,
    stack: c.stack,
  };
}

export const light: Palette = palette(false, colorsDay, treeDay);
export const dark: Palette = palette(true, colorsNight, treeNight);

const byMeadow = new Map<string, Palette>();

/**
 * The palette on a meadow (wave 5 spec, 10.1): only the earth under the trees changes
 * (snow in winter, golden in autumn). The same object every time, so it can be compared.
 */
export function paletteFor(night: boolean, meadow: MeadowId = 'summer'): Palette {
  const base = night ? dark : light;
  const g = groundOf(meadow, night);
  if (g.ground === base.ground && g.groundShade === base.groundShade) return base;
  const key = `${meadow}|${night}`;
  let p = byMeadow.get(key);
  if (!p) {
    p = { ...base, ground: g.ground, groundShade: g.groundShade };
    byMeadow.set(key, p);
  }
  return p;
}

export { fonts } from './ds/tokens';

/** Night by the clock: the "auto" theme turns dark from 20:00 to 6:00. */
export const isNightHour = (hour: number) => hour >= 20 || hour < 6;
