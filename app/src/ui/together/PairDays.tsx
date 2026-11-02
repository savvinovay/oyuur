// Days of a shared tree with two dots each — mine on the left, the friend's on the right
// (спец-друзья 8.4, 8.5). `PairDays`: the last 7 days on the shared tree's screen, a sprout
// under a counted day, a snowflake under a day a shared chance covered, today framed (blue,
// green once both watered). `PairStrip`: the main screen's 5 day cards around today.
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { addDays } from '@/game/dates';
import type { SharedTree } from '@/game/shared';
import { useStore } from '@/state/store';
import type { OpenHour } from '@/game/tree';
import { elevation, fonts, Glyph, Icon, motion, Txt, useColors, useMotionOn } from '@/ui/ds';
import { hourText } from '@/ui/watering/format';
import { PairDay, pairDays } from './model';

function Dots({ d, size }: { d: PairDay; size: number }) {
  const c = useColors();
  const dot = (on: boolean) => <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: on ? c.accent : c.sunken }} />;
  return (
    <View style={styles.dots}>
      {dot(d.mine)}
      {dot(d.theirs)}
    </View>
  );
}

/** The last 7 days, today on the right. `days` may hold today back (it shows counted only after the "+1" landed). */
export function PairDays({ s, me, holdToday = false, compact = false }: { s: SharedTree; me: string; holdToday?: boolean; compact?: boolean }) {
  const { today, night, t } = useStore();
  // On a narrow phone "today" does not fit a column: the frame alone tells it, the label is the weekday.
  const narrow = useWindowDimensions().width < 360;
  const c = useColors();
  const motionOn = useMotionOn();
  const days = pairDays(s, me, today, addDays(today, -6), 7);
  return (
    <View style={styles.week}>
      {days.map((d) => {
        const counted = d.counted && !(holdToday && d.today);
        const frame = d.today ? { borderWidth: 2, borderColor: counted ? c.accent : c.water } : null;
        const weekday = t.dict.weekdays[new Date(`${d.day}T12:00:00`).getDay()];
        return (
          <View
            key={d.day}
            style={[
              styles.col,
              compact && styles.colCompact,
              // "today" is a long word for a 45 px column (it was cut to "сегод…"): its column is wider.
              d.today && !narrow && styles.colToday,
              elevation(1, night),
              { backgroundColor: c.card, opacity: d.before || d.after ? 0.4 : 1 },
              frame,
            ]}
            accessibilityLabel={`${d.today ? t('dayToday') : d.day}${counted ? ' ✓' : ''}`}
          >
            <Txt numberOfLines={1} style={[styles.weekday, { color: d.today ? c.waterInk : c.textSoft }]}>{d.today && !narrow ? t('dayToday') : weekday}</Txt>
            {!d.before && !d.after && <Dots d={d} size={10} />}
            <View style={styles.mark}>
              {counted ? (
                <Animated.View key="sprout" entering={d.today && motionOn ? ZoomIn.springify().damping(motion.spring.pop.damping).stiffness(motion.spring.pop.stiffness) : undefined}>
                  <Glyph name="sprout" size={18} />
                </Animated.View>
              ) : d.frozen ? (
                <Glyph name="snowflake" size={16} />
              ) : d.died ? (
                <Glyph name="tombstone" size={16} />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Five day cards around today for the main screen's sheet (frame 26): two days back, today, two ahead. */
export function PairStrip({ s, me, waitHour = null }: {
  s: SharedTree;
  me: string;
  /** Today before my watering hour (OYUUR-33): a gray frame, the clock and the hour, as on my own trees. */
  waitHour?: OpenHour | null;
}) {
  const { today, night, t } = useStore();
  const c = useColors();
  const days = pairDays(s, me, today, addDays(today, -2), 5);
  return (
    <View style={styles.strip}>
      {days.map((d) => {
        const weekday = t.dict.weekdays[new Date(`${d.day}T12:00:00`).getDay()];
        const waits = d.today && !d.counted && waitHour !== null;
        const frame = d.today ? { borderWidth: 3, borderColor: d.counted ? c.accent : waits ? c.textMuted : c.water } : null;
        return (
          <View
            key={d.day}
            style={[
              styles.card,
              !d.future && elevation(1, night),
              { backgroundColor: d.future ? c.sunken : c.card, opacity: d.future ? 0.55 : d.before || d.after ? 0.4 : 1 },
              frame,
            ]}
          >
            <Txt variant="caption" numberOfLines={1} style={{ color: d.future ? c.textMuted : c.text, fontSize: 13 }}>{d.today ? t('dayToday') : weekday}</Txt>
            <Txt variant="number" style={{ color: d.future ? c.textMuted : c.text }}>{Number(d.day.slice(8))}</Txt>
            <View style={styles.cardMark}>
              {waits ? (
                <View style={styles.wait}>
                  <Icon name="clock" size={12} color={c.textSoft} strokeWidth={2.6} />
                  <Txt numberOfLines={1} style={[styles.waitText, { color: c.textSoft }]}>{hourText(waitHour, t.lang)}</Txt>
                </View>
              ) : d.frozen ? (
                <Glyph name="snowflake" size={16} />
              ) : d.died ? (
                <Glyph name="tombstone" size={16} />
              ) : !d.future && !d.before && !d.after ? (
                <Dots d={d} size={9} />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  week: { flexDirection: 'row', gap: 5, paddingHorizontal: 12 },
  col: { flex: 1, height: 70, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 5 },
  colCompact: { height: 58, gap: 3 },
  colToday: { flex: 1.45 },
  weekday: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, letterSpacing: -0.3 },
  dots: { flexDirection: 'row', gap: 4 },
  mark: { height: 18, justifyContent: 'center' },
  strip: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center' },
  card: { flex: 1, maxWidth: 66, height: 80, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  cardMark: { height: 20, justifyContent: 'center' },
  wait: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  waitText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
});
