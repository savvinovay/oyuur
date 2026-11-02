// The small show in the header right after a tree gets its name (wave 4 spec, section 4):
// a warm glow behind the name, the letters popping up one by one, six sparks around it.
// Lives only for the 1.3 s of the show (≤ 20 animated letters), then the header goes
// back to a plain line of text. Times are from the tap on "Name it".
// Letters are what a reader sees as one (an accent stays with its letter); a name in a
// right-to-left or joined script (letters.ts) comes in whole, with one soft fade.
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, TextStyle, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { motion } from '@/ui/ds';
import { fx } from '../live/colors';
import { graphemes, lettersApart } from './letters';

/** The whole show, ms: after it the header is plain text again. */
export const NAME_SHOW = 1300;

const LETTERS_FROM = 280;
const GLOW_FROM = 240;
const SPARKS_FROM = 400;
const GLOW_H = 64;
const GLOW_WIDER = 64;
/** The glow's peak: by day a bright warm cloud; at night a dimmer gold, so the white name stays readable. */
const GLOW_DAY = 0.85;
const GLOW_NIGHT = 0.35;
/** A whole name (not split into letters) fades in over this long. */
const WHOLE_IN = 360;

/**
 * Sparks around the name, as in frame 05: a pair on each side of it, a small one under each
 * end, all clear of the letters. `edge` — px past the name's end (on `side`), `y` — from
 * the line's middle (kept within the line, off the habit's line below), `size` 10–20 px.
 */
const SPARKS: { side: -1 | 1; edge: number; y: number; size: number }[] = [
  { side: -1, edge: 22, y: -6, size: 18 },
  { side: 1, edge: 24, y: -8, size: 20 },
  { side: -1, edge: 8, y: 6, size: 12 },
  { side: 1, edge: 10, y: 6, size: 14 },
  { side: 1, edge: 46, y: 4, size: 10 },
  { side: -1, edge: 44, y: 3, size: 10 },
];
const SPARK_STEP = 70;
const SPARK_LIFE = 600;

/** The name in the header's first line, letter by letter, over its glow and sparks. */
export function NameCelebration({ name, style, height, glow = true, night = false }: {
  name: string;
  /** The first line's text style (font, color, shadow). */
  style: TextStyle[];
  /** The line's height: the glow and sparks are placed around its middle. */
  height: number;
  /** Renamed or named: glow and sparks; false — the letters only. */
  glow?: boolean;
  night?: boolean;
}) {
  const apart = lettersApart(name);
  const letters = apart ? graphemes(name) : [name];
  const step = Math.min(40, 480 / Math.max(letters.length, 1));
  const [w, setW] = useState(0);
  const [lineW, setLineW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));
  const onLine = (e: LayoutChangeEvent) => setLineW(Math.round(e.nativeEvent.layout.width));
  return (
    <View style={[styles.line, { height }]} pointerEvents="none" onLayout={onLine}>
      {glow && w > 0 && <Glow width={w + GLOW_WIDER} lineH={height} night={night} />}
      <View style={styles.row} onLayout={onLayout}>
        {apart ? (
          letters.map((ch, i) => <Letter key={i} ch={ch} delay={LETTERS_FROM + i * step} style={style} />)
        ) : (
          <Whole text={name} style={style} />
        )}
      </View>
      {glow && w > 0 && SPARKS.map((s, i) => {
        // Past the name's end, but never off the line (a long name nearly fills it).
        const room = lineW > 0 ? lineW / 2 - s.size / 2 : Infinity;
        const x = s.side * Math.min(w / 2 + s.edge + s.size / 2, room);
        return <Spark key={i} x={x} y={s.y} size={s.size} lineH={height} delay={SPARKS_FROM + i * SPARK_STEP} />;
      })}
    </View>
  );
}

function Letter({ ch, delay, style }: { ch: string; delay: number; style: TextStyle[] }) {
  const alpha = useSharedValue(0);
  const p = useSharedValue(0);
  useEffect(() => {
    alpha.set(withDelay(delay, withTiming(1, { duration: 120 })));
    p.set(withDelay(delay, withSpring(1, motion.spring.pop)));
  }, [alpha, p, delay]);
  const a = useAnimatedStyle(() => ({
    opacity: alpha.get(),
    transform: [{ translateY: 8 * (1 - p.get()) }, { scale: 0.6 + 0.4 * p.get() }],
  }));
  return <Animated.Text maxFontSizeMultiplier={1.3} style={[...style, a]}>{ch}</Animated.Text>;
}

/** A name that must stay joined: one piece, fading in and rising a little. */
function Whole({ text, style }: { text: string; style: TextStyle[] }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(LETTERS_FROM, withTiming(1, { duration: WHOLE_IN, easing: Easing.out(Easing.cubic) })));
  }, [p]);
  const a = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateY: 6 * (1 - p.get()) }] }));
  return <Animated.Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[...style, a]}>{text}</Animated.Text>;
}

function Glow({ width, lineH, night }: { width: number; lineH: number; night: boolean }) {
  const alpha = useSharedValue(0);
  useEffect(() => {
    alpha.set(withDelay(GLOW_FROM, withSequence(
      withTiming(night ? GLOW_NIGHT : GLOW_DAY, { duration: 200, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 700, easing: Easing.in(Easing.cubic) }),
    )));
  }, [alpha, night]);
  const a = useAnimatedStyle(() => ({ opacity: alpha.get() }));
  const color = night ? fx.nameSparkEdge : fx.nameGlow;
  return (
    <Animated.View style={[styles.abs, { width, height: GLOW_H, left: '50%', marginLeft: -width / 2, top: lineH / 2 - GLOW_H / 2 }, a]}>
      <Svg width={width} height={GLOW_H}>
        <Defs>
          <RadialGradient id="name-glow" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="0.55" stopColor={color} stopOpacity={0.55} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={width / 2} cy={GLOW_H / 2} rx={width / 2} ry={GLOW_H / 2} fill="url(#name-glow)" />
      </Svg>
    </Animated.View>
  );
}

/** A four-pointed star, 24 units. */
const STAR = 'M12 1.5 C12.9 8 16 11.1 22.5 12 C16 12.9 12.9 16 12 22.5 C11.1 16 8 12.9 1.5 12 C8 11.1 11.1 8 12 1.5 Z';

function Spark({ x, y, size, lineH, delay }: { x: number; y: number; size: number; lineH: number; delay: number }) {
  const s = useSharedValue(0);
  useEffect(() => {
    const half = { duration: SPARK_LIFE / 2, easing: Easing.inOut(Easing.cubic) };
    s.set(withDelay(delay, withSequence(withTiming(1, half), withTiming(0, half))));
  }, [s, delay]);
  const a = useAnimatedStyle(() => ({ opacity: s.get() > 0.01 ? 1 : 0, transform: [{ scale: s.get() }, { rotate: `${s.get() * 20}deg` }] }));
  return (
    <Animated.View style={[styles.abs, { width: size, height: size, left: '50%', marginLeft: x - size / 2, top: lineH / 2 + y - size / 2 }, a]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={STAR} fill={fx.nameSpark} stroke={fx.nameSparkEdge} strokeWidth={1.6} strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  line: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  row: { flexDirection: 'row', alignItems: 'flex-end', maxWidth: '100%' },
  abs: { position: 'absolute' },
});
