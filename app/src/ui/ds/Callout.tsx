// A short hint above (or under) a target, like "Friends — coming soon" (spec 2.2):
// a white card with a tail pointing at the target. It pops out of the tail, lives
// 3.2 s or until tapped, and leaves faster than it came.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useStore } from '@/state/store';
import { Glyph, GlyphName } from './Glyph';
import { Txt } from './Text';
import { elevation, fonts, motion } from './tokens';
import { useColors, useMotionOn } from './useTheme';

const LIFE = 3200;
const LEAVE = 140;
const EDGE = 16;
const TAIL = 18;
/** How far the tail's tip sticks out of the card: half of the rotated square's diagonal. */
const TIP = Math.round((TAIL * Math.SQRT2) / 2);
/** Room between the tail's tip and the target. */
const GAP = 8;

export function Callout({ visible, anchor, glyph, title, text, onHide, maxWidth = 300 }: {
  visible: boolean;
  /** The target's rectangle in the Callout parent's coordinates. */
  anchor: { x: number; y: number; width: number; height: number };
  glyph?: GlyphName; title: string; text: string; onHide: () => void; maxWidth?: number;
}) {
  const c = useColors();
  const { night } = useStore();
  const motionOn = useMotionOn();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [cardH, setCardH] = useState(0);
  // Stays mounted while it fades out after `visible` turns false.
  const [mounted, setMounted] = useState(visible);
  const shown = useSharedValue(0);
  const pop = useSharedValue(0);
  const onHideRef = useRef(onHide);
  onHideRef.current = onHide;

  // Every new show (another target or text) restarts the clock.
  const showKey = `${title}|${anchor.x}|${anchor.y}`;
  useEffect(() => {
    if (!visible) {
      shown.set(withTiming(0, { duration: LEAVE, easing: motion.ease.in }));
      const id = setTimeout(() => setMounted(false), LEAVE);
      return () => clearTimeout(id);
    }
    setMounted(true);
    shown.set(0);
    pop.set(0);
    shown.set(withTiming(1, { duration: motion.fast, easing: motion.ease.out }));
    pop.set(motionOn ? withSpring(1, motion.spring.pop) : withTiming(1, { duration: motion.still }));
    const id = setTimeout(() => onHideRef.current(), LIFE);
    return () => clearTimeout(id);
  }, [visible, showKey, motionOn, shown, pop]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ scale: 0.92 + 0.08 * pop.get() }],
  }));

  if (!mounted) return null;

  const width = box.w > 0 ? Math.min(maxWidth, box.w - EDGE * 2) : maxWidth;
  const centerX = anchor.x + anchor.width / 2;
  const left = box.w > 0 ? Math.min(Math.max(centerX - width / 2, EDGE), box.w - EDGE - width) : centerX - width / 2;
  const aboveTop = anchor.y - TIP - GAP - cardH;
  // Not enough room above the target (closer than 8 px to the top) — stand under it.
  const above = aboveTop >= 8;
  const top = above ? aboveTop : anchor.y + anchor.height + TIP + GAP;
  const tailX = Math.min(Math.max(centerX - left, 24), width - 24);

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none" onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <Animated.View
        style={[
          styles.wrap,
          // Until its height is known the card waits off screen, so it never shows in the wrong place.
          { left, top: cardH ? top : -10000, width, transformOrigin:`${tailX}px ${above ? '100%' : '0%'}` },
          style,
        ]}
        onLayout={(e) => setCardH(e.nativeEvent.layout.height)}
      >
        <Pressable onPress={() => onHideRef.current()} accessibilityRole="button" accessibilityLabel={`${title}. ${text}`} accessibilityLiveRegion="polite">
          <View style={[styles.card, elevation(3, night), { backgroundColor: c.card }]}>
            <View
              style={[
                styles.tail,
                { backgroundColor: c.card, left: tailX - TAIL / 2 },
                above ? { bottom: -TAIL / 2 } : { top: -TAIL / 2 },
              ]}
            />
            <View style={styles.row}>
              {glyph && <Glyph name={glyph} size={36} />}
              <View style={styles.texts}>
                <Txt style={{ fontFamily: fonts.black, fontSize: 15, lineHeight: 20 }}>{title}</Txt>
                <Txt style={{ fontSize: 13.5, lineHeight: 18, color: c.textSoft }}>{text}</Txt>
              </View>
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 20 },
  wrap: { position: 'absolute' },
  card: { borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16 },
  tail: { position: 'absolute', width: TAIL, height: TAIL, borderRadius: 3, transform: [{ rotate: '45deg' }] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  texts: { flex: 1, gap: 2 },
});
