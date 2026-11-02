// "Too early: in 3 h 20 min · Change time": the pill over the crown for a tap before the tree's
// watering hour (OYUUR-33 5.2, frame 07). Like "Already watered" (AlreadyChip), but it has a text
// button, so it takes touches and lives 3 s; a new tap restarts it. By day white, at night the
// sheet's color with the outline.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, SharedValue, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { gameClock, gameDay } from '@/game/dates';
import { minutesUntilOpen, WithHours } from '@/game/tree';
import { T } from '@/i18n';
import { clockNow, useStore } from '@/state/store';
import { colorsFor, elevation, fonts, Txt } from '@/ui/ds';
import { untilText } from '@/ui/watering/format';
import { SceneGeo, slotAt } from '../scene/contract';
import { CHIP } from './timeline';

/** How long the pill stays in full, ms (with CHIP.in and CHIP.out — 3 s). */
const HOLD = 2600;
const HEIGHT = 36;

// A no-break space.
const NBSP = String.fromCharCode(0xa0);
/** "Too early: in 3 h 20 min"; the time itself never breaks (no-break spaces), the line may wrap before it. */
export const earlyText = (minutes: number, t: T) => t('wtEarly', { time: untilText(minutes, t).replace(/ /g, NBSP) });

/** Minutes until the watering hour, read from the clock right now (the screen's clock ticks every 30 s). */
export function useMinutesToOpen() {
  const { settings } = useStore();
  const { minuteOffset, dayOffset } = settings;
  return useCallback(
    (hours: WithHours) => {
      const now = clockNow(minuteOffset);
      return minutesUntilOpen(hours, gameDay(now, dayOffset), gameClock(now));
    },
    [minuteOffset, dayOffset],
  );
}

export function EarlyChip({ pulse, text, top, geo, depth, onChange }: {
  /** Changes on every early tap; 0 = never shown. */
  pulse: number;
  text: string;
  /** Top of the pill, px from the tree's feet. */
  top: number;
  geo: SceneGeo;
  depth: SharedValue<number>;
  /** "Change time": opens the watering-time sheet. */
  onChange: () => void;
}) {
  const { t, night } = useStore();
  const c = colorsFor(night);
  const alpha = useSharedValue(0);
  const scale = useSharedValue(0.9);
  // Faded out it takes no touches and is not read out. The view itself stays mounted: in a browser
  // a view mounted after its animation started may keep its first frame (stuck invisible).
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!pulse) return;
    setOn(true);
    const timer = setTimeout(() => setOn(false), CHIP.in + HOLD + CHIP.out + 30);
    cancelAnimation(alpha);
    cancelAnimation(scale);
    const inn = { duration: CHIP.in, easing: Easing.out(Easing.cubic) };
    alpha.set(withSequence(withTiming(1, inn), withDelay(HOLD, withTiming(0, { duration: CHIP.out, easing: Easing.in(Easing.cubic) }))));
    scale.set(0.9);
    scale.set(withTiming(1, inn));
    return () => clearTimeout(timer);
  }, [pulse, alpha, scale]);

  const style = useAnimatedStyle(() => {
    const s = slotAt(depth.get(), geo);
    return {
      opacity: alpha.get() * Math.max(0, 1 - Math.abs(depth.get()) * 2.5),
      transform: [{ translateX: s.x - geo.width / 2 }, { translateY: s.feetY + top }, { scale: scale.get() }],
    };
  });

  if (!pulse) return null;
  const ink = night ? c.text : '#1E1B16';
  return (
    <Animated.View
      pointerEvents={on ? 'box-none' : 'none'}
      accessibilityElementsHidden={!on}
      importantForAccessibility={on ? 'auto' : 'no-hide-descendants'}
      aria-hidden={on ? undefined : true}
      style={[styles.wrap, { width: geo.width }, style]}
    >
      <View
        style={[
          styles.pill,
          { backgroundColor: night ? c.sheet : '#FFFFFF' },
          night && { borderWidth: 1.5, borderColor: c.outline },
          elevation(1, night),
        ]}
      >
        {/* The wait is the point: on a narrow phone the text takes two lines rather than being cut. */}
        <Txt numberOfLines={2} style={[styles.text, { color: ink }]}>{text}</Txt>
        <Pressable
          onPress={() => {
            setOn(false);
            cancelAnimation(alpha);
            alpha.set(withTiming(0, { duration: CHIP.out }));
            onChange();
          }}
          hitSlop={6}
          accessibilityRole="button"
          style={({ pressed }) => [styles.act, pressed && { opacity: 0.6 }]}
        >
          <Txt numberOfLines={1} style={[styles.actText, { color: night ? '#8BE39B' : c.accentInk }]}>{t('wtChangeTime')}</Txt>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, top: 0, alignItems: 'center', paddingHorizontal: 16 },
  pill: { minHeight: HEIGHT, borderRadius: HEIGHT / 2, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 4, paddingVertical: 4, maxWidth: '100%' },
  text: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, flexShrink: 1, fontVariant: ['tabular-nums'] },
  act: { height: 28, marginLeft: 6, paddingHorizontal: 10, borderRadius: 14, justifyContent: 'center', flexShrink: 0 },
  actText: { fontFamily: fonts.black, fontSize: 13, lineHeight: 18 },
});
