// Sakura — pink blossoms, a dark reddish trunk and a wide, flat crown with falling petals.
// Sizes follow SIZES.sakura in layout.ts.
import { Circle, Group, Oval } from '@shopify/react-native-skia';
import { Palette } from '../theme';
import { DeadSmall, DeadTree } from './dead';
import { crownBlobs, Crown, droop, GroundShadow, Leaf, leafShades, Meadow, mix, Mound, rng, sag, Shades, Stem, Trunk } from './parts';
import { SkinProps } from './types';

const atNight = (s: Shades, p: Palette): Shades =>
  p.dark
    ? { light: mix(s.light, '#2C2D6A', 0.15), mid: mix(s.mid, '#2C2D6A', 0.2), dark: mix(s.dark, '#2C2D6A', 0.25), deep: mix(s.deep, '#1C1F5C', 0.3) }
    : s;

const blossomShades = (p: Palette) => atNight({ light: '#FFE1EC', mid: '#F8AECB', dark: '#E486AE', deep: '#B85C86' }, p);
const barkShades = (p: Palette) => atNight({ light: '#94604F', mid: '#6E4136', dark: '#552F27', deep: '#3A1F1A' }, p);

/** A five-petal flower. */
function Blossom({ x, y, r, s }: { x: number; y: number; r: number; s: Shades }) {
  return (
    <Group>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        return <Circle key={i} cx={x + Math.cos(a) * r * 0.55} cy={y + Math.sin(a) * r * 0.55} r={r * 0.5} color={i % 2 ? s.light : s.mid} />;
      })}
      <Circle cx={x} cy={y} r={r * 0.28} color="#F7D774" />
    </Group>
  );
}

/** Blossoms dotted over a crown, and petals drifting down beside it. */
function Petals({ seed, cx, cy, rx, ry, flowers, falling, s }: {
  seed: number; cx: number; cy: number; rx: number; ry: number; flowers: number; falling: number; s: Shades;
}) {
  const rand = rng(seed + 5);
  const on = Array.from({ length: flowers }, () => {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * 0.8;
    return { x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d, r: 5 + rand() * 3 };
  });
  const down = Array.from({ length: falling }, (_, i) => {
    const side = i % 2 ? 1 : -1;
    return { x: cx + side * rx * (0.55 + rand() * 0.45), y: cy + ry * (0.6 + rand() * 1.4), a: rand() * 180 };
  });
  return (
    <Group>
      {on.map((f, i) => <Blossom key={`o${i}`} x={f.x} y={f.y} r={f.r} s={s} />)}
      {down.map((f, i) => (
        <Group key={`d${i}`} transform={[{ translateX: f.x }, { translateY: f.y }, { rotate: (f.a * Math.PI) / 180 }]}>
          <Oval x={-3} y={-1.8} width={6} height={3.6} color={s.mid} />
        </Group>
      ))}
    </Group>
  );
}

export function Sakura({ look, progress, p, seed, thirst = 0, ground = true }: SkinProps) {
  const low = sag(thirst);
  const leaf = leafShades(p);
  const pink = blossomShades(p);
  const bark = barkShades(p);
  const green = (x: number, y: number, angle: number, len: number, light = true) => (
    <Leaf key={`${x},${y},${angle}`} x={x} y={y} angle={droop(angle, thirst)} len={len} width={len * 0.55} light={light ? leaf.light : leaf.mid} dark={leaf.dark} vein={leaf.deep} />
  );

  switch (look) {
    case 'sprout':
      return (
        <Group>
          <Mound w={40} p={p} />
          <Stem d="M0 0 Q -3 -14, 0 -26" width={4} color={mix(leaf.mid, bark.mid, 0.35)} shadow={leaf.dark} />
          {green(0, -26, -62, 16)}
          {green(0, -26, 62, 16, false)}
          {progress > 0.3 && <Blossom x={0} y={-31} r={6} s={pink} />}
        </Group>
      );
    case 'seedling':
      return (
        <Group>
          <Mound w={48} p={p} />
          <Stem d="M0 0 C -5 -30, 5 -52, 0 -68" width={4.5} color={bark.mid} shadow={bark.dark} />
          {green(-1, -26, -70, 24, false)}
          {green(1, -38, 68, 26)}
          {green(0, -52, -40, 22)}
          {green(0, -60, 36, 20, false)}
          <Blossom x={0} y={-72} r={9} s={pink} />
          <Blossom x={-14} y={-60} r={6} s={pink} />
        </Group>
      );
    case 'bush': {
      const stems = ['M0 0 C -4 -40, -20 -60, -32 -84', 'M0 0 C 4 -40, 20 -64, 30 -88', 'M0 0 C -2 -40, 3 -70, 0 -100'];
      const flowers: [number, number, number][] = [
        [-32, -88, 9], [-22, -72, 7], [30, -92, 9], [20, -76, 7], [0, -104, 10], [-8, -88, 6], [10, -98, 7], [-40, -76, 6], [40, -80, 6],
      ];
      return (
        <Group>
          {ground && <GroundShadow w={92} p={p} />}
          {stems.map((d) => <Stem key={d} d={d} width={5} color={bark.mid} shadow={bark.dark} />)}
          {green(-6, -36, -86, 28, false)}
          {green(6, -40, 84, 28)}
          {green(-18, -60, -64, 26)}
          {green(18, -62, 64, 26, false)}
          {flowers.map(([x, y, r]) => <Blossom key={`${x},${y}`} x={x} y={y} r={r * (0.9 + 0.1 * progress)} s={pink} />)}
        </Group>
      );
    }
    case 'young':
      return (
        <Group>
          {ground && <GroundShadow w={96} p={p} />}
          <Trunk h={124} w={11} s={bark} lean={-3} />
          <Stem d="M-2 -96 Q -24 -112, -46 -128" width={5} color={bark.mid} shadow={bark.dark} />
          <Stem d="M-1 -104 Q 22 -118, 44 -134" width={4} color={bark.mid} shadow={bark.dark} />
          <Crown thirst={thirst} blobs={crownBlobs(0, low - 150, 75, 46, 8, seed)} s={pink} flecks={10} seed={seed} fleckColor="#FFF4F8" />
          <Petals seed={seed} cx={0} cy={low - 150} rx={75} ry={46} flowers={10} falling={3} s={pink} />
        </Group>
      );
    case 'tree':
      return (
        <Group>
          {ground && <GroundShadow w={200} p={p} />}
          <Trunk h={146} w={20} s={bark} roots lean={-4} />
          <Stem d="M-4 -110 Q -50 -132, -96 -172" width={10} color={bark.mid} shadow={bark.dark} />
          <Stem d="M-2 -124 Q 46 -144, 92 -182" width={9} color={bark.mid} shadow={bark.dark} />
          <Crown thirst={thirst} blobs={crownBlobs(0, low - 195, 125, 57, 12, seed)} s={pink} flecks={20} seed={seed} fleckColor="#FFF4F8" />
          <Petals seed={seed} cx={0} cy={low - 195} rx={125} ry={57} flowers={16} falling={6} s={pink} />
        </Group>
      );
    case 'grand':
      return (
        <Group>
          {ground && <GroundShadow w={240} p={p} />}
          <Trunk h={156} w={32} s={bark} roots lean={-6} />
          <Stem d="M-6 -112 Q -60 -136, -112 -188" width={15} color={bark.mid} shadow={bark.dark} />
          <Stem d="M-2 -130 Q 56 -150, 110 -200" width={13} color={bark.mid} shadow={bark.dark} />
          <Crown thirst={thirst} blobs={crownBlobs(0, low - 220, 140, 70, 14, seed)} s={pink} flecks={30} seed={seed} fleckColor="#FFF4F8" />
          <Petals seed={seed} cx={0} cy={low - 220} rx={140} ry={70} flowers={22} falling={8} s={pink} />
          <Meadow w={260} p={p} seed={seed} flowers={[pink.light, pink.mid, '#FFFFFF']} />
        </Group>
      );
    case 'deadSmall':
      return <DeadSmall p={p} />;
    case 'dead':
      return <DeadTree p={p} scale={1.05} />;
  }
}
