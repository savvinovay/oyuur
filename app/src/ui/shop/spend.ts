// The acorns' flight from the item window's wallet into the picture above it (spec 3.5):
// developer А's flight layer (ui/acorns) does the flying.
import { Dimensions } from 'react-native';
import { acornFlights } from '@/ui/acorns';

/** A rectangle in the window's coordinates (measureInWindow). */
export interface Rect { x: number; y: number; width: number; height: number }

/** How far above the wallet the picture's middle is, about (item window, spec 7.1). */
const PICTURE_ABOVE = 150;

/** `amount` acorns leave the wallet at `from` (the item window's wallet chip) for the picture. */
export function spendAcorns(amount: number, from: Rect | null): void {
  if (!from) return;
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const to = { x: Dimensions.get('window').width / 2, y: Math.max(40, start.y - PICTURE_ABOVE) };
  acornFlights.spend(amount, to, { from: start });
}
