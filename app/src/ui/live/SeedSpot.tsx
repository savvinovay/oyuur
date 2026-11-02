// No habits yet: a planting hole with a seed in the middle of the meadow. A warm glow
// breathes, a dashed ring slowly turns and a sparkle flashes every 3 s. Tap to plant.
// Its size follows the scene (wave 2 spec, 5.2): the hole is 42 % of the screen wide.
import { Canvas, Circle, DashPathEffect, Group, Oval, Path, RadialGradient, vec } from '@shopify/react-native-skia';
import { useCallback, useEffect } from 'react';
import { Pressable } from 'react-native';
import { FrameInfo, useDerivedValue, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { useStore } from '@/state/store';
import { SceneGeo } from '../scene/contract';
import { liveColors } from './colors';

const STAR = 'M0 -1 Q 0.14 -0.14 1 0 Q 0.14 0.14 0 1 Q -0.14 0.14 -1 0 Q -0.14 -0.14 0 -1 Z';
const GRASS = '#9CCB5E';

/** Diameter of the hole, px, for a scene this wide: 158 on 375, 134 on 320, 181 on 430. */
export const holeDiameter = (width: number) => Math.min(190, Math.max(120, Math.round(width * 0.42)));

/** Everything else is measured from the hole (the spec's numbers at D = 96 were the old size). */
export function seedSpotLayout(width: number) {
  const d = holeDiameter(width);
  const w = 1.5 * d;
  const h = 0.95 * d;
  const ringRx = 0.64 * d;
  return {
    d,
    w,
    h,
    /** The feet line inside the canvas. */
    base: 0.67 * h,
    ringRx,
    ringRy: 0.27 * ringRx,
    glowR: 0.28 * d,
    /** The seed and the sparkle grow with the hole. */
    k: d / 96,
  };
}

export function SeedSpot({ geo, animations, onPress }: { geo: SceneGeo; animations: boolean; onPress: () => void }) {
  const { night, t } = useStore();
  const colors = liveColors(night);
  const { d, w: W, h: H, base: BASE, ringRx, ringRy, glowR, k } = seedSpotLayout(geo.width);
  const time = useSharedValue(0);
  // Stable callback that adds up frame steps (see sky/wind.ts), switched with the setting.
  const tick = useCallback((info: FrameInfo) => {
    'worklet';
    time.set(time.get() + Math.min((info.timeSincePreviousFrame ?? 0) / 1000, 0.1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const clock = useFrameCallback(tick, false);
  useEffect(() => {
    clock.setActive(animations);
    return () => clock.setActive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animations]);

  const cx = W / 2;
  const glowY = BASE - 0.1 * d;
  const glow = useDerivedValue(() => 0.45 + 0.1 * Math.sin((2 * Math.PI * time.get()) / 2.4));
  // The dash pattern (6 + 9) runs once round the ring in ~20 s.
  const dash = useDerivedValue(() => -((time.get() / 20) * 600) % 600);
  const sparkle = useDerivedValue(() => {
    const q = ((time.get() % 3) - 2.2) / 0.6;
    const s = q > 0 && q < 1 ? Math.sin(Math.PI * q) : 0;
    // A new place each time, above the seed.
    const n = Math.floor(time.get() / 3);
    const x = cx + Math.sin(n * 2.4) * 30 * k;
    const y = BASE - (18 + Math.abs(Math.cos(n * 1.7)) * 16) * k;
    return [{ translateX: x }, { translateY: y }, { scale: Math.max(0.001, 5 * k * s) }];
  }, [cx, BASE, k]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('plantFirst')}
      style={{ position: 'absolute', left: geo.width / 2 - W / 2, top: geo.feetY - 8 - BASE, width: W, height: H }}
    >
      <Canvas style={{ width: W, height: H }} pointerEvents="none">
        <Circle cx={cx} cy={glowY} r={glowR} opacity={glow}>
          <RadialGradient c={vec(cx, glowY)} r={glowR} colors={['#FFE9A8', 'rgba(255,233,168,0)']} />
        </Circle>
        <Group transform={[{ translateX: cx }, { translateY: BASE }, { scaleY: 0.27 }]}>
          <Circle cx={0} cy={0} r={d / 2}>
            <RadialGradient c={vec(0, 0)} r={d / 2} colors={[colors.dryEdge, colors.dryCenter, 'rgba(201,154,96,0)']} positions={[0, 0.75, 1]} />
          </Circle>
          <Circle cx={0} cy={0} r={0.215 * d} color={colors.wetMid} opacity={0.55} />
        </Group>
        <Oval x={cx - ringRx} y={BASE - ringRy} width={ringRx * 2} height={ringRy * 2} style="stroke" strokeWidth={2} color="#FFFFFF" opacity={0.85}>
          <DashPathEffect intervals={[6, 9]} phase={dash} />
        </Oval>
        {/* Two tufts of grass at the edges of the hole. */}
        <Tuft x={cx - 0.55 * d} y={BASE + 0.06 * d} h={13} />
        <Tuft x={cx + 0.5 * d} y={BASE - 0.02 * d} h={9} />
        {/* The seed, lying in the hole. */}
        <Group transform={[{ translateX: cx }, { translateY: BASE - 3 * k }, { rotate: -0.35 }, { scale: k }]}>
          <Oval x={-8} y={-5} width={16} height={10} color="#8A5A30" />
          <Oval x={-5} y={-4} width={7} height={3.5} color="#C08A55" opacity={0.8} />
          <Path path="M6 -1 Q 9 -6, 13 -7" style="stroke" strokeWidth={1.8} strokeCap="round" color="#7DB24A" />
        </Group>
        <Group transform={sparkle}>
          <Path path={STAR} color="#FFF6C2" />
        </Group>
      </Canvas>
    </Pressable>
  );
}

/** Three blades of grass `h` px tall, standing on (x, y). */
function Tuft({ x, y, h }: { x: number; y: number; h: number }) {
  const blades = `M0 0 Q -1 ${-h * 0.5}, -4 ${-h * 0.8} M0 0 Q 0.5 ${-h * 0.6}, 1 ${-h} M0 0 Q 1.5 ${-h * 0.45}, 4.5 ${-h * 0.7}`;
  return <Path path={blades} transform={[{ translateX: x }, { translateY: y }]} style="stroke" strokeWidth={1.6} strokeCap="round" color={GRASS} />;
}
