// A forest in a little picture (design/oyuur-29/спец.md 8.3, frames 01, 05): the three biggest
// trees on a strip of meadow under a soft sky, a counter pill in the corner. The trees are
// pictures (TreeThumb, drawn by the thumb queue as in the forest): no live canvases here.
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useStore } from '@/state/store';
import type { MiniTree } from '@/state/syncContract';
import { elevation, fonts, Icon, MAX_FONT_SCALE, Txt, useColors } from '@/ui/ds';
import { TreeThumb } from '@/ui/TreeArt';
import { CANVAS_H, CANVAS_W } from '@/ui/trees/layout';
import { meadowEdge, meadowStrip, miniSky } from './look';

/** Places of the three trees on the 112-wide picture (spec 8.3): the biggest in the middle. */
const SLOTS = [
  { x: 62, h: 52 },
  { x: 30, h: 44 },
  { x: 92, h: 40 },
];
const BASE_W = 112;
/** Even a sprout fills this share of its picture: no tree drawn lower than ~36 px (spec 8.3). */
const FILL = 0.88;

export function MiniForest({ trees, count, width = 112, height = 76, id }: {
  trees: MiniTree[];
  count: number;
  width?: number;
  height?: number;
  /** Unique per picture on screen: the sky's gradient id. */
  id: string;
}) {
  const c = useColors();
  const { night, palette } = useStore();
  const k = width / BASE_W;
  const meadow = 20 * k;
  const [top, bottom] = miniSky(night);
  return (
    <View style={[styles.box, { width, height, borderRadius: 16 * k }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill={`url(#sky-${id})`} />
        <Rect x="0" y={height - meadow} width={width} height={meadow} fill={meadowStrip(night)} />
        <Rect x="0" y={height - meadow} width={width} height={1} fill={meadowEdge(night)} />
      </Svg>
      {trees.slice(0, 3).map((tree, i) => {
        const slot = SLOTS[i];
        const h = slot.h * k;
        const size = (h * CANVAS_W) / CANVAS_H;
        return (
          // The drawing's feet are at 97.5 % of its height; they stand in the middle of the meadow.
          <View key={tree.id} style={{ position: 'absolute', left: slot.x * k - size / 2, bottom: meadow / 2 - h * 0.025 }}>
            <TreeThumb days={tree.days} dead={tree.dead} skin={tree.skin} seed={tree.id} palette={palette} size={size} fill={FILL} night={night} placeholder />
          </View>
        );
      })}
      <View style={[styles.pill, elevation(1, night), { backgroundColor: c.card }]}>
        <Icon name="tree" size={14} color={c.doneInk} strokeWidth={2.4} />
        <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.count, { color: c.text }]}>{count}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  pill: { position: 'absolute', top: 6, right: 6, height: 22, borderRadius: 11, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 3 },
  count: { fontFamily: fonts.black, fontSize: 12.5, lineHeight: 16 },
});
