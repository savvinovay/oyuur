// The meadow the player has put on (store.shop.meadow) and what it changes: the scene's
// colors and the earth under the trees. Read by the scene pieces themselves, so the
// screens that show them don't have to pass it down.
import { useStore } from '@/state/store';
import { Palette, paletteFor } from '../theme';
import { meadowTheme, MeadowTheme } from './themes';

export function useMeadow(): { theme: MeadowTheme; palette: Palette } {
  const { shop, night } = useStore();
  return { theme: meadowTheme(shop.meadow), palette: paletteFor(night, shop.meadow) };
}
