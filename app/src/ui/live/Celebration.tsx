// The new-stage show around the tree (spec 8.6): the scene darkens, light flashes,
// rays turn behind the tree. Also the +1 token that flies to the ring counter.
// All of it is driven by the frame of timeline.ts; nothing here keeps its own time.
import { Circle, Group, Path, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { fx, LiveColors } from './colors';
import { Frame } from './timeline';

const rgba = (rgb: number[], a: number) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

/** Darkens everything under the canvas, less around the tree. Root coordinates. */
export function Dim({ width, height, cx, cy, frame, fade, colors }: {
  width: number; height: number; cx: number; cy: number;
  frame: SharedValue<Frame>; fade: SharedValue<number>; colors: LiveColors;
}) {
  const opacity = useDerivedValue(() => frame.get().dim * fade.get());
  const [r, g, b, a] = colors.dim;
  return (
    <Rect x={0} y={0} width={width} height={height} opacity={opacity}>
      <RadialGradient c={vec(cx, cy)} r={230} colors={[rgba([r, g, b], a * 0.25), rgba([r, g, b], a)]} positions={[0, 1]} />
    </Rect>
  );
}

/** Twelve rays from behind the crown, slowly turning. Feet coordinates. */
export function Rays({ cx, cy, frame, fade, bright }: {
  cx: number; cy: number; frame: SharedValue<Frame>; fade: SharedValue<number>; bright: boolean;
}) {
  const path = useMemo(() => {
    const len = 300;
    let d = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const a1 = a - 0.1;
      const a2 = a + 0.1;
      d += `M0 0 L${Math.cos(a1) * len} ${Math.sin(a1) * len} L${Math.cos(a2) * len} ${Math.sin(a2) * len} Z `;
    }
    return d;
  }, []);
  const transform = useDerivedValue(() => [{ translateX: cx }, { translateY: cy }, { rotate: frame.get().raysRot }]);
  const opacity = useDerivedValue(() => Math.min(1, frame.get().raysAlpha * fade.get() * (bright ? 1.2 : 1)));
  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={path}>
        <RadialGradient c={vec(0, 0)} r={300} colors={[fx.rayIn, 'rgba(255,231,160,0.55)', 'rgba(255,231,160,0)']} positions={[0, 0.35, 1]} />
      </Path>
    </Group>
  );
}

/** A ring of light rushing out of the crown. Feet coordinates. */
export function Flash({ cx, cy, reach, frame, fade, colors }: {
  cx: number; cy: number; reach: number; frame: SharedValue<Frame>; fade: SharedValue<number>; colors: LiveColors;
}) {
  const r = useDerivedValue(() => Math.max(1, frame.get().flashR * reach));
  const opacity = useDerivedValue(() => frame.get().flashAlpha * colors.flashAlpha * fade.get());
  const n = parseInt(colors.flash.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (
    <Circle cx={cx} cy={cy} r={r} opacity={opacity}>
      <RadialGradient c={vec(cx, cy)} r={r} colors={[rgba(rgb, 1), rgba(rgb, 0.85), rgba(rgb, 0)]} positions={[0, 0.6, 1]} />
    </Circle>
  );
}

/**
 * The green +1 token: pops up over the crown and flies along a curve to the ring
 * counter. Root coordinates; `from` and `to` are set when the watering starts.
 * In the celebration it comes out of the flash beside the crown and goes up the
 * right side, then across under the header, away from where the ribbon will be.
 */
export function Token({ frame, from, to, fade, stage }: {
  frame: SharedValue<Frame>;
  from: SharedValue<{ x: number; y: number }>;
  to: SharedValue<{ x: number; y: number }>;
  fade: SharedValue<number>;
  stage: boolean;
}) {
  const transform = useDerivedValue(() => {
    const f = frame.get();
    const a = from.get();
    const b = to.get();
    // Quadratic Bézier. Watering: control point 70 px right and 90 px up from the start.
    const cx = stage ? a.x + 50 : a.x + 70;
    const cy = stage ? b.y + 24 : a.y - 90;
    const t = f.tokenT;
    const u = 1 - t;
    return [
      { translateX: u * u * a.x + 2 * u * t * cx + t * t * b.x },
      { translateY: u * u * a.y + 2 * u * t * cy + t * t * b.y },
      { scale: f.tokenScale },
    ];
  }, [stage]);
  const opacity = useDerivedValue(() => frame.get().tokenAlpha * fade.get());
  return (
    <Group transform={transform} opacity={opacity}>
      <Circle cx={0} cy={1.5} r={16} color="#000000" opacity={0.12} />
      <Circle cx={0} cy={0} r={16} color={fx.token} />
      <Circle cx={0} cy={0} r={16} style="stroke" strokeWidth={2.5} color="#FFFFFF" />
      {/* "+1" drawn as shapes: no font needed on the canvas. */}
      <Path path="M-10.5 0 H-2.5 M-6.5 -4 V4" style="stroke" strokeWidth={2.6} strokeCap="round" color="#FFFFFF" />
      <Path path="M2 -4 L5.5 -7 V7" style="stroke" strokeWidth={2.8} strokeCap="round" strokeJoin="round" color="#FFFFFF" />
    </Group>
  );
}
