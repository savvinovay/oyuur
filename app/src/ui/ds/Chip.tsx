// A small sunken pill to tap, like the habit ideas (spec 4.7).
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { cue } from '@/ui/feedback';
import { Txt } from './Text';
import { fonts, motion } from './tokens';
import { useColors, useMotionOn } from './useTheme';

export function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  const motionOn = useMotionOn();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      onPressIn={() => scale.set(withTiming(0.96, { duration: motion.press }))}
      onPressOut={() => scale.set(motionOn ? withSpring(1, motion.spring.press) : withTiming(1, { duration: motion.still }))}
      onPress={() => {
        cue('select');
        onPress();
      }}
      accessibilityRole="button"
      hitSlop={5}
    >
      <Animated.View style={[styles.chip, { backgroundColor: c.sunken }, style]}>
        <Txt numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, color: c.text }}>{label}</Txt>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { height: 34, borderRadius: 17, paddingHorizontal: 14, justifyContent: 'center' },
});
