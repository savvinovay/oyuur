// A small flock of distant birds crossing the day sky now and then. Each bird is
// two curved wings that swing around its body; the timetable and the flight
// path come from schedule.ts, so nothing here is rebuilt per frame.
import { Group, Path, Skia, SkPath } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { bird as color } from './colors';
import { birdPose, Flock, MAX_BIRDS } from './schedule';

/** The flock in the air and when it took off; `flock` is null when the sky is empty. */
export interface Flight {
  flock: Flock | null;
  start: number;
}

/** A left wing at rest, from the body at (0, 0) to the tip at (-7, 0), arched up. */
function wingPath(): SkPath {
  const b = Skia.PathBuilder.Make();
  b.moveTo(0, 0);
  b.quadTo(-3.5, -3.6, -7, -0.5);
  return b.detach();
}

const MIRROR = [{ scaleX: -1 }];

function Bird({ index, flight, t, width, wing }: {
  index: number;
  flight: SharedValue<Flight>;
  t: SharedValue<number>;
  width: number;
  wing: SkPath;
}) {
  const pose = useDerivedValue(() => {
    const { flock, start } = flight.value;
    if (!flock) return { x: -100, y: -100, wing: 0, visible: false };
    return birdPose(flock, index, t.value - start, width);
  }, [index, width]);
  const place = useDerivedValue(() => {
    const f = flight.value.flock;
    const s = f && f.birds[index] ? f.birds[index].span / 14 : 1;
    return [{ translateX: pose.value.x }, { translateY: pose.value.y }, { scale: s }];
  }, [index]);
  // Positive angle lifts the left wing's tip; the right wing is its mirror image.
  const flap = useDerivedValue(() => [{ rotate: pose.value.wing }]);
  return (
    <Group transform={place}>
      <Group transform={flap}>
        <Path path={wing} style="stroke" strokeWidth={1.8} strokeCap="round" color={color} />
      </Group>
      <Group transform={MIRROR}>
        <Group transform={flap}>
          <Path path={wing} style="stroke" strokeWidth={1.8} strokeCap="round" color={color} />
        </Group>
      </Group>
    </Group>
  );
}

export function Birds({ flight, t, width }: { flight: SharedValue<Flight>; t: SharedValue<number>; width: number }) {
  const wing = useMemo(wingPath, []);
  return (
    <Group opacity={0.7}>
      {Array.from({ length: MAX_BIRDS }, (_, i) => (
        <Bird key={i} index={i} flight={flight} t={t} width={width} wing={wing} />
      ))}
    </Group>
  );
}
