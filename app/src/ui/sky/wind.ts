// The scene's one clock. A single frame callback counts seconds since the screen
// opened and works out the wind from the gust timetable (schedule.ts); the sky,
// the grass, the live tree and the neighbours all read these two numbers, so
// the wind is the same everywhere.
import { useCallback, useEffect } from 'react';
import { FrameInfo, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { Wind } from '../scene/contract';
import { Cursor, cursorAt, cursorStart, gustFromCursor, GUST_BASE, GUSTS } from './schedule';

/** Gusts follow this seed: the same rhythm every time the app opens. */
export const WIND_SEED = 7;

/** With animations off the clock stands at 0 and there is no wind at all. */
export function useWind(animations: boolean): Wind {
  const t = useSharedValue(0);
  const gust = useSharedValue(animations ? GUST_BASE : 0);
  const cursor = useSharedValue<Cursor>(cursorStart(GUSTS, WIND_SEED));

  // The clock adds up frame steps itself: useFrameCallback registers a new callback
  // (and restarts timeSinceFirstFrame) whenever the function changes, so it is kept
  // stable and never relies on that counter. A long pause counts as one short step.
  const tick = useCallback((frame: FrameInfo) => {
    'worklet';
    const step = Math.min((frame.timeSincePreviousFrame ?? 0) / 1000, 0.1);
    const now = t.value + step;
    const c = cursorAt(GUSTS, WIND_SEED, cursor.value, now);
    if (c[0] !== cursor.value[0]) cursor.value = c;
    t.value = now;
    gust.value = gustFromCursor(WIND_SEED, c, now);
    // The shared values are stable for the life of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const clock = useFrameCallback(tick, false);

  useEffect(() => {
    clock.setActive(animations);
    if (!animations) {
      // Starting again restarts the clock, and the gusts with it.
      t.value = 0;
      gust.value = 0;
      cursor.value = cursorStart(GUSTS, WIND_SEED);
    }
    return () => clock.setActive(false);
    // clock and the shared values are stable for the life of the screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animations]);

  return { t, gust };
}
