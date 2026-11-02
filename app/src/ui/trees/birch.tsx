// Birch — a white trunk with black dashes, small yellow-green leaves and a tall weeping
// crown with hanging twigs and catkins (wave 5 spec, 9.2). Sizes follow SIZES.birch in layout.ts.
import { Group, Oval, Path } from '@shopify/react-native-skia';
import { Palette } from '../theme';
import { DeadSmall, DeadTree } from './dead';
import { clumpBlobs, Crown, droop, GroundShadow, Leaf, Meadow, mix, Mound, rng, sag, Shades, Stem, Trunk } from './parts';
import { SkinProps } from './types';

interface Bark extends Shades {
  /** The black dashes and the dark foot of the trunk. */
  mark: string;
}

const leafShades = (p: Palette): Shades =>
  p.dark
    ? { light: '#93B84C', mid: '#6E9A35', dark: '#4C7426', deep: '#31511A' }
    : { light: '#D6EC7A', mid: '#A8D45A', dark: '#74AA3A', deep: '#4E7F25' };

const barkShades = (p: Palette): Bark =>
  p.dark
    ? { light: '#D9D8E8', mid: '#C8C6D6', dark: '#A19DB5', deep: '#6B6789', mark: '#1A1830' }
    : { light: '#FFFFFF', mid: '#F1EEE6', dark: '#CFC8BA', deep: '#8E8676', mark: '#2B2620' };

const catkinColor = (p: Palette) => (p.dark ? '#7E6450' : '#B58A4E');

/**
 * Black dashes on the white bark and a dark foot. Follows the shape of Trunk:
 * narrowing to 0.42 of the width at the top, leaning by `lean`.
 */
function BirchMarks({ h, w, lean = 0, seed, s, roots = false }: { h: number; w: number; lean?: number; seed: number; s: Bark; roots?: boolean }) {
  const rand = rng(seed + 21);
  const n = Math.max(3, Math.round(h / 12));
  const foot = w / 2 + (roots ? w * 0.45 : w * 0.1) * 0.6;
  const dashes = Array.from({ length: n }, (_, i) => {
    const t = 0.1 + (0.84 * (i + rand() * 0.6)) / n;
    const cx = lean * Math.min(1, t * 1.1);
    const hw = (w / 2) * (1 - 0.58 * t);
    const len = hw * (0.55 + rand() * 0.7);
    const side = rand() < 0.5 ? -1 : 1;
    const x0 = Math.max(cx - hw, Math.min(cx + hw - len, cx + side * hw * 0.25 - len / 2));
    const y = -h * t;
    return `M${x0} ${y} L${x0 + len} ${y + (rand() - 0.5) * 1.4}`;
  });
  return (
    <Group>
      <Path path={`M${-foot} 0 L${-w * 0.47} ${-h * 0.13} Q 0 ${-h * 0.17} ${w * 0.47} ${-h * 0.13} L${foot} 0 Z`} color={s.mark} opacity={0.32} />
      <Path path={dashes.join(' ')} style="stroke" strokeWidth={Math.max(1.1, w * 0.075)} strokeCap="round" color={s.mark} opacity={0.85} />
    </Group>
  );
}

/** A hanging twig with small leaves looking down (a weeping birch); a catkin at its end. */
function Strand({ x, y, len, dx, s, seed, catkin }: { x: number; y: number; len: number; dx: number; s: Shades; seed: number; catkin: string | null }) {
  const rand = rng(seed);
  const cx = x + dx * 0.5;
  const cy = y + len * 0.3;
  const ex = x + dx;
  const ey = y + len;
  const k = Math.max(2, Math.floor(len / 8));
  const leaves = Array.from({ length: k }, (_, i) => {
    const j = i + 1;
    const t = j / k;
    const u = 1 - t;
    const side = j % 2 ? 1 : -1;
    const l = 7 + rand() * 3;
    return {
      x: u * u * x + 2 * u * t * cx + t * t * ex,
      y: u * u * y + 2 * u * t * cy + t * t * ey,
      angle: 180 + side * (25 + rand() * 20),
      len: l,
      light: j % 2 ? s.light : s.mid,
    };
  });
  return (
    <Group>
      <Path path={`M${x} ${y} Q ${cx} ${cy} ${ex} ${ey}`} style="stroke" strokeWidth={1.3} strokeCap="round" color={s.deep} opacity={0.55} />
      {leaves.map((l, i) => (
        <Leaf key={i} x={l.x} y={l.y} angle={l.angle} len={l.len} width={l.len * 0.75} light={l.light} dark={s.dark} vein={s.dark} />
      ))}
      {catkin && <Oval x={ex - 1.4} y={ey + 0.8} width={2.8} height={8.4} color={catkin} />}
    </Group>
  );
}

/** `count` twigs hanging from the lower half of a crown; the first `catkins` of them with a catkin. */
function Strands({ cx, cy, rx, ry, count, s, seed, catkins, catkin }: {
  cx: number; cy: number; rx: number; ry: number; count: number; s: Shades; seed: number; catkins: number; catkin: string;
}) {
  const rand = rng(seed + 33);
  const list = Array.from({ length: count }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    const a = 0.25 + (i / count) * 0.5 + rand() * 0.1;
    return {
      x: cx + side * rx * (0.35 + 0.5 * a),
      y: cy + ry * (0.25 + 0.45 * (1 - a)),
      len: 22 + rand() * 18,
      dx: side * (3 + rand() * 6),
    };
  });
  return (
    <Group>
      {list.map((t, i) => (
        <Strand key={i} {...t} s={s} seed={seed + i} catkin={i < catkins ? catkin : null} />
      ))}
    </Group>
  );
}

/** A short horizontal dash on a thin white stem. */
const dashes = (at: [number, number][]) => at.map(([x, y]) => `M${x - 1.5} ${y} L${x + 1.5} ${y + 0.4}`).join(' ');

export function Birch({ look, progress, p, seed, thirst = 0, ground = true }: SkinProps) {
  const low = sag(thirst);
  const s = leafShades(p);
  const b = barkShades(p);
  const catkin = catkinColor(p);
  const leaf = (x: number, y: number, angle: number, len: number, light = true) => (
    <Leaf key={`${x},${y},${angle}`} x={x} y={y} angle={droop(angle, thirst)} len={len} width={len * 0.72} light={light ? s.light : s.mid} dark={s.dark} vein={s.deep} />
  );
  const white = (d: string, width: number) => <Stem key={d} d={d} width={width} color={b.mid} shadow={b.dark} />;

  switch (look) {
    case 'sprout':
      return (
        <Group>
          <Mound w={40} p={p} />
          <Stem d="M0 0 Q 2 -14, 0 -28" width={3.5} color={mix(s.mid, b.dark, 0.3)} shadow={s.dark} />
          <Leaf x={0} y={-28} angle={droop(-58, thirst)} len={13} width={10} light={s.light} dark={s.mid} vein={s.dark} />
          <Leaf x={0} y={-28} angle={droop(58, thirst)} len={13} width={10} light={s.light} dark={s.mid} vein={s.dark} />
          {progress > 0.3 && leaf(0, -28, 0, 10)}
        </Group>
      );
    case 'seedling': {
      const leaves: [number, number, number, number, boolean][] = [
        [-1, -24, -70, 20, false], [1, -36, 64, 20, true], [0, -50, -48, 18, true], [0, -60, 40, 17, false], [0, -72, -14, 15, true], [0, -72, 24, 14, false],
      ];
      return (
        <Group>
          <Mound w={46} p={p} />
          {white('M0 0 C 4 -28, -4 -50, 0 -72', 4.5)}
          <Path path={dashes([[0, -16], [0, -34], [0, -52]])} style="stroke" strokeWidth={1.1} strokeCap="round" color={b.mark} />
          {leaves.map(([x, y, a, len, light]) => leaf(x, y, a, len, light))}
        </Group>
      );
    }
    case 'bush': {
      const stems: [string, number][] = [
        ['M0 0 C -3 -40, -14 -64, -22 -92', 4.5],
        ['M0 0 C 3 -40, 14 -66, 22 -96', 4.5],
        ['M0 0 C -1 -44, 2 -80, 0 -112', 5],
      ];
      // A few leaves already hang down: the first sign of a weeping birch.
      const leaves: [number, number, number, number, boolean][] = [
        [-6, -34, -80, 20, false], [6, -38, 82, 20, true], [-12, -56, -64, 22, true], [12, -58, 66, 22, false],
        [-22, -92, -30, 20, true], [-22, -92, -110, 18, false], [-18, -78, -130, 18, true],
        [22, -96, 32, 20, true], [22, -96, 112, 18, false], [18, -82, 132, 18, true], [-1, -74, -36, 18, false], [1, -86, 38, 18, true],
        [0, -112, -20, 17, true], [0, -112, 22, 16, false], [-1, -100, -120, 16, true], [1, -100, 124, 16, false],
        [-26, -70, -150, 16, false], [26, -74, 150, 16, true],
      ];
      return (
        <Group>
          {ground && <GroundShadow w={84} p={p} />}
          {stems.map(([d, w]) => white(d, w))}
          <Path path={dashes([[-3, -30], [4, -46], [-1, -60]])} style="stroke" strokeWidth={1.1} strokeCap="round" color={b.mark} />
          {leaves.map(([x, y, a, len, light]) => leaf(x, y, a, len * (0.9 + 0.1 * progress), light))}
        </Group>
      );
    }
    case 'young':
      return (
        <Group>
          {ground && <GroundShadow w={76} p={p} />}
          <Trunk h={140} w={10} s={b} lean={2} />
          <BirchMarks h={140} w={10} lean={2} seed={seed} s={b} />
          {white('M1 -100 Q -14 -116, -28 -136', 3.5)}
          {white('M1 -108 Q 16 -122, 30 -142', 3)}
          <Crown thirst={thirst} blobs={clumpBlobs([[2, low - 190, 32, 40, 5], [-16, low - 150, 28, 40, 5], [18, low - 146, 28, 40, 5]], seed)} s={s} flecks={16} seed={seed} edgeScale={0.8} />
          <Strands cx={2} cy={low - 164} rx={46} ry={66} count={5} s={s} seed={seed} catkins={0} catkin={catkin} />
        </Group>
      );
    case 'tree':
      return (
        <Group>
          {ground && <GroundShadow w={150} p={p} />}
          {/* A second, thinner trunk behind the main one. */}
          <Group transform={[{ translateX: 12 }]}>
            <Trunk h={124} w={11} s={b} lean={12} />
            <BirchMarks h={124} w={11} lean={12} seed={seed + 1} s={b} />
          </Group>
          <Trunk h={176} w={18} s={b} roots lean={-2} />
          <BirchMarks h={176} w={18} lean={-2} seed={seed} s={b} roots />
          {white('M-2 -120 Q -30 -146, -58 -180', 6)}
          {white('M0 -134 Q 28 -156, 54 -192', 5)}
          <Crown thirst={thirst} blobs={clumpBlobs([[2, low - 246, 42, 52, 6], [-30, low - 192, 40, 56, 6], [32, low - 186, 38, 56, 6], [2, low - 160, 36, 44, 5]], seed)} s={s} flecks={30} seed={seed} edgeScale={0.8} />
          <Strands cx={2} cy={low - 200} rx={70} ry={98} count={10} s={s} seed={seed} catkins={6} catkin={catkin} />
        </Group>
      );
    case 'grand':
      return (
        <Group>
          {ground && <GroundShadow w={210} p={p} />}
          <Group transform={[{ translateX: 16 }]}>
            <Trunk h={160} w={17} s={b} lean={18} />
            <BirchMarks h={160} w={17} lean={18} seed={seed + 1} s={b} />
          </Group>
          <Trunk h={190} w={26} s={b} roots lean={-4} />
          <BirchMarks h={190} w={26} lean={-4} seed={seed} s={b} roots />
          {white('M-4 -128 Q -44 -152, -86 -190', 9)}
          {white('M2 -142 Q 44 -162, 88 -200', 8)}
          <Crown thirst={thirst} blobs={clumpBlobs([[6, low - 250, 60, 54, 7], [-46, low - 194, 52, 58, 7], [56, low - 190, 50, 56, 7], [6, low - 162, 50, 40, 5]], seed)} s={s} flecks={44} seed={seed} edgeScale={0.8} />
          <Strands cx={6} cy={low - 206} rx={100} ry={98} count={14} s={s} seed={seed} catkins={10} catkin={catkin} />
          <Meadow w={230} p={p} seed={seed} flowers={['#FFFFFF', '#F7E36B', '#C9E8FF']} />
        </Group>
      );
    case 'deadSmall':
      return <DeadSmall p={p} />;
    case 'dead':
      return <DeadTree p={p} scale={1.05} />;
  }
}
