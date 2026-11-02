// A tree on a little square of sky with a strip of earth: the card's picture (76) and
// a list row's (48). The list's picture is the one `warmForest` draws ahead of time.
import { StyleSheet, View } from 'react-native';
import { Habit } from '@/game/tree';
import { useStore } from '@/state/store';
import { scene, useColors } from '@/ui/ds';
import { LIST_THUMB, listThumb } from '@/ui/forest/thumbs';
import { TreeThumb } from '@/ui/TreeArt';
import { CANVAS_H, CANVAS_W } from '@/ui/trees/layout';

const LOOK = {
  card: { box: 76, radius: 16, ground: 16, tree: 62 },
  list: { box: 48, radius: 12, ground: 10, tree: LIST_THUMB },
} as const;

export function ThumbBox({ habit, kind }: { habit: Habit; kind: keyof typeof LOOK }) {
  const { palette, night } = useStore();
  const c = useColors();
  const look = LOOK[kind];
  const base = listThumb(habit, palette);
  const props = look.tree === LIST_THUMB ? base : { ...base, size: (look.tree * CANVAS_W) / CANVAS_H };
  const w = props.size;
  return (
    <View style={[styles.box, { width: look.box, height: look.box, borderRadius: look.radius, backgroundColor: c.skyCard }]}>
      <View style={[styles.ground, { height: look.ground, backgroundColor: (night ? scene.meadow.night : scene.meadow.day).meadow[2] }]} />
      {/* The drawing's feet are at 97.5 % of its height; they stand in the middle of the ground strip. */}
      <View style={{ position: 'absolute', left: (look.box - w) / 2, bottom: look.ground / 2 - look.tree * 0.025 }}>
        <TreeThumb {...props} placeholder />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
