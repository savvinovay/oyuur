// Small pieces of the leaderboard (спец-друзья 9): an avatar with my ring, the value text,
// a "breathing" skeleton.
import { ReactNode, useEffect, useRef } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { Board } from '@/game/leaders';
import type { AvatarId } from '@/game/profile';
import type { T } from '@/i18n';
import { pluralForm } from '@/i18n';
import { useStore } from '@/state/store';
import { Avatar } from '@/ui/avatars/Avatar';
import { elevation, motion, useColors } from '@/ui/ds';
import type { Player } from './model';

/** "6 из 7" / "112 дн."; null — "—". */
export function valueText(t: T, board: Board, value: number | null): string {
  if (value === null) return '—';
  return board === 'week' ? t('leadersWeekValue', { n: value }) : t('leadersStreakValue', { n: value, word: t.dict.leadersDayWords[pluralForm(t.lang, value)] });
}

/** A player's avatar: me with a 3 px green ring outside, the others with a soft shadow. */
export function PlayerAvatar({ player, size, ring = 3, shadow = true }: { player: Player; size: number; ring?: number; shadow?: boolean }) {
  const c = useColors();
  const { night } = useStore();
  return (
    <View style={{ width: size, height: size }}>
      {player.me ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: -ring, top: -ring, width: size + 2 * ring, height: size + 2 * ring, borderRadius: size / 2 + ring, backgroundColor: c.accent }}
        />
      ) : shadow ? (
        <View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: c.card }, elevation(1, night)]} />
      ) : null}
      <Avatar id={player.avatar as AvatarId} color={player.color} size={size} />
    </View>
  );
}

/**
 * Text that fades in again (160 ms) when it changes — a tab switch's new value (9.5).
 * Opacity on the UI thread, not a layout `entering`: on the web that takes the text out of
 * the flow while it plays.
 */
export function FadeSwap({ value, on, children }: { value: string; on: boolean; children: ReactNode }) {
  const o = useSharedValue(1);
  const shown = useRef(value);
  useEffect(() => {
    if (shown.current === value) return;
    shown.current = value;
    if (!on) return;
    o.set(0);
    o.set(withTiming(1, { duration: motion.fast, easing: motion.ease.out }));
  }, [value, on, o]);
  const s = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={s}>{children}</Animated.View>;
}

/** Opacity 0.5 ↔ 1, 1200 ms, forever (спец-друзья 11.2); still when animations are off. */
export function Breathing({ on, children, style }: { on: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(1);
  useEffect(() => {
    if (!on) {
      cancelAnimation(o);
      o.set(0.75);
      return;
    }
    o.set(1);
    o.set(withRepeat(withTiming(0.5, { duration: 1200, easing: motion.ease.inOut }), -1, true));
    return () => cancelAnimation(o);
  }, [on, o]);
  const s = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[style, s]}>{children}</Animated.View>;
}
