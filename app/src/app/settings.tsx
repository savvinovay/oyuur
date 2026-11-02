// Settings (spec 4.11, frame 20): groups "Look", "Feedback" and "Language", deleting
// everything in a group of its own, the version at the bottom. Wave 5: "Account" goes first
// (спец-друзья 3.7, ui/account/SettingsAccount.tsx). OYUUR-30 (design/oyuur-29/спец.md 8.2,
// frames 10, 20): "Account" → "Password and code" → "Delete account" → … → "Forest from this
// phone" (30 days after "Keep only the account's forest") → "Erase your whole forest" → version.
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { LangSetting } from '@/i18n';
import { analytics, useStatsOn } from '@/net/analytics';
import { useFriends } from '@/state/friends';
import { ThemeSetting, useStore } from '@/state/store';
import { useSync } from '@/state/sync';
import { HintRow } from '@/ui/account/HintRow';
import { ACCOUNT_TINT } from '@/ui/account/look';
import { SettingsAccount } from '@/ui/account/SettingsAccount';
import { SignOutSheet } from '@/ui/account/SignOutSheet';
import { dateText, treeWord } from '@/ui/account/syncText';
import { Button, confirmDialog, fonts, Group, Icon, Page, Row, rowTint, Segmented, Toggle, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { clockText } from '@/ui/sheet/wait';
import { uses24 } from '@/ui/watering/format';
import { getPermission, remindersSupported } from '@/remind/notify';
import { useRemindPrefs } from '@/remind/prefs';

/** "0.7.0" is shown as "0.7". */
const version = (Constants.expoConfig?.version ?? '').replace(/\.0$/, '');

export default function SettingsScreen() {
  const { settings, updateSettings, t, today, resetAll, clock } = useStore();
  const c = useColors();
  const statsOn = useStatsOn();
  const account = useFriends().account;
  const sync = useSync();
  const [signingOut, setSigningOut] = useState(false);
  const remind = useRemindPrefs();
  // "Off in the phone's settings" when the phone doesn't allow notifications (checked again on coming back).
  const [remindBlocked, setRemindBlocked] = useState(false);
  useEffect(() => {
    if (!remindersSupported) return;
    const check = () => getPermission().then((p) => setRemindBlocked(!p.granted), () => {});
    check();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, []);

  const travel = (days: number) => updateSettings({ dayOffset: settings.dayOffset + days });
  // The clock within the day (OYUUR-34, the watering hours): minutes added to the real clock.
  const shift = (minutes: number) => updateSettings({ minuteOffset: settings.minuteOffset + minutes });
  const time = clockText(clock, uses24(t.lang));
  const onReset = async () => {
    // With an account the forest goes in the account too, or it would come back with the next save (spec 4.3).
    if (account) {
      const yes = await confirmDialog({
        title: t('accResetAllTitle'),
        message: t('accResetAllText', { nick: account.nick }),
        confirmLabel: t('accEraseAllButton'),
        cancelLabel: t('cancel'),
        tone: 'danger',
      });
      if (!yes) return;
      try {
        await sync.eraseEverywhere();
        cue('delete');
        showQuestHint(t('accErased'), 2500);
      } catch {
        // Nothing is erased without the network: not here, not in the account.
        cue('error');
        showQuestHint(t('accEraseFailed'), 3500);
      }
      return;
    }
    const yes = await confirmDialog({
      title: t('resetData'),
      message: t('resetConfirm'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      tone: 'danger',
    });
    if (!yes) return;
    cue('delete');
    resetAll();
  };

  const local = sync.localCopy;
  const onRestore = async () => {
    cue('select');
    try {
      await sync.restoreLocal();
    } catch {
      cue('error');
      showQuestHint(t('accFoundFailed'), 3000);
    }
  };

  return (
    <Page title={t('settings')}>
      <ScrollView contentContainerStyle={styles.body}>
        <SettingsAccount onSignOut={() => setSigningOut(true)} />

        {/* OYUUR-23: watering reminders, Android only (the web and iPhone — OYUUR-24). */}
        {remindersSupported ? (
          <Group title={t('rmTitle')}>
            <Row
              icon="bell"
              tint={rowTint.reminders}
              label={t('rmRow')}
              onPress={() => router.push('/reminders')}
              right={
                <View style={styles.link}>
                  <Txt variant="small" color={c.textSoft}>{t(!remind.on ? 'rmRowOff' : remindBlocked ? 'rmRowBlocked' : 'rmRowOn')}</Txt>
                  <Icon name="chevronRight" size={18} color={c.textSoft} />
                </View>
              }
            />
          </Group>
        ) : null}

        <Group title={t('groupLook')}>
          <Row
            icon="sun"
            tint={rowTint.theme}
            label={t('theme')}
            below={
              <Segmented<ThemeSetting>
                height={44}
                iconSize={16}
                value={settings.theme}
                onChange={(theme) => updateSettings({ theme })}
                options={[
                  { value: 'auto', label: t('themeAuto'), icon: 'auto' },
                  { value: 'light', label: t('themeLight'), icon: 'sun' },
                  { value: 'dark', label: t('themeDark'), icon: 'moon' },
                ]}
              />
            }
          />
          <Row
            icon="sparkles"
            tint={rowTint.animations}
            label={t('animations')}
            right={<Toggle value={settings.animations} onChange={(animations) => updateSettings({ animations })} accessibilityLabel={t('animations')} />}
          />
        </Group>

        <Group title={t('groupFeedback')}>
          <Row
            icon={settings.sounds ? 'speaker' : 'speakerOff'}
            tint={rowTint.sounds}
            label={t('sounds')}
            right={<Toggle value={settings.sounds} onChange={(sounds) => updateSettings({ sounds })} accessibilityLabel={t('sounds')} />}
          />
          <Row
            icon="vibrate"
            tint={rowTint.vibration}
            label={t('vibration')}
            right={<Toggle value={settings.vibration} onChange={(vibration) => updateSettings({ vibration })} accessibilityLabel={t('vibration')} />}
          />
        </Group>

        <Group title={t('groupLanguage')}>
          <Row
            icon="globe"
            tint={rowTint.language}
            label={t('language')}
            below={
              <Segmented<LangSetting>
                height={44}
                value={settings.language}
                onChange={(language) => updateSettings({ language })}
                options={[
                  { value: 'auto', label: t('languageAuto') },
                  { value: 'ru', label: 'Русский' },
                  { value: 'en', label: 'English' },
                ]}
              />
            }
          />
        </Group>

        {/* OYUUR-39: widgets live on Android only. Off — a hidden tree is signed with its own name (спец 6). */}
        {Platform.OS === 'android' ? (
          <Group title={t('wgGroup')}>
            <Row
              icon="lock"
              tint={rowTint.theme}
              label={t('wgNames')}
              right={<Toggle value={settings.widgetNames} onChange={(widgetNames) => updateSettings({ widgetNames })} accessibilityLabel={t('wgNames')} />}
              below={<Txt variant="small" color={c.textSoft}>{t(settings.widgetNames ? 'wgNamesOn' : 'wgNamesOff')}</Txt>}
            />
          </Group>
        ) : null}

        {/* OYUUR-26: on by default; off empties the queue and forgets the install id. */}
        <Group title={t('meStatsGroup')}>
          <Row
            icon="info"
            tint={rowTint.stats}
            label={t('meStatsSend')}
            right={<Toggle value={statsOn} onChange={(on) => analytics.setOff(!on)} accessibilityLabel={t('meStatsSend')} />}
            below={<Txt variant="small" color={c.textSoft}>{t('meStatsNote')}</Txt>}
          />
        </Group>

        {local ? (
          <>
            <Group title={t('accRestoreGroup')}>
              <HintRow
                icon="undoRound"
                tint={ACCOUNT_TINT.restore}
                label={t('accRestoreLocal')}
                hint={t('accRestoreLocalSub', { n: local.trees, trees: treeWord(t, local.trees), date: dateText(t, local.until) })}
                chevron
                onPress={onRestore}
                testID="restore-local"
              />
            </Group>
            <Txt style={[styles.note, { color: c.textSoft }]}>{t('accRestoreNote', { date: dateText(t, local.until) })}</Txt>
          </>
        ) : null}

        <Group style={styles.danger}>
          {account ? (
            <HintRow icon="trash" tint={rowTint.danger} label={t('accEraseAll')} labelColor={c.dangerText} hint={t('accEraseAllHint')} onPress={onReset} />
          ) : (
            <Row icon="trash" tint={rowTint.danger} label={t('resetData')} labelColor={c.dangerText} onPress={onReset} />
          )}
        </Group>

        {__DEV__ && (
          <View style={[styles.dev, { borderColor: c.textSoft }]}>
            <Txt variant="title3">{t('devTools')}</Txt>
            <Txt variant="small" color={c.textSoft}>{t('devToday', { date: today })}</Txt>
            <View style={styles.devRow}>
              <Button size="s" variant="secondary" title={t('devPlus1')} onPress={() => travel(1)} />
              <Button size="s" variant="secondary" title={t('devPlus7')} onPress={() => travel(7)} />
              <Button size="s" variant="secondary" title={t('devPlus30')} onPress={() => travel(30)} />
            </View>
            <Button size="s" variant="secondary" title={t('devReset')} onPress={() => updateSettings({ dayOffset: 0 })} />
            <Txt variant="small" color={c.textSoft}>{t('wbDevClock', { time })}</Txt>
            <View style={styles.devRow}>
              <Button size="s" variant="secondary" title={t('wbDevMinusHour')} onPress={() => shift(-60)} />
              <Button size="s" variant="secondary" title={t('wbDevPlusHour')} onPress={() => shift(60)} />
              <Button size="s" variant="secondary" title={t('wbDevPlus10')} onPress={() => shift(10)} />
              <Button size="s" variant="secondary" title={t('wbDevNow')} onPress={() => updateSettings({ minuteOffset: 0 })} />
            </View>
          </View>
        )}

        {version ? (
          <Txt variant="caption" color={c.textSoft} style={styles.version}>{t('version', { v: version })}</Txt>
        ) : null}
      </ScrollView>
      {signingOut ? <SignOutSheet onClosed={() => setSigningOut(false)} /> : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 40 },
  danger: { marginTop: 20 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginTop: 8, marginHorizontal: 8 },
  dev: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 20, padding: 14, gap: 10, marginTop: 20 },
  devRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  version: { textAlign: 'center', marginTop: 24 },
});
