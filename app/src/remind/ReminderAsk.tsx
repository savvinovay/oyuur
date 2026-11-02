// "Remind you to water?" (OYUUR-23): once, after a watering, when its show is over and no other sheet is up
// (the home screen decides, app/index.tsx). Never at the first start. "Remind me" — the phone's own question
// (Android 13+); "Not now" — never asked again by itself, Settings → Reminders turns them on.
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useStore } from '@/state/store';
import { Button, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { ModalSheet } from '@/ui/shop/ModalSheet';
import { hourText } from '@/ui/watering/format';
import { askPermission, getPermission, remindersSupported } from './notify';
import { getPrefs, loadPrefs, setPrefs } from './prefs';

/** The default hour of "Quit" trees, said in the ask. */
const QUIT_HOUR = 18;

/** Whether to ask now: Android, reminders on, never asked, the phone doesn't allow them yet. */
export async function shouldAskReminders(): Promise<boolean> {
  if (!remindersSupported) return false;
  const prefs = await loadPrefs();
  if (prefs.asked || !prefs.on) return false;
  try {
    const p = await getPermission();
    // Allowed already (Android 12 and older allow at once): nothing to ask, ever.
    // Shown once, however it is closed (a swipe or "back" too): it never comes back by itself.
    if (p.granted || p.canAsk) setPrefs({ asked: true });
    return !p.granted && p.canAsk;
  } catch {
    return false;
  }
}

export function ReminderAsk({ onClosed }: { onClosed: () => void }) {
  const { t } = useStore();
  return (
    <ModalSheet onClosed={onClosed} label={t('rmAskTitle')}>
      {(close) => <Ask close={close} />}
    </ModalSheet>
  );
}

function Ask({ close }: { close: () => void }) {
  const { t } = useStore();
  const c = useColors();
  const text = t('rmAskText', { quit: hourText(QUIT_HOUR, t.lang), do: hourText(getPrefs().doHour, t.lang) });
  const yes = async () => {
    setPrefs({ asked: true, on: true });
    close();
    try {
      const p = await askPermission();
      showQuestHint(t(p.granted ? 'rmAskDone' : 'rmAskLater'), 3000);
    } catch {
      showQuestHint(t('rmAskLater'), 3000);
    }
  };
  return (
    <View style={styles.body}>
      <View style={[styles.art, { backgroundColor: c.tintQuests }]}>
        <BellGlyph size={44} />
      </View>
      <Txt variant="title2" accessibilityRole="header" style={styles.center}>{t('rmAskTitle')}</Txt>
      <Txt variant="body" color={c.textSoft} style={[styles.center, styles.text]}>{text}</Txt>
      <Button size="l" title={t('rmAskYes')} onPress={yes} style={styles.yes} testID="remind-yes" />
      <Button
        size="m"
        variant="text"
        title={t('rmAskNo')}
        onPress={() => {
          cue('select');
          setPrefs({ asked: true });
          close();
          showQuestHint(t('rmAskLater'), 3000);
        }}
        cue={null}
      />
    </View>
  );
}

/** A warm bell with a drop (the reminder is about water). */
export function BellGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5.6 16.6 V11.2 a6.4 6.4 0 0 1 12.8 0 V16.6 L20 18.2 H4 Z" fill="#FFCF4D" stroke="#E5873A" strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M9.8 20 a2.3 2.3 0 0 0 4.4 0" fill="none" stroke="#E5873A" strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M8.6 10.4 a3.6 3.6 0 0 1 2.4 -2.8" fill="none" stroke="#FFF6C2" strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M18.6 2.6 C19.9 4.3 20.6 5.4 20.6 6.3 a2 2 0 0 1 -4 0 C16.6 5.4 17.3 4.3 18.6 2.6 Z" fill="#4FB6E8" stroke="#2C86B8" strokeWidth={1.1} />
      <Circle cx={12} cy={3.6} r={1.1} fill="#E5873A" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, alignItems: 'stretch' },
  art: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 4, marginBottom: 12 },
  center: { textAlign: 'center' },
  text: { marginTop: 6, marginHorizontal: 8 },
  yes: { marginTop: 20 },
});
