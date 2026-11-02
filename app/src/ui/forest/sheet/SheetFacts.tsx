// The folded forest sheet (spec 6, `peek`): three facts in pills — days of growth of the
// whole forest, trees growing now, trees locked in — and, with shared trees (wave 5), a fourth:
// how many, a tap opens the list on them. Narrow screens get compact pills; so do big numbers
// ("13827 days") that would push the row past the screen's edges.
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Habit, isCompleted, isGrowing } from '@/game/tree';
import { pluralForm } from '@/i18n';
import { useStore } from '@/state/store';
import { Pill } from '@/ui/ds';
import { totalDays } from './status';

// Rough width of a pill, px: padding, glyph and gap, plus the text (measured on Nunito 13 / 12 px bold).
const pillWidth = (label: string, compact: boolean) => (compact ? 36 + label.length * 6 : 48 + label.length * 6.6);

export function SheetFacts({ habits, compact: narrow, together = 0, onTogether }: {
  habits: Habit[];
  compact: boolean;
  /** My shared trees, growing and memories (wave 5): a pill with their number when there are any. */
  together?: number;
  onTogether?: () => void;
}) {
  const { t } = useStore();
  const { width } = useWindowDimensions();
  const total = habits.reduce((sum, h) => sum + totalDays(h), 0);
  const growing = habits.filter((h) => isGrowing(h.current)).length;
  const locked = habits.filter((h) => isCompleted(h.current)).length;
  const word = (words: string[], n: number) => words[pluralForm(t.lang, n)];
  const growLabel = `${growing} ${word(t.dict.growWords, growing)}`;
  const lockLabel = t('inForestShort', { n: locked });
  // The friends glyph says "together": the number is enough.
  const togetherLabel = String(together);
  const fits = (days: string, compact: boolean) => {
    const labels = together > 0 ? [days, growLabel, lockLabel, togetherLabel] : [days, growLabel, lockLabel];
    const gaps = (labels.length - 1) * (compact ? 6 : 8) + (compact ? 16 : 24);
    return labels.reduce((sum, l) => sum + pillWidth(l, compact), 0) + gaps <= Math.min(width, 460);
  };
  const daysLong = `${total} ${word(t.dict.dayWords, total)}`;
  const compact = narrow || !fits(daysLong, false);
  // Still too wide: the rings glyph already says "days".
  const daysLabel = fits(daysLong, compact) ? daysLong : String(total);
  return (
    <View style={[styles.row, compact && styles.compact]}>
      <Pill compact={compact} glyph="rings" label={daysLabel} />
      <Pill compact={compact} glyph="sprout" label={growLabel} />
      <Pill compact={compact} glyph="plaque" label={lockLabel} />
      {together > 0 && (
        <Pressable
          onPress={onTogether}
          disabled={!onTogether}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t('tgFactA11y', { n: together })}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Pill compact={compact} glyph="friends" label={togetherLabel} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingHorizontal: 12, marginTop: 4, height: 32 },
  compact: { gap: 6, paddingHorizontal: 8 },
  pressed: { opacity: 0.7 },
});
