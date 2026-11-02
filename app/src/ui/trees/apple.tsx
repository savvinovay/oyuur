// Apple tree — a low crooked trunk with a fork, a wide umbrella crown, blossom in spring
// and red apples on big trees, two of them fallen under the biggest (wave 5 spec, 9.4).
// Sizes follow SIZES.apple in layout.ts.
import { Circle, Group, Path, RadialGradient, vec } from '@shopify/react-native-skia';
import { Palette } from '../theme';
import { DeadSmall, DeadTree } from './dead';
import { crownBlobs, Crown, droop, GroundShadow, Leaf, Meadow, mix, Mound, rng, sag, Shades, Stem, Trunk } from './parts';
import { SkinProps } from './types';

const leafShades = (p: Palette): Shades =>
  p.dark
    ? { light: '#6F9A44', mid: '#4C7F33', dark: '#2F5F2A', deep: '#1D3E1B' }
    : { light: '#A9D86A', mid: '#6FB24A', dark: '#3F8A35', deep: '#2A5E25' };

const barkShades = (p: Palette): Shades =>
  p.dark
    ? { light: '#86708A', mid: '#6A5668', dark: '#4E3E4E', deep: '#30263A' }
    : { light: '#A88466', mid: '#876449', dark: '#684A34', deep: '#463020' };

/** Blossom petals: two shades. */
const blossomColors = (p: Palette) => (p.dark ? ['#D9D6EE', '#C9AFC8'] : ['#FFFFFF', '#FFD6E2']);
const BLOSSOM_HEART = '#F7D774';
/** Apple: light, middle, shadow of the round gradient. */
const appleColors = (p: Palette) => (p.dark ? ['#C65A5A', '#A23A3E', '#7A2832'] : ['#FF7A66', '#E0453A', '#B8302A']);
const APPLE_STALK = '#6B4A2E';

/** A five-petal apple blossom. */
function Blossom({ x, y, r, p }: { x: number; y: number; r: number; p: Palette }) {
  const [a, b] = blossomColors(p);
  return (
    <Group>
      {[0, 1, 2, 3, 4].map((i) => {
        const t = (i / 5) * Math.PI * 2 - Math.PI / 2;
        return <Circle key={i} cx={x + Math.cos(t) * r * 0.55} cy={y + Math.sin(t) * r * 0.55} r={r * 0.5} color={i % 2 ? a : b} />;
      })}
      <Circle cx={x} cy={y} r={r * 0.26} color={BLOSSOM_HEART} />
    </Group>
  );
}

/** A red apple: a round gradient lit from the upper left, a glint, a stalk and a leaf. */
function Fruit({ x, y, r, p }: { x: number; y: number; r: number; p: Palette }) {
  const s = leafShades(p);
  return (
    <Group>
      <Path path={`M${x} ${y - r + 1} L${x + 1.2} ${y - r - 3}`} style="stroke" strokeWidth={1.3} strokeCap="round" color={APPLE_STALK} />
      <Circle cx={x} cy={y} r={r}>
        <RadialGradient c={vec(x - r * 0.35, y - r * 0.4)} r={r * 1.5} colors={appleColors(p)} positions={[0, 0.55, 1]} />
      </Circle>
      <Circle cx={x - r * 0.35} cy={y - r * 0.35} r={r * 0.26} color="#FFFFFF" opacity={p.dark ? 0.35 : 0.7} />
      <Leaf x={x + 1} y={y - r - 2} angle={55} len={5.5} width={3.4} light={s.mid} dark={s.dark} vein={s.deep} />
    </Group>
  );
}

function Fruits({ seed, count, cx, cy, rx, ry, p }: { seed: number; count: number; cx: number; cy: number; rx: number; ry: number; p: Palette }) {
  const rand = rng(seed + 17);
  return (
    <Group>
      {Array.from({ length: count }, (_, i) => {
        const a = rand() * Math.PI * 2;
        const d = 0.35 + Math.sqrt(rand()) * 0.5;
        return <Fruit key={i} x={cx + Math.cos(a) * rx * d} y={cy + Math.sin(a) * ry * d * 0.9 + ry * 0.15} r={7 + rand() * 2} p={p} />;
      })}
    </Group>
  );
}

/** Blossoms scattered over a young crown: a spring apple tree. */
function CrownBlossom({ seed, cy, rx, ry, p }: { seed: number; cy: number; rx: number; ry: number; p: Palette }) {
  const rand = rng(seed + 9);
  return (
    <Group>
      {Array.from({ length: 10 }, (_, i) => {
        const a = rand() * Math.PI * 2;
        const d = Math.sqrt(rand()) * 0.82;
        return <Blossom key={i} x={Math.cos(a) * rx * d} y={cy + Math.sin(a) * ry * d} r={5 + rand() * 2} p={p} />;
      })}
    </Group>
  );
}

export function Apple({ look, progress, p, seed, thirst = 0, ground = true }: SkinProps) {
  const low = sag(thirst);
  const s = leafShades(p);
  const b = barkShades(p);
  const leaf = (x: number, y: number, angle: number, len: number, light = true) => (
    <Leaf key={`${x},${y},${angle}`} x={x} y={y} angle={droop(angle, thirst)} len={len} width={len * 0.62} light={light ? s.light : s.mid} dark={s.dark} vein={s.deep} />
  );
  const branch = (d: string, width: number) => <Stem key={d} d={d} width={width} color={b.mid} shadow={b.dark} />;

  switch (look) {
    case 'sprout':
      return (
        <Group>
          <Mound w={40} p={p} />
          <Stem d="M0 0 Q 3 -14, 0 -26" width={4} color={mix(s.mid, b.mid, 0.4)} shadow={s.dark} />
          {leaf(0, -26, -60, 15)}
          {leaf(0, -26, 60, 15, false)}
          {progress > 0.3 && leaf(0, -26, 0, 11)}
        </Group>
      );
    case 'seedling': {
      const leaves: [number, number, number, number, boolean][] = [
        [1, -24, 72, 22, false], [-1, -34, -66, 22, true], [1, -46, 54, 20, true], [-1, -56, -44, 19, false], [0, -66, 20, 17, true], [0, -66, -18, 16, false],
      ];
      return (
        <Group>
          <Mound w={46} p={p} />
          {branch('M0 0 C 5 -28, -4 -50, 0 -68', 4.5)}
          {leaves.map(([x, y, a, len, light]) => leaf(x, y, a, len, light))}
          <Blossom x={0} y={-71} r={6} p={p} />
        </Group>
      );
    }
    case 'bush': {
      const stems: [string, number][] = [
        ['M0 0 C -4 -40, -18 -60, -30 -80', 5],
        ['M0 0 C 4 -38, 18 -62, 28 -84', 5],
        ['M0 0 C -2 -40, 3 -68, 0 -96', 6],
      ];
      const leaves: [number, number, number, number, boolean][] = [
        [-8, -34, -88, 26, false], [8, -36, 86, 26, true], [-16, -56, -70, 26, true], [16, -58, 70, 26, false],
        [-30, -80, -44, 24, true], [-30, -80, -84, 22, false], [28, -84, 46, 24, true], [28, -84, 84, 22, false],
        [-1, -68, -30, 22, false], [1, -76, 32, 22, true], [0, -96, -26, 20, true], [0, -96, 24, 20, false], [0, -96, 0, 22, true],
      ];
      const flowers: [number, number, number][] = [[-30, -86, 7], [28, -90, 7], [0, -102, 8], [-14, -68, 6], [16, -72, 6]];
      return (
        <Group>
          {ground && <GroundShadow w={92} p={p} />}
          {stems.map(([d, w]) => branch(d, w))}
          {leaves.map(([x, y, a, len, light]) => leaf(x, y, a, len * (0.9 + 0.1 * progress), light))}
          {flowers.map(([x, y, r]) => <Blossom key={`${x},${y}`} x={x} y={y} r={r} p={p} />)}
        </Group>
      );
    }
    case 'young':
      return (
        <Group>
          {ground && <GroundShadow w={110} p={p} />}
          <Trunk h={96} w={12} s={b} lean={-3} />
          {branch('M-2 -70 Q -22 -90, -42 -112', 6)}
          {branch('M-1 -76 Q 22 -96, 42 -116', 5)}
          <Crown thirst={thirst} blobs={crownBlobs(0, low - 130, 86, 52, 8, seed)} s={s} flecks={12} seed={seed} />
          <CrownBlossom seed={seed} cy={low - 130} rx={86} ry={52} p={p} />
        </Group>
      );
    case 'tree':
      return (
        <Group>
          {ground && <GroundShadow w={190} p={p} />}
          <Trunk h={110} w={22} s={b} roots lean={-5} />
          {branch('M-3 -78 Q -40 -104, -78 -140', 11)}
          {branch('M2 -86 Q 40 -110, 80 -146', 10)}
          <Crown thirst={thirst} blobs={crownBlobs(0, low - 162, 128, 72, 12, seed)} s={s} flecks={24} seed={seed} />
          <Fruits seed={seed} count={8} cx={0} cy={low - 162} rx={128} ry={72} p={p} />
        </Group>
      );
    case 'grand':
      return (
        <Group>
          {ground && <GroundShadow w={250} p={p} />}
          <Trunk h={120} w={32} s={b} roots lean={-6} />
          {branch('M-4 -84 Q -50 -112, -98 -156', 16)}
          {branch('M3 -92 Q 50 -118, 100 -162', 14)}
          <Crown thirst={thirst} blobs={crownBlobs(0, low - 180, 146, 90, 15, seed)} s={s} flecks={36} seed={seed} />
          <Fruits seed={seed} count={11} cx={0} cy={low - 180} rx={146} ry={90} p={p} />
          <Fruit x={-62} y={-6} r={7} p={p} />
          <Fruit x={50} y={-5} r={6.5} p={p} />
          <Meadow w={260} p={p} seed={seed} flowers={['#FFFFFF', '#FFD6E2', '#F7E36B']} />
        </Group>
      );
    case 'deadSmall':
      return <DeadSmall p={p} />;
    case 'dead':
      return <DeadTree p={p} scale={1.05} />;
  }
}
