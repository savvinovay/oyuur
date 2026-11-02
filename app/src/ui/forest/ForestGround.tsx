// The ground of the forest map: ONE Skia canvas under the tree pictures (spec 1.3, 8).
// Wild meadow, the plot with its bank, lawn and fence, marks under the trees, rings,
// highlighted cells, dust, fireflies and the vignette. Everything in the world moves with
// one transform read from the camera's shared values; the paths are built once per plot
// size (the bank and fence every frame only while the plot grows).
import {
  BlurMask, Canvas, Circle, DashPathEffect, Fill, Group, Oval, Path, RadialGradient, Rect, Skia, SkPath, Transforms3d, vec,
} from '@shopify/react-native-skia';
import { memo, useEffect, useMemo } from 'react';
import {
  Easing, interpolateColor, SharedValue, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Cell } from '@/game/plot';
import { motion } from '@/ui/ds/tokens';
import { blink, seeded } from '@/ui/meadow/hills';
import { ForestColors, forestDay, forestNight, PlotTheme, themes } from './colors';
import {
  bankPebbles, cellSvg, edgeSvg, ellipseSvg, fenceSvg, GroundTree, lawnSvg, RAIL_W, stumpsSvg, treeHole,
  treeShadow, wildMeadow, wildSvg,
} from './ground';
import { cellCenter, plotBox, plusRadius } from './iso';
import type { TreeMotion } from './model';

const path = (svg: string): SkPath => {
  'worklet';
  return Skia.Path.MakeFromSVGString(svg) ?? Skia.Path.Make();
};

/** Ground colors that blend between day and night (1.4: 900 ms, like the meadow). */
const KEYS = [
  'meadow', 'tuftA', 'tuftB', 'bush', 'bushTop', 'bushShadow', 'stone', 'stoneSide', 'lawnA', 'lawnB', 'lawnTuft', 'lip',
  'bankL', 'bankR', 'bankLine', 'post', 'postSide', 'rail', 'cap', 'shadow', 'lunka', 'plotShadow', 'cloud', 'vignette',
  'stumpBody', 'stumpTop', 'stumpLine', 'dust',
] as const;
type Key = (typeof KEYS)[number];
const NO_CLOUD = 'rgba(40,70,20,0)';
const pick = (c: ForestColors, key: Key) => (key === 'cloud' ? (c.cloud ?? NO_CLOUD) : c[key]);

const FIREFLIES = 14;
/** Cloud shadows: half-sizes, world px, and their drift (1.3). */
const CLOUDS = [{ rx: 160, ry: 70, at: 0.15, y: -0.1 }, { rx: 210, ry: 90, at: 0.7, y: 0.55 }];
const CLOUD_SPEED = 10;
/** Lumps of earth thrown up by a landing tree: direction and size (4.5). */
const LUMPS: [number, number, number][] = [[-28, -4, 4], [24, -3, 4], [-18, 4, 3], [16, 5, 3], [-6, 8, 2.5], [6, -9, 2.5]];
const GOLD_SPARK = '#FFF6C2';
const PLUS_LINE = '#34A64D';

export interface Dust { key: number; x: number; y: number; count: number }
export interface Target { c: number; r: number; kind: 0 | 1 | 2 }

interface Props {
  /** The plot's colors on the meadow the player has put on (colors.ts `themes`); summer by default. */
  theme?: PlotTheme;
  size: number;
  /** Side of the drawn plot: fractional while it grows (5.3). */
  grow: SharedValue<number>;
  night: boolean;
  animations: boolean;
  width: number;
  height: number;
  /** World → screen transform of the camera. */
  matrix: SharedValue<Transforms3d>;
  z: SharedValue<number>;
  clock: SharedValue<number>;
  /** Trees at rest: shadows, holes, stumps. */
  trees: GroundTree[];
  /** Trees in motion: their shadows follow the pictures. */
  moving: { id: string; m: TreeMotion; w: number }[];
  /** The cell a lifted tree came from: its hole stays. */
  home: GroundTree | null;
  /** Many trees far out: stumps go (spec 8). */
  crowded: boolean;
  selected: { x: number; y: number; w: number; on: boolean } | null;
  gold: { key: string; x: number; y: number; w: number; h: number } | null;
  free: { rings: { d: number; path: string }[]; wave: SharedValue<number>; step: number; fade: number } | null;
  plus: Cell[] | null;
  target: SharedValue<Target>;
  dust: Dust[];
  onDustDone: (key: number) => void;
}

export const ForestGround = memo(function ForestGround(p: Props) {
  const { size, night, animations, width, height } = p;
  const theme = p.theme ?? themes.summer;

  const nightness = useSharedValue(night ? 1 : 0);
  useEffect(() => {
    nightness.value = animations ? withTiming(night ? 1 : 0, { duration: motion.scene, easing: Easing.inOut(Easing.cubic) }) : night ? 1 : 0;
  }, [night, animations, nightness]);
  const c = useBlend(nightness, theme);

  const wild = useMemo(() => {
    const svg = wildSvg(wildMeadow(size), 4);
    return {
      tufts: svg.tufts.map(path), flowers: svg.flowers.map(path), bushShadow: path(svg.bushShadow), bush: path(svg.bush),
      bushTop: path(svg.bushTop), stoneSide: path(svg.stoneSide), stone: path(svg.stone),
    };
  }, [size]);
  const lawn = useMemo(() => {
    const svg = lawnSvg(size);
    return { stripes: svg.stripes.map(path), tufts: path(svg.tufts) };
  }, [size]);
  const pebbles = useMemo(() => bankPebbles(size), [size]);
  const grow = p.grow;
  const edge = useDerivedValue(() => {
    const e = edgeSvg(grow.value, size, pebbles);
    return { diamond: path(e.diamond), bankL: path(e.bankL), bankR: path(e.bankR), bankLine: path(e.bankLine), lip: path(e.lip), pebbles: path(e.pebbles) };
  });
  const fence = useDerivedValue(() => {
    const f = fenceSvg(grow.value, size);
    return { rails: path(f.rails), post: path(f.post), postSide: path(f.postSide), cap: path(f.cap) };
  });
  const diamond = useDerivedValue(() => edge.value.diamond);
  const bankL = useDerivedValue(() => edge.value.bankL);
  const bankR = useDerivedValue(() => edge.value.bankR);
  const bankLine = useDerivedValue(() => edge.value.bankLine);
  const lip = useDerivedValue(() => edge.value.lip);
  const stones = useDerivedValue(() => edge.value.pebbles);
  const rails = useDerivedValue(() => fence.value.rails);
  const post = useDerivedValue(() => fence.value.post);
  const postSide = useDerivedValue(() => fence.value.postSide);
  const cap = useDerivedValue(() => fence.value.cap);

  const marks = useMemo(() => {
    const shadows = p.trees.map((t) => treeShadow(t.x, t.y, t.w)).join('');
    const holes = p.trees.map((t) => treeHole(t.x, t.y, t.w)).join('');
    const stumps = stumpsSvg(p.trees);
    return {
      shadows: path(shadows), holes: path(holes), stumpShadow: path(stumps.shadow), stumpBody: path(stumps.body),
      stumpTop: path(stumps.top), stumpRing: path(stumps.ring),
    };
  }, [p.trees]);
  const z = p.z;
  const crowded = p.crowded;
  const stumpsAlpha = useDerivedValue(() => (crowded && z.value < 0.45 ? 0 : 1));
  // Thin lines stay as thin on screen at any zoom.
  const hair = useDerivedValue(() => 1 / z.value);

  const box = plotBox(size);
  const mid = { x: 0, y: (box.top + box.bottom) / 2 };
  const moonR = size * 80 * 0.55;
  const flies = useMemo(() => {
    const rnd = seeded(31 + size);
    return Array.from({ length: FIREFLIES }, () => ({
      x: box.left - 120 + rnd() * (box.right - box.left + 240),
      y: box.top - 160 + rnd() * (box.bottom - box.top + 240),
      pause: 0.5 + rnd() * 2.5,
      phase: rnd() * 10,
    }));
  }, [size, box.left, box.right, box.top, box.bottom]);

  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height }} pointerEvents="none">
      <Fill color={c.meadow} />
      <Group transform={p.matrix}>
        <Path path={wild.tufts[0]} color={c.tuftA} />
        <Path path={wild.tufts[1]} color={c.tuftB} />
        <Flowers paths={wild.flowers} nightness={nightness} theme={theme} />
        <Path path={wild.bushShadow} color={c.bushShadow} />
        <Path path={wild.bush} color={c.bush} />
        <Path path={wild.bushTop} color={c.bushTop} />
        <Path path={wild.stoneSide} color={c.stoneSide} />
        <Path path={wild.stone} color={c.stone} />
        {!night && <Clouds box={box} clock={p.clock} animations={animations} color={theme.day.cloud ?? NO_CLOUD} />}

        <Group transform={[{ translateX: 6 }, { translateY: 19 }]}>
          <Path path={diamond} color={c.plotShadow}>
            <BlurMask blur={12} style="normal" />
          </Path>
        </Group>
        <Path path={bankL} color={c.bankL} />
        <Path path={bankR} color={c.bankR} />
        <Path path={bankLine} color={c.bankLine} style="stroke" strokeWidth={1.2} opacity={0.6} />
        <Path path={stones} color={c.bankLine} opacity={0.35} />
        <Group clip={diamond}>
          <Path path={lawn.stripes[0]} color={c.lawnA} />
          <Path path={lawn.stripes[1]} color={c.lawnB} />
          <Group opacity={nightness}>
            <Group transform={[{ translateX: mid.x }, { translateY: mid.y }, { scaleY: 0.5 }]}>
              <Circle cx={0} cy={0} r={moonR}>
                <RadialGradient c={vec(0, 0)} r={moonR} colors={['rgba(201,199,255,0.22)', 'rgba(201,199,255,0)']} />
              </Circle>
            </Group>
          </Group>
          <Path path={lawn.tufts} color={c.lawnTuft} />
        </Group>
        <Path path={lip} color={c.lip} style="stroke" strokeWidth={2} strokeJoin="round" />

        {p.free && <FreeCells {...p.free} hair={hair} night={night} />}
        <TargetCell target={p.target} hair={hair} />

        <Path path={rails} color={c.rail} style="stroke" strokeWidth={RAIL_W} strokeCap="round" strokeJoin="round" />
        <Path path={post} color={c.post} />
        <Path path={postSide} color={c.postSide} />
        <Path path={cap} color={c.cap} />

        {p.trees.length === 0 && p.moving.length === 0 && <EmptySpot size={size} hair={hair} night={night} />}
        <Path path={marks.shadows} color={c.shadow} />
        <Path path={marks.holes} color={c.lunka} />
        {p.home && <Home tree={p.home} shadow={c.shadow} hole={c.lunka} />}
        {p.moving.map((t) => <MovingShadow key={t.id} m={t.m} w={t.w} color={c.shadow} />)}
        <Group opacity={stumpsAlpha}>
          <Path path={marks.stumpShadow} color={c.shadow} />
          <Path path={marks.stumpBody} color={c.stumpBody} />
          <Path path={marks.stumpBody} color={c.stumpLine} style="stroke" strokeWidth={0.9} />
          <Path path={marks.stumpTop} color={c.stumpTop} />
          <Path path={marks.stumpTop} color={c.stumpLine} style="stroke" strokeWidth={0.9} />
          <Path path={marks.stumpRing} color={c.stumpLine} style="stroke" strokeWidth={0.6} opacity={0.6} />
        </Group>

        <SwapSign target={p.target} hair={hair} />
        {p.selected && <SelectRing {...p.selected} animations={animations} hair={hair} />}
        {p.gold && <GoldRing key={p.gold.key} x={p.gold.x} y={p.gold.y} w={p.gold.w} h={p.gold.h} animations={animations} hair={hair} />}
        {p.plus && <PlusMarks cells={p.plus} z={z} />}
        {p.dust.map((d) => <Puff key={d.key} id={d.key} x={d.x} y={d.y} count={d.count} color={c.dust} onDone={p.onDustDone} />)}
        {night && flies.map((f, i) => <Firefly key={i} {...f} clock={p.clock} nightness={nightness} animations={animations} />)}
      </Group>
      <Vignette width={width} height={height} color={c.vignette} />
    </Canvas>
  );
});

function useBlend(n: SharedValue<number>, theme: PlotTheme) {
  const out = {} as Record<Key, SharedValue<string>>;
  for (const key of KEYS) {
    const day = pick(theme.day, key);
    const dark = pick(theme.night, key);
    // KEYS never changes, so the hooks run in the same order every render.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    out[key] = useDerivedValue(() => interpolateColor(n.value, [0, 1], [day, dark]), [day, dark]);
  }
  return out;
}

function Flowers({ paths, nightness, theme }: { paths: SkPath[]; nightness: SharedValue<number>; theme: PlotTheme }) {
  // By day four colors (a meadow may have fewer: they repeat); by night two pale lilacs, dimmer.
  const colors = paths.map((_, i) => {
    const day = theme.day.flowers[i % theme.day.flowers.length];
    const dark = theme.night.flowers[i % theme.night.flowers.length];
    // One per path, and the paths are always four: the hooks run in the same order.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useDerivedValue(() => interpolateColor(nightness.value, [0, 1], [day, dark]), [day, dark]);
  });
  const alpha = useDerivedValue(() => 1 - (1 - theme.night.flowerAlpha) * nightness.value);
  return (
    <Group opacity={alpha}>
      {paths.map((p, i) => <Path key={i} path={p} color={colors[i]} />)}
    </Group>
  );
}

function Clouds({ box, clock, animations, color }: {
  box: { left: number; right: number; top: number; bottom: number }; clock: SharedValue<number>; animations: boolean;
  /** Middle of a cloud's shadow (ForestColors.cloud). */
  color: string;
}) {
  const span = box.right - box.left + 1400;
  const from = box.left - 700;
  return (
    <>
      {CLOUDS.map((cl, i) => (
        <Cloud key={i} {...cl} from={from} span={span} top={box.top + (box.bottom - box.top) * cl.y} clock={clock} animations={animations} colors={[color, NO_CLOUD]} />
      ))}
    </>
  );
}

/** A cloud shadow is a soft round gradient, not a blurred oval: a blur is the costliest thing to draw, and where it is off (the web, cheap phones) a hard dark oval was left on the grass. */
const CLOUD_STOPS = [0.35, 1];

function Cloud({ rx, ry, at, from, span, top, clock, animations, colors }: {
  colors: string[];
  rx: number; ry: number; at: number; from: number; span: number; top: number; clock: SharedValue<number>; animations: boolean;
}) {
  // Drifts right and comes back from the other side.
  const transform = useDerivedValue(() => {
    const t = animations ? clock.value : 0;
    const raw = at * span + CLOUD_SPEED * t;
    return [{ translateX: from + (((raw % span) + span) % span) }, { translateY: top }, { scaleY: ry / rx }];
  });
  return (
    <Group transform={transform}>
      <Circle cx={0} cy={0} r={rx}>
        <RadialGradient c={vec(0, 0)} r={rx} colors={colors} positions={CLOUD_STOPS} />
      </Circle>
    </Group>
  );
}

function FreeCells({ rings, wave, step, fade, hair, night }: {
  rings: { d: number; path: string }[]; wave: SharedValue<number>; step: number; fade: number; hair: SharedValue<number>; night: boolean;
}) {
  const colors = (night ? forestNight : forestDay).cellFree;
  const width = useDerivedValue(() => 1.6 * hair.value);
  const dash = useDerivedValue(() => [5 * hair.value, 5 * hair.value]);
  return (
    <>
      {rings.map((r) => <FreeRing key={r.d} {...r} wave={wave} step={step} fade={fade} width={width} dash={dash} fill={colors.fill} stroke={colors.stroke} />)}
    </>
  );
}

function FreeRing({ d, path: svg, wave, step, fade, width, dash, fill, stroke }: {
  d: number; path: string; wave: SharedValue<number>; step: number; fade: number; width: SharedValue<number>; dash: SharedValue<number[]>; fill: string; stroke: string;
}) {
  const p = useMemo(() => path(svg), [svg]);
  // A wave from the lifted tree: 12 ms a cell, never later than 300 ms (4.2).
  const delay = Math.min(step * d, 300);
  const opacity = useDerivedValue(() => Math.min(1, Math.max(0, (wave.value - delay) / fade)));
  return (
    <Group opacity={opacity}>
      <Path path={p} color={fill} />
      <Path path={p} color={stroke} style="stroke" strokeWidth={width} strokeJoin="round">
        <DashPathEffect intervals={dash as never} />
      </Path>
    </Group>
  );
}

/** The swap sign on a taken target cell: two arrows, one each way, in a white disc; screen px. */
const SWAP_R = 11;
const SWAP_ARROWS = 'M-5.5 -2.5H5.5M2.5 -5.5L5.5 -2.5L2.5 0.5M5.5 2.5H-5.5M-2.5 -0.5L-5.5 2.5L-2.5 5.5';

function TargetCell({ target, hair }: { target: SharedValue<Target>; hair: SharedValue<number> }) {
  const shape = useDerivedValue(() => (target.value.kind ? path(cellSvg(target.value, 0.92)) : Skia.Path.Make()));
  const color = useDerivedValue(() => (target.value.kind === 2 ? forestDay.cellSwap.color : forestDay.cellTarget.color));
  const width = useDerivedValue(() => forestDay.cellTarget.width * hair.value);
  return (
    <>
      <Path path={shape} color={color} opacity={forestDay.cellTarget.fillAlpha} />
      <Path path={shape} color={color} style="stroke" strokeWidth={width} strokeJoin="round" />
    </>
  );
}

/** "Will swap": over the marks, in front of the squatting tree's feet (pictures never cover what is below the feet). */
function SwapSign({ target, hair }: { target: SharedValue<Target>; hair: SharedValue<number> }) {
  const transform = useDerivedValue(() => {
    const t = target.value;
    const { x, y } = cellCenter(t);
    return [{ translateX: x }, { translateY: y + CELL_FRONT }, { scale: hair.value }];
  });
  const opacity = useDerivedValue(() => (target.value.kind === 2 ? 1 : 0));
  return (
    <Group transform={transform} opacity={opacity}>
      <Circle cx={0} cy={0} r={SWAP_R} color="rgba(255,255,255,0.95)" />
      <Path path={SWAP_ARROWS} color={forestDay.cellSwap.color} style="stroke" strokeWidth={1.8} strokeCap="round" strokeJoin="round" />
    </Group>
  );
}

/** The swap sign stands this far in front of the feet, world px: inside the cell's front half. */
const CELL_FRONT = 11;

function Home({ tree, shadow, hole }: { tree: GroundTree; shadow: SharedValue<string>; hole: SharedValue<string> }) {
  // The lifted tree's cell keeps its hole and a smaller, paler shadow (4.2).
  const s = useMemo(() => path(treeShadow(tree.x, tree.y, tree.w, 0.7)), [tree]);
  const h = useMemo(() => path(treeHole(tree.x, tree.y, tree.w)), [tree]);
  return (
    <>
      <Path path={s} color={shadow} opacity={0.6} />
      <Path path={h} color={hole} opacity={0.7} />
    </>
  );
}

/** A tree lifted this high (world px) casts its widest, palest shadow. */
const HIGH = 28;

function MovingShadow({ m, w, color }: { m: TreeMotion; w: number; color: SharedValue<string> }) {
  // The higher the tree, the wider, softer and paler its shadow: it is up in the air.
  const up = useDerivedValue(() => Math.min(1, Math.max(0, m.lift.value / HIGH)));
  const shape = useDerivedValue(() => path(treeShadow(m.px.value, m.py.value, w, 1 + 0.35 * up.value)));
  const blur = useDerivedValue(() => 4 * up.value);
  const opacity = useDerivedValue(() => (0.9 - 0.45 * up.value) * m.alpha.value);
  return (
    <Path path={shape} color={color} opacity={opacity}>
      <BlurMask blur={blur} style="normal" />
    </Path>
  );
}

/** An empty plot: a dashed hole in the middle, where the first tree will grow (spec 7). */
function EmptySpot({ size, hair, night }: { size: number; hair: SharedValue<number>; night: boolean }) {
  const { x, y } = cellCenter({ c: (size - 1) / 2, r: (size - 1) / 2 });
  const colors = (night ? forestNight : forestDay).cellFree;
  const width = useDerivedValue(() => 2 * hair.value);
  const dash = useDerivedValue(() => [6 * hair.value, 6 * hair.value]);
  return (
    <>
      <Oval x={x - 26} y={y - 11} width={52} height={22} color={(night ? forestNight : forestDay).lunka} opacity={0.5} />
      <Oval x={x - 26} y={y - 11} width={52} height={22} color={colors.stroke} style="stroke" strokeWidth={width}>
        <DashPathEffect intervals={dash as never} />
      </Oval>
    </>
  );
}

function SelectRing({ x, y, w, on, animations, hair }: { x: number; y: number; w: number; on: boolean; animations: boolean; hair: SharedValue<number> }) {
  const rx = Math.max(30, 0.45 * w);
  const ry = 0.44 * rx;
  const scale = useSharedValue(animations ? 0.6 : 1);
  const alpha = useSharedValue(0);
  useEffect(() => {
    if (!on) {
      alpha.value = withTiming(0, { duration: motion.still });
      return;
    }
    if (!animations) {
      scale.value = 1;
      alpha.value = withTiming(1, { duration: motion.still });
      return;
    }
    // Pops in, then breathes.
    scale.value = 0.6;
    alpha.value = withTiming(1, { duration: motion.fast });
    scale.value = withSequence(
      withSpring(1, motion.spring.pop),
      withRepeat(withTiming(1.06, { duration: 800, easing: motion.ease.inOut }), -1, true),
    );
  }, [on, x, y, animations, scale, alpha]);
  const transform = useDerivedValue(() => [{ translateX: x }, { translateY: y }, { scale: scale.value }]);
  const width = useDerivedValue(() => forestDay.ringSel.width * hair.value);
  return (
    <Group transform={transform} opacity={alpha}>
      <Oval x={-rx} y={-ry} width={rx * 2} height={ry * 2} color={forestDay.ringSel.fill} />
      <Oval x={-rx} y={-ry} width={rx * 2} height={ry * 2} color={forestDay.ringSel.stroke} style="stroke" strokeWidth={width} />
    </Group>
  );
}

function GoldRing({ x, y, w, h, animations, hair }: { x: number; y: number; w: number; h: number; animations: boolean; hair: SharedValue<number> }) {
  const g = forestDay.ringGold;
  const rx = Math.max(34, 0.45 * w);
  const ry = 0.44 * rx;
  const alpha = useSharedValue(0);
  const sparks = useSharedValue(0);
  useEffect(() => {
    if (!animations) {
      // Stands 4 s and fades, no pulse, no sparks (spec 9).
      alpha.value = withSequence(withTiming(1, { duration: motion.fast }), withDelay(4000, withTiming(0, { duration: 400 })));
      return;
    }
    // Appears, pulses three times, stands 2 s and fades (5.4).
    alpha.value = withSequence(
      withTiming(1, { duration: 200 }),
      withRepeat(withSequence(withTiming(0.5, { duration: 450 }), withTiming(1, { duration: 450 })), 3),
      withDelay(2000, withTiming(0, { duration: 400 })),
    );
    sparks.value = withTiming(1, { duration: 600 + 70 * 7, easing: Easing.linear });
  }, [animations, alpha, sparks]);
  const width = useDerivedValue(() => g.width * hair.value);
  return (
    <Group transform={[{ translateX: x }, { translateY: y }]}>
      <Group opacity={alpha}>
        <Group transform={[{ scaleY: 36 / 70 }]}>
          <Circle cx={0} cy={0} r={rx * 2}>
            <RadialGradient c={vec(0, 0)} r={rx * 2} colors={['rgba(255,231,160,0.75)', 'rgba(255,231,160,0)']} />
          </Circle>
        </Group>
        <Oval x={-rx} y={-ry} width={rx * 2} height={ry * 2} color={g.fill} />
        <Oval x={-rx} y={-ry} width={rx * 2} height={ry * 2} color={g.stroke} style="stroke" strokeWidth={width} />
      </Group>
      {animations && Array.from({ length: 8 }, (_, i) => <Spark key={i} i={i} w={w} h={h} t={sparks} />)}
    </Group>
  );
}

/** A four-pointed golden spark around the crown: grows and goes in 600 ms, 70 ms after the one before. */
function Spark({ i, w, h, t }: { i: number; w: number; h: number; t: SharedValue<number> }) {
  const a = (i * Math.PI) / 4 + 0.3;
  const x = Math.cos(a) * (0.55 * w + 10);
  const y = -0.55 * h + Math.sin(a) * (0.45 * h + 10);
  const size = 4 + ((i * 5) % 6);
  const total = 600 + 70 * 7;
  const transform = useDerivedValue(() => {
    const local = (t.value * total - 70 * i) / 600;
    const k = local <= 0 || local >= 1 ? 0 : Math.sin(Math.PI * local);
    return [{ translateX: x }, { translateY: y }, { scale: Math.max(0.001, k * size) }];
  });
  return (
    <Group transform={transform}>
      <Path path="M0 -1 Q 0.16 -0.16 1 0 Q 0.16 0.16 0 1 Q -0.16 0.16 -1 0 Q -0.16 -0.16 0 -1Z" color={GOLD_SPARK} />
    </Group>
  );
}

/** "+" marks while choosing a spot (4.7): a 24 px circle, a 10 px cross, the same size on screen at any zoom;
 * smaller when the cells are small, so neighbouring marks never touch (iso.ts `plusRadius`). */
const PLUS_ARM = 5 / 12;
/** The marks are rebuilt only when the zoom has moved this much (×), not every frame of a pinch. */
const PLUS_STEP = 1.06;

/** "+" on every free cell while choosing a spot (4.7). */
function PlusMarks({ cells, z }: { cells: Cell[]; z: SharedValue<number> }) {
  const centers = useMemo(() => cells.map((cell) => cellCenter(cell)), [cells]);
  // The zoom in steps of 6 %: within a step the marks keep their paths.
  const stepZ = useDerivedValue(() => Math.pow(PLUS_STEP, Math.round(Math.log(z.value) / Math.log(PLUS_STEP))));
  const marks = useDerivedValue(() => {
    const k = 1 / stepZ.value;
    const r = plusRadius(stepZ.value);
    let dots = '';
    let lines = '';
    for (let i = 0; i < centers.length; i++) {
      const { x, y } = centers[i];
      dots += ellipseSvg(x, y, r * k, r * k);
      const a = r * PLUS_ARM * k;
      lines += `M${x - a} ${y}L${x + a} ${y}M${x} ${y - a}L${x} ${y + a}`;
    }
    return { dots: path(dots), lines: path(lines) };
  });
  const dots = useDerivedValue(() => marks.value.dots);
  const lines = useDerivedValue(() => marks.value.lines);
  const width = useDerivedValue(() => 2.4 / stepZ.value);
  return (
    <>
      <Path path={dots} color="rgba(255,255,255,0.92)" />
      <Path path={lines} color={PLUS_LINE} style="stroke" strokeWidth={width} strokeCap="round" />
    </>
  );
}

/** Lumps of earth fly out from the feet and fade: 380 ms (4.5). */
function Puff({ x, y, count, color, onDone, id }: { x: number; y: number; count: number; color: SharedValue<string>; onDone: (key: number) => void; id: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 380, easing: motion.ease.out });
    const done = setTimeout(() => onDone(id), 420);
    return () => clearTimeout(done);
  }, [t, id, onDone]);
  const shape = useDerivedValue(() => {
    let d = '';
    for (let i = 0; i < count; i++) {
      const [dx, dy, r] = LUMPS[i % LUMPS.length];
      // 18…30 px out: the lumps start at the feet.
      const k = t.value * (0.65 + 0.35 * (r / 4));
      d += ellipseSvg(x + dx * k, y + dy * k - 6 * Math.sin(Math.PI * t.value), r, r);
    }
    return path(d);
  });
  const opacity = useDerivedValue(() => 0.75 * (1 - t.value));
  return <Path path={shape} color={color} opacity={opacity} />;
}

function Firefly({ x, y, pause, phase, clock, nightness, animations }: {
  x: number; y: number; pause: number; phase: number; clock: SharedValue<number>; nightness: SharedValue<number>; animations: boolean;
}) {
  // Blinks like the meadow's fireflies; a steady glow when animations are off.
  const opacity = useDerivedValue(() => nightness.value * (animations ? blink(clock.value, pause, phase) : 0.6));
  return (
    <Group opacity={opacity}>
      <Circle cx={x} cy={y} r={9}>
        <RadialGradient c={vec(x, y)} r={9} colors={['rgba(233,255,138,0.5)', 'rgba(233,255,138,0)']} />
      </Circle>
      <Circle cx={x} cy={y} r={1.6} color={forestNight.firefly!.core} />
    </Group>
  );
}

function Vignette({ width, height, color }: { width: number; height: number; color: SharedValue<string> }) {
  // A radial gradient stretched to the screen's shape: clear in the middle (58 %), darker at the edges.
  const cy = height * 0.46;
  const r = height * 0.72;
  const colors = useDerivedValue(() => [withAlpha(color.value, 0), color.value]);
  return (
    <Group transform={[{ translateX: width / 2 }, { translateY: cy }, { scaleX: width / height }, { translateX: -width / 2 }, { translateY: -cy }]}>
      <Rect x={width / 2 - height} y={0} width={height * 2} height={height}>
        <RadialGradient c={vec(width / 2, cy)} r={r} colors={colors} positions={[0.58, 1]} />
      </Rect>
    </Group>
  );
}

/** 'rgba(r,g,b,a)' or '#rrggbb' with a new alpha. */
function withAlpha(color: string, alpha: number): string {
  'worklet';
  if (color.startsWith('#')) {
    const v = parseInt(color.slice(1, 7), 16);
    return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
  }
  const parts = color.slice(color.indexOf('(') + 1, color.indexOf(')')).split(',');
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
}
