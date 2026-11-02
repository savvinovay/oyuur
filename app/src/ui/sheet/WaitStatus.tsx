// The status line of a tree before its watering hour (OYUUR-33 5.1, frames 05, 06, 06b, 07b):
// the gold clock, "You can water it from 18:00" (under an hour — "in 42 min"; a change for
// tomorrow — "Today from 18:00, tomorrow from 12:00") and an arrow. A tap opens the watering-time
// sheet. The third "too early" tap on the tree within 10 s pulses the arrow once: the time is
// changed here. Also the "until 3:00 at night" line after midnight. Used by the main screen's
// sheet and the shared tree's status.
import { useCallback, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { DAY_START_HOUR } from '@/game/dates';
import { T } from '@/i18n';
import { useStore } from '@/state/store';
import { colorsFor, Icon, MAX_FONT_SCALE, Txt } from '@/ui/ds';
import { askTime, earlyTap, useChannel } from '@/ui/live/events';
import { ClockGlyph } from '@/ui/watering/art';
import { fromText, hourText, untilText } from '@/ui/watering/format';
import { earlyStreak, WaitLine } from './wait';

/** The title of a waiting tree's status line. */
export function waitTitle(line: Extract<WaitLine, { kind: 'from' | 'in' }>, t: T): string {
  if (line.kind === 'in') return t('wbIn', { t: untilText(line.minutes, t) });
  const time = hourText(line.hour, t.lang);
  // "с 12:00" never breaks between its words (a no-break space) when the line wraps on a narrow phone.
  const when = fromText(line.tomorrow ?? 0, t).replace(/ /g, ' ');
  return line.tomorrow === null ? t('wbFrom', { time }) : t('wbTodayTomorrow', { time, when });
}

/** "You can water it from 18:00 ⌄": pressable, opens the watering-time sheet of `treeId`. */
export function WaitTitle({ treeId, line, animations }: { treeId: string; line: Extract<WaitLine, { kind: 'from' | 'in' }>; animations: boolean }) {
  const { t, night } = useStore();
  const c = colorsFor(night);
  // The arrow's pulse: 1 → 1.35 → 1 twice (2 × 300 ms), its color from soft to the text's.
  const pulse = useSharedValue(0);
  const taps = useRef<number[]>([]);
  useChannel(
    earlyTap,
    useCallback(
      (e: { treeId: string }) => {
        if (e.treeId !== treeId) return;
        const s = earlyStreak(taps.current, Date.now());
        taps.current = s.taps;
        if (!s.third || !animations) return;
        const half = { duration: 150, easing: Easing.inOut(Easing.quad) };
        pulse.set(withSequence(withTiming(1, half), withTiming(0, half), withTiming(1, half), withTiming(0, half)));
      },
      [treeId, animations, pulse],
    ),
  );
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.35 * pulse.get() }] }));
  const strongStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));
  const title = waitTitle(line, t);
  return (
    <Pressable
      onPress={() => askTime.emit({ treeId })}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${t('wbChangeA11y')}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <ClockGlyph size={20} />
      <Txt variant="bodyStrong" numberOfLines={2} style={styles.title}>{title}</Txt>
      <Animated.View style={arrowStyle}>
        <Icon name="chevronDown" size={16} color={c.textSoft} strokeWidth={2.6} />
        <Animated.View style={[StyleSheet.absoluteFill, strongStyle]}>
          <Icon name="chevronDown" size={16} color={c.text} strokeWidth={2.8} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/** After midnight, still open: "You can water it until 3:00 at night" (the day ends at 3:00). */
export function LateLine() {
  const { t, night } = useStore();
  const c = colorsFor(night);
  return (
    <View style={styles.late}>
      <Icon name="clock" size={15} color={c.textSoft} />
      <Txt variant="small" color={c.textSoft} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.shrink}>
        {t('wbLate', { time: hourText(DAY_START_HOUR, t.lang) })}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  title: { textAlign: 'left', flexShrink: 1, fontVariant: ['tabular-nums'] },
  late: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, maxWidth: '100%' },
  shrink: { flexShrink: 1, textAlign: 'center' },
});
