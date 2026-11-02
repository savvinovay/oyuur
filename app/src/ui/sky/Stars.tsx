// Night stars: white dots and golden four-pointed sparkles. They twinkle in three
// groups with their own periods instead of one animation per star, and show up
// in the second half of the day-to-night change.
import { Circle, Group, Path, Skia, SkPath, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { star as colors } from './colors';
import { Star, twinkle } from './schedule';

/** Four points with soft curved sides, like on the night background picture. */
function sparklePath(x: number, y: number, k: number): SkPath {
  const a = k * 1.6;
  const c = k * 0.25;
  const b = Skia.PathBuilder.Make();
  b.moveTo(x, y - a);
  b.quadTo(x + c, y - c, x + a, y);
  b.quadTo(x + c, y + c, x, y + a);
  b.quadTo(x - c, y + c, x - a, y);
  b.quadTo(x - c, y - c, x, y - a);
  b.close();
  return b.detach();
}

function TwinkleGroup({ group, dots, sparkles, t, nightness }: {
  group: number;
  dots: Star[];
  sparkles: { star: Star; path: SkPath }[];
  t: SharedValue<number>;
  nightness: SharedValue<number>;
}) {
  // Stars appear between 0.4 and 1.0 of the way to night.
  const opacity = useDerivedValue(() => Math.min(1, Math.max(0, (nightness.value - 0.4) / 0.6)) * twinkle(group, t.value));
  // Sparkles also breathe a little: 0.9–1.1 of their size.
  const size = useDerivedValue(() => [{ scale: 1 + (twinkle(group, t.value) - 0.6) / 4 }]);
  return (
    <Group opacity={opacity}>
      {dots.map((d, i) => (
        <Circle key={i} cx={d.x} cy={d.y} r={d.r} color={colors.dot} opacity={d.alpha} />
      ))}
      {sparkles.map(({ star: s, path }, i) => (
        <Group key={i} transform={size} origin={vec(s.x, s.y)}>
          <Path path={path} color={colors.sparkle} opacity={s.alpha} />
        </Group>
      ))}
    </Group>
  );
}

export function Stars({ dots, sparkles, t, nightness }: {
  dots: Star[];
  sparkles: Star[];
  t: SharedValue<number>;
  nightness: SharedValue<number>;
}) {
  const shapes = useMemo(() => sparkles.map((s) => ({ star: s, path: sparklePath(s.x, s.y, s.r) })), [sparkles]);
  return (
    <Group>
      {[0, 1, 2].map((g) => (
        <TwinkleGroup
          key={g}
          group={g}
          dots={dots.filter((d) => d.group === g)}
          sparkles={shapes.filter((s) => s.star.group === g)}
          t={t}
          nightness={nightness}
        />
      ))}
    </Group>
  );
}
