// Trees drawn in code with Skia. Each kind (oak, sakura, spruce, birch, maple, apple, palm) draws its own
// stages in ui/trees; here they are placed and zoomed by age (ui/trees/layout.ts).
// Later the drawings can be swapped for an artist's pictures kind by kind.
import { Canvas, ColorMatrix, drawAsPicture, Group, Paint, Path, Skia } from '@shopify/react-native-skia';
import { ComponentType, useEffect, useRef, useState } from 'react';
import { Image, PixelRatio, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Skin, stageOf } from '@/game/tree';
import { motion } from './ds/tokens';
import { SoftPatch } from './SoftPatch';
import { treeMatrix } from './live/colors';
import { Palette } from './theme';
import { BASE_Y, CANVAS_H, CANVAS_W, fillZoom, lookOf, treeZoom } from './trees/layout';
import { Apple } from './trees/apple';
import { Birch } from './trees/birch';
import { Maple } from './trees/maple';
import { Oak } from './trees/oak';
import { Palm } from './trees/palm';
import { Sakura } from './trees/sakura';
import { Spruce } from './trees/spruce';
import { hashString } from './trees/parts';
import { SkinProps } from './trees/types';
import { Dropped, makeThumbQueue } from './thumbQueue';

const KINDS: Record<Skin, ComponentType<SkinProps>> = { oak: Oak, sakura: Sakura, spruce: Spruce, birch: Birch, maple: Maple, apple: Apple, palm: Palm };

export interface TreeArtProps {
  days: number;
  dead?: boolean;
  /** Locked-in result: a golden plaque at the foot of the tree. */
  completed?: boolean;
  palette: Palette;
  /** Width in pixels; the height follows the 300×320 picture. */
  size: number;
  skin?: Skin;
  /** Any stable text (the tree id): gives each tree its own leaf pattern. */
  seed?: string;
  /** Not watered today: drooping and faded. */
  thirsty?: boolean;
  /** Night scene: darker and cooler, the same as the live tree at night (live/colors.ts `nightMatrix`). */
  night?: boolean;
  /**
   * A small picture (forest card): even the youngest tree fills at least this share
   * of the picture's height, older ones a little more (trees/layout.ts `fillZoom`).
   */
  fill?: number;
  /** Earth under the tree (default). The forest map draws its own and turns it off. */
  ground?: boolean;
}

/** A live drawing, for the one big tree on a screen. */
export function TreeArt(props: TreeArtProps) {
  return (
    <Canvas style={{ width: props.size, height: (props.size * CANVAS_H) / CANVAS_W }}>
      <TreeScene {...props} />
    </Canvas>
  );
}

/**
 * The tree as Skia elements, standing at the bottom center of a `size`-wide picture.
 * `density` — drawing pixels per screen point, when drawn bigger than shown (snapshots).
 */
export function TreeScene({ size, thirst, thirsty, night = false, density = 1, ...rest }: TreeArtProps & { thirst?: number; density?: number }) {
  const k = size / CANVAS_W;
  const dry = thirst ?? (thirsty ? 1 : 0);
  const body = <TreeBody {...rest} k={k} thirst={dry} density={density} />;
  const tinted = dry > 0 || night;
  return (
    <Group transform={[{ translateX: size / 2 }, { translateY: BASE_Y * k }]}>
      {tinted ? <Group layer={<Paint><ColorMatrix matrix={treeMatrix(dry, 0, 0, 0, NO_HAZE, night ? 1 : 0, rest.skin)} /></Paint>}>{body}</Group> : body}
    </Group>
  );
}

const NO_HAZE = [0, 0, 0];

/** The plaque is 64 units wide; on screen it is never wider than this (frame 21: a small sign at the foot). */
const PLAQUE_W = 64;
const PLAQUE_MAX = 28;

/**
 * The tree with its feet at (0, 0), `k` screen pixels per unit. No color filter: the
 * live tree lays its own animated one over it. `thirst` (0..1) only droops the leaves.
 */
export function TreeBody({ days, dead = false, completed = false, palette, skin = 'oak', seed = '', k, thirst = 0, ground = true, fill = 0, density = 1 }: Omit<TreeArtProps, 'size' | 'thirsty' | 'night'> & { k: number; thirst?: number; density?: number }) {
  const Kind = KINDS[skin];
  const extra = fillZoom(skin, days, dead, fill);
  const zoom = treeZoom(skin, days, dead) * extra;
  const look = lookOf(days, dead);
  // A zoomed-in small tree is not small any more.
  const small = extra === 1 && (look === 'sprout' || look === 'seedling' || look === 'deadSmall');
  const plaqueScale = Math.min(small ? 0.6 : 1, (PLAQUE_MAX * density) / (PLAQUE_W * k));
  // Beside the trunk; a zoomed tree is wider, so the sign moves out too, but stays in the picture.
  const plaqueX = Math.min((small ? 34 : 70) * extra, CANVAS_W / 2 - (PLAQUE_W / 2 + 2) * plaqueScale);
  return (
    <Group transform={[{ scale: k }]}>
      <Group transform={[{ scale: zoom }]}>
        <Kind look={look} progress={stageOf(days).progress} p={palette} seed={hashString(seed)} thirst={dead ? 0 : thirst} ground={ground} />
      </Group>
      {completed && <Plaque x={plaqueX} scale={plaqueScale} />}
    </Group>
  );
}

/** Golden sign with a star beside the trunk. */
function Plaque({ x, scale }: { x: number; scale: number }) {
  return (
    <Group transform={[{ translateX: x }, { scale }]}>
      <Path path="M-3 0 L-3 -34 L3 -34 L3 0 Z" color="#8A6A3B" />
      <Path path="M-26 -66 H26 A6 6 0 0 1 32 -60 V-34 A6 6 0 0 1 26 -28 H-26 A6 6 0 0 1 -32 -34 V-60 A6 6 0 0 1 -26 -66 Z" color="#F4C542" />
      <Path path="M-26 -66 H26 A6 6 0 0 1 32 -60 V-34 A6 6 0 0 1 26 -28 H-26 A6 6 0 0 1 -32 -34 V-60 A6 6 0 0 1 -26 -66 Z" style="stroke" strokeWidth={3} color="#B8860B" />
      <Path path="M0 -60 L4 -51 L14 -50 L6 -44 L9 -34 L0 -40 L-9 -34 L-6 -44 L-14 -50 L-4 -51 Z" color="#FFF6C8" />
    </Group>
  );
}

// Snapshots for small trees (forest cards). A browser allows only ~16 live drawing
// surfaces per page, so a forest of live canvases would go blank; a picture drawn
// once in memory and shown as an image has no such limit.

/** Gives Skia's memory back. On the web a surface Skia could not make is an empty wrapper whose dispose throws. */
function free(object: { dispose(): void } | null | undefined) {
  try {
    object?.dispose();
  } catch {
    // Nothing was allocated.
  }
}

async function draw(props: TreeArtProps): Promise<string> {
  const scale = Math.min(PixelRatio.get(), 2);
  const w = Math.round(props.size * scale);
  const h = Math.round((props.size * scale * CANVAS_H) / CANVAS_W);
  // Skia has no surface for an empty picture (a place not measured yet).
  if (!(w > 0 && h > 0)) throw new Error(`No room for the picture: size ${props.size}`);
  const picture = await drawAsPicture(<TreeScene {...props} size={props.size * scale} density={scale} />, Skia.XYWHRect(0, 0, w, h));
  const surface = Skia.Surface.Make(w, h);
  // Skia's memory is not freed by the browser on its own: give it back right away.
  // These objects are ours alone, no canvas on screen draws them.
  try {
    if (!surface) throw new Error('Could not make a drawing surface');
    surface.getCanvas().drawPicture(picture);
    surface.flush();
    const image = surface.makeImageSnapshot();
    try {
      return `data:image/png;base64,${image.encodeToBase64()}`;
    } finally {
      free(image);
    }
  } finally {
    free(surface);
    free(picture);
  }
}

// Pictures are drawn one after another, a few per frame (thumbQueue.ts): pictures on
// screen go before warm-ups, and a picture whose thumb left the screen is not drawn.
const nextFrame = () =>
  new Promise<void>((resolve) => {
    // Right after the next paint.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
    else setTimeout(resolve, 16);
  });

const queue = makeThumbQueue<TreeArtProps>({ draw, nextFrame, now: () => Date.now(), budget: 8, deliverGap: 120 });
const snapshots = queue.ready;

const thumbKey = ({ days, dead, completed, palette, size, skin, seed, thirsty, night, fill, ground }: TreeArtProps) =>
  // The ground color tells the meadow apart (theme.ts paletteFor): each meadow has its own earth under the trees.
  [days, !!dead, !!completed, palette.dark, palette.ground, size, skin ?? 'oak', seed ?? '', !!thirsty, !!night, fill ?? 0, ground ?? true].join('|');

const hasRoom = (size: number) => size > 0 && Number.isFinite(size);

/** Draws a TreeThumb's picture ahead of time, so the thumb shows it at once. */
export function warmThumb(props: TreeArtProps): Promise<void> {
  const key = thumbKey(props);
  if (snapshots.has(key) || !hasRoom(props.size)) return Promise.resolve();
  return queue.warm(key, props).then(() => undefined);
}

/**
 * The same tree as a picture: cheap to show many at once. `onReady` fires once the picture is shown.
 * `placeholder`: until the picture is drawn a soft patch of earth stands in its place (none
 * with `ground: false`), then the tree fades in (160 ms); a picture drawn ahead (`warmThumb`) shows at once.
 */
export function TreeThumb({ onReady, placeholder = false, ...props }: TreeArtProps & { onReady?: () => void; placeholder?: boolean }) {
  const { size } = props;
  const key = thumbKey(props);
  const [uri, setUri] = useState(() => snapshots.get(key));
  const uriRef = useRef(uri);
  uriRef.current = uri;
  const [instant] = useState(() => !placeholder || snapshots.has(key));
  const shown = useSharedValue(instant ? 1 : 0);
  useEffect(() => {
    const ready = snapshots.get(key);
    if (ready) {
      if (ready !== uriRef.current) setUri(ready);
      return;
    }
    if (!hasRoom(size)) return;
    let live = true;
    const ticket = queue.request(key, props);
    ticket.promise.then(
      (u) => live && setUri(u),
      (error) => live && !(error instanceof Dropped) && console.warn('Could not draw tree', error),
    );
    return () => {
      live = false;
      // Off screen: nobody else waiting, the picture is not drawn.
      ticket.release();
    };
    // The key covers everything that changes the picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    if (!uri) return;
    onReadyRef.current?.();
    if (!instant) shown.set(withTiming(1, { duration: motion.fast, easing: motion.ease.out }));
  }, [uri, instant, shown]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  // The tree brings its own patch of earth: the stand-in one goes as the tree comes.
  const patchStyle = useAnimatedStyle(() => ({ opacity: 1 - shown.get() }));

  const style = { width: size, height: (size * CANVAS_H) / CANVAS_W };
  const image = uri ? <Image source={{ uri }} style={style} /> : null;
  if (!placeholder) return image ?? <View style={style} />;
  const k = size / CANVAS_W;
  return (
    <View style={style}>
      {/* Without its own earth (the forest map) the ground under it already has a hole: no patch over it. */}
      {!instant && props.ground !== false && (
        <Animated.View
          style={[
            styles.patch,
            {
              width: size * 0.4,
              height: size * 0.07,
              left: size * 0.3,
              top: BASE_Y * k - size * 0.035,
            },
            patchStyle,
          ]}
        >
          <SoftPatch color={props.palette.dark ? 'rgba(12,10,48,0.3)' : 'rgba(122,86,38,0.3)'} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      {image && <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]}>{image}</Animated.View>}
    </View>
  );
}

const styles = StyleSheet.create({
  patch: { position: 'absolute' },
});
