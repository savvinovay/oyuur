// The bottom sheet's surface and grabber (spec 1, 4.5): rounded top, a cartoon
// outline, a soft shadow upward and a light line along the top edge.
import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useStore } from '@/state/store';
import { elevation, radius } from './tokens';
import { useColors } from './useTheme';

export function SheetSurface({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const { night } = useStore();
  return (
    <View style={[styles.surface, elevation('sheet', night), { backgroundColor: c.sheet, borderColor: c.outline }, style]}>
      <View style={[styles.shine, { backgroundColor: night ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)' }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const BAR_W = 19;
const BAR_H = 5;
const TILT = 14;

/** progress 0 — a flat handle, 1 — a chevron pointing down. Without progress — flat. */
export function Grabber({ progress }: { progress?: SharedValue<number> }) {
  const c = useColors();
  // Each bar turns around its inner end, so at 1 the two make a "V".
  const leftStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${TILT * Math.max(0, Math.min(1, progress?.get() ?? 0))}deg` }] }));
  const rightStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-TILT * Math.max(0, Math.min(1, progress?.get() ?? 0))}deg` }] }));
  return (
    <View style={styles.grabber} pointerEvents="none">
      <Animated.View style={[styles.bar, { backgroundColor: c.card, transformOrigin: 'right center', marginRight: -1 }, leftStyle]} />
      <Animated.View style={[styles.bar, { backgroundColor: c.card, transformOrigin: 'left center', marginLeft: -1 }, rightStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: 1.5,
    borderBottomWidth: 0,
  },
  shine: { position: 'absolute', top: 1, left: radius.sheet, right: radius.sheet, height: 1 },
  grabber: { height: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  bar: { width: BAR_W, height: BAR_H, borderRadius: 3 },
});
