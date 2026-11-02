// Maple — a fiery crown of a few clumps of carved five-lobed leaves, golden flecks, winged seeds
// and leaves always falling (wave 5 spec, 9.3). Red from the very first leaf.
// Sizes follow SIZES.maple in layout.ts.
import { Circle, Group, Oval, Path } from '@shopify/react-native-skia';
import { Palette } from '../theme';
import { DeadSmall, DeadTree } from './dead';
import { clumpBlobs, Crown, deg, droop, GroundShadow, Leaf, leafShades, Meadow, Mound, rng, sag, Shades, Stem, Trunk } from './parts';
import { SkinProps } from './types';

// At night the leaves stay nearly as fiery as by day: the darkening is the maple's own
// night matrix (live/colors.ts NIGHT_WARM); together they are about 0.76 of the day.
export const mapleLeafShades = (p: Palette): Shades =>
  p.dark
    ? { light: '#F5A443', mid: '#E8722C', dark: '#D0522A', deep: '#86281C' }
    : { light: '#FFAE4A', mid: '#F27A2E', dark: '#DA5A2C', deep: '#922C1E' };

const barkShades = (p: Palette): Shades =>
  p.dark
    ? { light: '#7E6E80', mid: '#625266', dark: '#4A3C50', deep: '#2E2436' }
    : { light: '#9C8070', mid: '#7A5F50', dark: '#5E463A', deep: '#3E2C24' };

const fleckColor = (p: Palette) => (p.dark ? '#D9A85A' : '#FFD36B');
/** Winged seeds: wings, seed. */
const samaraColors = (p: Palette) => (p.dark ? ['#A88A5A', '#7A5A3A'] : ['#E9B65A', '#B5762E']);

/** Winged seeds in pairs hanging from the lower edge of the crown. */
function Samaras({ seed, count, cx, cy, rx, ry, p }: { seed: number; count: number; cx: number; cy: number; rx: number; ry: number; p: Palette }) {
  const rand = rng(seed + 13);
  const [wing, nut] = samaraColors(p);
  return (
    <Group>
      {Array.from({ length: count }, (_, i) => {
        const a = Math.PI * (0.2 + (0.6 * (i + rand() * 0.6)) / count);
        const x = cx + Math.cos(a) * rx * 0.74;
        const y = cy + Math.sin(a) * ry * 0.72;
        return (
          <Group key={i}>
            <Path path={`M${x} ${y - 3} L${x} ${y + 2}`} style="stroke" strokeWidth={1} color={nut} />
            <Group transform={[{ translateX: x }, { translateY: y + 2 }]}>
              <Group transform={[{ translateX: -3.2 }, { translateY: 5 }, { rotate: deg(28) }]}>
                <Oval x={-2.3} y={-6} width={4.6} height={12} color={wing} />
              </Group>
              <Group transform={[{ translateX: 3.2 }, { translateY: 5 }, { rotate: deg(-28) }]}>
                <Oval x={-2.3} y={-6} width={4.6} height={12} color={wing} />
              </Group>
              <Circle cx={-1.3} cy={1.2} r={1.8} color={nut} />
              <Circle cx={1.3} cy={1.2} r={1.8} color={nut} />
            </Group>
          </Group>
        );
      })}
    </Group>
  );
}

/** Leaves drifting down beside the crown. */
function FallingLeaves({ seed, count, cx, cy, rx, ry, s }: { seed: number; count: number; cx: number; cy: number; rx: number; ry: number; s: Shades }) {
  const rand = rng(seed + 5);
  return (
    <Group>
      {Array.from({ length: count }, (_, i) => {
        const side = i % 2 ? 1 : -1;
        const x = cx + side * rx * (0.55 + rand() * 0.45);
        const y = cy + ry * (0.6 + rand() * 1.3);
        const len = 7 + rand() * 3;
        return <Leaf key={i} x={x} y={y} angle={rand() * 360} len={len} width={len} light={s.light} dark={s.mid} vein={s.dark} shape="maple" />;
      })}
    </Group>
  );
}

export function Maple({ look, progress, p, seed, thirst = 0, ground = true }: SkinProps) {
  const low = sag(thirst);
  const s = mapleLeafShades(p);
  const b = barkShades(p);
  const fleck = fleckColor(p);
  const leaf = (x: number, y: number, angle: number, len: number, light = true) => (
    <Leaf key={`${x},${y},${angle}`} x={x} y={y} angle={droop(angle, thirst)} len={len} width={len} light={light ? s.light : s.mid} dark={s.dark} vein={s.deep} shape="maple" />
  );
  const branch = (d: string, width: number) => <Stem key={d} d={d} width={width} color={b.mid} shadow={b.dark} />;

  switch (look) {
    case 'sprout': {
      // Two green strap-like seed leaves; the first maple leaf is already red.
      const c = leafShades(p);
      return (
        <Group>
          <Mound w={40} p={p} />
          <Stem d="M0 0 Q -2 -14, 0 -26" width={4} color={p.dark ? '#7A4A36' : '#A0522D'} shadow={p.dark ? '#4E2E22' : '#6E3520'} />
          <Leaf x={0} y={-24} angle={droop(-72, thirst)} len={15} width={7} light={c.light} dark={c.mid} vein={c.dark} />
          <Leaf x={0} y={-24} angle={droop(72, thirst)} len={15} width={7} light={c.light} dark={c.mid} vein={c.dark} />
          {progress > 0.3 && leaf(0, -26, 0, 13)}
        </Group>
      );
    }
    case 'seedling':
      // Maple leaves grow in opposite pairs.
      return (
        <Group>
          <Mound w={48} p={p} />
          {branch('M0 0 C -4 -30, 4 -52, 0 -70', 4.5)}
          {leaf(0, -30, -62, 22, false)}
          {leaf(0, -30, 62, 22)}
          {leaf(0, -52, -46, 20)}
          {leaf(0, -52, 46, 20, false)}
          {leaf(0, -70, 0, 18)}
        </Group>
      );
    case 'bush': {
      const stems: [string, number][] = [
        ['M0 0 C -4 -40, -18 -62, -28 -82', 5],
        ['M0 0 C 4 -40, 18 -66, 26 -86', 5],
        ['M0 0 C -2 -40, 3 -70, 0 -100', 6],
      ];
      const leaves: [number, number, number, number, boolean][] = [
        [-8, -34, -88, 26, false], [8, -38, 86, 26, true], [-16, -58, -70, 28, true], [16, -60, 70, 28, false],
        [-28, -82, -44, 26, true], [-28, -82, -84, 22, false], [26, -86, 46, 26, true], [26, -86, 84, 22, false],
        [-1, -70, -30, 22, false], [1, -78, 32, 22, true], [0, -100, -26, 20, true], [0, -100, 24, 20, false], [0, -100, 0, 22, true],
      ];
      return (
        <Group>
          {ground && <GroundShadow w={92} p={p} />}
          {stems.map(([d, w]) => branch(d, w))}
          {leaves.map(([x, y, a, len, light]) => leaf(x, y, a, len * (0.9 + 0.1 * progress), light))}
        </Group>
      );
    }
    case 'young':
      return (
        <Group>
          {ground && <GroundShadow w={84} p={p} />}
          <Trunk h={124} w={11} s={b} />
          {branch('M0 -92 Q -18 -108, -34 -126', 5)}
          {branch('M0 -100 Q 16 -116, 32 -134', 4)}
          <Crown thirst={thirst} blobs={clumpBlobs([[0, low - 166, 48, 38, 6], [-36, low - 142, 36, 34, 5], [36, low - 144, 36, 36, 5]], seed)} s={s} flecks={14} seed={seed} fleckColor={fleck} leafShape="maple" edgeScale={1.25} />
          <FallingLeaves seed={seed} count={3} cx={0} cy={low - 150} rx={72} ry={54} s={s} />
        </Group>
      );
    case 'tree':
      return (
        <Group>
          {ground && <GroundShadow w={170} p={p} />}
          <Trunk h={150} w={20} s={b} roots />
          {branch('M-2 -96 Q -32 -126, -64 -160', 10)}
          {branch('M2 -110 Q 32 -134, 60 -172', 9)}
          <Crown thirst={thirst} blobs={clumpBlobs([[0, low - 208, 78, 58, 7], [-64, low - 176, 56, 50, 5], [64, low - 180, 56, 52, 5], [0, low - 156, 66, 48, 5]], seed)} s={s} flecks={26} seed={seed} fleckColor={fleck} leafShape="maple" edgeScale={1.25} />
          <Samaras seed={seed} count={4} cx={0} cy={low - 186} rx={120} ry={80} p={p} />
          <FallingLeaves seed={seed} count={5} cx={0} cy={low - 186} rx={120} ry={80} s={s} />
        </Group>
      );
    case 'grand':
      return (
        <Group>
          {ground && <GroundShadow w={240} p={p} />}
          <Trunk h={162} w={32} s={b} roots />
          {branch('M-4 -104 Q -44 -128, -92 -180', 15)}
          {branch('M4 -118 Q 48 -140, 96 -194', 13)}
          <Crown thirst={thirst} blobs={clumpBlobs([[0, low - 230, 96, 66, 8], [-80, low - 190, 66, 60, 6], [80, low - 194, 66, 62, 6], [0, low - 168, 84, 54, 6]], seed)} s={s} flecks={40} seed={seed} fleckColor={fleck} leafShape="maple" edgeScale={1.25} />
          <Samaras seed={seed} count={7} cx={0} cy={low - 202} rx={146} ry={98} p={p} />
          <FallingLeaves seed={seed} count={8} cx={0} cy={low - 202} rx={146} ry={98} s={s} />
          {/* Fallen leaves in the grass instead of flowers. */}
          <Meadow w={270} p={p} seed={seed} flowers={[s.mid, s.light, s.dark]} />
        </Group>
      );
    case 'deadSmall':
      return <DeadSmall p={p} />;
    case 'dead':
      return <DeadTree p={p} scale={1.05} />;
  }
}
