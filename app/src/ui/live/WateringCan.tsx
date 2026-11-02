// The watering can, drawn in code: about 84 × 54 px, the tip of its spout at (0, 0),
// so tipping it to pour turns it around the spout and the stream starts in one place.
import { Group, LinearGradient, Path, vec } from '@shopify/react-native-skia';
import { SharedValue, useDerivedValue } from 'react-native-reanimated';
import { fx } from './colors';
import { Frame, SPOUT } from './timeline';

const BODY = 'M31 8 L75 8 Q79 8 78.6 12 L76 41 Q75.4 46 70 46 L38 46 Q32.6 46 32 41 L29.4 12 Q29 8 31 8 Z';
const SHADE = 'M62 8 L75 8 Q79 8 78.6 12 L76 41 Q75.4 46 70 46 L60 46 Z';
const HANDLE = 'M42 8 C 43 -12, 68 -12, 70 8';
const BACK_HANDLE = 'M77 14 C 90 14, 92 34, 76.5 36';
const SPOUT_TUBE = 'M33 36 L5 5';
const ROSE = 'M-2 -1 L6 -6 L10 3 L1 7 Z';

export function WateringCan({ frame }: { frame: SharedValue<Frame> }) {
  const transform = useDerivedValue(() => {
    const f = frame.get();
    return [
      { translateX: SPOUT.x + f.canShift },
      { translateY: SPOUT.y },
      { rotate: (f.canTilt * Math.PI) / 180 },
      { scale: f.canScale },
    ];
  });
  const opacity = useDerivedValue(() => frame.get().canAlpha);
  return (
    <Group transform={transform} opacity={opacity}>
      <Path path={BACK_HANDLE} style="stroke" strokeWidth={5} strokeCap="round" color={fx.canRim} />
      <Path path={HANDLE} style="stroke" strokeWidth={5} strokeCap="round" color={fx.canRim} />
      <Path path={SPOUT_TUBE} style="stroke" strokeWidth={6} strokeCap="round" color={fx.canRim} />
      <Path path={SPOUT_TUBE} style="stroke" strokeWidth={2.4} strokeCap="round" color={fx.canBody} />
      <Path path={ROSE} color={fx.canRim} />
      <Path path={BODY}>
        <LinearGradient start={vec(29, 0)} end={vec(79, 0)} colors={[fx.canShade, fx.canBody, fx.canBody, fx.canShade]} positions={[0, 0.3, 0.7, 1]} />
      </Path>
      <Path path={SHADE} color={fx.canShade} opacity={0.35} />
      <Path path="M37 14 L37 38" style="stroke" strokeWidth={4} strokeCap="round" color={fx.canShine} opacity={0.85} />
      <Path path="M28 8 L80 8" style="stroke" strokeWidth={4} strokeCap="round" color={fx.canRim} />
    </Group>
  );
}
