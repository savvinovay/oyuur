// The moon where the sun was: a pale disc with three craters and a lilac glow
// that slowly breathes. By day it hides 60 px lower and faded out.
import { Circle, Group, RadialGradient, vec } from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { moon } from './colors';

const DISC = 18;
const GLOW = 62;
const BREATH = 6;

export function Moon({ x, y, t, nightness }: { x: number; y: number; t: SharedValue<number>; nightness: SharedValue<number> }) {
  const rise = useDerivedValue(() => [{ translateY: 60 * (1 - nightness.value) }]);
  const opacity = useDerivedValue(() => nightness.value);
  // Glow opacity 0.85 ↔ 1.0.
  const glow = useDerivedValue(() => 0.925 - 0.075 * Math.cos((2 * Math.PI * t.value) / BREATH));

  return (
    <Group transform={rise} opacity={opacity}>
      <Circle cx={x} cy={y} r={GLOW} opacity={glow}>
        <RadialGradient c={vec(x, y)} r={GLOW} colors={moon.glow} />
      </Circle>
      <Circle cx={x} cy={y} r={DISC} color={moon.disc} />
      <Circle cx={x - 6} cy={y - 5} r={4} color={moon.crater} />
      <Circle cx={x + 6} cy={y + 6} r={3} color={moon.crater} />
      <Circle cx={x + 5} cy={y - 7} r={1.8} color={moon.crater} />
    </Group>
  );
}
