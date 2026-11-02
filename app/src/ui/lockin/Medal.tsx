// The gold medal a locked-in tree folds into before it flies to "My forest" (spec 3.2):
// a 84 px disc with a warm gradient, a white rim, an outer gold ring and a glow, with
// the tree's picture inside.
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { growthDays, isDead, Tree } from '@/game/tree';
import { Palette } from '@/ui/theme';
import { TreeThumb } from '@/ui/TreeArt';
import { BASE_Y, CANVAS_W, lookOf, SIZES, treeZoom } from '@/ui/trees/layout';

export const MEDAL = 84;
/** Height of the tree inside the medal, and where its feet stand from the bottom. */
const TREE_H = 62;
const FEET = 12;
/** A tiny sprout is not blown up past this picture width. */
const MAX_PICTURE = 320;
/** The gold glow, and under it the raised shadow of elevation(3) (day and night shadow colors). */
const SHADOW_DAY = '0 0 28px 8px rgba(255,214,90,0.65), 0 14px 16px rgba(90,58,18,0.24)';
const SHADOW_NIGHT = '0 0 28px 8px rgba(255,214,90,0.65), 0 14px 16px rgba(5,4,26,0.55)';

export function Medal({ tree, palette, night }: { tree: Tree; palette: Palette; night: boolean }) {
  const days = growthDays(tree);
  const dead = isDead(tree);
  // The tree, not its whole picture, is 62 px tall: zoom the picture so it fills the medal.
  const drawn = SIZES[tree.skin][lookOf(days, dead)].h * treeZoom(tree.skin, days, dead);
  const size = Math.min((CANVAS_W * TREE_H) / drawn, MAX_PICTURE);
  const k = size / CANVAS_W;
  const inner = MEDAL - 6;
  return (
    <View style={[styles.ring, { boxShadow: night ? SHADOW_NIGHT : SHADOW_DAY }]}>
      <View style={styles.rim}>
        <Svg width={inner} height={inner} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="medal" cx="38%" cy="32%" r="75%">
              <Stop offset="0" stopColor="#FFF3C4" />
              <Stop offset="0.45" stopColor="#FFD866" />
              <Stop offset="1" stopColor="#F0B53A" />
            </RadialGradient>
          </Defs>
          <Circle cx={inner / 2} cy={inner / 2} r={inner / 2} fill="url(#medal)" />
        </Svg>
        <View style={{ position: 'absolute', left: inner / 2 - size / 2, top: inner - FEET - BASE_Y * k }}>
          <TreeThumb days={days} dead={dead} palette={palette} size={size} skin={tree.skin} seed={tree.id} night={night} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: MEDAL + 4,
    height: MEDAL + 4,
    borderRadius: (MEDAL + 4) / 2,
    backgroundColor: '#D99A1E',
    padding: 2,
  },
  rim: {
    width: MEDAL,
    height: MEDAL,
    borderRadius: MEDAL / 2,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
});
