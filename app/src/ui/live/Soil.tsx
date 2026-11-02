// The planting hole at the tree's feet: dry and cracked while the tree is thirsty,
// a dark wet patch spreading from where the water falls, plain soil for a dead tree
// or a past generation. Drawn with its center at (0, 0) of the feet group.
import { Circle, Group, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { Skin } from '@/game/tree';
import { fallenLeaves, LiveColors } from './colors';
import { DROP_FALL, Frame, lerp, SPOUT } from './timeline';

/** Height of the hole as a share of its width: seen from low above. */
const FLAT = 0.16;

/** Width of the hole, px, for a tree of this drawn width. */
export const holeWidth = (treeW: number) => Math.max(90, Math.min(170, treeW * 0.85));

const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function Soil({ width, frame, neutral, colors, skin }: {
  width: number;
  frame: SharedValue<Frame>;
  /** Dead tree or a past generation: no water, no cracks. */
  neutral: boolean;
  colors: LiveColors;
  skin: Skin;
}) {
  const rx = width / 2;
  const ry = rx * FLAT;
  const hole = useMemo(() => Skia.Path.Oval(Skia.XYWHRect(-rx, -ry, rx * 2, ry * 2)), [rx, ry]);
  // A few cracks running out from the middle, flat like the hole.
  const cracks = useMemo(() => {
    const lines = [
      [[-0.12, 0.1], [-0.34, -0.2], [-0.55, -0.1], [-0.7, -0.35]],
      [[0.08, -0.15], [0.3, -0.45], [0.52, -0.35]],
      [[0.15, 0.2], [0.38, 0.35], [0.62, 0.15], [0.75, 0.3]],
      [[-0.05, 0.3], [-0.25, 0.55], [-0.45, 0.5]],
      [[0.3, -0.45], [0.36, -0.7]],
    ];
    return lines.map((pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x * rx} ${y * ry}`).join(' ')).join(' ');
  }, [rx, ry]);

  const crackAlpha = useDerivedValue(() => frame.get().cracks * 0.7);
  const fallenAlpha = useDerivedValue(() => frame.get().fallen);
  const wetAlpha = useDerivedValue(() => (frame.get().wet > 0 ? 1 : 0));
  // Wet soil replaces the dry one: no light dry rim is left around the dark patch.
  // Late in the spreading, so the dry hole doesn't fade before the water gets there.
  const dryAlpha = useDerivedValue(() => {
    const w = frame.get().wet;
    return 1 - w * w;
  });
  const shineAlpha = useDerivedValue(() => frame.get().wet * colors.wetShine);
  // The wet patch grows from where the drops land to the whole hole, darkest in the
  // middle and melting into the meadow at the edge (no outline).
  const landX = SPOUT.x - 18 * DROP_FALL;
  const wetC = useDerivedValue(() => vec(lerp(landX, 0, frame.get().wet), 0));
  const wetR = useDerivedValue(() => lerp(10, rx, frame.get().wet));

  if (neutral) {
    return (
      <Group transform={[{ scaleY: FLAT }]}>
        <Circle cx={0} cy={0} r={rx}>
          <RadialGradient c={vec(0, 0)} r={rx} colors={[colors.neutral, colors.neutral, alpha(colors.neutral, 0)]} positions={[0, 0.8, 1]} />
        </Circle>
      </Group>
    );
  }

  const fallen = fallenLeaves[skin] ?? colors.fallen;
  return (
    <Group>
      {/* Dry soil. */}
      <Group transform={[{ scaleY: FLAT }]} opacity={dryAlpha}>
        <Circle cx={0} cy={0} r={rx}>
          <RadialGradient c={vec(0, 0)} r={rx} colors={[colors.dryCenter, colors.dryEdge, alpha(colors.dryEdge, 0)]} positions={[0, 0.82, 1]} />
        </Circle>
      </Group>
      <Path path={cracks} style="stroke" strokeWidth={1.3} strokeCap="round" strokeJoin="round" color={colors.crack} opacity={crackAlpha} />
      {/* Wet patch, kept inside the hole. */}
      <Group clip={hole} opacity={wetAlpha}>
        <Group transform={[{ scaleY: FLAT }]}>
          <Circle c={wetC} r={wetR}>
            <RadialGradient c={wetC} r={wetR} colors={[colors.wetCenter, colors.wetMid, alpha(colors.wetMid, 0)]} positions={[0, 0.75, 1]} />
          </Circle>
        </Group>
        {/* A soft glint of water, not a hard-edged spot. */}
        <Group transform={[{ translateX: -rx * 0.28 }, { translateY: -ry * 0.3 }, { scaleY: FLAT }]} opacity={shineAlpha}>
          <Circle cx={0} cy={0} r={rx * 0.3}>
            <RadialGradient c={vec(0, 0)} r={rx * 0.3} colors={['#FFFFFF', 'rgba(255,255,255,0)']} />
          </Circle>
        </Group>
      </Group>
      {/* Two leaves the thirsty tree has dropped (a spruce drops nothing). */}
      {skin !== 'spruce' && (
        <Group opacity={fallenAlpha}>
          <FallenLeaf x={-rx * 0.55} y={ry * 0.1} angle={-0.5} color={fallen[0]} />
          <FallenLeaf x={rx * 0.62} y={-ry * 0.2} angle={0.9} color={fallen[1]} />
        </Group>
      )}
    </Group>
  );
}

function FallenLeaf({ x, y, angle, color }: { x: number; y: number; angle: number; color: string }) {
  return (
    <Group transform={[{ translateX: x }, { translateY: y }, { rotate: angle }, { scaleY: 0.55 }]}>
      <Path path="M-6 0 C -3 -3.2, 3 -3.2, 6 0 C 3 3.2, -3 3.2, -6 0 Z" color={color} />
      <Path path="M-5 0 L5 0" style="stroke" strokeWidth={0.6} color="#000000" opacity={0.15} />
    </Group>
  );
}
