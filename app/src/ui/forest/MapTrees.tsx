// The trees of the forest map: pictures (TreeThumb), never live canvases, inside one
// "world" view that the camera moves and scales on the UI thread (spec 1.3, layer 8).
// Each picture reads only its own shared values (feet, lift, scale, lean), so dragging
// one tree never re-runs the styles of the others.
import { memo, useEffect } from 'react';
import { AccessibilityActionEvent, StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import type { Cell } from '@/game/plot';
import { Palette } from '@/ui/theme';
import { TreeThumb } from '@/ui/TreeArt';
import { CELL_H, CELL_W, cellCenter } from './iso';
import { FEET_Y, MapItem, Motions, THUMB_H, THUMB_W, TreeMotion } from './model';
import { mapThumb } from './thumbs';

interface Props {
  items: MapItem[];
  motions: Motions;
  palette: Palette;
  width: number;
  anchorY: number;
  cx: SharedValue<number>;
  cy: SharedValue<number>;
  z: SharedValue<number>;
  labels: Map<string, string>;
  moveLabel: string;
  readOnly: boolean;
  onAction: (id: string, action: 'activate' | 'move') => void;
  /** Free cells as buttons for the screen reader while choosing a spot (spec 9). */
  freeCells: Cell[] | null;
  freeLabel: (cell: Cell) => string;
  onFreeCell: (cell: Cell) => void;
}

export function MapTrees(p: Props) {
  const { width, anchorY, cx, cy, z } = p;
  const world = useAnimatedStyle(() => ({
    transform: [{ translateX: width / 2 - cx.value * z.value }, { translateY: anchorY - cy.value * z.value }, { scale: z.value }],
  }));
  return (
    <Animated.View style={[styles.world, world]} pointerEvents="box-none">
      {p.freeCells?.map((cell) => {
        const { x, y } = cellCenter(cell);
        return (
          <View
            key={`${cell.c},${cell.r}`}
            accessible
            accessibilityRole="button"
            accessibilityLabel={p.freeLabel(cell)}
            onAccessibilityTap={() => p.onFreeCell(cell)}
            style={[styles.cell, { left: x - CELL_W / 4, top: y - CELL_H / 4 }]}
          />
        );
      })}
      {p.items.map((item) => (
        <MapTree
          key={item.id}
          item={item}
          m={p.motions.get(item.id, item)}
          palette={p.palette}
          label={p.labels.get(item.id) ?? item.name}
          moveLabel={p.moveLabel}
          readOnly={p.readOnly}
          onAction={p.onAction}
        />
      ))}
    </Animated.View>
  );
}

const MapTree = memo(function MapTree({ item, m, palette, label, moveLabel, readOnly, onAction }: {
  item: MapItem;
  m: TreeMotion;
  palette: Palette;
  label: string;
  moveLabel: string;
  readOnly: boolean;
  onAction: (id: string, action: 'activate' | 'move') => void;
}) {
  // Feet at (px, py); lean and squash around the feet.
  const style = useAnimatedStyle(() => ({
    opacity: m.alpha.value,
    transform: [
      { translateX: m.px.value - THUMB_W / 2 },
      { translateY: m.py.value - FEET_Y - m.lift.value },
      { rotate: `${m.rot.value}deg` },
      { scaleX: m.sx.value * m.press.value },
      { scaleY: m.sy.value * m.press.value },
    ],
  }));
  // Its drop and badge show once the picture does; off the map they wait again.
  useEffect(() => () => {
    m.ready.value = 0;
  }, [m]);
  const actions = readOnly ? [{ name: 'activate' }] : [{ name: 'activate' }, { name: 'move', label: moveLabel }];
  const onAccessibilityAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'activate' || name === 'move') onAction(item.id, name);
  };
  return (
    <Animated.View
      style={[styles.tree, style]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={actions}
      onAccessibilityAction={onAccessibilityAction}
    >
      <View pointerEvents="none">
        <TreeThumb {...mapThumb(item.habit, palette)} placeholder onReady={() => (m.ready.value = 1)} />
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  // A point at the world's origin: children are placed by their own transforms.
  world: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformOrigin: 'left top' },
  tree: { position: 'absolute', left: 0, top: 0, width: THUMB_W, height: THUMB_H, transformOrigin: `${THUMB_W / 2}px ${FEET_Y}px` },
  cell: { position: 'absolute', width: CELL_W / 2, height: CELL_H / 2 },
});
