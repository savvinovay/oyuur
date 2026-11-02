// Our own on/off switch (spec 4.7): the system Switch looks different on iOS,
// Android and the web. Track 52×32, a white knob that springs from x 3 to 23.
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useStore } from '@/state/store';
import { cue } from '@/ui/feedback';
import { elevation, motion } from './tokens';
import { useColors, useMotionOn } from './useTheme';

const TRACK_W = 52;
const TRACK_H = 32;
const KNOB = 26;
const OFF_X = 3;
const ON_X = TRACK_W - KNOB - OFF_X;

export function Toggle({ value, onChange, accessibilityLabel, disabled = false }: {
  value: boolean; onChange: (value: boolean) => void; accessibilityLabel?: string; disabled?: boolean;
}) {
  const c = useColors();
  const { night } = useStore();
  const motionOn = useMotionOn();
  const x = useSharedValue(value ? ON_X : OFF_X);
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    x.set(motionOn ? withSpring(value ? ON_X : OFF_X, motion.spring.thumb) : withTiming(value ? ON_X : OFF_X, { duration: motion.still }));
    on.set(withTiming(value ? 1 : 0, { duration: motion.fast }));
  }, [value, motionOn, x, on]);

  const off = c.sunken;
  const accent = c.accent;
  const trackStyle = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(on.get(), [0, 1], [off, accent]) }));
  const knobStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <Pressable
      onPress={() => {
        cue('select');
        onChange(!value);
      }}
      disabled={disabled}
      hitSlop={6}
      // role and aria-* as well: react-native-web reads only those, so the browser knows the state too.
      role="switch"
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      aria-checked={value}
      aria-disabled={disabled}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View style={[styles.track, !value && { boxShadow: `inset 0 2px 3px ${night ? 'rgba(0,0,0,0.35)' : 'rgba(90,58,18,0.18)'}` }, trackStyle]}>
        <Animated.View style={[styles.knob, elevation(1, night), knobStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2, justifyContent: 'center' },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2, backgroundColor: '#FFFFFF' },
});
