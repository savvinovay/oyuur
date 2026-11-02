// Buttons of the design system (spec 4.7, frame 24): a face on a darker "lip".
// Pressed, the face sinks onto the lip in 60 ms and springs back on release.
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { cue as giveCue, Cue } from '@/ui/feedback';
import { Glyph, GlyphName } from './Glyph';
import { Icon, IconName } from './Icon';
import { Txt } from './Text';
import { Colors, fonts, MAX_FONT_SCALE, motion } from './tokens';
import { useColors, useMotionOn } from './useTheme';

/** `warm` — "cheer" (friends, спец-друзья 2.2); `done` — a finished action: flat, readable, not pressable. */
export type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'danger' | 'warm' | 'done' | 'text';
export type ButtonSize = 'l' | 'm' | 's';

const SIZES: Record<ButtonSize, { h: number; r: number; lip: number; pad: number; font: number; pic: number }> = {
  l: { h: 56, r: 16, lip: 4, pad: 20, font: 18, pic: 22 },
  m: { h: 48, r: 14, lip: 4, pad: 20, font: 16, pic: 22 },
  s: { h: 36, r: 12, lip: 3, pad: 14, font: 14, pic: 18 },
};

const DEFAULT_CUE: Record<ButtonVariant, Cue | null> = { primary: 'tap', gold: 'tap', secondary: 'select', danger: 'select', warm: null, done: null, text: null };

export function buttonLook(variant: ButtonVariant, c: Colors): { face: string; lip: string | null; ink: string } {
  switch (variant) {
    case 'primary': return { face: c.accent, lip: c.accentLip, ink: c.onAccent };
    case 'secondary': return { face: c.secondary, lip: c.secondaryLip, ink: c.text };
    case 'gold': return { face: c.gold, lip: c.goldLip, ink: c.goldInk };
    case 'danger': return { face: c.danger, lip: c.dangerLip, ink: '#FFFFFF' };
    case 'warm': return { face: c.warm, lip: c.warmLip, ink: c.warmInk };
    case 'done': return { face: c.sunken, lip: null, ink: c.textSoft };
    default: return { face: 'transparent', lip: null, ink: c.textSoft };
  }
}

export function Button({
  title, onPress, variant = 'primary', size = 'l', glyph, icon, disabled = false, style, accessibilityLabel, cue, onDisabledPress, testID,
}: {
  title: string; onPress: () => void; variant?: ButtonVariant; size?: ButtonSize;
  glyph?: GlyphName; icon?: IconName; disabled?: boolean; style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string; /** null — no feedback */ cue?: Cue | null;
  /** Called on a tap while disabled (e.g. to shake an empty field). */
  onDisabledPress?: () => void;
  testID?: string;
}) {
  const c = useColors();
  const motionOn = useMotionOn();
  const s = SIZES[size];
  const isText = variant === 'text';
  const look = disabled && !isText ? { face: c.sunken, lip: null, ink: c.textMuted } : buttonLook(variant, c);
  const lip = isText ? 0 : s.lip;
  // 0 — up, 1 — pressed onto the lip (the lip still shows 1 px).
  const press = useSharedValue(0);
  const sink = s.lip - 1;
  const faceStyle = useAnimatedStyle(() =>
    isText ? { opacity: 1 - 0.4 * press.get() } : { transform: [{ translateY: sink * press.get() }] },
  );

  const down = () => {
    if (disabled) return;
    press.set(withTiming(1, { duration: isText ? 100 : motion.press, easing: Easing.linear }));
  };
  const up = () => {
    if (disabled) return;
    press.set(motionOn && !isText ? withSpring(0, motion.spring.press) : withTiming(0, { duration: motion.still }));
  };
  const tap = () => {
    if (disabled) return onDisabledPress?.();
    const feedback = cue === undefined ? DEFAULT_CUE[variant] : cue;
    if (feedback) giveCue(feedback);
    onPress();
  };

  const picture = glyph ? <Glyph name={glyph} size={s.pic} muted={disabled} /> : icon ? <Icon name={icon} size={s.pic} color={look.ink} /> : null;
  return (
    <Pressable
      onPressIn={down}
      onPressOut={up}
      onPress={tap}
      disabled={disabled && !onDisabledPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      testID={testID}
      style={[{ height: s.h + lip }, style]}
    >
      {look.lip && <View style={[styles.lip, { top: lip, height: s.h, borderRadius: s.r, backgroundColor: look.lip }]} />}
      <Animated.View style={[styles.face, { height: s.h, borderRadius: s.r, paddingHorizontal: s.pad, backgroundColor: look.face }, faceStyle]}>
        {picture}
        <Txt
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{ fontFamily: fonts.bold, fontSize: s.font, lineHeight: s.font + 6, color: look.ink, flexShrink: 1 }}
        >
          {title}
        </Txt>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lip: { position: 'absolute', left: 0, right: 0 },
  face: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
