// A friend's trees on their profile (спец-друзья 6.5, frames 16, 22): one row per habit — picture,
// name (or habit), habit (or "stage · kind"), days · chances · "try 2"; on the right today's state.
// A previous try that died gets a footnote. Hidden trees are one row with only their number.
// Rows open the friend's forest on that tree. On a narrow screen (under 360) the state is only its
// sign, so the name and the hearts keep one line each.
// OYUUR-34 (спец 5.4): a tree waiting for its watering hour shows the gold clock and "from 18:00".
import { Fragment } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { DayKey } from '@/game/dates';
import { checkedInToday, growthDays, Habit, isCompleted, isDead, isGrowing, MAX_CHANCES, stageOf, wateringOpensAt } from '@/game/tree';
import { pluralForm } from '@/i18n';
import { useStore } from '@/state/store';
import { elevation, fonts, Glyph, GlyphName, Icon, Txt, useColors, withAlpha } from '@/ui/ds';
import { StateMark } from '@/ui/watering/art';
import { fromText } from '@/ui/watering/format';
import { previousTry, waitingNow } from './model';
import { TreeBox } from './TreeBox';

export function FriendTrees({ rows, hidden, noData, today, emptyText, onOpen }: {
  rows: Habit[];
  hidden: number;
  /** Their phone sent nothing today: today's state is unknown. */
  noData: boolean;
  today: DayKey;
  /** "Aisha isn't sharing trees yet". */
  emptyText: string;
  onOpen: (lineageId: string) => void;
}) {
  const { t, night, clock } = useStore();
  const c = useColors();
  const compact = useWindowDimensions().width < 360;
  const divider = <View style={[styles.divider, { backgroundColor: c.divider }]} />;
  const lock = (
    <View style={[styles.lock, { backgroundColor: c.sunken, borderColor: c.textMuted }]}>
      <Icon name="lock" size={24} color={c.textSoft} />
    </View>
  );

  return (
    <View>
      <View style={[styles.card, elevation(1, night), { backgroundColor: c.card }]}>
        {rows.length === 0 && hidden === 0 && (
          <View style={[styles.row, styles.short]}>
            {lock}
            <Txt style={[styles.title, styles.flex]}>{emptyText}</Txt>
          </View>
        )}
        {rows.map((h, i) => {
          const x = h.current;
          const days = growthDays(x);
          const growing = isGrowing(x);
          const stage = t.dict.stageNames[stageOf(days).stage];
          const skin = t.dict.skinNames[x.skin].toLocaleLowerCase(t.lang);
          const second = x.nickname ? x.name : `${stage} · ${skin}`;
          let st: { glyph: GlyphName | 'clock' | null; text: string; color: string };
          if (isCompleted(x)) st = { glyph: 'plaque', text: t('frStLocked'), color: c.textSoft };
          else if (isDead(x)) st = { glyph: 'tombstone', text: t('frStMemory'), color: c.textSoft };
          else if (checkedInToday(x, today)) st = { glyph: 'check', text: t('frStWatered'), color: c.doneInk };
          else if (waitingNow(x, today, clock)) st = { glyph: 'clock', text: fromText(wateringOpensAt(x, today), t), color: c.textSoft };
          else if (noData) st = { glyph: null, text: t('frStNoData'), color: c.textSoft };
          else st = { glyph: 'drop', text: t('frStWaiting'), color: c.waterInk };
          const prev = previousTry(h);
          return (
            <Fragment key={h.lineageId}>
              {i > 0 && divider}
              <Pressable
                onPress={() => onOpen(h.lineageId)}
                accessibilityRole="button"
                accessibilityLabel={`${x.nickname ?? x.name}. ${second}. ${t('frDaysShort', { n: days })}. ${st.text}`}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: withAlpha(c.sunken, 0.5) }]}
              >
                <TreeBox box={56} days={days} skin={x.skin} seed={x.id} dead={isDead(x)} completed={isCompleted(x)} />
                <View style={styles.flex}>
                  <Txt numberOfLines={1} style={styles.title}>{x.nickname ?? x.name}</Txt>
                  <Txt numberOfLines={1} style={[styles.sub, { color: c.textSoft }]}>{second}</Txt>
                  <View style={styles.facts}>
                    <Glyph name="rings" size={14} />
                    <Txt numberOfLines={1} style={[styles.fact, styles.keep, { color: c.textSoft }]}>{t('frDaysShort', { n: days })}</Txt>
                    {/* Each part keeps together; on a narrow screen a part moves to the next line whole. */}
                    {growing && (
                      <View style={styles.part}>
                        <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
                        {Array.from({ length: MAX_CHANCES }, (_, k) => (
                          <Glyph key={k} name={k < x.chancesLeft ? 'heart' : 'heartEmpty'} size={13} />
                        ))}
                      </View>
                    )}
                    {x.generation > 1 && (
                      <View style={styles.part}>
                        <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
                        <Glyph name="seed" size={14} />
                        <Txt style={[styles.fact, { color: c.textSoft }]}>{t('frTryN', { n: x.generation })}</Txt>
                      </View>
                    )}
                  </View>
                </View>
                <View style={compact ? styles.stateCompact : styles.state}>
                  {st.glyph ? <StateMark name={st.glyph} size={24} /> : <Icon name="hourglass" size={22} color={c.textSoft} strokeWidth={2} />}
                  {!compact && <Txt numberOfLines={1} style={[styles.stateText, { color: st.color }]}>{st.text}</Txt>}
                </View>
              </Pressable>
              {prev && (
                <View style={styles.prev}>
                  <Glyph name="stump" size={18} />
                  <Txt numberOfLines={2} style={[styles.prevText, { color: c.textSoft }]}>
                    {t('frPrevTry', { habit: prev.name, days: t('frDaysShort', { n: growthDays(prev) }) })}
                  </Txt>
                </View>
              )}
            </Fragment>
          );
        })}
        {hidden > 0 && (
          <>
            {rows.length > 0 && divider}
            <View style={[styles.row, styles.short]}>
              {lock}
              <View style={styles.flex}>
                <Txt style={styles.title}>{t('frHiddenTrees', { n: hidden, word: t.dict.frHiddenWords[pluralForm(t.lang, hidden)] })}</Txt>
                <Txt style={[styles.sub, { color: c.textSoft }]}>{t('frHiddenWhy')}</Txt>
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth * 2, marginLeft: 80 },
  row: { minHeight: 76, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  short: { minHeight: 68 },
  flex: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.black, fontSize: 16, lineHeight: 21 },
  sub: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 3, marginTop: 1 },
  fact: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, marginLeft: 2 },
  dot: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 4 },
  state: { width: 72, alignItems: 'center', gap: 2 },
  stateCompact: { width: 28, alignItems: 'center' },
  keep: { flexShrink: 0 },
  part: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stateText: { fontFamily: fonts.black, fontSize: 11.5, lineHeight: 16 },
  lock: { width: 56, height: 56, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  prev: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10, marginTop: -4 },
  prevText: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 17, flex: 1 },
});
