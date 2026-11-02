// The golden plaque that grows out of the ground beside a locked-in tree (spec 3.2),
// and the picture for the "Lock in for good?" dialog (spec 3.1).
// Drawn with react-native-svg: the main screen already has three Skia canvases.
import { StyleSheet, View } from 'react-native';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';
import { growthDays, isDead, Tree } from '@/game/tree';
import { useStore } from '@/state/store';
import { colorsFor, Glyph } from '@/ui/ds';
import { treeMood } from '@/ui/live/mood';
import { TreeThumb } from '@/ui/TreeArt';
import { BASE_Y, CANVAS_H, CANVAS_W, lookOf, SIZES, treeZoom } from '@/ui/trees/layout';

/** The plaque's picture is 52×58 at zoom 1; its post stands at the bottom middle. */
export const PLAQUE = { w: 52, h: 58 };

export function Plaque({ k = 1 }: { k?: number }) {
  return (
    <Svg width={PLAQUE.w * k} height={PLAQUE.h * k} viewBox="0 0 52 58">
      <Ellipse cx={26} cy={55} rx={14} ry={3} fill="rgba(80,50,20,0.25)" />
      <Rect x={23} y={26} width={6} height={30} rx={2} fill="#8A6A3B" />
      <Rect x={3} y={3} width={46} height={30} rx={7} fill="#FFCF4D" stroke="#B9801E" strokeWidth={2.4} />
      <Rect x={7} y={6} width={38} height={6} rx={3} fill="#FFF3C4" opacity={0.6} />
      <Path
        d="M26 9 L28.9 15 L35.4 15.7 L30.6 20.1 L31.9 26.5 L26 23.3 L20.1 26.5 L21.4 20.1 L16.6 15.7 L23.1 15Z"
        fill="#FFF7E0"
        stroke="#D99A1E"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Size of the dialog picture; the tree in it is 70 % of the picture's height at any
 * stage (a sprout is zoomed up, a grand oak down), never wider than 90 % of it.
 */
const PIC = { w: 120, h: 112, ground: 30, treeH: 0.7, treeW: 0.9, maxSize: 300 };

/** The picture in the "Lock in for good?" dialog: the tree on a bit of sky, a plaque in the corner. */
export function LockInPicture({ tree }: { tree: Tree }) {
  const { palette, night, today } = useStore();
  const c = colorsFor(night);
  const days = growthDays(tree);
  const dead = isDead(tree);
  // Size the whole picture so that the drawn tree, not its canvas, fills the frame.
  const drawn = SIZES[tree.skin][lookOf(days, dead)];
  const zoom = treeZoom(tree.skin, days, dead);
  const k = Math.min((PIC.h * PIC.treeH) / (drawn.h * zoom), (PIC.w * PIC.treeW) / (drawn.w * zoom), PIC.maxSize / CANVAS_W);
  const size = CANVAS_W * k;
  // The tree's feet stand in the middle of the strip of ground.
  const top = PIC.h - PIC.ground / 2 - BASE_Y * k;
  return (
    <View style={[styles.picture, { backgroundColor: c.skyCard }]}>
      <View style={[styles.ground, { backgroundColor: night ? '#3B3A6E' : '#EED8A0' }]} />
      <View style={{ position: 'absolute', left: (PIC.w - size) / 2, top, height: CANVAS_H * k }}>
        <TreeThumb
          days={days}
          dead={dead}
          palette={palette}
          size={size}
          skin={tree.skin}
          seed={tree.id}
          thirsty={treeMood(tree, today) === 'thirsty'}
          night={night}
        />
      </View>
      <View style={styles.corner}>
        <Glyph name="plaque" size={34} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  picture: { width: PIC.w, height: PIC.h, borderRadius: 24, overflow: 'hidden', alignSelf: 'center' },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0, height: PIC.ground },
  corner: { position: 'absolute', right: 8, bottom: 6 },
});
