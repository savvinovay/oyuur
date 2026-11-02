// "Water me": a little bubble with a drop beside the thirsty crown. Bobs on the wind's
// clock, follows the tree when the camera moves, pops when the tree is watered.
// Tapping it waters the tree too. At night a soft moonlit halo breathes behind it.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import Animated, { Easing, SharedValue, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { SceneGeo, slotAt } from '../scene/contract';
import { BUBBLE, TAIL_REACH } from './bubble';
import { fx, MOON } from './colors';

// Where the bubble goes over the crown: bubbleSpot in bubble.ts.
export { BUBBLE, bubbleSpot, TAIL_REACH } from './bubble';

export function ThirstBubble({ spot, geo, depth, time, nightness, background, animations, popping, label, onTap }: {
  /** Middle of the bubble, px from the tree's feet. */
  spot: { x: number; y: number };
  geo: SceneGeo;
  depth: SharedValue<number>;
  /** The wind's clock, seconds: the bubble bobs with it. */
  time: SharedValue<number>;
  /** 0 by day, 1 by night: how much of the halo shows. */
  nightness?: SharedValue<number>;
  background: string;
  animations: boolean;
  popping: boolean;
  label: string;
  onTap: () => void;
}) {
  const scale = useSharedValue(animations ? 0 : 1);
  const day = useSharedValue(0);
  const night = nightness ?? day;
  const alpha = useSharedValue(animations ? 0 : 1);

  useEffect(() => {
    if (popping) {
      const out = { duration: 160, easing: Easing.out(Easing.cubic) };
      scale.set(withTiming(animations ? 1.25 : 1, out));
      alpha.set(withTiming(0, out));
    } else if (animations) {
      scale.set(withDelay(600, withSpring(1, { damping: 12, stiffness: 220 })));
      alpha.set(withDelay(600, withTiming(1, { duration: 120 })));
    }
  }, [popping, animations, scale, alpha]);

  const style = useAnimatedStyle(() => {
    const d = depth.get();
    const s = slotAt(d, geo);
    const bob = 4 * Math.sin((2 * Math.PI * time.get()) / 2.2);
    return {
      opacity: alpha.get() * Math.max(0, 1 - Math.abs(d) * 2.5),
      transform: [
        { translateX: s.x + spot.x * s.scale - BUBBLE / 2 },
        { translateY: s.feetY + spot.y * s.scale - BUBBLE / 2 + bob },
        { scale: scale.get() * s.scale },
      ],
    };
  });

  // The halo breathes 0.4 ↔ 0.6 with the bob (the same 2.2 s swing); still without animations.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: night.get() * (animations ? 0.5 + 0.1 * Math.sin((2 * Math.PI * time.get()) / 2.2) : 0.5),
  }));

  const tap = useTapGesture({ maxDistance: 10, runOnJS: true, onActivate: () => onTap() });

  return (
    <GestureDetector gesture={tap}>
      <Animated.View
        style={[styles.bubble, style]}
        pointerEvents={popping ? 'none' : 'auto'}
        accessibilityRole="button"
        accessibilityLabel={label}
        // Popped (invisible) bubbles are not read out.
        aria-hidden={popping}
      >
        <Animated.View style={[styles.halo, haloStyle]} pointerEvents="none">
          <Svg width={HALO * 2} height={HALO * 2}>
            <Defs>
              <RadialGradient id="thirst-halo" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={MOON} stopOpacity={1} />
                <Stop offset="1" stopColor={MOON} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={HALO} cy={HALO} r={HALO} fill="url(#thirst-halo)" />
          </Svg>
        </Animated.View>
        {/* The tail curls down-left, onto the crown. */}
        <Svg width={TAIL_BOX} height={TAIL_BOX} style={styles.tail}>
          <Path d={TAIL} fill={background} />
        </Svg>
        <View style={[styles.round, { backgroundColor: background }]}>
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path d="M12 2.5 C 9 7, 5 10.6, 5 14.6 A 7 7 0 0 0 19 14.6 C 19 10.6, 15 7, 12 2.5 Z" fill={fx.bubbleDrop} />
            <Path d="M9.2 14.2 A 3 3 0 0 0 11.6 17.6" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" fill="none" opacity={0.85} />
          </Svg>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/** Radius of the night halo, px. */
const HALO = 30;

// The tail in its own box, which starts TAIL_BOX px left of and under the bubble's middle.
const TAIL_BOX = 30;
const tail = () => {
  const c = TAIL_BOX; // the bubble's middle, in the box
  const at = (deg: number, r: number) => `${(c + Math.cos((deg * Math.PI) / 180) * r).toFixed(1)} ${(-c + Math.sin((deg * Math.PI) / 180) * r + TAIL_BOX).toFixed(1)}`;
  // Base inside the round edge (so it merges), tip TAIL_REACH out at 135° (down-left).
  const tip = at(135, TAIL_REACH * Math.SQRT2);
  return `M${at(112, BUBBLE / 2 - 2)} Q ${at(128, BUBBLE / 2 + 6)}, ${tip} Q ${at(146, BUBBLE / 2 + 4)}, ${at(158, BUBBLE / 2 - 2)} Z`;
};
const TAIL = tail();

const styles = StyleSheet.create({
  bubble: { position: 'absolute', left: 0, top: 0, width: BUBBLE, height: BUBBLE },
  round: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.97,
    shadowColor: 'rgb(30,70,100)',
    shadowOpacity: 0.22,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  tail: { position: 'absolute', left: BUBBLE / 2 - TAIL_BOX, top: BUBBLE / 2 },
  halo: { position: 'absolute', left: BUBBLE / 2 - HALO, top: BUBBLE / 2 - HALO, width: HALO * 2, height: HALO * 2 },
});
