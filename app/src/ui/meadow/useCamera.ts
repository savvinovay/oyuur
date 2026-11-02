// The camera that rides along the meadow from habit to habit. `cameraX` (in habits)
// lives on the UI thread: the finger drives it directly, a spring finishes the swipe,
// and a tap on the dots drives it smoothly across several habits. React only hears
// about it twice: when the nearest habit changes (focusIndex, for the header and the
// sheet) and when the camera comes to rest (liveIndex, where the live tree stands).
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePanGesture } from 'react-native-gesture-handler';
import { cancelAnimation, Easing, useAnimatedReaction, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { cueHaptic, cueSound } from '../feedback';
import { DRAG_PX } from '../scene/contract';
import { dragCamera, driveDuration, nearestIndex, targetIndex } from './camera';

interface Options {
  /** Habit to start on. */
  initial: number;
  animations: boolean;
  /** Not read any more: ui/feedback follows the vibration setting itself. */
  vibration?: boolean;
  /** Watering or a celebration is on: swipes and dots do nothing. */
  busy: boolean;
  /** The camera came to rest on this habit. */
  onSettle?: (index: number) => void;
}

const DRIVE_EASING = Easing.bezier(0.45, 0, 0.2, 1);
/** With animations off a swipe this long (px) or this fast (px/s) switches the habit. */
const STILL_SWIPE = { distance: 50, speed: 500 };

export function useCamera(n: number, { initial, animations, busy, onSettle }: Options) {
  const cameraX = useSharedValue(initial);
  const [focusIndex, setFocusIndex] = useState(initial);
  const [liveIndex, setLiveIndex] = useState(initial);
  const start = useSharedValue(initial);
  // A programmatic jump: no click of the "detent".
  const silent = useSharedValue(false);

  const onSettleRef = useRef(onSettle);
  onSettleRef.current = onSettle;
  // Where the camera last came to rest: a swipe that springs back home makes no sound.
  const restedAt = useRef(initial);
  const settle = useCallback((index: number) => {
    setFocusIndex(index);
    setLiveIndex(index);
    if (index !== restedAt.current) cueSound('swipe');
    restedAt.current = index;
    onSettleRef.current?.(index);
  }, []);

  // A click like a detent on every habit passed; the sound waits for the stop (settle).
  const click = useCallback(() => cueHaptic('swipe'), []);

  // The nearest habit changed: the header and sheet switch (while they are faded out),
  // and the swipe clicks like a detent, once per habit.
  useAnimatedReaction(
    () => nearestIndex(cameraX.value, n),
    (now, before) => {
      if (before === null || now === before) return;
      scheduleOnRN(setFocusIndex, now);
      if (!silent.value) scheduleOnRN(click);
    },
    [n, click],
  );

  /** A released swipe: spring to `index` (keeping the finger's speed, habits/s) and rest there. */
  const springTo = (index: number, velocity: number) => {
    'worklet';
    if (!animations) {
      cameraX.value = index;
      scheduleOnRN(settle, index);
      return;
    }
    // energyThreshold: stop once the leftover wobble is under a pixel, so the live tree
    // takes over right when the eye sees the camera stop (the default waits ~0.4 s more).
    const config = { damping: 22, stiffness: 180, mass: 1, velocity, energyThreshold: 1e-5 };
    cameraX.value = withSpring(index, config, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(settle, index);
    });
  };

  const gesture = usePanGesture({
    activeOffsetX: [-12, 12],
    failOffsetY: [-14, 14],
    enabled: !busy && n > 0,
    onActivate: () => {
      'worklet';
      cancelAnimation(cameraX);
      silent.value = false;
      start.value = cameraX.value;
    },
    onUpdate: (e) => {
      'worklet';
      // With animations off the camera does not ride along; it jumps on release.
      if (animations) cameraX.value = dragCamera(start.value - e.translationX / DRAG_PX, n);
    },
    onDeactivate: (e) => {
      'worklet';
      const from = nearestIndex(start.value, n);
      if (!animations) {
        const dx = e.translationX;
        const step = dx < -STILL_SWIPE.distance || e.velocityX < -STILL_SWIPE.speed ? 1
          : dx > STILL_SWIPE.distance || e.velocityX > STILL_SWIPE.speed ? -1 : 0;
        springTo(Math.min(Math.max(from + step, 0), n - 1), 0);
        return;
      }
      springTo(targetIndex(cameraX.value, e.velocityX, from, n), -e.velocityX / DRAG_PX);
    },
  });

  /** Drive the camera to a habit (the dots). */
  const goTo = useCallback(
    (index: number) => {
      if (busy || index < 0 || index >= n) return;
      cancelAnimation(cameraX);
      silent.value = false;
      if (!animations) {
        cameraX.value = index;
        settle(index);
        return;
      }
      cameraX.value = withTiming(
        index,
        { duration: driveDuration(index - cameraX.value), easing: DRIVE_EASING },
        (finished) => {
          'worklet';
          if (finished) scheduleOnRN(settle, index);
        },
      );
    },
    [busy, n, animations, settle, cameraX, silent],
  );

  /** Stand on a habit at once, without a ride or a click (links, deleted habits). */
  const jump = useCallback(
    (index: number) => {
      cancelAnimation(cameraX);
      silent.value = true;
      cameraX.value = index;
      restedAt.current = index;
      setFocusIndex(index);
      setLiveIndex(index);
    },
    [cameraX, silent],
  );

  // Fewer habits than the camera stands on (one was deleted): step back inside.
  useEffect(() => {
    if (n > 0 && liveIndex > n - 1) jump(n - 1);
  }, [n, liveIndex, jump]);

  return { cameraX, focusIndex, liveIndex, gesture, goTo, jump };
}
