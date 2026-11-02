// Small pieces of the shared-tree screens: the tree on a square of sky (a picture, not a
// live canvas — the profile may show it next to many other trees), the days badge, and the
// "who has watered" marks.
import { StyleSheet, View } from 'react-native';
import { growthDays, isCompleted, isDead, Tree } from '@/game/tree';
import { useStore } from '@/state/store';
import { elevation, fonts, Glyph, Icon, scene, Txt, useColors } from '@/ui/ds';
import { TreeThumb } from '@/ui/TreeArt';
import { CANVAS_H, CANVAS_W } from '@/ui/trees/layout';

/** The tree on its little square of sky with a strip of meadow. `thirsty`: drooping (not watered by both). */
export function SharedThumb({ tree, box, thirsty = false, faded = false }: { tree: Tree; box: number; thirsty?: boolean; faded?: boolean }) {
  const { palette, night } = useStore();
  const c = useColors();
  const ground = Math.round(box * 0.2);
  const treeH = box * 0.82;
  const size = (treeH * CANVAS_W) / CANVAS_H;
  return (
    <View style={[styles.box, { width: box, height: box, borderRadius: box * 0.2, backgroundColor: c.skyCard }]}>
      <View style={[styles.ground, { height: ground, backgroundColor: (night ? scene.meadow.night : scene.meadow.day).meadow[2] }]} />
      <View style={{ position: 'absolute', left: (box - size) / 2, bottom: ground / 2 - treeH * 0.025, opacity: faded ? 0.55 : 1 }}>
        <TreeThumb
          days={growthDays(tree)}
          dead={isDead(tree)}
          completed={isCompleted(tree)}
          palette={palette}
          skin={tree.skin}
          seed={tree.id}
          size={size}
          fill={0.58}
          thirsty={thirsty && !isDead(tree)}
          placeholder
        />
      </View>
    </View>
  );
}

/** The days of growth on a little white pill (the card's corner). */
export function DaysBadge({ days }: { days: number }) {
  const { night } = useStore();
  const c = useColors();
  return (
    <View style={[styles.badge, elevation(1, night), { backgroundColor: c.card }]}>
      <Glyph name="rings" size={14} />
      <Txt variant="caption" style={styles.badgeText}>{days}</Txt>
    </View>
  );
}

/** "💧 you — not yet" / "✓ you" / "⌛ Aisha — waiting" / "✓ Aisha": one side's mark. */
export function WhoMark({ done, label, mine }: { done: boolean; label: string; mine: boolean }) {
  const c = useColors();
  return (
    <View style={styles.who}>
      {done ? <Glyph name="check" size={16} /> : mine ? <Glyph name="drop" size={16} /> : <Icon name="hourglass" size={15} color={c.textSoft} />}
      <Txt variant="small" numberOfLines={1} style={[styles.whoText, { color: done ? c.doneInk : mine ? c.waterInk : c.textSoft }]}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  badge: { position: 'absolute', left: 6, top: 6, height: 22, borderRadius: 11, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  badgeText: { fontSize: 12, lineHeight: 16 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  whoText: { fontFamily: fonts.bold, flexShrink: 1 },
});
