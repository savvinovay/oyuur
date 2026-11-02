// The sun in the top left corner: a soft breathing glow, a disc and 12 rays
// that turn once a minute. At night it sinks 60 px and fades out.
import { Circle, Group, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { sun } from './colors';

const CORE = 19;
const GLOW = 66;
const RAY_FROM = 26;
const RAY_TO = 35;
/** Seconds per full turn of the rays, and per breath of the glow. */
const TURN = 60;
const BREATH = 4;

export function Sun({ x, y, t, nightness }: { x: number; y: number; t: SharedValue<number>; nightness: SharedValue<number> }) {
  const rays = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.moveTo(x + Math.cos(a) * RAY_FROM, y + Math.sin(a) * RAY_FROM);
      b.lineTo(x + Math.cos(a) * RAY_TO, y + Math.sin(a) * RAY_TO);
    }
    return b.detach();
  }, [x, y]);
  const center = vec(x, y);

  const sink = useDerivedValue(() => [{ translateY: 60 * nightness.value }]);
  const opacity = useDerivedValue(() => 1 - nightness.value);
  const turn = useDerivedValue(() => [{ rotate: ((2 * Math.PI) / TURN) * t.value }]);
  // 1 → 1.08 → 1; at t = 0 (animations off) it rests at 1.
  const breathe = useDerivedValue(() => [{ scale: 1.04 - 0.04 * Math.cos((2 * Math.PI * t.value) / BREATH) }]);

  return (
    <Group transform={sink} opacity={opacity}>
      <Group transform={breathe} origin={center}>
        <Circle cx={x} cy={y} r={GLOW}>
          <RadialGradient c={center} r={GLOW} colors={sun.glow} positions={[0, 0.45, 1]} />
        </Circle>
      </Group>
      <Group transform={turn} origin={center}>
        <Path path={rays} style="stroke" strokeWidth={4} strokeCap="round" color={sun.ray} opacity={0.9} />
      </Group>
      <Circle cx={x} cy={y} r={CORE}>
        {/* The highlight sits up and to the left of the middle. */}
        <RadialGradient c={vec(x - 0.2 * CORE, y - 0.24 * CORE)} r={CORE * 1.15} colors={sun.core} positions={[0, 0.55, 1]} />
      </Circle>
    </Group>
  );
}
