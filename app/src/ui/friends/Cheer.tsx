// "Cheer on" on a friend's profile (спец-друзья 6.4, frames 17–18). Times from the release:
//   0        cue('cheer'); the cheer goes to the queue (it waits for network if there is none)
//   0…560    six palms leave the button (±70) on arcs to the avatar, 30 ms apart:
//            a quadratic curve with the control point 40…90 to the side and 60 higher, inOut(cubic),
//            scale 1 → 0.55, turn ±10…22° → 0, fading over the last 15 % of the way
//   200      the button becomes "Cheer sent" (old content out 120 ms, new in 160 ms after 80)
//   620      the avatar jumps (screen: 1 → 1.12 in 90 ms, `bounce` spring back)
//   620…1340 a warm glow behind the avatar: in 120, holds 200, out 400
//   620…1120 four sparks fly 28…44 px out and fade
// Without animations: no palms, no jump; the button and the glow change in 120 ms.
// Everything is transform / opacity on the UI thread; palms are 6 views with one SVG each.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, SharedValue, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useStore } from '@/state/store';
import { Button, fonts, Glyph, Icon, motion, Txt, useColors, useMotionOn } from '@/ui/ds';

export interface Point {
  x: number;
  y: number;
}

/** When the palms land, from the release (the avatar jumps, the glow and sparks start). */
export const LAND = 620;
const FLY = 560;
const GLOW = 140;
const WARM = '#FFB46B';

// Each palm: start offset along the button, control point to the side, turn, size.
const PALMS = [
  { dx: -70, side: -90, turn: -18, size: 22 },
  { dx: -42, side: -60, turn: -10, size: 24 },
  { dx: -14, side: -40, turn: 12, size: 26 },
  { dx: 14, side: 40, turn: 22, size: 22 },
  { dx: 42, side: 70, turn: -14, size: 24 },
  { dx: 70, side: 90, turn: 16, size: 20 },
];
const SPARKS = [
  { angle: -150, dist: 36, size: 16 },
  { angle: -30, dist: 44, size: 14 },
  { angle: 150, dist: 28, size: 11 },
  { angle: 30, dist: 32, size: 12 },
];

/** The warm glow, drawn behind the avatar; `run` > 0 plays it once per change. */
export function CheerGlow({ at, run }: { at: Point; run: number }) {
  const motionOn = useMotionOn();
  const o = useSharedValue(0);
  useEffect(() => {
    if (!run) return;
    o.set(0);
    o.set(
      motionOn
        ? withSequence(withDelay(LAND, withTiming(1, { duration: 120 })), withDelay(200, withTiming(0, { duration: 400, easing: motion.ease.out })))
        : withSequence(withTiming(1, { duration: motion.still }), withTiming(0, { duration: motion.still })),
    );
  }, [run, o, motionOn]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: at.x - GLOW / 2, top: at.y - GLOW / 2, width: GLOW, height: GLOW }, style]}>
      <Svg width={GLOW} height={GLOW}>
        <Defs>
          <RadialGradient id="cheerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={WARM} stopOpacity={0.55} />
            <Stop offset="1" stopColor={WARM} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={GLOW / 2} cy={GLOW / 2} r={GLOW / 2} fill="url(#cheerGlow)" />
      </Svg>
    </Animated.View>
  );
}

/** The palms and the sparks, over the content. */
export function CheerFlight({ from, to, avatar, run }: { from: Point; to: Point; avatar: number; run: number }) {
  const motionOn = useMotionOn();
  if (!run || !motionOn) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {PALMS.map((p, i) => <Palm key={`${run}-${i}`} i={i} from={from} to={to} />)}
      {SPARKS.map((s, i) => <Spark key={`${run}-s${i}`} i={i} at={to} radius={avatar / 2} />)}
    </View>
  );
}

function Palm({ i, from, to }: { i: number; from: Point; to: Point }) {
  const p = PALMS[i];
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(i * 30, withTiming(1, { duration: FLY, easing: Easing.inOut(Easing.cubic) })));
  }, [t, i]);
  const sx = from.x + p.dx;
  const sy = from.y;
  const cx = (sx + to.x) / 2 + p.side;
  const cy = Math.min(sy, to.y) + (sy - to.y) / 2 - 60;
  const style = useAnimatedStyle(() => {
    const k = t.get();
    const a = (1 - k) * (1 - k);
    const b = 2 * (1 - k) * k;
    const c = k * k;
    return {
      opacity: k < 0.85 ? 1 : (1 - k) / 0.15,
      transform: [
        { translateX: a * sx + b * cx + c * to.x - p.size / 2 },
        { translateY: a * sy + b * cy + c * to.y - p.size / 2 },
        { scale: 1 - 0.45 * k },
        { rotate: `${p.turn * (1 - k)}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.abs, { left: 0, top: 0 }, style]}>
      <Glyph name="cheer" size={p.size} />
    </Animated.View>
  );
}

function Spark({ i, at, radius }: { i: number; at: Point; radius: number }) {
  const s = SPARKS[i];
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(LAND, withTiming(1, { duration: 500, easing: motion.ease.out })));
  }, [t]);
  const rad = (s.angle * Math.PI) / 180;
  const style = useAnimatedStyle(() => {
    const k = t.get();
    const d = radius + s.dist * k;
    return {
      opacity: k === 0 ? 0 : 1 - k,
      transform: [{ translateX: at.x + Math.cos(rad) * d - s.size / 2 }, { translateY: at.y + Math.sin(rad) * d - s.size / 2 }],
    };
  });
  return (
    <Animated.View style={[styles.abs, { left: 0, top: 0 }, style]}>
      <Glyph name="sparkle" size={s.size} />
    </Animated.View>
  );
}

/** The avatar's jump when the palms land. */
export function jumpAvatar(scale: SharedValue<number>, motionOn: boolean) {
  if (!motionOn) return;
  scale.set(withDelay(LAND, withSequence(withTiming(1.12, { duration: 90, easing: motion.ease.out }), withSpring(1, motion.spring.bounce))));
}

/** The button and the line under it. `sent` — cheered today; `queued` — still waiting for network. */
export function CheerControl({ name, nameNom, sent, queued, offline, onCheer }: {
  /** The name for "Cheer … on" (a case in Russian: the @nick). */
  name: string;
  /** The name for "… will see you're there". */
  nameNom: string;
  sent: boolean;
  queued: boolean;
  offline: boolean;
  onCheer: () => void;
}) {
  const { t } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const enter = motionOn ? FadeIn.duration(160).delay(80) : FadeIn.duration(motion.still);
  const leave = motionOn ? FadeOut.duration(120) : FadeOut.duration(motion.still);
  // Without network the cheer waits in the queue: the line says it will go once online.
  const waits = (sent && queued) || (!sent && offline);
  const hint = waits ? t('frCheerQueued') : !sent ? t('frCheerHint', { name: nameNom }) : t('frCheerAgain');
  return (
    <View>
      <View style={styles.button}>
        {sent ? (
          <Animated.View key="sent" entering={enter} exiting={leave} style={styles.fill}>
            <Button title={t('frCheerSent')} variant="done" glyph="check" cue={null} onPress={() => {}} />
          </Animated.View>
        ) : (
          <Animated.View key="cheer" entering={enter} exiting={leave} style={styles.fill}>
            <Button title={t('frCheerButton', { name })} variant="warm" glyph="cheer" cue={null} onPress={onCheer} />
          </Animated.View>
        )}
      </View>
      <View style={styles.hint} accessibilityLiveRegion="polite">
        {waits && <Icon name="wifiOff" size={14} color={c.textSoft} />}
        <Txt numberOfLines={2} style={[styles.hintText, { color: c.textSoft }]}>{hint}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  button: { height: 60 },
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  hint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, minHeight: 20 },
  hintText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, textAlign: 'center', flexShrink: 1 },
});
