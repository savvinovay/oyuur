// Hooks every design-system piece uses: the colors of the current theme and
// whether things may move (spec 4.6: the "Animations" setting and the system's
// "reduce motion").
import { useReducedMotion } from 'react-native-reanimated';
import { useStore } from '@/state/store';
import { Colors, colorsFor } from './tokens';

export function useColors(): Colors {
  return colorsFor(useStore().night);
}

/** False when animations are off: springs become 120 ms timings, bounces and wobbles go. */
export function useMotionOn(): boolean {
  const reduced = useReducedMotion();
  return useStore().settings.animations && !reduced;
}
