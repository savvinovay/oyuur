// "Already watered today" / "This day is already over": a pill over the crown for a
// repeated tap. Comes in 180 ms, stays 1.4 s, goes in 220 ms; a new tap restarts it,
// so pills never pile up.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, SharedValue, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useStore } from '@/state/store';
import { SceneGeo, slotAt } from '../scene/contract';
import { AppText, shadow } from '../kit';
import { CHIP } from './timeline';

export function AlreadyChip({ pulse, text, top, geo, depth }: {
  /** Changes on every repeated tap; 0 = never shown. */
  pulse: number;
  text: string;
  /** Top of the pill, px from the tree's feet. */
  top: number;
  geo: SceneGeo;
  depth: SharedValue<number>;
}) {
  const { palette } = useStore();
  const alpha = useSharedValue(0);
  const scale = useSharedValue(0.9);
  // Off the page once it has faded: an invisible pill must not be read out.
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!pulse) return;
    setOn(true);
    const timer = setTimeout(() => setOn(false), CHIP.in + CHIP.hold + CHIP.out + 30);
    cancelAnimation(alpha);
    cancelAnimation(scale);
    const inn = { duration: CHIP.in, easing: Easing.out(Easing.cubic) };
    alpha.set(withSequence(withTiming(1, inn), withDelay(CHIP.hold, withTiming(0, { duration: CHIP.out, easing: Easing.in(Easing.cubic) }))));
    scale.set(0.9);
    scale.set(withTiming(1, inn));
    return () => clearTimeout(timer);
  }, [pulse, alpha, scale]);

  const style = useAnimatedStyle(() => {
    const s = slotAt(depth.get(), geo);
    return {
      opacity: alpha.get() * Math.max(0, 1 - Math.abs(depth.get()) * 2.5),
      transform: [{ translateX: s.x - geo.width / 2 }, { translateY: s.feetY + top }, { scale: scale.get() }],
    };
  });

  if (!on) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { width: geo.width }, style]}>
      <View style={[styles.pill, { backgroundColor: palette.dark ? '#E9E8FF' : '#FFFFFF' }, shadow(palette)]}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path d="M12 1.5 A 10.5 10.5 0 1 0 12.01 1.5 Z" fill="#4CC764" />
          <Path d="M7 12.4 L10.6 15.8 L17.2 8.8" stroke="#FFFFFF" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
        <AppText weight="bold" style={{ fontSize: 13, color: '#1E1B16', flexShrink: 1 }}>{text}</AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // A longer note (the watering time changed) wraps inside the screen instead of running off it.
  wrap: { position: 'absolute', left: 0, top: 0, alignItems: 'center', paddingHorizontal: 16 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 12, paddingVertical: 6, borderRadius: 16, maxWidth: '100%' },
});
