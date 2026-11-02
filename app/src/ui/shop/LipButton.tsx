// The design system's L button (a face on a lip, ds/Button.tsx) with any content inside:
// "Buy for 🌰 250", "Need 🌰 580". Pressed, the face sinks onto the lip; while unavailable
// it is flat and grey, and a tap on it may still complain (`onDisabledPress`).
import { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { ButtonVariant, buttonLook, motion, useColors, useMotionOn } from '@/ui/ds';

const H = 56;
const LIP = 4;

export function LipButton({ variant, disabled = false, onPress, onDisabledPress, label, children, style }: {
  variant: ButtonVariant;
  disabled?: boolean;
  onPress(): void;
  onDisabledPress?(): void;
  label: string;
  /** Gets the ink color of the face. */
  children: (ink: string) => ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const motionOn = useMotionOn();
  const look = disabled ? { face: c.sunken, lip: null, ink: c.textMuted } : buttonLook(variant, c);
  const press = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (LIP - 1) * press.get() }] }));
  return (
    <Pressable
      onPressIn={() => !disabled && press.set(withTiming(1, { duration: motion.press, easing: Easing.linear }))}
      onPressOut={() => !disabled && press.set(motionOn ? withSpring(0, motion.spring.press) : withTiming(0, { duration: motion.still }))}
      onPress={() => (disabled ? onDisabledPress?.() : onPress())}
      disabled={disabled && !onDisabledPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      style={[{ height: H + LIP }, style]}
    >
      {look.lip && <View style={[styles.lip, { backgroundColor: look.lip }]} />}
      <Animated.View style={[styles.face, { backgroundColor: look.face }, faceStyle]}>{children(look.ink)}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lip: { position: 'absolute', left: 0, right: 0, top: LIP, height: H, borderRadius: 16 },
  face: { height: H, borderRadius: 16, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
