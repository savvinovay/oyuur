// The ground of the main screen: far mountains, hills, a strip of forest, pale bushes,
// the meadow, three rows of grass with flowers and thick grass in the foreground right
// above the bottom sheet, going on under it to the bottom of the screen (the sheet can be
// pulled lower than the place the scene is laid out for); fireflies at night. One Skia
// canvas from a little above the horizon to the bottom of the screen.
// Each layer slides by its own share of the width per habit (parallax), so a swipe
// feels like a camera passing along the meadow. All motion reads shared values on
// the UI thread; React does not re-render while anything moves.
// Its colors, flowers and weather come from the meadow the player has put on (themes.ts).
import { Canvas, Circle, Group, LinearGradient, Path, Rect, Skia, SkPath, SkPathBuilder, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Easing, interpolateColor, SharedValue, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { SceneGeo, Wind } from '../scene/contract';
import { fireflyCore, fireflyGlow, MeadowColors, NIGHT_FLOWER_ALPHA } from './colors';
import {
  blink, bushes, farForest, Firefly, fireflies, frontRows, GRASS_ROWS, GRASS_TILE, HILLS, MOUNTAINS, PERIOD, ridge,
  ridgeMax, seeded, tufts, underRows, wrap,
} from './hills';
import { MeadowTheme } from './themes';
import { useMeadow } from './useMeadow';
import { WeatherLayer } from './WeatherLayer';

/** The canvas starts this far above the horizon (room for the mountains). */
export const MEADOW_ABOVE = 110;

// Shift per habit of camera, share of the width (spec 6.1).
const PARALLAX = { mountains: 0.04, hills: 0.08, forest: 0.11, bushes: 0.14, fireflies: 0.3 };

interface Props {
  geo: SceneGeo;
  night: boolean;
  animations: boolean;
  cameraX: SharedValue<number>;
  wind: Wind;
}

export function Meadow({ geo, night, animations, cameraX, wind }: Props) {
  const { theme } = useMeadow();
  const { height: screenH } = useWindowDimensions();
  const W = geo.width;
  const top = geo.horizonY - MEADOW_ABOVE;
  // Down to the bottom of the screen: the meadow goes on under the bottom sheet.
  const bottom = Math.max(screenH, geo.height + 60);

  // 0 by day, 1 by night; colors blend over 0.9 s, like the sky.
  const nightness = useSharedValue(night ? 1 : 0);
  useEffect(() => {
    nightness.value = animations
      ? withTiming(night ? 1 : 0, { duration: 900, easing: Easing.inOut(Easing.cubic) })
      : night ? 1 : 0;
  }, [night, animations, nightness]);
  const c = useColors(nightness, theme);

  /** Layer shift in px for a parallax share; still when animations are off. */
  const shift = (cam: number, share: number) => {
    'worklet';
    return [{ translateX: -wrap((animations ? cam : 0) * share * W, PERIOD) }];
  };
  // Each reads cameraX itself, so the layer follows it (see useColors).
  const mountainsMove = useDerivedValue(() => shift(cameraX.value, PARALLAX.mountains));
  const hillsMove = useDerivedValue(() => shift(cameraX.value, PARALLAX.hills));
  const forestMove = useDerivedValue(() => shift(cameraX.value, PARALLAX.forest));
  const bushesMove = useDerivedValue(() => shift(cameraX.value, PARALLAX.bushes));

  const shapes = useMemo(() => buildLandscape(geo, bottom), [geo, bottom]);
  const grass = useMemo(() => buildGrass(geo, bottom, theme), [geo, bottom, theme]);
  // Snow caps fade away with the day.
  const capsAlpha = useDerivedValue(() => 0.7 * (1 - nightness.value));
  const weatherBox = useMemo(
    () => ({ width: W, top: 0, grassY: geo.height - 24, bottom: geo.height, horizonY: geo.horizonY }),
    [W, geo.height, geo.horizonY],
  );

  const mountainsBase = geo.horizonY - 8;
  const hillsBase = geo.horizonY + 2;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top }]}>
      <Canvas style={{ width: W, height: bottom - top }}>
        <Group transform={[{ translateY: -top }]}>
          <Group transform={mountainsMove}>
            <Path path={shapes.mountains}>
              <LinearGradient
                start={vec(0, mountainsBase - ridgeMax(MOUNTAINS))}
                end={vec(0, mountainsBase)}
                colors={c.mountains}
              />
            </Path>
            {theme.snowCaps && (
              // Winter by day: the mountains white again, all but their foot (spec 10.3).
              <Group clip={Skia.XYWHRect(0, top, PERIOD + W + 8, mountainsBase - 12 - top)} opacity={capsAlpha}>
                <Path path={shapes.mountains} color="#FFFFFF" />
              </Group>
            )}
          </Group>
          <Group transform={hillsMove}>
            <Path path={shapes.hills}>
              <LinearGradient start={vec(0, hillsBase - ridgeMax(HILLS))} end={vec(0, hillsBase)} colors={c.hills} />
            </Path>
          </Group>
          {/* The haze softens the mountains and hills; the forest and bushes stand in front of it. */}
          <Rect x={0} y={geo.horizonY - 32} width={W} height={32}>
            <LinearGradient start={vec(0, geo.horizonY - 32)} end={vec(0, geo.horizonY)} colors={c.haze} />
          </Rect>
          <Group transform={forestMove}>
            <Path path={shapes.forest} color={c.forest} />
          </Group>
          <Group transform={bushesMove}>
            <Path path={shapes.bushes} color={c.bushes} />
          </Group>
          <Rect x={0} y={geo.horizonY} width={W} height={bottom - geo.horizonY}>
            <LinearGradient
              start={vec(0, geo.horizonY)}
              end={vec(0, bottom)}
              colors={c.meadow}
              positions={[0, 0.22, 0.5, 1]}
            />
          </Rect>
          {/* The ground gets richer toward the viewer, under the thick front grass. */}
          <Rect x={0} y={geo.height - 140} width={W} height={bottom - geo.height + 140}>
            <LinearGradient start={vec(0, geo.height - 140)} end={vec(0, geo.height)} colors={c.frontShade} />
          </Rect>
          {/* Under the sheet the ground is grass too, down to the bottom (the mat of the front
              grass sways, so this still strip starts under it). */}
          <Rect x={0} y={geo.height + 20} width={W} height={bottom - geo.height - 20} color={c.front0} />
          {grass.map((row, r) => (
            <GrassRowLayer key={r} row={row} rowIndex={r} c={c} nightness={nightness} {...{ animations, cameraX, wind, W }} />
          ))}
          {theme.weather && <WeatherLayer kind={theme.weather} night={night} box={weatherBox} t={wind.t} />}
          {night &&
            shapes.fireflies.map((f, i) => (
              <FireflyDot key={i} f={f} geo={geo} animations={animations} cameraX={cameraX} wind={wind} nightness={nightness} />
            ))}
        </Group>
      </Canvas>
    </View>
  );
}

type Colors = ReturnType<typeof useColors>;

/** Every meadow color as a shared value that follows day ↔ night. */
function useColors(n: SharedValue<number>, theme: MeadowTheme) {
  // Each derived value reads `n` itself: a shared value read only inside a helper
  // is not tracked, and the color would never update.
  const day = theme.meadow.day;
  const night = theme.meadow.night;
  const mix = (v: number, key: keyof MeadowColors, i = 0) => {
    'worklet';
    const d = day[key];
    const k = night[key];
    const from = (Array.isArray(d) ? d[i] : d) as string;
    const to = (Array.isArray(k) ? k[i] : k) as string;
    return interpolateColor(v, [0, 1], [from, to]);
  };
  return {
    mountains: useDerivedValue(() => [mix(n.value, 'mountainsTop'), mix(n.value, 'mountainsBottom')]),
    hills: useDerivedValue(() => [mix(n.value, 'hillsTop'), mix(n.value, 'hillsBottom')]),
    forest: useDerivedValue(() => mix(n.value, 'forest')),
    bushes: useDerivedValue(() => mix(n.value, 'bushes')),
    meadow: useDerivedValue(() => {
      const v = n.value;
      return [mix(v, 'meadow', 0), mix(v, 'meadow', 1), mix(v, 'meadow', 2), mix(v, 'meadow', 3)];
    }),
    haze: useDerivedValue(() => {
      const h = mix(n.value, 'haze');
      return [withAlpha(h, 0), withAlpha(h, 0.55)];
    }),
    grass0: useDerivedValue(() => mix(n.value, 'grass', 0)),
    grass1: useDerivedValue(() => mix(n.value, 'grass', 1)),
    front0: useDerivedValue(() => mix(n.value, 'frontGrass', 0)),
    front1: useDerivedValue(() => mix(n.value, 'frontGrass', 1)),
    frontShade: useDerivedValue(() => {
      const g = mix(n.value, 'frontGrass', 1);
      return [withAlpha(g, 0), withAlpha(g, 0.5)];
    }),
    flower0: useDerivedValue(() => mix(n.value, 'flowers', 0)),
    flower1: useDerivedValue(() => mix(n.value, 'flowers', 1)),
    flower2: useDerivedValue(() => mix(n.value, 'flowers', 2)),
    flower3: useDerivedValue(() => mix(n.value, 'flowers', 3)),
    heart: useDerivedValue(() => mix(n.value, 'flowerHeart')),
  };
}

/** 'rgba(r, g, b, a)' or '#rrggbb' with a new alpha. */
function withAlpha(color: string, alpha: number): string {
  'worklet';
  if (color.startsWith('#')) {
    const v = parseInt(color.slice(1, 7), 16);
    return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
  }
  const parts = color.slice(color.indexOf('(') + 1, color.indexOf(')')).split(',');
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}

/** Mountains, hills, forest and bushes as paths a little wider than one period. */
function buildLandscape(geo: SceneGeo, bottom: number) {
  const W = geo.width;
  const span = PERIOD + W + 8;

  const silhouette = (waves: typeof MOUNTAINS, base: number, floor: number) => {
    const p = Skia.PathBuilder.Make();
    p.moveTo(0, floor);
    for (let x = 0; x <= span; x += 4) p.lineTo(x, base - ridge(x, waves));
    p.lineTo(span, floor);
    p.close();
    return p.detach();
  };
  const mountains = silhouette(MOUNTAINS, geo.horizonY - 8, geo.horizonY + 6);
  const hills = silhouette(HILLS, geo.horizonY + 2, geo.horizonY + 8);

  // Far forest: groups of round crowns and firs on the horizon, repeated every period.
  const forest = Skia.PathBuilder.Make();
  const base = geo.horizonY + 2;
  for (const copy of [0, PERIOD]) {
    for (const t of farForest()) {
      const x = t.x + copy;
      if (x - t.w / 2 > span) continue;
      if (t.kind === 'fir') {
        forest.moveTo(x - t.w / 2, base);
        forest.lineTo(x, base - t.h);
        forest.lineTo(x + t.w / 2, base);
        forest.close();
      } else {
        forest.addRRect(Skia.RRectXY(Skia.XYWHRect(x - t.w / 2, base - t.h, t.w, t.h), t.w / 2, t.w / 2));
      }
    }
  }
  // A low strip joins the feet of the trees to the meadow.
  forest.addRect(Skia.XYWHRect(0, base - 1, span, 4));

  // Pale bushes: three overlapping circles each, repeated every period.
  const bush = Skia.PathBuilder.Make();
  const y = geo.horizonY + 6;
  for (const copy of [0, PERIOD]) {
    for (const b of bushes()) {
      const x = b.x + copy;
      if (x > span + 20) continue;
      const s = b.scale;
      bush.addCircle(x - 10 * s, y, 8 * s);
      bush.addCircle(x, y - 5 * s, 10 * s);
      bush.addCircle(x + 10 * s, y, 8 * s);
    }
  }

  return { mountains, hills, forest: forest.detach(), bushes: bush.detach(), fireflies: fireflies(), bottom };
}

interface Band {
  /** Sways around this line (screen y). */
  pivot: number;
  blades: [SkPath, SkPath];
  petals: [SkPath, SkPath, SkPath, SkPath];
  hearts: SkPath;
}

interface BuiltRow {
  alpha: number;
  parallax: number;
  /** The thick grass in the foreground: its own colors, a stronger sway. */
  front: boolean;
  /** Thick grass under the sheet: lighter blades, so they read on the dark mat. */
  under: boolean;
  bands: Band[];
}

/** Grass rows split into bands; each band holds two tiles of tufts side by side. */
function buildGrass(geo: SceneGeo, bottom: number, theme: MeadowTheme): BuiltRow[] {
  const tiles = Math.ceil((geo.width + GRASS_TILE) / GRASS_TILE);
  const rowBottom = geo.height + 6 - geo.horizonY;
  const front = frontRows(geo.height - geo.horizonY);
  const under = underRows(geo.height - geo.horizonY, bottom - geo.horizonY);
  // A meadow has more or fewer flowers (themes.ts); never a flower on every tuft.
  const rows = [...GRASS_ROWS, ...front, ...under].map((row) => ({ ...row, flowers: Math.min(0.95, row.flowers * theme.flowers) }));
  // Autumn: some of the "flowers" are maple leaves lying in the grass.
  const leafy = seeded(907);
  return rows.map((row, r) => {
    const to = row.to ?? rowBottom;
    const list = tufts(row, r, rowBottom);
    const make = () => Skia.PathBuilder.Make();
    const builders = Array.from({ length: row.bands }, () => ({
      blades: [make(), make()],
      petals: [make(), make(), make(), make()],
      hearts: make(),
    }));
    for (const t of list) {
      const b = Math.min(Math.floor(((t.y - row.from) / (to - row.from)) * row.bands), row.bands - 1);
      const band = builders[b];
      // Decided once per tuft: every copy of the tile must be the same, or the wrap would show.
      const leaf = t.flower >= 0 && theme.leafFlowers > 0 && leafy() < theme.leafFlowers ? leafy() * 360 : null;
      for (let k = 0; k < tiles; k++) {
        const x = t.x + k * GRASS_TILE;
        const y = geo.horizonY + t.y;
        addTuft(band.blades[t.shade], x, y, t.h, t.lean);
        if (t.flower < 0) continue;
        const fx = x + t.h * 0.45 + 1.5;
        const fy = y - t.h * 0.8;
        if (leaf !== null) addFallenLeaf(band.petals[t.flower], fx, fy + t.h * 0.6, row.flowerR * 1.9, leaf);
        else addFlower(band.petals[t.flower], theme.hearts ? band.hearts : null, fx, fy, row.flowerR);
      }
    }
    // Under the first foreground row: a solid mat of grass with a wavy top, so the strip
    // reads as thick grass, not single tufts (the wave repeats every tile).
    if (r === GRASS_ROWS.length) {
      const mat = builders[0].blades[0];
      const top = geo.horizonY + to - 6;
      for (let k = 0; k < tiles; k++) {
        const x0 = k * GRASS_TILE;
        mat.moveTo(x0, top + 60);
        for (let x = 0; x <= GRASS_TILE; x += 5) mat.lineTo(x0 + x, top + 3 * Math.sin((2 * Math.PI * x) / 95));
        mat.lineTo(x0 + GRASS_TILE, top + 60);
        mat.close();
      }
    }
    const bands: Band[] = builders.map((band, b) => ({
      pivot: geo.horizonY + row.from + ((to - row.from) * (b + 1)) / row.bands,
      blades: [band.blades[0].detach(), band.blades[1].detach()],
      petals: [band.petals[0].detach(), band.petals[1].detach(), band.petals[2].detach(), band.petals[3].detach()],
      hearts: band.hearts.detach(),
    }));
    const isUnder = r >= GRASS_ROWS.length + front.length;
    return { alpha: row.alpha, parallax: row.parallax, front: r >= GRASS_ROWS.length, under: isUnder, bands };
  });
}

/** Three blades from one foot: a short one to the left, a tall one, one to the right. */
function addTuft(p: SkPathBuilder, x: number, y: number, h: number, lean: number) {
  const blades: [number, number][] = [[-1, 0.68], [0, 1], [1, 0.8]];
  for (const [j, k] of blades) {
    const bx = x + j * h * 0.16;
    const tipX = x + j * h * 0.42 + lean * h;
    const tipY = y - h * k;
    const w = 0.55 + h * 0.07;
    const bend = (tipX - bx) * 0.25;
    p.moveTo(bx - w, y);
    p.quadTo(bx - w * 0.2 + bend, y - h * k * 0.55, tipX, tipY);
    p.quadTo(bx + w * 0.2 + bend, y - h * k * 0.55, bx + w, y);
    p.close();
  }
}

/** Right half of a maple leaf one unit long (stalk at 0, tip at −1); a pair is a line, four a curve. */
const MAPLE_HALF: number[][] = [[0.10, -0.22], [0.42, -0.20], [0.30, -0.30, 0.26, -0.38], [0.52, -0.60], [0.32, -0.58, 0.18, -0.62], [0, -1]];

/** A maple leaf `len` long lying in the grass, turned by `angle` degrees. */
function addFallenLeaf(p: SkPathBuilder, x: number, y: number, len: number, angle: number) {
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  // Seen from low above: flattened.
  const sin = Math.sin(a);
  const at = (px: number, py: number): [number, number] => [x + (px * cos - py * sin) * len, y + (px * sin + py * cos) * len * 0.55];
  for (const side of [1, -1]) {
    p.moveTo(...at(0, -0.16));
    for (const q of MAPLE_HALF) {
      if (q.length === 4) p.quadTo(...at(side * q[0], q[1]), ...at(side * q[2], q[3]));
      else p.lineTo(...at(side * q[0], q[1]));
    }
    p.close();
  }
}

/** A tiny flower: a dot far away, five petals and a heart up close (no heart on a winter meadow). */
function addFlower(petals: SkPathBuilder, hearts: SkPathBuilder | null, x: number, y: number, r: number) {
  if (r < 1.8) {
    petals.addCircle(x, y, r);
    return;
  }
  for (let i = 0; i < 5; i++) {
    const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
    petals.addCircle(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55);
  }
  hearts?.addCircle(x, y, r * 0.38);
}

interface RowProps {
  row: BuiltRow;
  rowIndex: number;
  c: Colors;
  nightness: SharedValue<number>;
  animations: boolean;
  cameraX: SharedValue<number>;
  wind: Wind;
  W: number;
}

function GrassRowLayer({ row, rowIndex, c, nightness, animations, cameraX, wind, W }: RowProps) {
  // The row leans with the wind, stronger in a gust; straight when animations are off.
  // Grass up close sways a little more.
  const strength = row.front ? 1.3 : 1;
  const lean = useDerivedValue(() => {
    if (!animations) return 0;
    return strength * (0.04 + 0.1 * wind.gust.value) * Math.sin((2 * Math.PI * wind.t.value) / 2.2 + rowIndex * 0.4);
  });
  const shiftX = useDerivedValue(() => -wrap((animations ? cameraX.value : 0) * row.parallax * W, GRASS_TILE));
  // Flowers are dimmer at night.
  const flowerAlpha = useDerivedValue(() => row.alpha * (1 - (1 - NIGHT_FLOWER_ALPHA) * nightness.value));
  return (
    <>
      {row.bands.map((band, b) => (
        <GrassBand
          key={b}
          band={band}
          lean={lean}
          shiftX={shiftX}
          alpha={row.alpha}
          flowerAlpha={flowerAlpha}
          c={c}
          blades={row.under ? [c.front1, c.grass0] : row.front ? [c.front0, c.front1] : [c.grass0, c.grass1]}
        />
      ))}
    </>
  );
}

function GrassBand({ band, lean, shiftX, alpha, flowerAlpha, c, blades }: {
  band: Band;
  lean: SharedValue<number>;
  shiftX: SharedValue<number>;
  alpha: number;
  flowerAlpha: SharedValue<number>;
  c: Colors;
  /** Colors of the two blade shades. */
  blades: [SharedValue<string>, SharedValue<string>];
}) {
  // Slide with the camera, then shear around the band's bottom line: feet stay, tips sway.
  const transform = useDerivedValue(() => [
    { translateX: shiftX.value },
    { translateY: band.pivot },
    { skewX: lean.value },
    { translateY: -band.pivot },
  ]);
  return (
    <Group transform={transform}>
      <Path path={band.blades[0]} color={blades[0]} opacity={alpha} />
      <Path path={band.blades[1]} color={blades[1]} opacity={alpha} />
      <Path path={band.petals[0]} color={c.flower0} opacity={flowerAlpha} />
      <Path path={band.petals[1]} color={c.flower1} opacity={flowerAlpha} />
      <Path path={band.petals[2]} color={c.flower2} opacity={flowerAlpha} />
      <Path path={band.petals[3]} color={c.flower3} opacity={flowerAlpha} />
      <Path path={band.hearts} color={c.heart} opacity={flowerAlpha} />
    </Group>
  );
}

function FireflyDot({ f, geo, animations, cameraX, wind, nightness }: {
  f: Firefly;
  geo: SceneGeo;
  animations: boolean;
  cameraX: SharedValue<number>;
  wind: Wind;
  nightness: SharedValue<number>;
}) {
  const span = geo.width + 60;
  const cx = useDerivedValue(() => {
    const t = wind.t.value;
    const cam = animations ? cameraX.value : 0;
    return wrap(f.x * span - cam * PARALLAX.fireflies * geo.width + f.ax * Math.sin((2 * Math.PI * t) / f.tx + f.phase), span) - 30;
  });
  const cy = useDerivedValue(
    () => geo.horizonY + f.y + f.ay * Math.sin((2 * Math.PI * wind.t.value) / f.ty + f.phase * 1.7),
  );
  // Blinks while animations are on; otherwise a steady glowing point.
  const opacity = useDerivedValue(() => nightness.value * (animations ? blink(wind.t.value, f.pause, f.phase) : 1));
  return (
    <Group opacity={opacity}>
      <Circle cx={cx} cy={cy} r={7} color={fireflyGlow} />
      <Circle cx={cx} cy={cy} r={2} color={fireflyCore} />
    </Group>
  );
}
