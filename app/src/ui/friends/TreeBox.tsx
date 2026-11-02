// A tree picture on a little square of sky with a strip of earth (спец-друзья 5.2, 6.5): a friend's
// tree row (56) and an offered shared tree (48). A picture (TreeThumb), never a live canvas.
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Skin } from '@/game/tree';
import { useStore } from '@/state/store';
import { scene, useColors } from '@/ui/ds';
import { TreeThumb } from '@/ui/TreeArt';
import { CANVAS_H, CANVAS_W } from '@/ui/trees/layout';

/** How much of the picture's height even a sprout fills (as the forest list). */
const FILL = 0.58;

export const TreeBox = memo(function TreeBox({ box, days, skin, seed, dead = false, completed = false }: {
  box: number; days: number; skin: Skin; seed: string; dead?: boolean; completed?: boolean;
}) {
  const { palette, night } = useStore();
  const c = useColors();
  const ground = Math.round(box * 0.2);
  const treeH = box * 0.86;
  const size = (treeH * CANVAS_W) / CANVAS_H;
  return (
    <View style={[styles.box, { width: box, height: box, borderRadius: box >= 56 ? 12 : 10, backgroundColor: c.skyCard }]}>
      <View style={[styles.ground, { height: ground, backgroundColor: (night ? scene.meadow.night : scene.meadow.day).meadow[2] }]} />
      {/* The drawing's feet are at 97.5 % of its height; they stand in the middle of the ground strip. */}
      <View style={{ position: 'absolute', left: (box - size) / 2, bottom: ground / 2 - treeH * 0.025 }}>
        <TreeThumb days={days} dead={dead} completed={completed} palette={palette} size={size} skin={skin} seed={seed} fill={FILL} night={night} placeholder />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
