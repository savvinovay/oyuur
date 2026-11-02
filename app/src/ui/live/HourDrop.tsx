// The watering hour came while the screen is open (OYUUR-33 5.1, frames 10b–10c): one drop
// falls 40 px into the planting hole, beside the trunk (380 ms, ease in), a small splash spreads
// on the soil and melts (220 ms) — 0.6 s in all. An invitation, without a sound. Driven by one
// number, ms since the start.
import { StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { Glyph } from '@/ui/ds';
import { SceneGeo, slotAt } from '../scene/contract';

export const HOUR_DROP = { fall: 380, ring: 220, end: 600 };
const DROP = 16;
/** How high above the soil the drop starts, px. */
const FALL = 40;
const RING_W = 30;
const RING_H = 10;

export function HourDrop({ t, geo, depth, dx }: {
  /** ms since the hour came; −1 — nothing to show. */
  t: SharedValue<number>;
  geo: SceneGeo;
  depth: SharedValue<number>;
  /** Where in the hole it lands, px right of the trunk (so it never falls over a small sprout). */
  dx: number;
}) {
  const dropStyle = useAnimatedStyle(() => {
    const ms = t.get();
    if (ms < 0 || ms > HOUR_DROP.fall) return { opacity: 0 };
    const s = slotAt(depth.get(), geo);
    const p = ms / HOUR_DROP.fall;
    const y = -FALL + (FALL - 2) * p * p;
    return {
      opacity: p > 0.85 ? (1 - p) / 0.15 : Math.min(1, p * 8),
      transform: [{ translateX: s.x + dx - DROP / 2 }, { translateY: s.feetY + y - DROP }],
    };
  });
  const ringStyle = useAnimatedStyle(() => {
    const ms = t.get() - HOUR_DROP.fall;
    if (t.get() < 0 || ms < 0 || ms > HOUR_DROP.ring) return { opacity: 0 };
    const s = slotAt(depth.get(), geo);
    const p = 1 - Math.pow(1 - ms / HOUR_DROP.ring, 3);
    return {
      opacity: 0.8 * (1 - ms / HOUR_DROP.ring),
      transform: [{ translateX: s.x + dx - RING_W / 2 }, { translateY: s.feetY - RING_H / 2 }, { scale: 0.1 + 0.9 * p }],
    };
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[styles.at, dropStyle]}>
        <Glyph name="drop" size={DROP} />
      </Animated.View>
      <Animated.View style={[styles.at, styles.ring, ringStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  at: { position: 'absolute', left: 0, top: 0 },
  ring: { width: RING_W, height: RING_H, borderRadius: RING_H / 2, borderWidth: 2, borderColor: '#7FC8F0' },
});
