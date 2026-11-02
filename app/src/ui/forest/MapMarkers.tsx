// Markers over the forest map (spec 1.3, layer 6): the drop over a thirsty tree (a blue
// dot when far out), and the "new" badge. They keep their size on screen at any zoom, so
// their layer only moves with the camera and each marker places itself by the zoom.
// Bubbles bob on the shared clock, so only the ones that can be seen are mounted: far out
// (dots) none of them reads the clock, close in only the trees near the screen have one.
// A marker waits for its tree's picture. Badges that would overlap give way (badges.ts) and
// hide while trees are moved: they would cover the "+" of free cells.
import { memo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Animated, { makeMutable, SharedValue, useAnimatedReaction, useAnimatedStyle } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { colorsFor, elevation, fonts, Glyph, MAX_FONT_SCALE, radius, type } from '@/ui/ds';
import { hashString } from '@/ui/trees/parts';
import { BADGE_H, BUBBLE } from './badges';
import type { MapItem, Motions, TreeMotion } from './model';

/** Below this zoom a drop becomes a blue dot: a wall of bubbles would hide the forest (1.5).
 * A 6×6 plot seen whole on a 375 phone (zoom ~0.8) keeps its bubbles; 8×8 and bigger get dots. */
export const DOT_ZOOM = 0.75;
/** With 200+ trees, below this zoom only the trees are shown (spec 8). */
const CROWD_ZOOM = 0.45;
const DOT = 8;
/** The bubble's bottom sits this far above the crown, px. */
const BUBBLE_GAP = 4;
/** Room between the "new" badge and a drop beside it, px. */
const BADGE_GAP = 4;
/** The badge's top is this far over the crown: it stands right on it, as a drop does, px. */
const BADGE_TOP = BUBBLE_GAP + BADGE_H;
/** One bob of a drop, s. */
const BOB = 2.2;
/** By night the bubble is nearly white: blue on lilac would be lost. */
const NIGHT_BUBBLE = 'rgba(255,255,255,0.92)';

interface Props {
  items: MapItem[];
  /** Trees that may wear the "new" badge. */
  badges: MapItem[];
  /** Per badge: the zoom below which it gives way to a nearer badge or a drop (badges.ts). */
  hideBelow: Map<string, number>;
  /** Trees are being moved: no badges. */
  badgesOff: boolean;
  motions: Motions;
  night: boolean;
  animations: boolean;
  crowded: boolean;
  width: number;
  anchorY: number;
  cx: SharedValue<number>;
  cy: SharedValue<number>;
  z: SharedValue<number>;
  clock: SharedValue<number>;
  newLabel: string;
}

export function MapMarkers(p: Props) {
  const { width, anchorY, cx, cy, z } = p;
  const layer = useAnimatedStyle(() => ({
    transform: [{ translateX: width / 2 - cx.value * z.value }, { translateY: anchorY - cy.value * z.value }],
  }));
  // Bubbles or dots: React hears about it only when the zoom crosses the line.
  const [bubbles, setBubbles] = useState(() => z.value >= DOT_ZOOM);
  useAnimatedReaction(
    () => z.value >= DOT_ZOOM,
    (now, before) => {
      // The first run too: the camera may have moved between the first render and now.
      if (now !== before) scheduleOnRN(setBubbles, now);
    },
  );
  // Badge widths, measured: a drop beside a badge moves out of its way.
  const widths = useRef(new Map<string, SharedValue<number>>());
  const widthOf = (id: string) => {
    let w = widths.current.get(id);
    if (!w) {
      w = makeMutable(0);
      widths.current.set(id, w);
    }
    return w;
  };
  const night = p.night;
  return (
    <Animated.View style={[styles.layer, layer]} pointerEvents="none">
      {p.items.map((item) => {
        if (!item.thirsty) return null;
        const m = p.motions.get(item.id, item);
        return bubbles ? (
          <Bubble
            key={item.id}
            item={item}
            m={m}
            z={z}
            clock={p.clock}
            night={night}
            animations={p.animations}
            badgeW={widthOf(item.id)}
            badgeBelow={p.badgesOff ? Infinity : (p.hideBelow.get(item.id) ?? Infinity)}
          />
        ) : (
          <Dot key={item.id} item={item} m={m} z={z} crowded={p.crowded} />
        );
      })}
      {!p.badgesOff &&
        p.badges.map((item) => (
          <Badge
            key={item.id}
            item={item}
            m={p.motions.get(item.id, item)}
            z={z}
            label={p.newLabel}
            width={widthOf(item.id)}
            below={p.hideBelow.get(item.id) ?? 0}
          />
        ))}
    </Animated.View>
  );
}

/** Hidden while the tree is lifted, flying or pale, and until its picture is there. */
const quiet = (m: TreeMotion) => {
  'worklet';
  return m.lift.value > 1 || m.alpha.value < 0.9 || m.ready.value < 0.5;
};

const Bubble = memo(function Bubble({ item, m, z, clock, night, animations, badgeW, badgeBelow }: {
  item: MapItem; m: TreeMotion; z: SharedValue<number>; clock: SharedValue<number>; night: boolean; animations: boolean;
  /** The tree's own badge: its width, and the zoom below which it is not shown (Infinity: none). */
  badgeW: SharedValue<number>; badgeBelow: number;
}) {
  const c = colorsFor(night);
  // Each drop bobs in its own phase.
  const phase = (hashString(item.id) % 628) / 100;
  const { w, h } = item;
  const style = useAnimatedStyle(() => {
    const k = z.value;
    const hidden = quiet(m) || k < DOT_ZOOM;
    // A hidden bubble does not bob: nothing to move.
    const bob = animations && !hidden ? 2 * Math.sin((2 * Math.PI * clock.value) / BOB + phase) : 0;
    // On the top of the real crown, at its right shoulder.
    const top = (m.py.value - m.lift.value - h * Math.max(m.sy.value, 0.45)) * k;
    let x = m.px.value * k + Math.max(0.22 * w * k, 6) - 6;
    let y = top - BUBBLE_GAP - BUBBLE;
    if (m.badge.value > 0.01 && k >= badgeBelow) {
      // The "new" badge is over the crown's middle: the drop stands beside it, level with it.
      x = Math.max(x, m.px.value * k + badgeW.value / 2 + BADGE_GAP);
      y = top - BADGE_TOP + BADGE_H / 2 - BUBBLE / 2;
    }
    return { opacity: hidden ? 0 : 1, transform: [{ translateX: x }, { translateY: y + bob }] };
  });
  return (
    <Animated.View style={[styles.bubble, { backgroundColor: night ? NIGHT_BUBBLE : c.card }, elevation(2, false), style]}>
      <Glyph name="drop" size={15} />
    </Animated.View>
  );
});

const Dot = memo(function Dot({ item, m, z, crowded }: { item: MapItem; m: TreeMotion; z: SharedValue<number>; crowded: boolean }) {
  const c = colorsFor(false);
  const { w, h } = item;
  const style = useAnimatedStyle(() => {
    const k = z.value;
    const hidden = quiet(m) || k >= DOT_ZOOM || (crowded && k < CROWD_ZOOM);
    return {
      opacity: hidden ? 0 : 1,
      transform: [{ translateX: (m.px.value + 0.2 * w) * k - DOT / 2 }, { translateY: (m.py.value - h) * k - DOT - 2 }],
    };
  });
  return <Animated.View style={[styles.dot, { backgroundColor: c.water }, style]} />;
});

function Badge({ item, m, z, label, width, below }: {
  item: MapItem; m: TreeMotion; z: SharedValue<number>; label: string; width: SharedValue<number>;
  /** Below this zoom it gives way to a nearer badge or a drop. */
  below: number;
}) {
  const c = colorsFor(false);
  const { h } = item;
  const style = useAnimatedStyle(() => {
    const k = z.value;
    const b = m.badge.value;
    // Over the crown: it rises with a sprouting tree.
    const top = (m.py.value - m.lift.value - h * Math.max(m.sy.value, 0.45)) * k - BADGE_TOP;
    const on = b > 0.01 && k >= below && m.ready.value > 0.5;
    return {
      opacity: on ? Math.min(1, b * 2) : 0,
      transform: [{ translateX: m.px.value * k }, { translateY: top }, { scale: 0.4 + 0.6 * b }],
    };
  });
  const onLayout = (e: LayoutChangeEvent) => {
    width.value = e.nativeEvent.layout.width;
  };
  return (
    <Animated.View style={[styles.badgeAnchor, style]}>
      <View onLayout={onLayout} style={[styles.badge, { backgroundColor: c.gold, borderBottomColor: c.goldLip }]}>
        <Animated.Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.micro, styles.badgeText, { color: c.goldInk }]}>
          {label}
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0, width: 0, height: 0 },
  bubble: {
    position: 'absolute', left: 0, top: 0, width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2,
    alignItems: 'center', justifyContent: 'center',
  },
  dot: { position: 'absolute', left: 0, top: 0, width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, borderColor: '#FFFFFF' },
  // A zero-wide anchor at the tree's axis; the badge centres itself on it.
  badgeAnchor: { position: 'absolute', left: 0, top: 0, width: 0, alignItems: 'center', transformOrigin: 'center bottom' },
  badge: { borderRadius: radius.xs, paddingHorizontal: 7, paddingVertical: 2, borderBottomWidth: 2 },
  badgeText: { fontFamily: fonts.black },
});
