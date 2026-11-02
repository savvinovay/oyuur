// The card's "⋯" menu (spec 3.3): a small card over the button, its right edge in line
// with the button's, a tail pointing down at it. A tap anywhere else closes it.
// First comes "Rename" / "Give a name" (wave 4, 5.2, frame 16), then for a growing tree
// "Kind of tree" (wave 5, 8.1) and "Watering time" (OYUUR-34, спец 4.2).
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useStore } from '@/state/store';
import { elevation, fonts, Icon, IconName, motion, Txt, useColors, useMotionOn } from '@/ui/ds';
import type { Anchor } from './TreeCard';

const WIDTH = 224;
const ROW = 48;
const TAIL = 12;
/** Between the button's top and the menu's bottom (the tail fills it). */
const GAP = 10;

export function TreeMenu({ anchor, screenW, screenH, named, onRename, onKind, onHour, onHistory, onDelete, onClose }: {
  /** The "⋯" button, in the screen's coordinates. */
  anchor: Anchor;
  screenW: number;
  screenH: number;
  /** The tree has its own name: "Rename"; without one: "Give a name". */
  named: boolean;
  onRename(): void;
  /** "Kind of tree": only for a growing tree (none — the row is not shown). */
  onKind?: () => void;
  /** "Watering time": only for a growing tree. */
  onHour?: () => void;
  onHistory(): void;
  onDelete(): void;
  onClose(): void;
}) {
  const { t, night } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const shown = useSharedValue(0);
  const scale = useSharedValue(motionOn ? 0.92 : 1);
  useEffect(() => {
    shown.set(withTiming(1, { duration: motion.fast }));
    if (motionOn) scale.set(withSpring(1, motion.spring.pop));
  }, [shown, scale, motionOn]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scale: scale.get() }] }));

  const right = Math.max(8, screenW - (anchor.x + anchor.width));
  const bottom = screenH - anchor.y + GAP;
  // The tail stands over the button's middle.
  const tailRight = Math.max(8, screenW - right - (anchor.x + anchor.width / 2) - TAIL / 2);

  const item = (icon: IconName, label: string, color: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.divider }]}
    >
      <Icon name={icon} size={20} color={color} />
      <Txt numberOfLines={1} style={[styles.label, { color }]}>{label}</Txt>
    </Pressable>
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('close')} accessibilityRole="button" />
      <Animated.View
        accessibilityRole="menu"
        style={[styles.menu, elevation(3, night), { right, bottom, backgroundColor: c.card, transformOrigin: 'bottom right' }, style]}
      >
        <View style={[styles.tail, { right: tailRight, backgroundColor: c.card }]} />
        <View style={styles.clip}>
          {item('pencil', t(named ? 'rename' : 'nameGive'), c.text, onRename)}
          <View style={[styles.divider, { backgroundColor: c.divider }]} />
          {onKind && item('sparkles', t('shopTreeKind'), c.text, onKind)}
          {onKind && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
          {onHour && item('clock', t('wtMenu'), c.text, onHour)}
          {onHour && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
          {item('eye', t('treeHistory'), c.text, onHistory)}
          <View style={[styles.divider, { backgroundColor: c.divider }]} />
          {item('trash', t('deleteTree'), c.dangerText, onDelete)}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  menu: { position: 'absolute', width: WIDTH, borderRadius: 16 },
  clip: { borderRadius: 16, overflow: 'hidden' },
  tail: { position: 'absolute', bottom: -TAIL / 2 + 1, width: TAIL, height: TAIL, transform: [{ rotate: '45deg' }], borderRadius: 2 },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  label: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, flexShrink: 1 },
  divider: { height: StyleSheet.hairlineWidth * 2, marginHorizontal: 16 },
});
