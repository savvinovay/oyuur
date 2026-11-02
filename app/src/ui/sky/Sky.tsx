// The sky behind the home scene: one Skia canvas from the top of the screen down
// to just below the horizon. By day the sun turns its rays, clouds drift in
// three layers and now and then birds fly by; at night the moon glows, stars
// twinkle and a star falls once in a while. Everything moves on the UI thread
// from the shared wind clock; React renders only when day turns to night.
// Colors and weather come from the meadow the player has put on (meadow/themes.ts).
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Easing,
  interpolateColor,
  SharedValue,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { MEADOW_ABOVE } from '../meadow/Meadow';
import { useMeadow } from '../meadow/useMeadow';
import { WeatherLayer } from '../meadow/WeatherLayer';
import { SceneGeo, Wind } from '../scene/contract';
import { Birds, Flight } from './Birds';
import { Clouds } from './Clouds';
import { Moon } from './Moon';
import {
  cloudLayout,
  Cursor,
  cursorAt,
  cursorStart,
  FLOCKS,
  flockOf,
  gustSpeed,
  meteorOf,
  METEORS,
  starLayout,
} from './schedule';
import { Fall, ShootingStar } from './ShootingStar';
import { Stars } from './Stars';
import { Sun } from './Sun';
import { useWind } from './wind';

/** Where the sun and the moon stand; the theme button sits on top of it. */
export function sunCenter(topInset: number): { x: number; y: number } {
  return { x: 44, y: topInset + 30 };
}

/** The same clouds, stars and birds every time. */
const SKY_SEED = 2026;
/** Day and night swap in this many ms. */
const SWAP = 900;

export interface SkyProps {
  geo: SceneGeo;
  night: boolean;
  /** Already includes the system "reduce motion" setting. */
  animations: boolean;
  /** Which habit the camera looks at (fractional): clouds shift a little with it. */
  cameraX: SharedValue<number>;
  /** The scene's wind from useWind. Pass it so the sky keeps time with the grass and trees; without it the sky runs its own clock. */
  wind?: Wind;
  /** Watering or a celebration is on: no new flocks start meanwhile. */
  busy?: boolean;
}

export function Sky({ geo, night, animations, cameraX, wind: sceneWind, busy = false }: SkyProps) {
  const { theme } = useMeadow();
  const ownWind = useWind(animations && !sceneWind);
  const wind = sceneWind ?? ownWind;
  const { width, height: sceneH, headerBottom, horizonY } = geo;
  const height = horizonY + 10;
  const sun = sunCenter(geo.topInset);

  // 0 by day, 1 by night; in between while they swap.
  const nightness = useSharedValue(night ? 1 : 0);
  useEffect(() => {
    nightness.value = animations
      ? withTiming(night ? 1 : 0, { duration: SWAP, easing: Easing.inOut(Easing.cubic) })
      : night
        ? 1
        : 0;
    // nightness is a stable shared value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [night, animations]);
  // Keep the other half drawn until the swap is over, then drop it.
  const dayShown = useLingering(!night, SWAP + 50);
  const nightShown = useLingering(night, SWAP + 50);

  const clouds = useMemo(() => cloudLayout(SKY_SEED, width, sceneH, headerBottom), [width, sceneH, headerBottom]);
  const stars = useMemo(() => starLayout(SKY_SEED, width, horizonY, sun), [width, horizonY, sun.x, sun.y]); // eslint-disable-line react-hooks/exhaustive-deps

  const busyNow = useSharedValue(busy);
  useEffect(() => {
    busyNow.value = busy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // The sky's own bookkeeping on each tick of the wind clock: how far the clouds
  // have drifted (faster in gusts), which flock is flying, which star is falling.
  const drift = useSharedValue(0);
  const flocks = useSharedValue<Cursor>(cursorStart(FLOCKS, SKY_SEED));
  const meteors = useSharedValue<Cursor>(cursorStart(METEORS, SKY_SEED));
  const flight = useSharedValue<Flight>({ flock: null, start: 0 });
  const fall = useSharedValue<Fall>({ meteor: null, start: 0 });
  useAnimatedReaction(
    () => wind.t.value,
    (t, prev) => {
      // Clouds stay where they are when the clock stops or restarts.
      if (prev !== null && t > prev) drift.value += Math.min(t - prev, 0.1) * gustSpeed(wind.gust.value);
      if (!animations) return;
      const f = cursorAt(FLOCKS, SKY_SEED, flocks.value, t);
      if (f[0] !== flocks.value[0]) {
        flocks.value = f;
        // A flock only starts in the full day and never during watering or a celebration.
        const go = f[0] >= 0 && nightness.value < 0.05 && !busyNow.value;
        flight.value = { flock: go ? flockOf(SKY_SEED, f[0], sceneH, headerBottom) : null, start: f[1] };
      }
      const m = cursorAt(METEORS, SKY_SEED, meteors.value, t);
      if (m[0] !== meteors.value[0]) {
        meteors.value = m;
        const go = m[0] >= 0 && nightness.value > 0.95;
        fall.value = { meteor: go ? meteorOf(SKY_SEED, m[0], width, horizonY) : null, start: m[1] };
      }
    },
    [animations, width, sceneH, headerBottom, horizonY],
  );
  useEffect(() => {
    if (animations) return;
    // Nothing flies while animations are off.
    flight.value = { flock: null, start: 0 };
    fall.value = { meteor: null, start: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animations]);

  const { day: daySky, night: nightSky } = theme.sky;
  const gradient = useDerivedValue(() => {
    const n = nightness.value;
    return [
      interpolateColor(n, [0, 1], [daySky.top, nightSky.top]),
      interpolateColor(n, [0, 1], [daySky.mid, nightSky.mid]),
      interpolateColor(n, [0, 1], [daySky.horizon, nightSky.horizon]),
    ];
  });
  // The weather above the meadow's canvas; the meadow draws the rest (WeatherLayer).
  const meadowTop = horizonY - MEADOW_ABOVE;
  const weatherBox = useMemo(
    () => ({ width, top: 0, grassY: sceneH - 24, bottom: sceneH, horizonY }),
    [width, sceneH, horizonY],
  );

  return (
    <View pointerEvents="none" style={[styles.sky, { width, height }]}>
      <Canvas style={{ width, height }}>
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient start={vec(0, 0)} end={vec(0, height)} colors={gradient} positions={[0, 0.6, 1]} />
        </Rect>
        {nightShown && <Stars dots={stars.dots} sparkles={stars.sparkles} t={wind.t} nightness={nightness} />}
        {nightShown && animations && <ShootingStar fall={fall} t={wind.t} nightness={nightness} />}
        {nightShown && <Moon x={sun.x} y={sun.y} t={wind.t} nightness={nightness} />}
        {dayShown && <Sun x={sun.x} y={sun.y} t={wind.t} nightness={nightness} />}
        <Clouds spots={clouds} drift={drift} cameraX={cameraX} nightness={nightness} parallax={animations} width={width} colors={theme.sky} />
        {dayShown && animations && theme.birds && <Birds flight={flight} t={wind.t} width={width} />}
        {theme.weather && <WeatherLayer kind={theme.weather} night={night} box={weatherBox} t={wind.t} clipBottom={meadowTop} />}
      </Canvas>
    </View>
  );
}

/** True while `on`, and for `ms` more after it turns off. */
function useLingering(on: boolean, ms: number): boolean {
  const [shown, setShown] = useState(on);
  useEffect(() => {
    if (on) {
      setShown(true);
      return;
    }
    const id = setTimeout(() => setShown(false), ms);
    return () => clearTimeout(id);
  }, [on, ms]);
  return on || shown;
}

const styles = StyleSheet.create({
  sky: { position: 'absolute', left: 0, top: 0 },
});
