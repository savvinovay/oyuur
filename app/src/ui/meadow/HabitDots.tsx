// Dots on top of the main screen, one per habit. The current habit is a pill; a habit
// still waiting for today's watering is an empty ring, so the row also tells what is
// left to do today. A habit waiting for its watering hour is a ring with clock hands instead
// (OYUUR-33 5.1): not watered yet is not a debt. A tap drives the camera to that habit.
// The row fits between the sun and the hearts. With many habits only a window of dots
// around the current one is shown, like a page control on iOS: the dots at an edge that
// hides more habits are smaller.
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { DayKey } from '@/game/dates';
import { checkedInToday, Habit, isGrowing, OpenHour } from '@/game/tree';
import { useStore } from '@/state/store';
import { hourText } from '@/ui/watering/format';
import { dotWindow } from './dots';

interface Props {
  habits: Habit[];
  active: number;
  today: DayKey;
  /** The row may be at most this wide, px. */
  width: number;
  disabled?: boolean;
  onPress: (index: number) => void;
  /** The hour a habit waits for today (OYUUR-33); null — it doesn't wait. */
  waitsFor?: (h: Habit) => OpenHour | null;
}

export function HabitDots({ habits, active, today, width, disabled, onPress, waitsFor }: Props) {
  const { palette, t } = useStore();
  if (habits.length < 2) return null;
  const { start, end, slot, size } = dotWindow(habits.length, active, width);
  return (
    <View style={styles.row}>
      {habits.slice(start, end).map((h, j) => {
        const i = start + j;
        const waiting = isGrowing(h.current) && !checkedInToday(h.current, today);
        const hour = waiting ? waitsFor?.(h) ?? null : null;
        const k = size(i);
        let dot;
        if (i === active) dot = <View style={[styles.pill, { backgroundColor: palette.text, opacity: 0.9 }]} />;
        else if (hour !== null) dot = <ClockRing color={palette.text} />;
        else if (waiting) dot = <View style={[styles.dot, styles.ring, { borderColor: palette.text }]} />;
        else dot = <View style={[styles.dot, { backgroundColor: palette.text, opacity: 0.38 }]} />;
        return (
          <Pressable
            key={h.lineageId}
            onPress={() => onPress(i)}
            disabled={disabled}
            // The touch area is the Pressable itself: hitSlop does not work in the browser.
            style={[styles.hit, { width: slot }]}
            accessibilityRole="button"
            accessibilityState={{ selected: i === active }}
            accessibilityLabel={
              hour !== null
                ? `${h.current.name}: ${t('wbDotWaits', { time: hourText(hour, t.lang) })}`
                : waiting
                  ? `${h.current.name}: ${t('dotThirsty')}`
                  : isGrowing(h.current)
                    ? `${h.current.name}: ${t('alreadyWatered')}`
                    : h.current.name
            }
          >
            <View style={k < 1 && { transform: [{ scale: k }] }}>{dot}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A 12 px clock (frame 06): a ring and two hands, 1.5 px lines, in the color of the other dots. */
function ClockRing({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 12 12" style={{ opacity: 0.5 }}>
      <G fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <Circle cx={6} cy={6} r={5.1} />
        <Path d="M6 3.3 V6 L7.9 7.1" />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
  hit: { height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  ring: { borderWidth: 1.6, opacity: 0.55 },
  pill: { width: 18, height: 8, borderRadius: 4 },
});
