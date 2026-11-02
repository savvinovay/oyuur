// Waiting is the same everywhere (design/oyuur-29/спец.md 8.3): the button keeps its color, a
// white ring turns on its left (800 ms a turn) and the label says what is going on ("Merging…").
// The ring turns on the UI thread, so it doesn't stop while JS works out the password key.
import { useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button, ButtonSize, buttonLook, ButtonVariant, fonts, IconName, MAX_FONT_SCALE, Txt, useColors, useMotionOn } from '@/ui/ds';
import type { Cue } from '@/ui/feedback';

export function Ring({ size = 22, color = '#FFFFFF', track = 'rgba(255,255,255,0.35)' }: { size?: number; color?: string; track?: string }) {
  const motionOn = useMotionOn();
  const turn = useSharedValue(0);
  useEffect(() => {
    // Without animations the ring still turns, slower: it is the only sign that work goes on.
    turn.set(withRepeat(withTiming(1, { duration: motionOn ? 800 : 1600, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(turn);
  }, [turn, motionOn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 360}deg` }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={8.5} fill="none" stroke={track} strokeWidth={3} />
        <Path d="M12 3.5 A8.5 8.5 0 0 1 20.5 12" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

const H: Record<ButtonSize, { h: number; r: number; lip: number; font: number }> = {
  l: { h: 56, r: 16, lip: 4, font: 18 },
  m: { h: 48, r: 14, lip: 4, font: 16 },
  s: { h: 36, r: 12, lip: 3, font: 14 },
};

/** A design-system Button that, while `busy`, keeps its face and shows the ring with `busyTitle`. */
export function BusyButton({ busy, busyTitle, variant = 'primary', size = 'l', style, ...rest }: {
  busy: boolean;
  busyTitle: string;
  title: string;
  onPress(): void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onDisabledPress?: () => void;
  /** A line icon before the title (not while busy: the ring is there then). */
  icon?: IconName;
  cue?: Cue | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const c = useColors();
  if (!busy) return <Button variant={variant} size={size} style={style} {...rest} />;
  const look = buttonLook(variant, c);
  const s = H[size];
  const light = look.ink === '#FFFFFF' || look.ink === c.onAccent;
  return (
    <View
      style={[{ height: s.h + s.lip }, style]}
      accessibilityRole="button"
      accessibilityState={{ disabled: true, busy: true }}
      accessibilityLabel={busyTitle}
      testID={rest.testID}
    >
      {look.lip && <View style={[styles.lip, { top: s.lip, height: s.h, borderRadius: s.r, backgroundColor: look.lip }]} />}
      <View style={[styles.face, { height: s.h, borderRadius: s.r, backgroundColor: look.face }]}>
        <Ring size={size === 's' ? 18 : 22} color={light ? '#FFFFFF' : look.ink} track={light ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.15)'} />
        <Txt numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: fonts.bold, fontSize: s.font, lineHeight: s.font + 6, color: look.ink, flexShrink: 1 }}>
          {busyTitle}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lip: { position: 'absolute', left: 0, right: 0 },
  face: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
});
