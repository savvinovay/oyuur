// Dead trees look alike for every kind: a wilted sprout, or bare twisted branches.
import { Group, Path } from '@shopify/react-native-skia';
import { Palette } from '../theme';
import { Leaf, mix, Mound, Stem } from './parts';

export function DeadSmall({ p }: { p: Palette }) {
  const wood = p.deadWood;
  return (
    <Group>
      <Mound w={40} p={p} />
      <Stem d="M0 0 Q -2 -28, 14 -36" width={4} color={wood} shadow={mix(wood, '#000000', 0.25)} />
      <Leaf x={14} y={-36} angle={150} len={18} width={11} light="#A88A66" dark="#8A7052" vein={wood} />
      <Leaf x={5} y={-27} angle={-145} len={16} width={10} light="#9C8160" dark="#7E6448" vein={wood} />
    </Group>
  );
}

/** Bare branches, `scale` × about 124 units wide and 132 tall. */
export function DeadTree({ p, scale }: { p: Palette; scale: number }) {
  const wood = p.deadWood;
  const shadow = mix(wood, '#000000', 0.3);
  const branch = (d: string, w: number) => <Stem key={d} d={d} width={w} color={wood} shadow={shadow} />;
  return (
    <Group transform={[{ scale }]}>
      <Path path="M-44 0 Q 0 -8, 44 0 Z" color={p.groundShade} opacity={0.8} />
      {branch('M-4 0 C -2 -40, 6 -60, 0 -92', 11)}
      {branch('M2 -50 C -20 -60, -30 -80, -44 -104', 6)}
      {branch('M-30 -82 L -56 -86', 3.5)}
      {branch('M2 -62 C 22 -70, 34 -88, 46 -108', 6)}
      {branch('M32 -86 L 58 -90', 3.5)}
      {branch('M0 -92 L -10 -118', 4.5)}
      {branch('M0 -92 L 12 -124', 4)}
      {branch('M-10 -118 L -20 -130', 3)}
    </Group>
  );
}
