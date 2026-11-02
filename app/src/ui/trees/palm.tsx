// Palm — grows from a coconut: a trunk curved in an arc with rings, a crown of feathery
// fronds, coconuts on big trees and a patch of sand at its foot (wave 5 spec, 9.5).
// The crown leans right; SIZES.palm in layout.ts takes the farthest edge of it.
import { Circle, Group, LinearGradient, Oval, Path, RadialGradient, vec } from '@shopify/react-native-skia';
import { Palette } from '../theme';
import { DeadSmall, DeadTree } from './dead';
import { droop, GroundShadow, hangDown, Leaf, Meadow, Mound, rng, Shades, Stem } from './parts';
import { SkinProps } from './types';

const frondShades = (p: Palette): Shades =>
  p.dark
    ? { light: '#5E8F3C', mid: '#3E7432', dark: '#255A2C', deep: '#173D1E' }
    : { light: '#9FD45A', mid: '#5DAE3E', dark: '#2F7F34', deep: '#1E5A26' };

const trunkShades = (p: Palette): Shades =>
  p.dark
    ? { light: '#A08A86', mid: '#82685E', dark: '#5E4A48', deep: '#3E3036' }
    : { light: '#E2BC84', mid: '#C4975E', dark: '#9C7040', deep: '#6E4C28' };

const coconutColors = (p: Palette) => (p.dark ? ['#7A6050', '#5A4234', '#3E2C22'] : ['#A87A4E', '#7A5230', '#5E3C1E']);
const sandColors = (p: Palette) => (p.dark ? ['#7A6A5A', '#655648'] : ['#F2D9A4', '#E3C186']);

/** Segments of a frond's midrib. */
const SEGMENTS = 16;

/**
 * An almond leaflet as an SVG path already turned and placed: stalk at (x, y), pointing
 * at `angle` degrees (0 = up). Leaflets are many and tiny, so they are joined into one
 * path per color instead of a gradient each.
 */
function leaflet(x: number, y: number, angle: number, len: number, w: number): string {
  const a = (angle * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const pt = (px: number, py: number) => `${x + px * cos - py * sin} ${y + px * sin + py * cos}`;
  return `M${pt(0, 0)} C ${pt(w, -len * 0.22)}, ${pt(w, -len * 0.72)}, ${pt(0, -len)} C ${pt(-w, -len * 0.72)}, ${pt(-w, -len * 0.22)}, ${pt(0, 0)} Z`;
}

/**
 * A frond: a curved midrib with leaflets on both sides. It starts at `angle` degrees
 * (0 = up, clockwise) and bends down by `bend · t^1.5` along its length.
 */
function Frond({ x, y, angle, len, bend, s, seed, thirst = 0 }: {
  x: number; y: number; angle: number; len: number; bend: number; s: Shades; seed: number; thirst?: number;
}) {
  const rand = rng(seed);
  const sign = angle === 0 ? (rand() < 0.5 ? -1 : 1) : Math.sign(angle);
  // A thirsty palm bends its fronds 12° further.
  const curl = bend + 12 * thirst;
  const pts: [number, number, number][] = [[x, y, angle]];
  let px = x;
  let py = y;
  for (let i = 1; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const a = ((angle + sign * curl * Math.pow(t, 1.5)) * Math.PI) / 180;
    px += Math.sin(a) * (len / SEGMENTS);
    py -= Math.cos(a) * (len / SEGMENTS);
    pts.push([px, py, (a * 180) / Math.PI]);
  }
  let light = '';
  let mid = '';
  for (let i = 2; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const [lx, ly, la] = pts[i];
    const l = len * 0.3 * (1 - 0.55 * t) + 3;
    for (const side of [-1, 1]) {
      const a = hangDown(la + side * (58 - 22 * t) + 16 * thirst * side, 0.35 + 0.4 * thirst);
      const d = leaflet(lx, ly, a, l, l * 0.12);
      if ((i + (side > 0 ? 1 : 0)) % 2) light += d;
      else mid += d;
    }
  }
  const rib = 'M' + pts.map(([px, py]) => `${px} ${py}`).join(' L');
  return (
    <Group>
      <Path path={mid} color={s.mid} />
      <Path path={light} color={s.light} />
      <Path path={rib} style="stroke" strokeWidth={Math.max(1.2, len * 0.03)} strokeCap="round" strokeJoin="round" color={s.dark} />
    </Group>
  );
}

/**
 * The crown: `n` fronds fanned from −100° to 100° (× `spread`), drawn from the outer ones to
 * the middle one.
 */
function FrondCrown({ x, y, n, len, bend, s, seed, thirst, spread = 1 }: {
  x: number; y: number; n: number; len: number; bend: number; s: Shades; seed: number; thirst: number; spread?: number;
}) {
  const fan = Array.from({ length: n }, (_, i) => ({ a: (-100 + (200 * i) / (n - 1)) * spread, i }));
  fan.sort((p, q) => Math.abs(q.a) - Math.abs(p.a));
  return (
    <Group>
      {fan.map(({ a, i }) => (
        <Frond
          key={i}
          x={x}
          y={y}
          angle={a * 0.95}
          len={len * (1 - (0.12 * Math.abs(a)) / 100)}
          bend={bend * (0.4 + Math.abs(a) / 100)}
          s={s}
          seed={seed + i}
          thirst={thirst}
        />
      ))}
    </Group>
  );
}

/** A trunk curved along (0, 0) → (0.05·lean, −0.55h) → (lean, −h), narrowing to 0.68 w, with rings. */
function PalmTrunk({ h, w, lean, s }: { h: number; w: number; lean: number; s: Shades }) {
  const at = (t: number) => {
    const u = 1 - t;
    return [2 * u * t * lean * 0.05 + t * t * lean, 2 * u * t * (-h * 0.55) + t * t * -h];
  };
  const along = (t: number) => {
    const dx = 2 * (1 - t) * lean * 0.05 + 2 * t * (lean - lean * 0.05);
    const dy = 2 * (1 - t) * (-h * 0.55) + 2 * t * (-h + h * 0.55);
    const l = Math.hypot(dx, dy);
    return [dx / l, dy / l];
  };
  const n = 24;
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [cx, cy] = at(t);
    const [tx, ty] = along(t);
    const hw = (w / 2) * (1 - 0.32 * t) * (i === 0 ? 1.25 : 1);
    left.push(`${cx + ty * hw} ${cy - tx * hw}`);
    right.push(`${cx - ty * hw} ${cy + tx * hw}`);
  }
  const body = `M${left.join(' L')} L${right.reverse().join(' L')} Z`;
  let rings = '';
  let shine = '';
  const count = Math.floor(h / 9);
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const [cx, cy] = at(t);
    const [tx, ty] = along(t);
    const hw = (w / 2) * (1 - 0.32 * t);
    const ax = cx + ty * hw;
    const ay = cy - tx * hw;
    rings += `M${ax} ${ay} Q ${cx - tx * 3} ${cy + ty * 3} ${cx - ty * hw} ${cy + tx * hw} `;
    // A light dash just above the ring.
    const ox = -tx * 2;
    const oy = -ty * 2;
    shine += `M${ax - tx * 2.4 + ox} ${ay - ty * 2.4 + oy} Q ${cx - ty * hw * 0.4 + ox} ${cy + tx * hw * 0.4 - 1 + oy} ${cx + ox} ${cy - 2 + oy} `;
  }
  return (
    <Group>
      <Path path={body}>
        <LinearGradient start={vec(-w / 2, 0)} end={vec(w / 2 + lean * 0.6, 0)} colors={[s.dark, s.light, s.mid, s.deep]} positions={[0, 0.3, 0.65, 1]} />
      </Path>
      <Path path={rings} style="stroke" strokeWidth={1.3} color={s.deep} opacity={0.5} />
      <Path path={shine} style="stroke" strokeWidth={1.1} color={s.light} opacity={0.5} />
    </Group>
  );
}

const NUTS: [number, number][] = [[-6, 6], [6, 7], [0, 12], [-11, 12], [11, 13]];

function Coconuts({ x, y, count, p }: { x: number; y: number; count: number; p: Palette }) {
  const colors = coconutColors(p);
  return (
    <Group>
      {NUTS.slice(0, count).map(([dx, dy]) => (
        <Group key={`${dx},${dy}`}>
          <Circle cx={x + dx} cy={y + dy} r={6.6}>
            <RadialGradient c={vec(x + dx - 2.4, y + dy - 2.6)} r={10} colors={colors} positions={[0, 0.5, 1]} />
          </Circle>
          <Circle cx={x + dx - 2.2} cy={y + dy - 2.4} r={1.5} color="#FFFFFF" opacity={0.3} />
        </Group>
      ))}
    </Group>
  );
}

function Sand({ w, p }: { w: number; p: Palette }) {
  return (
    <Oval x={-w / 2} y={-1 - w * 0.07} width={w} height={w * 0.14}>
      <LinearGradient start={vec(0, -w * 0.07)} end={vec(0, w * 0.05)} colors={sandColors(p)} />
    </Oval>
  );
}

export function Palm({ look, progress, p, seed, thirst = 0, ground = true }: SkinProps) {
  const s = frondShades(p);
  const b = trunkShades(p);
  const crown = (x: number, y: number, n: number, len: number, bend: number, spread = 1) => (
    <FrondCrown x={x} y={y} n={n} len={len} bend={bend} s={s} seed={seed} thirst={thirst} spread={spread} />
  );

  switch (look) {
    case 'sprout':
      return (
        <Group>
          <Mound w={40} p={p} />
          <Coconuts x={0} y={-9} count={1} p={p} />
          {[-38, 0, 38].map((a, i) => (
            <Leaf key={a} x={0} y={-12} angle={droop(a, thirst)} len={i === 1 ? 20 : 17} width={6} light={s.light} dark={s.mid} vein={s.dark} />
          ))}
          {progress > 0.3 && <Leaf x={0} y={-12} angle={droop(-14, thirst)} len={14} width={5} light={s.light} dark={s.mid} vein={s.dark} />}
        </Group>
      );
    case 'seedling':
      return (
        <Group>
          <Mound w={50} p={p} />
          <Coconuts x={0} y={-9} count={1} p={p} />
          <Stem d="M0 -8 L0 -16" width={4} color={b.mid} shadow={b.dark} />
          {[-70, -35, 0, 35, 70].map((a, i) => (
            <Frond key={a} x={0} y={-16} angle={a} len={i === 2 ? 40 : 34} bend={14} s={s} seed={seed + i} thirst={thirst} />
          ))}
        </Group>
      );
    case 'bush':
      return (
        <Group>
          {ground && <Sand w={70} p={p} />}
          {ground && <GroundShadow w={90} p={p} />}
          {/* Straight from the ground: a narrower fan, so the outer fronds don't dip into the earth. */}
          {crown(0, -8, 7, 72, 22, 0.72)}
        </Group>
      );
    case 'young':
      return (
        <Group>
          {ground && <Sand w={70} p={p} />}
          {ground && <GroundShadow w={86} p={p} />}
          <PalmTrunk h={92} w={12} lean={12} s={b} />
          {crown(12, -92, 7, 72, 40)}
        </Group>
      );
    case 'tree':
      return (
        <Group>
          {ground && <Sand w={96} p={p} />}
          {ground && <GroundShadow w={120} p={p} />}
          <PalmTrunk h={186} w={18} lean={24} s={b} />
          {crown(24, -186, 9, 96, 46)}
          <Coconuts x={24} y={-186} count={3} p={p} />
        </Group>
      );
    case 'grand':
      return (
        <Group>
          {ground && <Sand w={120} p={p} />}
          {ground && <GroundShadow w={150} p={p} />}
          <PalmTrunk h={196} w={24} lean={30} s={b} />
          {crown(30, -196, 11, 104, 50)}
          <Coconuts x={30} y={-196} count={5} p={p} />
          <Meadow w={200} p={p} seed={seed} flowers={['#FF9FB8', '#FFD84D', '#FFFFFF']} />
        </Group>
      );
    case 'deadSmall':
      return <DeadSmall p={p} />;
    case 'dead':
      return <DeadTree p={p} scale={1.05} />;
  }
}
