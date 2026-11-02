// Spruce — tiers of dark needles in a tall cone, cones hanging on big trees.
// Sizes follow SIZES.spruce in layout.ts.
import { Group, LinearGradient, Oval, Path, vec } from '@shopify/react-native-skia';
import { Palette } from '../theme';
import { DeadSmall, DeadTree } from './dead';
import { barkShades, droop, GroundShadow, Leaf, Meadow, mix, Mound, rng, Shades, Stem, Trunk } from './parts';
import { SkinProps } from './types';

const needleShades = (p: Palette): Shades =>
  p.dark
    ? { light: '#4F8A4A', mid: '#2F6A3C', dark: '#1F4E2E', deep: '#13321F' }
    : { light: '#76B65E', mid: '#43914B', dark: '#2C6E3C', deep: '#1B4A2A' };

/**
 * One tier of branches: a wide skirt from its tip down to a jagged lower edge.
 * `y` is the lower edge, `top` the tip, `half` half of the width.
 */
function Tier({ y, top, half, s, seed }: { y: number; top: number; half: number; s: Shades; seed: number }) {
  const rand = rng(seed);
  const teeth = Math.max(3, Math.round(half / 9));
  let edge = '';
  for (let i = teeth; i >= -teeth; i--) {
    const x = (i / teeth) * half;
    const dip = i === teeth || i === -teeth ? 0 : (i % 2 ? -1 : 1) * (2 + rand() * 3);
    edge += ` L ${x} ${y + dip - Math.abs(x / half) * 4}`;
  }
  const d = `M0 ${top} Q ${half * 0.35} ${top + (y - top) * 0.45}, ${half} ${y - 4}${edge} Q ${-half * 0.35} ${top + (y - top) * 0.45}, 0 ${top} Z`;
  return (
    <Group>
      {/* Shadow cast by the tier on the one below. */}
      <Path path={`M${-half * 0.9} ${y - 2} Q 0 ${y + 9}, ${half * 0.9} ${y - 2} Z`} color={s.deep} opacity={0.6} />
      <Path path={d}>
        <LinearGradient start={vec(-half, top)} end={vec(half, y)} colors={[s.light, s.mid, s.dark]} positions={[0, 0.45, 1]} />
      </Path>
      {/* A few needle strokes catching the light. */}
      <Path
        path={`M${-half * 0.55} ${y - 6} Q ${-half * 0.3} ${top + (y - top) * 0.55}, ${-half * 0.08} ${top + (y - top) * 0.3}`}
        style="stroke" strokeWidth={Math.max(1, half * 0.04)} strokeCap="round" color={s.light} opacity={0.7}
      />
    </Group>
  );
}

/** A cone of `count` tiers from `bottom` up to `h`, `w` wide at the bottom. */
function Cone({ h, bottom, w, count, s, seed }: { h: number; bottom: number; w: number; count: number; s: Shades; seed: number }) {
  const span = (h - bottom) / count;
  const tiers = Array.from({ length: count }, (_, i) => {
    const y = -bottom - i * span;
    const share = 1 - i / count;
    return { y, top: Math.max(-h, y - span * 2.1), half: (w / 2) * (0.22 + 0.78 * share) };
  });
  return (
    <Group>
      {tiers.map((t, i) => <Tier key={i} y={t.y} top={t.top} half={t.half} s={s} seed={seed + i} />)}
      {/* The very tip. */}
      <Path path={`M0 ${-h} L ${w * 0.05} ${-h + span * 0.9} L ${-w * 0.05} ${-h + span * 0.9} Z`} color={s.mid} />
    </Group>
  );
}

/** Spruce cones hanging under the tiers. */
function Cones({ seed, count, h, bottom, w }: { seed: number; count: number; h: number; bottom: number; w: number }) {
  const rand = rng(seed + 9);
  return (
    <Group>
      {Array.from({ length: count }, (_, i) => {
        const share = 0.15 + rand() * 0.55;
        const y = -bottom - (h - bottom) * share;
        const x = (i % 2 ? 1 : -1) * (w / 2) * (1 - share) * (0.55 + rand() * 0.3);
        return (
          <Group key={i}>
            <Oval x={x - 3} y={y} width={6} height={12} color="#8A5A30" />
            <Path path={`M${x - 2} ${y + 3} L ${x + 2} ${y + 5} M${x - 2} ${y + 7} L ${x + 2} ${y + 9}`} style="stroke" strokeWidth={1} color="#5E3B1C" />
          </Group>
        );
      })}
    </Group>
  );
}

export function Spruce({ look, progress, p, seed, thirst = 0, ground = true }: SkinProps) {
  const s = needleShades(p);
  const bark = barkShades(p);
  const needle = (x: number, y: number, angle: number, len: number) => (
    <Leaf key={`${x},${y},${angle}`} x={x} y={y} angle={droop(angle, thirst * 0.6)} len={len} width={len * 0.22} light={s.light} dark={s.dark} vein={s.dark} />
  );

  switch (look) {
    case 'sprout':
      // A conifer seedling: a little star of needles on a stalk.
      return (
        <Group>
          <Mound w={34} p={p} />
          <Stem d="M0 0 L0 -24" width={3.5} color={mix(s.mid, bark.mid, 0.4)} shadow={s.dark} />
          {[-70, -40, -12, 12, 40, 70].map((a) => needle(0, -24, a, 14))}
          {progress > 0.3 && needle(0, -24, 0, 16)}
        </Group>
      );
    case 'seedling':
      return (
        <Group>
          <Mound w={44} p={p} />
          <Stem d="M0 0 L0 -70" width={4} color={bark.mid} shadow={bark.dark} />
          {[-62, -34, 34, 62].map((a) => needle(0, -26, a, 20))}
          {[-58, -30, 30, 58].map((a) => needle(0, -46, a, 17))}
          {[-50, -20, 0, 20, 50].map((a) => needle(0, -68, a, 15))}
        </Group>
      );
    case 'bush':
      return (
        <Group>
          {ground && <GroundShadow w={72} p={p} />}
          <Trunk h={18} w={8} s={bark} />
          <Cone h={128} bottom={10} w={84} count={4} s={s} seed={seed} />
        </Group>
      );
    case 'young':
      return (
        <Group>
          {ground && <GroundShadow w={92} p={p} />}
          <Trunk h={34} w={12} s={bark} />
          <Cone h={210} bottom={24} w={104} count={6} s={s} seed={seed} />
        </Group>
      );
    case 'tree':
      return (
        <Group>
          {ground && <GroundShadow w={130} p={p} />}
          <Trunk h={44} w={18} s={bark} roots />
          <Cone h={272} bottom={32} w={150} count={8} s={s} seed={seed} />
          <Cones seed={seed} count={4} h={272} bottom={32} w={150} />
        </Group>
      );
    case 'grand':
      return (
        <Group>
          {ground && <GroundShadow w={190} p={p} />}
          <Trunk h={52} w={26} s={bark} roots />
          <Cone h={304} bottom={38} w={200} count={10} s={s} seed={seed} />
          <Cones seed={seed} count={7} h={304} bottom={38} w={200} />
          <Meadow w={190} p={p} seed={seed} flowers={['#FFFFFF', '#B9D7F7', '#F7E36B']} />
        </Group>
      );
    case 'deadSmall':
      return <DeadSmall p={p} />;
    case 'dead':
      return <DeadTree p={p} scale={1.1} />;
  }
}
