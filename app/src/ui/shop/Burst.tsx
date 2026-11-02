// A burst of little leaves (and acorns) from a point (spec 7.5 confetti, 7.6 and 8.1 the
// puff when a tree changes its kind): they fly out, then may fall and fade. Plain views with
// react-native-svg leaves, moved on the UI thread by one clock; nothing when animations are off.
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import type { MeadowId } from '@/game/economy';
import type { Skin } from '@/game/tree';
import { Glyph } from '@/ui/ds';

/** Leaf colors of each kind (light, dark): the puff is the new kind's leaves. */
export const KIND_LEAVES: Record<Skin, string[]> = {
  oak: ['#8BC34A', '#5E9A2C', '#A8D45A'],
  sakura: ['#FFB3CB', '#FF8FB1', '#FFD6E2'],
  spruce: ['#3E7A3A', '#2E5E2C', '#5C9A4A'],
  birch: ['#D6EC7A', '#A8D45A', '#74AA3A'],
  maple: ['#FFB54D', '#F07A2E', '#D2452B'],
  apple: ['#A9D86A', '#6FB24A', '#FFFFFF'],
  palm: ['#9FD45A', '#5DAE3E', '#2F7F34'],
};

/** A meadow's confetti is its weather (spec 7.5). */
export const MEADOW_BITS: Record<MeadowId, string[]> = {
  summer: ['#8BC34A', '#FFD84D', '#FF9FB8'],
  autumn: ['#E8643C', '#F2A33A', '#D9822B', '#B5552E'],
  winter: ['#FFFFFF', '#D7ECFF', '#E8434F'],
  bloom: ['#FFB3CB', '#FFD6E2', '#B7A6FF', '#FFFFFF'],
};

interface Bit {
  angle: number;
  dist: number;
  spin: number;
  color: string;
  acorn: boolean;
  size: number;
}

export interface BurstProps {
  /** Changes start a new burst; 0 — none yet. */
  run: number;
  x: number;
  y: number;
  colors: string[];
  count: number;
  acorns?: number;
  /** How far they fly out, px. */
  spread: [number, number];
  /** Flying out, ms (out-cubic). */
  out: number;
  /** Then falling this far with gravity, px (0 — they fade where they are). */
  fall?: number;
  fallTime?: number;
  leaf?: number;
}

export const Burst = memo(function Burst({ run, x, y, colors, count, acorns = 0, spread, out, fall = 0, fallTime = 300, leaf = 10 }: BurstProps) {
  const clock = useSharedValue(0);
  const total = out + fallTime;
  const bits = useMemo<Bit[]>(() => {
    // A fresh scatter each run, but steady within one.
    let seed = (run * 9301 + 49297) % 233280;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    return Array.from({ length: count + acorns }, (_, i) => ({
      angle: (i / (count + acorns)) * Math.PI * 2 + rand() * 0.6,
      dist: spread[0] + rand() * (spread[1] - spread[0]),
      spin: (rand() - 0.5) * 540,
      color: colors[i % colors.length],
      acorn: i >= count,
      size: leaf * (0.8 + rand() * 0.4),
    }));
    // A new run is a new burst; the rest are its settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);
  useEffect(() => {
    if (!run) return;
    clock.set(0);
    clock.set(withTiming(total, { duration: total, easing: Easing.linear }));
  }, [run, clock, total]);
  if (!run) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {bits.map((b, i) => (
        <Piece key={`${run}-${i}`} bit={b} clock={clock} x={x} y={y} out={out} fall={fall} fallTime={fallTime} />
      ))}
    </View>
  );
});

function Piece({ bit, clock, x, y, out, fall, fallTime }: { bit: Bit; clock: SharedValue<number>; x: number; y: number; out: number; fall: number; fallTime: number }) {
  const s = bit.size;
  const style = useAnimatedStyle(() => {
    const t = clock.get();
    const a = Math.min(1, t / out);
    const eased = 1 - (1 - a) ** 3;
    const f = Math.max(0, Math.min(1, (t - out) / fallTime));
    const dx = Math.cos(bit.angle) * bit.dist * eased;
    const dy = Math.sin(bit.angle) * bit.dist * eased + fall * f * f;
    // Fade over the last 300 ms (or the whole fall if it is shorter).
    const fadeFrom = out + fallTime - Math.min(300, fallTime);
    const alpha = t <= 0 || t >= out + fallTime ? 0 : t < fadeFrom ? 1 : 1 - (t - fadeFrom) / Math.min(300, fallTime);
    return {
      opacity: alpha,
      transform: [{ translateX: x - s / 2 + dx }, { translateY: y - s / 2 + dy }, { rotate: `${bit.spin * (t / 1000)}deg` }],
    };
  });
  return (
    <Animated.View style={[styles.piece, { width: s, height: s }, style]}>
      {bit.acorn ? (
        <Glyph name="acorn" size={s} />
      ) : (
        <Svg width={s} height={s} viewBox="-5 -10 10 10">
          <Path d="M0 0 C 4.2 -2.2, 4.2 -7.2, 0 -10 C -4.2 -7.2, -4.2 -2.2, 0 0 Z" fill={bit.color} />
        </Svg>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute', left: 0, top: 0 },
});
