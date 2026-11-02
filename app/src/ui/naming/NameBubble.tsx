// "What's my name?": a pill beside the crown of a watered tree that has no name yet
// (wave 4 spec, section 2). Not a window: it can be left alone. It sits where the
// "water me" bubble would (bubbleSpot), bobs on the wind's clock, its tag winks every
// 6 s, it rides with the tree when the camera moves. A tap pops it and opens the name sheet.
// At night a soft moonlit halo breathes behind it.
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, SharedValue, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { fonts, Glyph, motion } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { BUBBLE, TAIL_REACH } from '../live/bubble';
import { MOON } from '../live/colors';
import { SceneGeo, slotAt } from '../scene/contract';

/** Pill height; its left end is the would-be round bubble's left half. */
const H = BUBBLE;
/** Room kept to the screen's edges (a big crown pushes the pill aside), and under the header, px. */
const EDGE = 16;
const UNDER_HEADER = 10;
/** The tail's base stays this far inside the pill's ends. */
const TAIL_END = 14;
/** Width before it is measured (spec 2.1: ~160 RU, ~150 EN). */
const GUESS_W = 160;
/** The night halo: wider than the pill by this, and this tall. */
const HALO_WIDER = 60;
const HALO_H = 106;

export function NameBubble({ spot, geo, depth, time, nightness, background, ink, animations, fresh, hidden = false, label, a11yLabel, onTap, onShown }: {
  /** Middle of the would-be round bubble (point A), px from the tree's feet. */
  spot: { x: number; y: number };
  geo: SceneGeo;
  depth: SharedValue<number>;
  /** The wind's clock, seconds: the pill bobs with it and the tag winks on it. */
  time: SharedValue<number>;
  /** 0 by day, 1 by night: how much of the halo shows. */
  nightness: SharedValue<number>;
  background: string;
  ink: string;
  animations: boolean;
  /** Asked just now (after a watering): pops in 400 ms with its sound; else 600 ms, quietly. */
  fresh: boolean;
  /** Steps aside (α 0 in 120 ms) while something else is said over the crown ("Already watered"). */
  hidden?: boolean;
  label: string;
  a11yLabel: string;
  onTap: () => void;
  /** A fresh bubble came out with its sound: from now on it is not fresh. */
  onShown?: () => void;
}) {
  const [w, setW] = useState<number | null>(null);
  const [popped, setPopped] = useState(false);
  const scale = useSharedValue(animations ? 0 : 1);
  const alpha = useSharedValue(animations ? 0 : 1);
  const hush = useSharedValue(hidden ? 0 : 1);
  useEffect(() => {
    hush.set(withTiming(hidden ? 0 : 1, { duration: 120 }));
  }, [hidden, hush]);

  // Comes out once its width is known, so it never jumps sideways.
  const measured = w !== null;
  useEffect(() => {
    if (!measured) return;
    const delay = fresh ? 400 : 600;
    if (animations) {
      scale.set(withDelay(delay, withSpring(1, motion.spring.pop)));
      alpha.set(withDelay(delay, withTiming(1, { duration: 120 })));
    }
    if (!fresh) return;
    const id = setTimeout(() => {
      cue('nameAsk');
      onShown?.();
    }, animations ? delay : 0);
    return () => clearTimeout(id);
    // Once, when it can be placed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured]);

  const width = w ?? GUESS_W;
  // Placed for the tree in front (depth 0); off the middle it only rides and fades.
  const ax = geo.width / 2 + spot.x;
  const ay = geo.feetY + spot.y;
  const left = Math.max(EDGE, Math.min(ax - H / 2, geo.width - EDGE - width));
  const top = Math.max(ay - H / 2, geo.headerBottom + UNDER_HEADER);
  // The tail's tip ends where the round bubble's would: TAIL_REACH left of and under A.
  const base = Math.min(Math.max(ax - left, TAIL_END), width - TAIL_END);
  const tipX = base - TAIL_REACH;
  const tipY = ay - top + TAIL_REACH;

  const style = useAnimatedStyle(() => {
    const d = depth.get();
    const s = slotAt(d, geo);
    const bob = animations ? 4 * Math.sin((2 * Math.PI * time.get()) / 2.2) : 0;
    // Where A is now against where it is in front.
    const dx = s.x + spot.x * s.scale - ax;
    const dy = s.feetY + spot.y * s.scale - ay;
    return {
      opacity: alpha.get() * hush.get() * Math.max(0, 1 - Math.abs(d) * 2.5) * (measured ? 1 : 0),
      transform: [{ translateX: left + dx }, { translateY: top + dy + bob }, { scale: scale.get() * s.scale }],
    };
  });

  // Every 6 s the tag winks: 0 → −10° → 8° → −4° → 0 over 500 ms.
  const tagStyle = useAnimatedStyle(() => {
    if (!animations) return { transform: [{ rotate: '0deg' }] };
    const p = (time.get() % 6) / 0.5;
    let deg = 0;
    if (p < 1) {
      const keys = [0, -10, 8, -4, 0];
      const x = p * 4;
      const i = Math.min(Math.floor(x), 3);
      const f = x - i;
      const e = f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2;
      deg = keys[i] + (keys[i + 1] - keys[i]) * e;
    }
    return { transform: [{ rotate: `${deg}deg` }] };
  });

  // The halo breathes 0.4 ↔ 0.6 with the bob; still without animations.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: nightness.get() * (animations ? 0.5 + 0.1 * Math.sin((2 * Math.PI * time.get()) / 2.2) : 0.5),
  }));

  const press = () => {
    if (popped) return;
    setPopped(true);
    cue('select');
    const out = { duration: 160, easing: Easing.out(Easing.cubic) };
    if (animations) scale.set(withTiming(1.15, out));
    alpha.set(withTiming(0, animations ? out : { duration: 0 }));
    onTap();
  };
  const tap = useTapGesture({ maxDistance: 10, runOnJS: true, onActivate: press });

  const onLayout = (e: LayoutChangeEvent) => {
    const next = Math.ceil(e.nativeEvent.layout.width);
    setW((prev) => (prev === next ? prev : next));
  };

  const haloW = width + HALO_WIDER;
  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        onLayout={onLayout}
        style={[styles.pill, { transformOrigin: `${tipX}px ${tipY}px` }, style]}
        pointerEvents={popped || hidden ? 'none' : 'auto'}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        aria-hidden={popped}
      >
        <Animated.View style={[styles.halo, { width: haloW, left: -HALO_WIDER / 2 }, haloStyle]} pointerEvents="none">
          <Svg width={haloW} height={HALO_H}>
            <Defs>
              <RadialGradient id="name-halo" cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0" stopColor={MOON} stopOpacity={1} />
                <Stop offset="1" stopColor={MOON} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={haloW / 2} cy={HALO_H / 2} rx={haloW / 2} ry={HALO_H / 2} fill="url(#name-halo)" />
          </Svg>
        </Animated.View>
        {/* The tail curls down-left from under the pill, onto the crown. */}
        <Svg width={TAIL_W} height={TAIL_H} style={[styles.tail, { left: tipX - TIP_X, top: tipY - TIP_Y }]}>
          <Path d={TAIL} fill={background} />
        </Svg>
        <View style={[styles.body, { backgroundColor: background }]}>
          <Animated.View style={tagStyle}>
            <Glyph name="nameTag" size={20} />
          </Animated.View>
          <Animated.Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.text, { color: ink }]}>
            {label}
          </Animated.Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

// The tail, as in the mockup: a 40×34 box, its tip at (6, 30), its base along the pill's bottom.
const TAIL_W = 40;
const TAIL_H = 34;
const TIP_X = 6;
const TIP_Y = 30;
const TAIL = 'M30 2 Q26 20 6 30 Q18 16 18 2 Z';

const styles = StyleSheet.create({
  pill: { position: 'absolute', left: 0, top: 0, height: H },
  body: {
    height: H,
    borderRadius: H / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 14,
    shadowColor: 'rgb(30,70,100)',
    shadowOpacity: 0.22,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  text: { fontFamily: fonts.black, fontSize: 14, lineHeight: 18 },
  tail: { position: 'absolute' },
  halo: { position: 'absolute', top: H / 2 - HALO_H / 2, height: HALO_H },
});
