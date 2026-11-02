// Trees of the other habits standing on the meadow along an arc (slotAt): the one in
// front is big, the others small behind it on both sides. They are pictures
// (TreeThumb), not live canvases; each one is placed every frame from the camera on
// the UI thread, so they follow the finger without React re-rendering.
import { BlendColor, drawAsPicture, Group, Paint, Skia } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Image, PixelRatio, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, FadeIn, SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { DayKey } from '@/game/dates';
import { checkedInToday, growthDays, Habit, isCompleted, isDead, isGrowing, Tree } from '@/game/tree';
import { useStore } from '@/state/store';
import { treeK } from '../live/LiveTree';
import { SceneGeo, slotAt, Wind } from '../scene/contract';
import { TreeArtProps, TreeScene, TreeThumb } from '../TreeArt';
import { BASE_Y, CANVAS_H, CANVAS_W, lookOf, SIZES, treeZoom } from '../trees/layout';
import { SoftPatch } from '../SoftPatch';
import { MeadowSwap } from './MeadowSwap';
import { useMeadow } from './useMeadow';

/** Neighbours further than this many habits from the camera are not mounted. */
const REACH = 3;
/** A tiny sprout far back is never drawn shorter than this, px. */
const MIN_HEIGHT = 28;

/**
 * Width of the front tree's picture (spec section 2): as wide as the screen allows,
 * but never reaching up into the header. The live tree uses the same size.
 */
export function frontTreeSize(geo: SceneGeo): number {
  return CANVAS_W * treeK(geo);
}

interface Props {
  habits: Habit[];
  /** The generation shown by the live tree (its habit is at liveIndex). */
  liveTree: Tree | undefined;
  liveIndex: number;
  focusIndex: number;
  /** The live tree has drawn its first frame: its picture can go. */
  liveReady: boolean;
  cameraX: SharedValue<number>;
  geo: SceneGeo;
  wind: Wind;
  today: DayKey;
  animations: boolean;
  /** The tree waits for its watering hour today (OYUUR-33): drawn calm, not thirsty, like the live tree. */
  waits?: (tree: Tree) => boolean;
}

export function Neighbors({ habits, liveTree, liveIndex, focusIndex, liveReady, cameraX, geo, wind, today, animations, waits }: Props) {
  const { night } = useStore();
  // The meadow's earth under the trees and its haze on the far ones.
  const { theme, palette } = useMeadow();
  const size = frontTreeSize(geo);
  // While another screen is on top, the home screen is laid out 0 × 0 on the web: no
  // pictures then (a 0 px picture can't be drawn, and it would only be thrown away).
  if (!(size >= 1)) return null;
  const colors = theme.meadow[night ? 'night' : 'day'];
  const near = (i: number) => Math.abs(i - liveIndex) <= REACH || Math.abs(i - focusIndex) <= REACH;
  // Far ones first, so nearer trees are drawn over them.
  const order = habits
    .map((h, i) => ({ h, i }))
    .filter(({ i }) => near(i))
    .sort((a, b) => Math.abs(b.i - focusIndex) - Math.abs(a.i - focusIndex));
  return (
    <>
      {/* With animations off the camera jumps; the whole row then fades in for 150 ms. */}
      <Animated.View
        key={animations ? 'moving' : `still-${focusIndex}`}
        entering={animations ? undefined : FadeIn.duration(150)}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        {order.map(({ h, i }) => {
          const tree = i === liveIndex && liveTree ? liveTree : h.current;
          return (
            <Neighbor
              key={h.lineageId}
              tree={tree}
              index={i}
              hidden={i === liveIndex && liveReady}
              thirsty={isGrowing(tree) && !checkedInToday(tree, today) && !waits?.(tree)}
              size={size}
              haze={colors.haze}
              soil={colors.soil}
              night={palette.dark}
              {...{ cameraX, geo, wind, animations, palette }}
            />
          );
        })}
      </Animated.View>
      {/* Over the sky, the meadow and these trees: a new meadow comes in under a veil (spec 10.6). */}
      <MeadowSwap animations={animations} />
    </>
  );
}

interface NeighborProps {
  tree: Tree;
  index: number;
  /** The live tree stands here and is drawn: hide the picture under it. */
  hidden: boolean;
  thirsty: boolean;
  size: number;
  haze: string;
  soil: string;
  night: boolean;
  cameraX: SharedValue<number>;
  geo: SceneGeo;
  wind: Wind;
  animations: boolean;
  palette: TreeArtProps['palette'];
}

function Neighbor({ tree, index, hidden, thirsty, size, haze, soil, night, cameraX, geo, wind, animations, palette }: NeighborProps) {
  const days = growthDays(tree);
  const dead = isDead(tree);
  const k = size / CANVAS_W;
  const picH = (size * CANVAS_H) / CANVAS_W;
  const feet = BASE_Y * k;
  // Real height of the drawn tree, so a sprout far back can be kept readable.
  const treeH = SIZES[tree.skin][lookOf(days, dead)].h * treeZoom(tree.skin, days, dead) * k;
  const minScale = Math.min(1, MIN_HEIGHT / Math.max(treeH, 1));

  // The picture under the live tree fades out in 120 ms once the live tree is drawn,
  // then React hides it. When the live tree leaves, React shows the picture in the very
  // commit that removes the live tree, so there is never a frame with no tree or two.
  const fade = useSharedValue(hidden ? 0 : 1);
  const [gone, setGone] = useState(hidden);
  useEffect(() => {
    if (hidden) {
      fade.value = withTiming(0, { duration: 120 }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(setGone, true);
      });
    } else {
      cancelAnimation(fade);
      fade.value = 1;
      setGone(false);
    }
  }, [hidden, fade]);
  // Hidden by React now: get the picture ready to show again at full strength.
  useEffect(() => {
    if (gone) fade.value = 1;
  }, [gone, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const place = useAnimatedStyle(() => {
    const s = slotAt(index - cameraX.value, geo);
    // A light sway around the foot, stronger in a gust.
    const sway = animations ? 0.5 * (0.4 + 1.2 * wind.gust.value) * Math.sin((2 * Math.PI * wind.t.value) / 3.4 + index) : 0;
    return {
      opacity: s.opacity,
      transform: [
        { translateX: s.x - size / 2 },
        { translateY: s.feetY - feet },
        { rotate: `${sway}deg` },
        { scale: Math.max(s.scale, minScale) },
      ],
    };
  });
  const hazeStyle = useAnimatedStyle(() => ({ opacity: slotAt(index - cameraX.value, geo).haze }));

  // At night the picture gets the same night colors as the live tree, so they swap unseen.
  const art: TreeArtProps = { days, dead, completed: isCompleted(tree), palette, size, skin: tree.skin, seed: tree.id, thirsty, night };
  return (
    <Animated.View style={[styles.slot, { width: size, height: picH, transformOrigin: [size / 2, feet, 0] }, place]}>
      <View style={[StyleSheet.absoluteFill, { opacity: hidden && gone ? 0 : 1 }]}>
        <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]}>
          {/* A low, faint oval of earth: from far away only a soft patch under the trunk reads; fainter on the blue night meadow. */}
          <SoftPatch color={soil} style={[styles.soil, { width: size * 0.3, height: size * 0.05, left: size * 0.35, top: feet - size * 0.025, opacity: night ? 0.35 : 0.5 }]} />
          <TreeThumb {...art} />
          <Animated.View style={[StyleSheet.absoluteFill, hazeStyle]}>
            <Silhouette art={art} color={haze} />
          </Animated.View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

// Haze over a far tree: the same tree filled with the horizon color, laid over it at
// the slot's haze opacity. Drawn once at half resolution; it is faint and small.
const silhouettes = new Map<string, string>();

async function drawSilhouette(art: TreeArtProps, color: string, key: string): Promise<string> {
  const scale = Math.min(PixelRatio.get(), 2) * 0.5;
  const size = art.size * scale;
  const w = Math.round(size);
  const h = Math.round((size * CANVAS_H) / CANVAS_W);
  // CanvasKit gives back no surface for an empty size, and the web wrapper then fails on
  // every call, even dispose. Never ask for one.
  if (!(w >= 1 && h >= 1)) throw new Error(`Tree haze of ${w} × ${h} px`);
  const picture = await drawAsPicture(
    <Group layer={<Paint><BlendColor color={color} mode="srcIn" /></Paint>}>
      <TreeScene {...art} size={size} />
    </Group>,
    Skia.XYWHRect(0, 0, w, h),
  );
  const surface = Skia.Surface.Make(w, h);
  // Out of memory the surface comes back empty: its getCanvas throws, and so would its
  // dispose. Only a surface that was really made is given back below.
  let canvas;
  try {
    if (!surface) throw new Error('no surface');
    canvas = surface.getCanvas();
  } catch {
    picture.dispose();
    throw new Error(`Could not make a ${w} × ${h} px drawing surface`);
  }
  // Skia's memory is not freed by the browser on its own: give it back right away.
  // These are our own offscreen objects; no canvas on screen draws them.
  try {
    canvas.drawPicture(picture);
    surface.flush();
    const image = surface.makeImageSnapshot();
    try {
      const uri = `data:image/png;base64,${image.encodeToBase64()}`;
      silhouettes.set(key, uri);
      return uri;
    } finally {
      image.dispose();
    }
  } finally {
    surface.dispose();
    picture.dispose();
  }
}

function Silhouette({ art, color }: { art: TreeArtProps; color: string }) {
  const key = [art.days, !!art.dead, !!art.completed, art.size, art.skin, art.seed, !!art.thirsty, !!art.night, color].join('|');
  const [uri, setUri] = useState(() => silhouettes.get(key));
  useEffect(() => {
    const ready = silhouettes.get(key);
    if (ready) return setUri(ready);
    let live = true;
    drawSilhouette(art, color, key)
      .then((u) => live && setUri(u))
      .catch((error) => console.warn('Could not draw tree haze', error));
    return () => {
      live = false;
    };
    // The key covers everything that changes the picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!uri) return null;
  return <Image source={{ uri }} style={StyleSheet.absoluteFill} />;
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', left: 0, top: 0 },
  soil: { position: 'absolute' },
});
