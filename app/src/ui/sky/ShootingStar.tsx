// Now and then at night a star falls: a bright head with a 90 px trail fading to
// nothing, gone in 0.65 s. The timetable is in schedule.ts.
import { Circle, Group, Line, LinearGradient } from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { Meteor, meteorPose } from './schedule';

/** The shooting star in the air and when it started; `meteor` is null when there is none. */
export interface Fall {
  meteor: Meteor | null;
  start: number;
}

const TRAIL = ['rgba(255,255,255,0.95)', 'rgba(255,255,255,0)'];

export function ShootingStar({ fall, t, nightness }: { fall: SharedValue<Fall>; t: SharedValue<number>; nightness: SharedValue<number> }) {
  const pose = useDerivedValue(() => {
    const { meteor, start } = fall.value;
    if (!meteor) return { headX: -50, headY: -50, tailX: -50, tailY: -50, alpha: 0 };
    return meteorPose(meteor, t.value - start);
  });
  const head = useDerivedValue(() => ({ x: pose.value.headX, y: pose.value.headY }));
  const tail = useDerivedValue(() => ({ x: pose.value.tailX, y: pose.value.tailY }));
  const opacity = useDerivedValue(() => pose.value.alpha * nightness.value);
  return (
    <Group opacity={opacity}>
      <Line p1={head} p2={tail} style="stroke" strokeWidth={1.6} strokeCap="round">
        <LinearGradient start={head} end={tail} colors={TRAIL} />
      </Line>
      <Circle c={head} r={1.6} color="#FFFFFF" />
    </Group>
  );
}
