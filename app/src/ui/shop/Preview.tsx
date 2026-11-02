// A tree standing on a little meadow scene (spec 6.2, 7.1): the shop's cards, the item
// window, the meadow cards. The scene is react-native-svg, the tree a TreeThumb picture:
// no live canvas anywhere here (spec 16).
import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { AnimatedStyle } from 'react-native-reanimated';
import type { MeadowId } from '@/game/economy';
import type { Skin } from '@/game/tree';
import { dark, light } from '@/ui/theme';
import { TreeArtProps, TreeThumb } from '@/ui/TreeArt';
import { useMeadowScene } from './MeadowScene';
import { treeBox, treeShares } from './model';

export interface PreviewProps {
  meadow: MeadowId;
  night: boolean;
  width: number;
  height: number;
  radius: number;
  /** The tree standing on the meadow; none — an empty meadow. */
  tree?: { skin: Skin; days: number; seed: string } | null;
  /** Share of the height the tree fills (by its own drawing, not its picture). */
  fill?: number;
  /**
   * Size the picture by a tree of this age instead (the growth show: a sprout is small next
   * to the "tree" it becomes); an older tree still keeps clear of the top edge.
   */
  sizeByDays?: number;
  /** Instead of `fill`: the picture's width as a share of the box (the meadow cards' little birch). */
  pictureWidth?: number;
  /** Where the horizon and the tree's feet are, as shares of the height. */
  horizon?: number;
  feet?: number;
  sun?: boolean;
  weather?: boolean;
  seed?: number;
  /** Moves the tree only (the celebration's bounce, the growth show's pop). */
  treeStyle?: StyleProp<AnimatedStyle<ViewStyle>>;
  /** Over everything, inside the rounded box. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** The tree's picture props, so a window can draw them ahead of time (warmThumb). */
export function previewTree(p: Pick<PreviewProps, 'width' | 'height' | 'fill' | 'pictureWidth' | 'feet' | 'night' | 'sizeByDays'> & { tree: NonNullable<PreviewProps['tree']> }): { props: TreeArtProps; left: number; top: number } {
  const { width, height, fill = 0.82, pictureWidth, feet = 0.84, night, tree, sizeByDays } = p;
  const feetY = height * feet;
  const fit = (days: number, share: number) => treeBox({ boxW: width, boxH: height, feet: feetY, share, ...treeShares(tree.skin, days) }).size;
  const raw = pictureWidth
    ? width * pictureWidth
    : sizeByDays !== undefined
      ? Math.min(fit(sizeByDays, fill), fit(tree.days, Math.min(0.9, feet - 0.04)))
      : fit(tree.days, fill);
  const size = Math.max(1, Math.round(raw));
  return {
    props: { days: tree.days, skin: tree.skin, seed: tree.seed, size, night, palette: night ? dark : light, ground: false },
    left: Math.round((width - size) / 2),
    top: feetY - (size * 312) / 300,
  };
}

export function Preview(props: PreviewProps) {
  const { meadow, night, width, height, radius, tree, horizon = 0.66, feet = 0.84, sun = false, weather = false, seed = 5, treeStyle, children, style } = props;
  const placed = tree ? previewTree({ ...props, tree }) : null;
  const { back, fore } = useMeadowScene({
    meadow, night, width, height, horizon, sun, weather, seed,
    soil: placed ? { x: width / 2, y: height * feet, w: placed.props.size } : null,
  });
  return (
    <View style={[styles.box, { width, height, borderRadius: radius }, style]}>
      {back}
      {placed && (
        <Animated.View style={[styles.tree, { left: placed.left, top: placed.top, transformOrigin: 'bottom' }, treeStyle]} pointerEvents="none">
          <TreeThumb {...placed.props} />
        </Animated.View>
      )}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">{fore}</View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  tree: { position: 'absolute' },
});
