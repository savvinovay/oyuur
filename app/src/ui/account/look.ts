// Colors of the forest-in-the-account screens (design/oyuur-29/спец.md 7, 8.1). `softOnCard` and
// `meadowStrip` are the spec's new tokens; they live here until ds/tokens takes them.
import type { Colors } from '@/ui/ds';

/** Soft text on a card: at night `textSoft` on `card` is 3.1:1, this one 4.55:1 (spec 8.1). */
export const softOnCard = (c: Colors, night: boolean) => (night ? '#F2F1FF' : c.textSoft);

/** The meadow strip under a mini-forest, and the light 1 px edge on its top. */
export const meadowStrip = (night: boolean) => (night ? '#45507A' : '#DCE3A0');
export const meadowEdge = (night: boolean) => (night ? '#7280B4' : '#EEF3C6');

/**
 * The mini-forest's sky, top to bottom. At night a step lighter than the spec's #262B6E → #4C50A0:
 * on the night card that one read as a dark hole (critic, OYUUR-30).
 */
export const miniSky = (night: boolean) => (night ? ['#3A408E', '#666ABA'] : ['#BFEAF6', '#EAFBFF']);

/** Squares behind the white icons of the account rows (frames 10–12, 20). */
export const ACCOUNT_TINT = {
  saved: '#4CC764',
  saving: '#4FB6E8',
  offline: '#8D93A1',
  error: '#D24A43',
  session: '#FF9E5E',
  password: '#9874E3',
  code: '#4FB6E8',
  restore: '#4CC764',
  /** The quiet badge on the Settings tile (spec 7). */
  attention: '#F4B740',
};
