// The "New!" celebration over the item window's picture (spec 7.5, frame 20): a white
// flash, slow rays behind, leaves and acorns flying out, a golden ribbon "New!" that after
// 2.4 s shrinks into a small "NEW" mark in the corner. A tap skips to the end.
// Without animations: a gold ring for 1.2 s and the ribbon fading in to stay.
import { useEffect, useId, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Path, RadialGradient, Rect, Stop, LinearGradient } from 'react-native-svg';
import { useStore } from '@/state/store';
import { fonts, motion, scene, Txt } from '@/ui/ds';
import { Burst } from './Burst';

const fx = scene.live.fx;
const RIBBON_H = 40;
const RAYS = 12;
const RAY_DEG = 9;
/** When the ribbon turns into the corner mark. */
const TO_MARK = 2400;

export function NewParty({ run, skip, width, height, colors, motionOn }: {
  /** A new number starts the celebration; 0 — nothing yet. */
  run: number;
  /** A new number jumps to the end. */
  skip: number;
  width: number;
  height: number;
  /** The confetti: the kind's leaves or the meadow's weather. */
  colors: string[];
  motionOn: boolean;
}) {
  const { t } = useStore();
  const uid = `p${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const flash = useSharedValue(0);
  const rays = useSharedValue(0);
  const turn = useSharedValue(0);
  const ribbon = useSharedValue(0);
  const mark = useSharedValue(0);
  const ring = useSharedValue(0);
  const [burst, setBurst] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!run) return;
    if (!motionOn) {
      ring.set(withSequence(withTiming(1, { duration: 120 }), withDelay(960, withTiming(0, { duration: 120 }))));
      ribbon.set(withTiming(1, { duration: 200 }));
      return;
    }
    flash.set(withSequence(withTiming(0.6, { duration: 80 }), withTiming(0, { duration: 300, easing: motion.ease.out })));
    rays.set(withDelay(60, withSequence(withTiming(1, { duration: 300 }), withDelay(1640, withTiming(0, { duration: 400 })))));
    turn.set(0);
    turn.set(withDelay(60, withTiming(12 * 2.4, { duration: 2400, easing: Easing.linear })));
    ribbon.set(withDelay(150, withSpring(1, motion.spring.pop)));
    mark.set(withDelay(TO_MARK, withTiming(1, { duration: 300, easing: motion.ease.inOut })));
    timers.current.push(setTimeout(() => setBurst(run), 100));
    // A new run is a new celebration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  useEffect(() => {
    if (!skip || !run || !motionOn) return;
    timers.current.forEach(clearTimeout);
    flash.set(0);
    rays.set(withTiming(0, { duration: 200 }));
    ribbon.set(1);
    mark.set(1);
    setBurst(0);
    // Only a skip does this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));
  const raysStyle = useAnimatedStyle(() => ({ opacity: rays.get(), transform: [{ rotate: `${turn.get()}deg` }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.get() }));
  const ribbonStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, ribbon.get()) * (1 - mark.get()),
    transform: [{ translateY: -RIBBON_H * (1 - ribbon.get()) }, { scale: 1 - 0.5 * mark.get() }],
  }));
  const markStyle = useAnimatedStyle(() => ({ opacity: mark.get(), transform: [{ scale: 0.6 + 0.4 * mark.get() }] }));

  if (!run) return null;
  const cx = width / 2;
  const cy = height * 0.5;
  const reach = Math.hypot(width, height) * 0.6;
  const wedge = (i: number) => {
    const a0 = ((i * 360) / RAYS - RAY_DEG / 2) * (Math.PI / 180);
    const a1 = ((i * 360) / RAYS + RAY_DEG / 2) * (Math.PI / 180);
    return `M${reach} ${reach} L${reach + Math.cos(a0) * reach} ${reach + Math.sin(a0) * reach} L${reach + Math.cos(a1) * reach} ${reach + Math.sin(a1) * reach} Z`;
  };
  const ribbonW = Math.min(width - 40, 200);
  // The ribbon stays without animations (spec 7.5): the mark only comes after a real show.
  const keepRibbon = !motionOn;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {motionOn && (
        <Animated.View style={[styles.rays, { left: cx - reach, top: cy - reach, width: reach * 2, height: reach * 2 }, raysStyle]}>
          <Svg width={reach * 2} height={reach * 2}>
            <Defs>
              <RadialGradient id={`${uid}r`} gradientUnits="userSpaceOnUse" cx={reach} cy={reach} r={reach}>
                <Stop offset="0" stopColor={fx.rayOut} stopOpacity={0.55} />
                <Stop offset="1" stopColor={fx.rayOut} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            {Array.from({ length: RAYS }, (_, i) => <Path key={i} d={wedge(i)} fill={`url(#${uid}r)`} />)}
          </Svg>
        </Animated.View>
      )}
      {motionOn && <Animated.View style={[StyleSheet.absoluteFill, styles.flash, flashStyle]} />}
      {motionOn && (
        <Burst run={burst} x={cx} y={cy} colors={colors} count={10} acorns={4} spread={[90, 140]} out={400} fall={60} fallTime={800} leaf={11} />
      )}
      {!motionOn && <Animated.View style={[StyleSheet.absoluteFill, styles.ring, { borderColor: '#FFCF4D' }, ringStyle]} />}
      <Animated.View style={[styles.ribbon, { left: (width - ribbonW) / 2, width: ribbonW }, keepRibbon ? { opacity: 1 } : ribbonStyle]}>
        <Ribbon width={ribbonW} uid={uid} />
        <Txt numberOfLines={1} style={styles.ribbonText}>{t('shopNewRibbon')}</Txt>
      </Animated.View>
      {motionOn && (
        <Animated.View style={[styles.mark, markStyle]}>
          <Txt variant="micro" style={{ color: fx.ribbonText }}>{t('shopNewMark')}</Txt>
        </Animated.View>
      )}
    </View>
  );
}

/** The ribbon's gold band with swallowtail ends, like the stage ribbon (live/StageBanner.tsx), smaller. */
function Ribbon({ width: w, uid }: { width: number; uid: string }) {
  const end = 24;
  const H = RIBBON_H;
  return (
    <Svg width={w} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fx.ribbonTop} />
          <Stop offset="1" stopColor={fx.ribbonBottom} />
        </LinearGradient>
      </Defs>
      <Path d={`M0 8 H${end} V${H - 2} H0 L8 ${(H + 6) / 2} Z`} fill={fx.ribbonEnds} />
      <Path d={`M${w} 8 H${w - end} V${H - 2} H${w} L${w - 8} ${(H + 6) / 2} Z`} fill={fx.ribbonEnds} />
      <Rect x={end - 10} y={2} width={w - (end - 10) * 2} height={H - 8} rx={8} fill={`url(#${uid}g)`} stroke={fx.ribbonEdge} strokeWidth={1.5} />
      <Rect x={end - 4} y={6} width={w - (end - 4) * 2} height={4} rx={2} fill="#FFFFFF" opacity={0.35} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  rays: { position: 'absolute' },
  flash: { backgroundColor: '#FFFFFF' },
  ring: { borderWidth: 3, borderRadius: 24 },
  ribbon: { position: 'absolute', top: 14, height: RIBBON_H, alignItems: 'center', justifyContent: 'center', paddingBottom: 6 },
  ribbonText: { fontFamily: fonts.black, fontSize: 18, lineHeight: 24, color: fx.ribbonText },
  mark: { position: 'absolute', left: 8, top: 8, backgroundColor: '#FFCF4D', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
});
