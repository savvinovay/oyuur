// A new meadow on the main screen (wave 5 spec, 10.6): back from the shop with another
// meadow, the canvases are rebuilt under a veil of the new sky's horizon color, and the
// veil melts away (500 ms, from the second frame after the rebuild; 200 ms without
// animations). No sound or vibration: the player already heard the choice in the shop.
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { MeadowId } from '@/game/economy';
import { useStore } from '@/state/store';
import { meadowTheme } from './themes';

/** The meadow last shown on the main screen. Kept outside the component: on the web the scene unmounts under another screen. */
let shown: MeadowId | null = null;

/** Two frames: the rebuilt canvases have drawn by then. */
const SETTLE = 34;

export function MeadowSwap({ animations }: { animations: boolean }) {
  const { shop, night, ready } = useStore();
  const focused = useIsFocused();
  const [veil, setVeil] = useState<string | null>(null);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!ready || !focused) return;
    const before = shown;
    shown = shop.meadow;
    if (before === null || before === shop.meadow) return;
    setVeil(meadowTheme(shop.meadow).sky[night ? 'night' : 'day'].horizon);
    opacity.set(
      withSequence(
        withTiming(1, { duration: 0 }),
        withDelay(
          SETTLE,
          withTiming(0, { duration: animations ? 500 : 200, easing: Easing.out(Easing.cubic) }, (finished) => {
            'worklet';
            if (finished) scheduleOnRN(setVeil, null);
          }),
        ),
      ),
    );
    // Only a new meadow (or coming back to the screen) starts the veil.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focused, shop.meadow]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  if (!veil) return null;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: veil }, style]} />;
}
