// Settings → Reminders (OYUUR-23): on/off, "Last chance" on/off, the hour for "Do" trees (20:00 by default),
// what comes next, and — when the phone doesn't allow notifications — how to allow them. Android only:
// the web and iPhone get their reminders in OYUUR-24, until then this screen leads back to Settings.
import { Redirect } from 'expo-router';
import { ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { addDays } from '@/game/dates';
import { useStore } from '@/state/store';
import { Button, fonts, Group, Icon, Page, Row, rowTint, Toggle, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { hourText } from '@/ui/watering/format';
import { askPermission, getPermission, openPhoneSettings, Permission, remindersSupported, sendTest } from '@/remind/notify';
import { DO_HOURS, LAST_CHANCE_HOUR, planReminders } from '@/remind/plan';
import { setPrefs, useRemindPrefs } from '@/remind/prefs';
import { treeUrl } from '@/remind/schedule';
import { reminderText } from '@/remind/text';

/** How many coming reminders the screen lists. */
const NEXT = 3;
const HOUR_W = 64;
const HOUR_GAP = 8;

export default function RemindersScreen() {
  if (!remindersSupported) return <Redirect href="/settings" />;
  return <Reminders />;
}

/** The phone's permission, checked again whenever the app comes back (from the phone's settings). */
function usePermission(): [Permission | null, () => void] {
  const [p, setP] = useState<Permission | null>(null);
  const check = useCallback(() => {
    getPermission().then(setP, () => setP({ granted: false, canAsk: false }));
  }, []);
  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [check]);
  return [p, check];
}

function Reminders() {
  const { t, trees, settings, today, clock } = useStore();
  const c = useColors();
  const prefs = useRemindPrefs();
  const [perm, recheck] = usePermission();
  const hoursRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const blocked = perm !== null && !perm.granted;

  const allow = async () => {
    cue('select');
    if (perm?.canAsk) {
      await askPermission().catch(() => null);
      recheck();
    } else openPhoneSettings();
  };

  const next = useMemo(
    () => planReminders({ trees, prefs, now: new Date(), dayOffset: settings.dayOffset, minuteOffset: settings.minuteOffset }).slice(0, NEXT),
    // The clock's hour too: what is "next" moves while the screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trees, prefs, settings.dayOffset, settings.minuteOffset, today, clock.hour],
  );
  // "today, 18:00", "tonight, 1:00", "tomorrow, 18:00", "tomorrow night, 1:00" (the game day's 1:00 is after midnight).
  const whenText = (kind: 'open' | 'last', day: string, hour: number) => {
    const rel = day === today ? 0 : day === addDays(today, 1) ? 1 : -1;
    const word = kind === 'open'
      ? [t('rmToday'), t('rmTomorrow')][rel]
      : [t('rmTonight'), t('rmTomorrowNight')][rel];
    // Further days (rare: only when nothing comes sooner) — by the date, "31.10".
    return `${word ?? `${day.slice(8)}.${day.slice(5, 7)}`}, ${hourText(hour, t.lang)}`;
  };

  const test = async () => {
    cue('select');
    if (blocked) return allow();
    const first = trees.find((x) => x.diedOn === null && x.completedOn === null);
    const sample = next.find((r) => r.kind === 'open');
    const text = sample
      ? reminderText(sample, t)
      : reminderText({ kind: 'open', trees: [{ id: first?.id ?? '', label: first ? (first.visibility === 'private' ? first.nickname : first.name) : null, days: first?.checkins.length ?? 0, dies: false }] }, t);
    await sendTest(text.title, text.body, treeUrl(sample?.trees[0]?.id ?? first?.id ?? '')).catch(() => {});
    showQuestHint(t('rmTestSent'), 3000);
  };

  return (
    <Page title={t('rmTitle')}>
      <ScrollView contentContainerStyle={styles.body}>
        {blocked ? (
          <View style={[styles.blocked, { backgroundColor: c.tintQuests }]}>
            <View style={styles.blockedHead}>
              <View style={[styles.blockedIcon, { backgroundColor: rowTint.danger }]}>
                <Icon name="bell" size={18} color="#FFFFFF" strokeWidth={2.3} />
              </View>
              <View style={styles.blockedText}>
                <Txt variant="bodyStrong">{t('rmBlocked')}</Txt>
                <Txt variant="small" color={c.textSoft}>{t('rmBlockedSub')}</Txt>
              </View>
            </View>
            <Button size="m" title={perm?.canAsk ? t('rmAllow') : t('rmOpenSettings')} onPress={allow} cue={null} style={styles.allow} testID="remind-allow" />
          </View>
        ) : null}

        {/* While the phone doesn't allow them, the settings are dimmed: they wait for the permission. */}
        <View style={blocked ? styles.dim : null}>
        <Group style={styles.first}>
          <Row
            icon="bell"
            tint={rowTint.reminders}
            label={t('rmOn')}
            right={<Toggle value={prefs.on} onChange={(on) => {
                setPrefs({ on });
                // Turned on while the phone doesn't allow them: its question at once.
                if (on && perm && !perm.granted && perm.canAsk) void allow();
              }} accessibilityLabel={t('rmOn')} />}
            below={<Txt variant="small" color={c.textSoft}>{t('rmOnSub', { time: hourText(18, t.lang) })}</Txt>}
          />
          {prefs.on ? (
            <Row
              icon="hourglass"
              tint={rowTint.danger}
              label={t('rmLast')}
              right={<Toggle value={prefs.lastChance} onChange={(lastChance) => setPrefs({ lastChance })} accessibilityLabel={t('rmLast')} />}
              below={<Txt variant="small" color={c.textSoft}>{t('rmLastSub', { time: hourText(LAST_CHANCE_HOUR, t.lang) })}</Txt>}
            />
          ) : null}
        </Group>

        {prefs.on ? (
          <Group title={t('rmDoTime')}>
            <Row
              icon="clock"
              tint={rowTint.vibration}
              label={t('rmDoPick')}
              right={<Txt variant="title3" style={{ color: c.text }}>{hourText(prefs.doHour, t.lang)}</Txt>}
              below={
                <View style={styles.belowGap}>
                  <Txt variant="small" color={c.textSoft}>{t('rmDoTimeSub')}</Txt>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.hours}
                    ref={hoursRef}
                    // The chosen hour is in sight when the screen opens (20:00 is far to the right).
                    onLayout={() => hoursRef.current?.scrollTo({ x: Math.max(0, DO_HOURS.indexOf(prefs.doHour) - 1) * (HOUR_W + HOUR_GAP), animated: false })}
                  >
                    {DO_HOURS.map((h) => {
                      const on = h === prefs.doHour;
                      return (
                        <Pressable
                          key={h}
                          onPress={() => {
                            cue('select');
                            setPrefs({ doHour: h });
                          }}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={hourText(h, t.lang)}
                          style={[styles.hour, { backgroundColor: on ? c.accent : c.sunken }]}
                          hitSlop={4}
                        >
                          <Txt style={[styles.hourText, { color: on ? '#FFFFFF' : c.text }]}>{hourText(h, t.lang)}</Txt>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              }
            />
          </Group>
        ) : null}

        {prefs.on ? (
          <Group title={t('rmNext')}>
            {next.length === 0 ? (
              <Row label={t('rmNextNone')} />
            ) : (
              next.map((r) => {
                const text = reminderText(r, t);
                const time = whenText(r.kind, r.day, r.hour);
                return (
                  <View key={r.key} style={styles.next}>
                    <Txt style={[styles.nextTime, { color: r.kind === 'last' ? c.dangerText : c.accent }]}>{time}</Txt>
                    <Txt variant="bodyStrong" numberOfLines={2}>{text.title}</Txt>
                    <Txt variant="small" color={c.textSoft} numberOfLines={2}>{text.body}</Txt>
                  </View>
                );
              })
            )}
          </Group>
        ) : null}

        </View>

        <Txt style={[styles.note, { color: c.textSoft }]}>{t('rmQuiet')}</Txt>
        <Txt style={[styles.note, styles.noteNext, { color: c.textSoft }]}>{t('rmHiddenNote')}</Txt>

        {prefs.on ? <Button size="m" variant="secondary" title={t('rmTest')} onPress={test} cue={null} style={styles.test} testID="remind-test" /> : null}
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  blocked: { borderRadius: 20, padding: 16, marginTop: 12 },
  blockedHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  blockedIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  blockedText: { flex: 1, gap: 2 },
  allow: { marginTop: 12 },
  dim: { opacity: 0.5 },
  first: { marginTop: 12 },
  noteNext: { marginTop: 6 },
  belowGap: { gap: 10 },
  hours: { gap: HOUR_GAP, paddingRight: 8 },
  hour: { width: HOUR_W, height: 40, borderRadius: 20, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  hourText: { fontFamily: fonts.bold, fontSize: 15 },
  next: { gap: 2, paddingHorizontal: 16, paddingVertical: 12 },
  nextTime: { fontFamily: fonts.black, fontSize: 13, letterSpacing: 0.2 },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginTop: 12, marginHorizontal: 8 },
  test: { marginTop: 16 },
});
