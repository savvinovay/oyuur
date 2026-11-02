// The landscape behind the tree: sky and a hill, painted by a neural network
// (assets/bg, by day and by night), placed so the hilltop is where the tree stands.
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Palette } from './theme';

/**
 * The hilltop sits this far above the bottom of the tree's stage: a little higher than
 * the tree's feet, so the tree stands on the front of the hill with ground around it.
 */
export const GROUND_LIFT = 64;

// Picture size and how far down (share of its height) the top of its hill is.
const HOME = {
  day: { source: require('../../assets/bg/home-day.jpg'), ground: 1202 / 1536 },
  night: { source: require('../../assets/bg/home-night.jpg'), ground: 1157 / 1536 },
  ratio: 1536 / 1024,
};

/**
 * Fills the screen. `groundY` is where the hilltop should be, in screen pixels from
 * the top; until it is known the picture just covers the screen.
 */
export function Backdrop({ palette, groundY }: { palette: Palette; groundY: number | null }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const pic = palette.dark ? HOME.night : HOME.day;
  // Big enough to cover the screen above and below the hilltop, which meets the tree.
  const ground = groundY ?? box.h * pic.ground;
  const h = Math.max(box.w * HOME.ratio, ground / pic.ground, (box.h - ground) / (1 - pic.ground));
  const w = h / HOME.ratio;
  const top = ground - pic.ground * h;
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: palette.skyTop }]}
      pointerEvents="none"
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {box.w > 0 && (
        <Image source={pic.source} style={{ position: 'absolute', width: w, height: h, left: (box.w - w) / 2, top }} resizeMode="cover" />
      )}
    </View>
  );
}
