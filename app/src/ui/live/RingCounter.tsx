// Days of growth in the header: the rings icon and the number. After watering it keeps
// the old number until the +1 token lands, then the number rolls over (the old one goes
// up and out first, then the new one comes up), the icon bumps a little and a green "+1"
// pops up beside it — and always goes away on its own timer.
import { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useStore } from '@/state/store';
import { AppText, Rings, textShadow } from '../kit';
import { setRingMeasure, tokenLanded, tokenLaunched, useChannel } from './events';
import { REDUCED } from './timeline';

/** The old number leaves upward, then the new one comes up from below. */
const ROLL_OUT = { duration: 120, easing: Easing.in(Easing.quad) };
const ROLL_IN = { duration: 220, easing: Easing.out(Easing.cubic) };
/** The icon never grows more than this, so it never runs into the number. */
const BUMP = 1.15;
/** The +1 pill: in, hold, out. */
const PILL_HOLD = 900;
const PILL_OUT = 250;

export function RingCounter({ treeId, value }: { treeId: string; value: number }) {
  const { settings, palette } = useStore();
  const reducedMotion = useReducedMotion();
  const animations = settings.animations && !reducedMotion;
  const [state, setShown] = useState({ treeId, now: value });
  // Another tree came to the front (the camera passed by): its number shows in this very
  // render, together with its name, no animation. The effect below catches the state up.
  const shown = state.treeId === treeId ? state : { treeId, now: value };
  const [pill, setPill] = useState(0);
  const shownRef = useRef(value);
  const treeRef = useRef(treeId);
  // The tree we expect a token for, and until when we wait for it.
  const expected = useRef<{ treeId: string; until: number; instant: boolean } | null>(null);
  const waiting = useRef<number | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Counts the flips, so a late "show the new number" from an older roll is dropped.
  const flips = useRef(0);

  // The +1 pill always leaves by its own timer.
  const [pillOn, setPillOn] = useState(false);
  // 0 → 1: the old number goes up and out; at 1, unseen, the text changes;
  // 1 → 2: the new number comes up from below. The old and the new one are never on screen together.
  const roll = useSharedValue(2);
  const bump = useSharedValue(1);
  const glow = useSharedValue(0);
  const pillScale = useSharedValue(0.4);
  const pillAlpha = useSharedValue(0);
  const pillY = useSharedValue(0);

  // The old number is gone: show the new one and bring it up.
  const enter = useCallback(
    (n: number, to: number) => {
      if (n !== flips.current) return;
      setShown({ treeId: treeRef.current, now: to });
      roll.set(withTiming(2, ROLL_IN));
    },
    [roll],
  );

  const flip = useCallback(
    (to: number) => {
      clearTimeout(fallback.current);
      waiting.current = null;
      const from = shownRef.current;
      shownRef.current = to;
      const n = ++flips.current;
      const up = to > from;
      if (animations && up) {
        roll.set(0);
        roll.set(
          withTiming(1, ROLL_OUT, (done) => {
            'worklet';
            if (done) scheduleOnRN(enter, n, to);
          }),
        );
        // A stiff, well-damped spring: it comes back without swinging past BUMP again.
        bump.set(withSequence(withTiming(BUMP, { duration: 110 }), withSpring(1, { damping: 14, stiffness: 260 })));
        glow.set(withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 280 })));
      } else {
        cancelAnimation(roll);
        roll.set(2);
        setShown({ treeId: treeRef.current, now: to });
      }
      if (up) setPill((p) => p + 1);
    },
    [animations, roll, bump, glow, enter],
  );

  useChannel(
    tokenLaunched,
    useCallback(
      (e: { treeId: string; arriveIn: number }) => {
        if (e.treeId === treeRef.current) expected.current = { treeId: e.treeId, until: Date.now() + e.arriveIn + 600, instant: e.arriveIn === 0 };
      },
      [],
    ),
  );
  useChannel(
    tokenLanded,
    useCallback(
      (e: { treeId: string }) => {
        if (e.treeId !== treeRef.current) return;
        expected.current = null;
        if (waiting.current !== null) flip(waiting.current);
      },
      [flip],
    ),
  );

  useEffect(() => {
    if (treeId !== treeRef.current) {
      // Another tree came to the front: no animation, just its number.
      treeRef.current = treeId;
      expected.current = null;
      clearTimeout(fallback.current);
      waiting.current = null;
      flips.current++;
      shownRef.current = value;
      setShown({ treeId, now: value });
      setPillOn(false);
      cancelAnimation(roll);
      roll.set(2);
      return;
    }
    if (value === shownRef.current) return;
    const e = expected.current;
    if (value > shownRef.current && e && !e.instant && Date.now() < e.until) {
      // Hold the old number until the token lands, but never longer than promised.
      waiting.current = value;
      clearTimeout(fallback.current);
      fallback.current = setTimeout(() => flip(value), e.until - Date.now());
      return;
    }
    expected.current = null;
    flip(value);
  }, [value, treeId, flip, roll]);

  useEffect(() => () => clearTimeout(fallback.current), []);
  useEffect(() => {
    if (!pill) return;
    setPillOn(true);
    const hold = animations ? PILL_HOLD : REDUCED.plusPill;
    pillY.set(0);
    if (animations) {
      pillScale.set(0.4);
      pillScale.set(withSpring(1, { damping: 12, stiffness: 260 }));
      pillAlpha.set(withSequence(withTiming(1, { duration: 120 }), withDelay(hold, withTiming(0, { duration: PILL_OUT }))));
      pillY.set(withDelay(hold + 120, withTiming(-8, { duration: PILL_OUT, easing: Easing.in(Easing.cubic) })));
    } else {
      pillScale.set(1);
      pillAlpha.set(1);
    }
    const timer = setTimeout(() => setPillOn(false), hold + 120 + PILL_OUT + 30);
    return () => clearTimeout(timer);
  }, [pill, animations, pillScale, pillAlpha, pillY]);

  // Tell the live tree where to fly the token.
  const icon = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {
    const measure = () =>
      new Promise<{ x: number; y: number } | null>((resolve) => {
        if (!icon.current) return resolve(null);
        icon.current.measureInWindow((x: number, y: number, w: number, h: number) => resolve({ x: x + w / 2, y: y + h / 2 }));
      });
    setRingMeasure(measure);
    return () => setRingMeasure(null);
  }, []);

  const numberRoll = useAnimatedStyle(() => {
    const p = roll.get();
    return p <= 1
      ? { opacity: 1 - p, transform: [{ translateY: -18 * p }] }
      : { opacity: p - 1, transform: [{ translateY: 18 * (2 - p) }] };
  });
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: Math.min(bump.get(), BUMP) }] }));
  // The glow grows no further than the icon does.
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() * 0.6, transform: [{ scale: 0.85 + (BUMP - 0.85) * glow.get() }] }));
  const pillStyle = useAnimatedStyle(() => ({ opacity: pillAlpha.get(), transform: [{ translateY: pillY.get() }, { scale: pillScale.get() }] }));

  const numberStyle = [{ fontSize: 46, lineHeight: 54 }, textShadow];
  return (
    <View style={styles.row}>
      <View ref={icon} style={styles.icon}>
        <Animated.View style={[styles.glow, glowStyle]} />
        <Animated.View style={iconStyle}>
          <Rings size={40} />
        </Animated.View>
      </View>
      <View>
        <Animated.View style={numberRoll}>
          <AppText weight="black" style={numberStyle}>{shown.now}</AppText>
        </Animated.View>
        {pillOn && shown === state && (
          <Animated.View style={[styles.pill, { backgroundColor: palette.accent }, pillStyle]} pointerEvents="none">
            <AppText weight="black" style={{ color: '#FFFFFF', fontSize: 13, lineHeight: 16 }}>+1</AppText>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFD866' },
  pill: { position: 'absolute', right: -30, top: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 2, borderColor: '#FFFFFF' },
});
