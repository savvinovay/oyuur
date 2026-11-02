// The friend profile's landscape header (спец-друзья 6.2, frames 15, 22): the sky of the main
// scene, 14 stars at night (placed by the nick), a hill and two meadow strips, and up to 4 of the
// friend's growing open trees as pictures (TreeThumb, no live canvas) with their feet on 206.
// A tap opens the friend's forest.
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import type { Tree } from '@/game/tree';
import { growthDays } from '@/game/tree';
import { useStore } from '@/state/store';
import { elevation, scene } from '@/ui/ds';
import { TreeThumb } from '@/ui/TreeArt';
import { CANVAS_H, CANVAS_W } from '@/ui/trees/layout';

/** Where the trees' feet stand, from the bottom of the header (232 − 206). */
const FEET = 26;

/** A small stable number from a text (the stars' places). */
function hash(s: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < s.length; k++) h = Math.imul(h ^ s.charCodeAt(k), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export const ProfileHero = memo(function ProfileHero({ nick, trees, width, height, compact, onPress, label, bare = false }: {
  nick: string;
  /** Up to 4, most days first (model.heroTrees). */
  trees: Tree[];
  width: number;
  height: number;
  compact: boolean;
  onPress?: () => void;
  label?: string;
  /** The skeleton: no trees yet. */
  bare?: boolean;
}) {
  const { night, palette } = useStore();
  const sky = night ? scene.sky.night : scene.sky.day;
  const meadow = night ? scene.meadow.night : scene.meadow.day;
  const treeW = compact ? 94 : 110;
  const offsets = compact ? [-80, 80, -128, 128] : [-96, 96, -150, 150];
  const treeH = (treeW * CANVAS_H) / CANVAS_W;
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole="button" accessibilityLabel={label} style={[styles.hero, elevation(1, night), { height }]}>
      <View style={[styles.clip, { height }]}>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="heroSky" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={sky.top} />
              <Stop offset="0.8" stopColor={sky.horizon} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill="url(#heroSky)" />
          {night &&
            Array.from({ length: 14 }, (_, i) => (
              <Circle
                key={i}
                cx={8 + hash(nick, i) * (width - 16)}
                cy={height * 0.22 + hash(nick, i + 50) * height * 0.42}
                r={1.5}
                fill="#FFFFFF"
                opacity={0.4 + (i % 3) * 0.2}
              />
            ))}
        </Svg>
        <Svg width={width + 40} height={90} viewBox="0 0 415 90" preserveAspectRatio="none" style={[styles.hills, { left: -20 }]}>
          <Path d="M0 40 C60 18 120 22 190 34 C260 46 330 20 415 30 V90 H0Z" fill={meadow.hillsTop} opacity={0.85} />
          <Path d="M0 62 C80 50 150 56 210 58 C280 60 340 48 415 54 V90 H0Z" fill={meadow.meadow[0]} />
          <Path d="M0 74 C90 70 200 76 415 70 V90 H0Z" fill={meadow.meadow[1]} />
        </Svg>
        {!bare &&
          trees.map((x, i) => (
            // The drawing's feet are at 97.5 % of its height.
            <View key={x.id} style={{ position: 'absolute', left: width / 2 + offsets[i] - treeW / 2, bottom: FEET - treeH * 0.025 }} pointerEvents="none">
              <TreeThumb days={growthDays(x)} palette={palette} size={treeW} skin={x.skin} seed={x.id} fill={0.3} ground={false} night={night} />
            </View>
          ))}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  hero: { position: 'absolute', left: 0, right: 0, top: 0, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  clip: { overflow: 'hidden', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  hills: { position: 'absolute', bottom: 0 },
});
