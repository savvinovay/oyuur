// Three layers of clouds drifting right and wrapping around the screen. Each
// cloud is one shape made once (four circles and a rounded strip as a single
// path, so a see-through cloud has no darker overlaps) with a flat shadow below
// and a highlight arc on top; per frame only its position changes.
import { Group, LinearGradient, Oval, Path, Skia, SkPath, vec } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { interpolateColor, SharedValue, useDerivedValue } from 'react-native-reanimated';
import { daySky as summerDay, nightSky as summerNight, SkyColors } from './colors';
import { CLOUD_LAYERS, CloudSpot, cloudX } from './schedule';

interface Shapes {
  body: SkPath;
  light: SkPath;
}

function cloudShapes(): Shapes {
  const body = Skia.PathBuilder.Make();
  body.addCircle(-24, 2, 12);
  body.addCircle(-6, -8, 18);
  body.addCircle(16, -4, 15);
  body.addCircle(32, 4, 9);
  body.addRRect(Skia.RRectXY(Skia.XYWHRect(-36, 2, 70, 12), 6, 6));
  // Arc of a 12 px circle around (-8, -10) from its left to its top: the lit edge.
  const light = Skia.PathBuilder.Make();
  light.addArc(Skia.XYWHRect(-20, -22, 24, 24), 180, 90);
  return { body: body.detach(), light: light.detach() };
}

interface Look {
  body: SharedValue<string[]>;
  light: SharedValue<string>;
  shadow: SharedValue<string>;
}

function Cloud({ spot, shapes, look, drift, cameraX, parallax, width }: {
  spot: CloudSpot;
  shapes: Shapes;
  look: Look;
  drift: SharedValue<number>;
  cameraX: SharedValue<number>;
  parallax: boolean;
  width: number;
}) {
  const { x0, layer, y, scale, stretch } = spot;
  const transform = useDerivedValue(
    () => [
      { translateX: cloudX(x0, layer, drift.value, parallax ? cameraX.value : 0, width) },
      { translateY: y },
      { scaleX: scale * stretch },
      { scaleY: scale },
    ],
    [x0, layer, y, scale, stretch, parallax, width],
  );
  return (
    <Group transform={transform}>
      <Oval x={-42} y={12} width={88} height={8} color={look.shadow} opacity={0.18} />
      <Path path={shapes.body}>
        <LinearGradient start={vec(0, -30)} end={vec(0, 14)} colors={look.body} />
      </Path>
      <Path path={shapes.light} style="stroke" strokeWidth={2.5} strokeCap="round" color={look.light} opacity={0.7} />
    </Group>
  );
}

function Layer({ index, spots, ...rest }: {
  index: number;
  spots: CloudSpot[];
  shapes: Shapes;
  look: Look;
  drift: SharedValue<number>;
  cameraX: SharedValue<number>;
  nightness: SharedValue<number>;
  parallax: boolean;
  width: number;
}) {
  const [day, night] = CLOUD_LAYERS[index].alpha;
  const { nightness } = rest;
  const opacity = useDerivedValue(() => day + (night - day) * nightness.value);
  return (
    <Group opacity={opacity}>
      {spots.map((s, i) => (
        <Cloud key={i} spot={s} {...rest} />
      ))}
    </Group>
  );
}

export function Clouds({ spots, drift, cameraX, nightness, parallax, width, colors }: {
  spots: CloudSpot[];
  drift: SharedValue<number>;
  cameraX: SharedValue<number>;
  nightness: SharedValue<number>;
  /** Shift with the camera; off when animations are off (the ride makes some people queasy). */
  parallax: boolean;
  width: number;
  /** The meadow's sky (meadow/themes.ts); the summer one by default. */
  colors?: { day: SkyColors; night: SkyColors };
}) {
  const shapes = useMemo(cloudShapes, []);
  const daySky = colors?.day ?? summerDay;
  const nightSky = colors?.night ?? summerNight;
  const body = useDerivedValue(() => [
    interpolateColor(nightness.value, [0, 1], [daySky.cloudTop, nightSky.cloudTop]),
    interpolateColor(nightness.value, [0, 1], [daySky.cloudBottom, nightSky.cloudBottom]),
  ]);
  const light = useDerivedValue(() => interpolateColor(nightness.value, [0, 1], [daySky.cloudLight, nightSky.cloudLight]));
  const shadow = useDerivedValue(() => interpolateColor(nightness.value, [0, 1], [daySky.cloudShadow, nightSky.cloudShadow]));
  const look = { body, light, shadow };
  return (
    <Group>
      {CLOUD_LAYERS.map((_, i) => (
        <Layer
          key={i}
          index={i}
          spots={spots.filter((s) => s.layer === i)}
          shapes={shapes}
          look={look}
          drift={drift}
          cameraX={cameraX}
          nightness={nightness}
          parallax={parallax}
          width={width}
        />
      ))}
    </Group>
  );
}
