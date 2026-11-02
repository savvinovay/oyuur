// Oak — the default kind. Lobed leaves, a round crown and acorns on big trees.
// Sizes follow SIZES.oak in layout.ts.
import { Circle, Group, Oval, Path } from '@shopify/react-native-skia';
import { barkShades, crownBlobs, Crown, droop, GroundShadow, Leaf, leafShades, Meadow, Mound, rng, sag, Stem, Trunk } from './parts';
import { DeadSmall, DeadTree } from './dead';
import { SkinProps } from './types';

export function Oak({ look, progress, p, seed, thirst = 0, ground = true }: SkinProps) {
  const hang = (a: number) => droop(a, thirst);
  const low = sag(thirst);
  const leaf = leafShades(p);
  const bark = barkShades(p);
  const oakLeaf = (x: number, y: number, angle: number, len: number, light = true) => (
    <Leaf key={`${x},${y},${angle}`} x={x} y={y} angle={hang(angle)} len={len} width={len * 0.82} light={light ? leaf.light : leaf.mid} dark={leaf.dark} vein={leaf.deep} oak />
  );

  switch (look) {
    case 'sprout':
      return (
        <Group>
          <Mound w={40} p={p} />
          <Stem d="M0 0 Q -3 -14, 0 -26" width={4} color={leaf.mid} shadow={leaf.dark} />
          <Leaf x={0} y={-26} angle={hang(-62)} len={16} width={13} light={leaf.light} dark={leaf.mid} vein={leaf.dark} />
          <Leaf x={0} y={-26} angle={hang(62)} len={16} width={13} light={leaf.light} dark={leaf.mid} vein={leaf.dark} />
          {progress > 0.3 && oakLeaf(0, -26, 0, 12 * Math.min(1, progress + 0.2))}
        </Group>
      );
    case 'seedling':
      return (
        <Group>
          <Mound w={48} p={p} />
          <Stem d="M0 0 C -6 -30, 6 -52, 0 -66" width={5} color={leaf.mid} shadow={leaf.dark} />
          {oakLeaf(-1, -28, -72, 26, false)}
          {oakLeaf(1, -42, 66, 28)}
          {oakLeaf(0, -56, -38, 24)}
          {oakLeaf(0, -66, 28, 20, false)}
          {oakLeaf(0, -66, -4, 18)}
        </Group>
      );
    case 'bush': {
      const stems: [string, number][] = [
        ['M0 0 C -4 -40, -18 -62, -28 -82', 5],
        ['M0 0 C 4 -40, 18 -66, 26 -86', 5],
        ['M0 0 C -2 -40, 3 -70, 0 -100', 6],
      ];
      const leaves: [number, number, number, number, boolean][] = [
        [-8, -34, -88, 30, false], [8, -38, 86, 30, true], [-16, -58, -70, 32, true], [16, -60, 70, 32, false],
        [-28, -82, -44, 30, true], [-28, -82, -84, 26, false], [26, -86, 46, 30, true], [26, -86, 84, 26, false],
        [-1, -70, -30, 26, false], [1, -78, 32, 26, true], [0, -100, -26, 22, true], [0, -100, 24, 22, false], [0, -100, 0, 24, true],
      ];
      return (
        <Group>
          {ground && <GroundShadow w={96} p={p} />}
          {stems.map(([d, w]) => <Stem key={d} d={d} width={w} color={leaf.mid} shadow={leaf.dark} />)}
          {leaves.map(([x, y, a, len, light]) => oakLeaf(x, y, a, len * (0.9 + 0.1 * progress), light))}
        </Group>
      );
    }
    case 'young':
      return (
        <Group>
          {ground && <GroundShadow w={84} p={p} />}
          <Trunk h={130} w={11} s={bark} />
          <Stem d="M0 -96 Q -16 -110, -30 -130" width={5} color={bark.mid} shadow={bark.dark} />
          <Stem d="M0 -104 Q 14 -118, 28 -138" width={4} color={bark.mid} shadow={bark.dark} />
          <Crown thirst={thirst} blobs={crownBlobs(0, low - 150, 68, 50, 7, seed)} s={leaf} flecks={16} seed={seed} />
        </Group>
      );
    case 'tree':
      return (
        <Group>
          {ground && <GroundShadow w={170} p={p} />}
          <Trunk h={160} w={22} s={bark} roots />
          <Stem d="M-2 -100 Q -30 -130, -62 -168" width={10} color={bark.mid} shadow={bark.dark} />
          <Stem d="M2 -116 Q 30 -140, 58 -182" width={9} color={bark.mid} shadow={bark.dark} />
          <Crown thirst={thirst} blobs={crownBlobs(0, low - 185, 115, 77, 11, seed)} s={leaf} flecks={30} seed={seed} />
          <Acorns seed={seed} count={4} cx={0} cy={low - 185} rx={115} ry={77} />
        </Group>
      );
    case 'grand':
      return (
        <Group>
          {ground && <GroundShadow w={240} p={p} />}
          <Trunk h={170} w={34} s={bark} roots />
          <Stem d="M-4 -104 Q -44 -128, -92 -180" width={15} color={bark.mid} shadow={bark.dark} />
          <Stem d="M4 -118 Q 48 -140, 96 -194" width={13} color={bark.mid} shadow={bark.dark} />
          <Crown thirst={thirst} blobs={crownBlobs(0, low - 200, 146, 100, 14, seed)} s={leaf} flecks={44} seed={seed} />
          <Acorns seed={seed} count={7} cx={0} cy={low - 200} rx={146} ry={100} />
          <Meadow w={270} p={p} seed={seed} flowers={['#F4A6C6', '#F7E36B', '#FFFFFF']} />
        </Group>
      );
    case 'deadSmall':
      return <DeadSmall p={p} />;
    case 'dead':
      return <DeadTree p={p} scale={1.05} />;
  }
}

/** Acorns hanging along the lower edge of the crown. */
function Acorns({ seed, count, cx, cy, rx, ry }: { seed: number; count: number; cx: number; cy: number; rx: number; ry: number }) {
  const rand = rng(seed + 11);
  return (
    <Group>
      {Array.from({ length: count }, (_, i) => {
        const a = Math.PI * (0.2 + (0.6 * (i + rand() * 0.6)) / count);
        const x = cx + Math.cos(a) * rx * 0.72;
        const y = cy + Math.sin(a) * ry * 0.7;
        return (
          <Group key={i}>
            <Oval x={x - 3.6} y={y - 1} width={7.2} height={9} color="#C98B3E" />
            <Circle cx={x - 1.2} cy={y + 2.2} r={1.3} color="#E7B66E" />
            <Path path={`M${x - 4.4} ${y + 0.5} Q ${x} ${y - 4.5}, ${x + 4.4} ${y + 0.5} Z`} color="#7A5530" />
            <Path path={`M${x} ${y - 3} L${x + 0.8} ${y - 5.5}`} style="stroke" strokeWidth={1.2} color="#7A5530" strokeCap="round" />
          </Group>
        );
      })}
    </Group>
  );
}
