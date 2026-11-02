// A little meadow scene for the shop (spec 6.2, 7.1): sky, sun or moon, clouds, far
// mountains and hills, a strip of far forest, the meadow with tufts and flowers, the front
// grass and the meadow's weather, standing still. Drawn with react-native-svg, not Skia:
// a grid of eleven cards must not take eleven live canvases (spec 16).
// A port of `sceneSVG` from design/волна-5/макет-магазин-рисунки.js.
import { memo, ReactNode, useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { MeadowId } from '@/game/economy';
import { meadowPreviewColors } from './meadowPreview';

export interface MeadowSceneProps {
  meadow: MeadowId;
  night: boolean;
  width: number;
  height: number;
  /** The horizon, as a share of the height. */
  horizon?: number;
  /** Sun by day, moon by night. */
  sun?: boolean;
  weather?: boolean;
  /** The row of tall grass along the bottom edge. */
  front?: boolean;
  /** A patch of earth for a tree standing at (x, y), `w` wide. */
  soil?: { x: number; y: number; w: number } | null;
  seed?: number;
}

/** The mockup's random numbers (mulberry32), so a scene is the same every time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f1 = (n: number) => Math.round(n * 100) / 100;
const ridge = (x: number, waves: number[][]) => waves.reduce((s, [a, p, ph]) => s + a * Math.sin((x / p) * Math.PI * 2 + ph), 0);

/** Right half of a maple leaf (spec 9.1), stem at 0,0 and tip at 0,−len. */
const MAPLE = [[0, -0.16], [0.10, -0.22], [0.42, -0.20], [0.30, -0.30, 0.26, -0.38], [0.52, -0.60], [0.32, -0.58, 0.18, -0.62], [0, -1]];
function mapleHalf(len: number) {
  const s = (x: number) => f1(x * len);
  let d = `M0 ${s(-0.16)}`;
  for (const p of MAPLE.slice(1)) d += p.length === 4 ? ` Q ${s(p[0])} ${s(p[1])} ${s(p[2])} ${s(p[3])}` : ` L ${s(p[0])} ${s(p[1])}`;
  return `${d} L 0 ${s(-0.16)} Z`;
}
const almond = (len: number, w: number) =>
  `M0 0 C ${f1(w)} ${f1(-len * 0.22)}, ${f1(w)} ${f1(-len * 0.72)}, 0 ${f1(-len)} C ${f1(-w)} ${f1(-len * 0.72)}, ${f1(-w)} ${f1(-len * 0.22)}, 0 0 Z`;

function leaf(key: string, x: number, y: number, angle: number, len: number, color: string, maple: boolean): ReactNode {
  return (
    <G key={key} transform={`translate(${f1(x)} ${f1(y)}) rotate(${f1(angle)})`}>
      {maple ? (
        <>
          <Path d={mapleHalf(len)} fill={color} />
          <Path d={mapleHalf(len)} fill={color} transform="scale(-1 1)" />
        </>
      ) : (
        <Path d={almond(len, len * 0.42)} fill={color} />
      )}
    </G>
  );
}

/**
 * The scene in two layers: `back` goes behind the tree, `fore` (front grass, weather,
 * fireflies) in front of it. Both are whole <Svg>s of `width` × `height`.
 */
export function useMeadowScene({
  meadow, night, width: W, height: H, horizon = 0.5, sun = true, weather = true, front = true, soil = null, seed = 5,
}: MeadowSceneProps): { back: ReactNode; fore: ReactNode } {
  // Gradient ids are global in a browser page: each scene gets its own.
  const uid = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const body = useMemo(() => {
    const th = meadowPreviewColors(meadow, night);
    const sk = th.sky;
    const m = th.meadow;
    const hy = H * horizon;
    const rand = rng(seed);
    const id = (name: string) => `${uid}${name}`;
    const url = (name: string) => `url(#${id(name)})`;
    const defs: ReactNode[] = [];
    const o: ReactNode[] = [];
    const k = H / 812;
    const K = Math.max(0.55, k * 2);

    defs.push(
      <LinearGradient key="sky" id={id('sky')} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={f1(hy)}>
        <Stop offset="0" stopColor={sk.top} />
        <Stop offset="0.6" stopColor={sk.mid} />
        <Stop offset="1" stopColor={sk.horizon} />
      </LinearGradient>,
    );
    o.push(<Rect key="sky" width={W} height={f1(hy + 6)} fill={url('sky')} />);

    if (night) {
      const n = Math.round((W * hy) / 900);
      for (let i = 0; i < n; i++) {
        o.push(<Circle key={`star${i}`} cx={f1(rand() * W)} cy={f1(rand() * hy * 0.85)} r={f1(0.6 + rand() * 1)} fill="#FFFFFF" opacity={f1(0.5 + rand() * 0.5)} />);
      }
    }
    if (sun) {
      const sx = W * 0.18;
      const sy = hy * 0.26;
      const r = Math.max(9, Math.min(W, H) * 0.07);
      if (night) {
        defs.push(
          <RadialGradient key="glow" id={id('glow')} gradientUnits="userSpaceOnUse" cx={f1(sx)} cy={f1(sy)} r={f1(r * 2.2)}>
            <Stop offset="0" stopColor="rgb(201,199,255)" stopOpacity={0.5} />
            <Stop offset="1" stopColor="rgb(201,199,255)" stopOpacity={0} />
          </RadialGradient>,
        );
        o.push(
          <Circle key="glow" cx={f1(sx)} cy={f1(sy)} r={f1(r * 2.2)} fill={url('glow')} />,
          <Circle key="moon" cx={f1(sx)} cy={f1(sy)} r={f1(r)} fill="#EEEDFB" />,
          <Circle key="crater" cx={f1(sx + r * 0.3)} cy={f1(sy - r * 0.2)} r={f1(r * 0.22)} fill="#D4D1EE" />,
        );
      } else {
        defs.push(
          <RadialGradient key="glow" id={id('glow')} gradientUnits="userSpaceOnUse" cx={f1(sx)} cy={f1(sy)} r={f1(r * 2.4)}>
            <Stop offset="0" stopColor="rgb(255,246,194)" stopOpacity={0.85} />
            <Stop offset="0.5" stopColor="rgb(255,241,168)" stopOpacity={0.3} />
            <Stop offset="1" stopColor="rgb(255,241,168)" stopOpacity={0} />
          </RadialGradient>,
          <RadialGradient key="sun" id={id('sun')} gradientUnits="userSpaceOnUse" cx={f1(sx - r * 0.3)} cy={f1(sy - r * 0.3)} r={f1(r * 1.3)}>
            <Stop offset="0" stopColor="#FFF6BE" />
            <Stop offset="0.5" stopColor="#FBD84E" />
            <Stop offset="1" stopColor="#F4BE34" />
          </RadialGradient>,
        );
        o.push(
          <Circle key="glow" cx={f1(sx)} cy={f1(sy)} r={f1(r * 2.4)} fill={url('glow')} />,
          <Circle key="sun" cx={f1(sx)} cy={f1(sy)} r={f1(r)} fill={url('sun')} />,
        );
      }
    }

    // Clouds.
    [[0.62, 0.3, 1], [0.86, 0.55, 0.7], [0.32, 0.62, 0.8]].forEach(([cx, cy, size], i) => {
      const x = W * cx;
      const y = hy * cy;
      const s = Math.min(W, H) * 0.09 * size;
      defs.push(
        <LinearGradient key={`cloud${i}`} id={id(`cloud${i}`)} gradientUnits="userSpaceOnUse" x1="0" y1={f1(y - s)} x2="0" y2={f1(y + s * 0.6)}>
          <Stop offset="0" stopColor={sk.cloudTop} />
          <Stop offset="1" stopColor={sk.cloudBottom} />
        </LinearGradient>,
      );
      o.push(
        <G key={`cloud${i}`} fill={url(`cloud${i}`)}>
          <Ellipse cx={f1(x)} cy={f1(y)} rx={f1(s * 1.6)} ry={f1(s * 0.55)} />
          <Circle cx={f1(x - s * 0.5)} cy={f1(y - s * 0.3)} r={f1(s * 0.55)} />
          <Circle cx={f1(x + s * 0.3)} cy={f1(y - s * 0.45)} r={f1(s * 0.75)} />
        </G>,
      );
    });

    const sil = (base: number, waves: number[][], floor: number) => {
      let d = `M0 ${f1(floor)}`;
      for (let x = 0; x <= W + 3; x += 4) d += ` L${x} ${f1(base - ridge(x, waves))}`;
      return `${d} L${f1(W)} ${f1(floor)} Z`;
    };
    const mountains = [[16 * K, 160, 0.4], [9 * K, 71, 1.3]];
    defs.push(
      <LinearGradient key="mnt" id={id('mnt')} gradientUnits="userSpaceOnUse" x1="0" y1={f1(hy - 50 * K)} x2="0" y2={f1(hy)}>
        <Stop offset="0" stopColor={m.mountainsTop} />
        <Stop offset="1" stopColor={m.mountainsBottom} />
      </LinearGradient>,
      <LinearGradient key="hill" id={id('hill')} gradientUnits="userSpaceOnUse" x1="0" y1={f1(hy - 20 * K)} x2="0" y2={f1(hy + 4)}>
        <Stop offset="0" stopColor={m.hillsTop} />
        <Stop offset="1" stopColor={m.hillsBottom} />
      </LinearGradient>,
    );
    o.push(<Path key="mnt" d={sil(hy - 8 * K, mountains, hy + 6)} fill={url('mnt')} />);
    if (th.snowCaps) o.push(<Path key="caps" d={sil(hy - 8 * K, mountains, hy - 12 * K)} fill="#FFFFFF" opacity={0.7} />);
    o.push(<Path key="hill" d={sil(hy + 2, [[7 * K, 110, 2.1], [4 * K, 47, 0.2]], hy + 8)} fill={url('hill')} />);

    // The far forest: round crowns and a few firs.
    for (let x = 6, i = 0; x < W; x += 9 + rand() * 18, i++) {
      const r = (3 + rand() * 4) * Math.min(K, 1.1);
      o.push(
        rand() < 0.4
          ? <Path key={`far${i}`} d={`M${f1(x)} ${f1(hy + 3 - r * 2.6)} L${f1(x + r)} ${f1(hy + 4)} L${f1(x - r)} ${f1(hy + 4)} Z`} fill={m.forest} />
          : <Circle key={`far${i}`} cx={f1(x)} cy={f1(hy + 3 - r * 0.6)} r={f1(r)} fill={m.forest} />,
      );
    }

    defs.push(
      <LinearGradient key="mead" id={id('mead')} gradientUnits="userSpaceOnUse" x1="0" y1={f1(hy)} x2="0" y2={f1(H)}>
        <Stop offset="0" stopColor={m.meadow[0]} />
        <Stop offset="0.22" stopColor={m.meadow[1]} />
        <Stop offset="0.5" stopColor={m.meadow[2]} />
        <Stop offset="1" stopColor={m.meadow[3]} />
      </LinearGradient>,
      <LinearGradient key="haze" id={id('haze')} gradientUnits="userSpaceOnUse" x1="0" y1={f1(hy - 14)} x2="0" y2={f1(hy + 6)}>
        <Stop offset="0" stopColor={m.haze} stopOpacity={0} />
        <Stop offset="1" stopColor={m.haze} stopOpacity={0.55} />
      </LinearGradient>,
    );
    o.push(<Rect key="mead" y={f1(hy + 2)} width={W} height={f1(H - hy)} fill={url('mead')} />);
    o.push(<Rect key="haze" y={f1(hy - 14)} width={W} height={20} fill={url('haze')} />);

    // Tufts and flowers.
    const tufts = Math.round((W * (H - hy)) / 1100);
    for (let i = 0; i < tufts; i++) {
      const x = rand() * W;
      const y = hy + 8 + Math.pow(rand(), 1.4) * (H - hy - 10);
      const s = 0.6 + ((y - hy) / (H - hy)) * 1.6;
      o.push(
        <Path
          key={`tuft${i}`}
          d={`M${f1(x - 2 * s)} ${f1(y)} Q ${f1(x - 2 * s)} ${f1(y - 4 * s)} ${f1(x - 3 * s)} ${f1(y - 6 * s)} Q ${f1(x)} ${f1(y - 3 * s)} ${f1(x + 0.5)} ${f1(y - 7 * s)} Q ${f1(x + 1)} ${f1(y - 3 * s)} ${f1(x + 3 * s)} ${f1(y - 5 * s)} Q ${f1(x + 2 * s)} ${f1(y - 3 * s)} ${f1(x + 2 * s)} ${f1(y)} Z`}
          fill={m.grass[i % 2]}
        />,
      );
    }
    const flowers = Math.round(tufts * 0.35 * th.flowers);
    for (let i = 0; i < flowers; i++) {
      const x = rand() * W;
      const y = hy + 10 + Math.pow(rand(), 1.2) * (H - hy - 14);
      const s = 0.7 + ((y - hy) / (H - hy)) * 1.4;
      const color = m.flowers[Math.floor(rand() * 4)];
      // Autumn: most "flowers" by day are fallen maple leaves.
      if (meadow === 'autumn' && !night && rand() < 0.6) {
        o.push(leaf(`fl${i}`, x, y, rand() * 360, 5 * s, th.weatherColors[i % th.weatherColors.length], true));
      } else {
        o.push(<Circle key={`fl${i}`} cx={f1(x)} cy={f1(y)} r={f1(1.6 * s)} fill={color} opacity={night ? 0.6 : 1} />);
        if (th.hearts) o.push(<Circle key={`fh${i}`} cx={f1(x)} cy={f1(y)} r={f1(0.6 * s)} fill={m.flowerHeart} opacity={night ? 0.4 : 1} />);
      }
    }

    if (soil) {
      o.push(<Ellipse key="soil" cx={f1(soil.x)} cy={f1(soil.y)} rx={f1(soil.w * 0.2)} ry={f1(Math.max(1.5, soil.w * 0.035))} fill={th.ground.groundShade} />);
    }
    return { defs, back: o, th, hy, K };
    // The soil's numbers, not the object: a new object each render must not redraw the scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meadow, night, W, H, horizon, sun, soil?.x, soil?.y, soil?.w, seed, uid]);

  // In front of the tree: the tall grass and the weather.
  const fore = useMemo(() => {
    const { th, K } = body;
    // Its own numbers: drawn again (another weather setting) it stays the same.
    const rand = rng(seed * 7 + 1);
    const o: ReactNode[] = [];
    if (front) {
      let d = `M0 ${H}`;
      for (let x = 0; x <= W; x += 5) d += ` L${x} ${f1(H - 6 - rand() * 10 * Math.max(1, K))} L${f1(x + 2.5)} ${f1(H - 2)}`;
      o.push(<Path key="front" d={`${d} L${f1(W)} ${H} Z`} fill={th.meadow.frontGrass[0]} />);
    }
    if (weather && th.weather) {
      const cols = th.weatherColors;
      const count = th.weather === 'snow' ? Math.round((W * H) / 2600) : Math.round((W * H) / 7000);
      for (let i = 0; i < count; i++) {
        const x = rand() * W;
        const y = rand() * H * 0.92;
        const c = cols[i % cols.length];
        if (th.weather === 'snow') o.push(<Circle key={`w${i}`} cx={f1(x)} cy={f1(y)} r={f1(1 + rand() * 1.6)} fill={c} opacity={f1(0.75 + rand() * 0.25)} />);
        else if (th.weather === 'leaves') o.push(leaf(`w${i}`, x, y, rand() * 360, 7 + rand() * 3, c, rand() < 0.5));
        else o.push(<Ellipse key={`w${i}`} cx={f1(x)} cy={f1(y)} rx={3.2} ry={1.9} transform={`rotate(${f1(rand() * 180)} ${f1(x)} ${f1(y)})`} fill={c} />);
      }
      if (th.weather === 'petals' && !night) {
        ([[0.72, 0.62, '#FFD84D'], [0.2, 0.7, '#B7A6FF']] as const).forEach(([bx, by, c], i) => (
          o.push(
            <G key={`fly${i}`} transform={`translate(${f1(W * bx)} ${f1(H * by)}) scale(${f1(K)})`}>
              <Ellipse cx={-3} cy={-1} rx={3.2} ry={2.4} fill={c} transform="rotate(-25 -3 -1)" />
              <Ellipse cx={3} cy={-1} rx={3.2} ry={2.4} fill={c} transform="rotate(25 3 -1)" />
              <Ellipse cx={-2} cy={2} rx={2} ry={1.5} fill={c} />
              <Ellipse cx={2} cy={2} rx={2} ry={1.5} fill={c} />
              <Path d="M0 -3 V3" stroke="#5A3A0E" strokeWidth={1} />
            </G>,
          )
        ));
      }
    }
    if (night) {
      for (let i = 0; i < Math.round(W / 60); i++) {
        const x = rand() * W;
        const y = body.hy + 10 + rand() * (H - body.hy - 20);
        o.push(<Circle key={`ffg${i}`} cx={f1(x)} cy={f1(y)} r={4} fill="rgba(233,255,138,0.18)" />, <Circle key={`ff${i}`} cx={f1(x)} cy={f1(y)} r={1.4} fill="#F4FFB8" />);
      }
    }
    return o;
  }, [body, front, weather, night, W, H, seed]);

  return useMemo(() => {
    if (!(W > 0 && H > 0)) return { back: null, fore: null };
    return {
      back: <Svg width={W} height={H}><Defs>{body.defs}</Defs>{body.back}</Svg>,
      fore: <Svg width={W} height={H}>{fore}</Svg>,
    };
  }, [body, fore, W, H]);
}

/** The whole scene in one picture, with nothing standing on it. */
export const MeadowScene = memo(function MeadowScene(props: MeadowSceneProps) {
  const { back, fore } = useMeadowScene(props);
  return (
    <View style={{ width: props.width, height: props.height }} pointerEvents="none">
      {back}
      <View style={StyleSheet.absoluteFill}>{fore}</View>
    </View>
  );
});
