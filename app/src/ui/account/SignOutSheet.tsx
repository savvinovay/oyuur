// "Sign out of @sasha_t?" (design/oyuur-29/спец.md 5.3, 8.5; frame 13): the forest is in the
// account now, so the choice is honest — remove it from this phone (the main one, for someone
// else's phone) or keep it here without an account. Not everything saved → a yellow line, and
// "remove" waits for the network. Hidden trees are in the account's chest (OYUUR-31), so they don't
// stop "remove" — unless they are only on this device yet ('locked'): then a yellow line says so
// (never the green "saved") and "Lock" first. After "remove" the app starts over on the home screen.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { AvatarId } from '@/game/profile';
import { pluralForm } from '@/i18n';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { useSync } from '@/state/sync';
import { Avatar } from '@/ui/avatars/Avatar';
import { Button, fonts, Icon, MAX_FONT_SCALE, Txt, useColors, Vault } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { ModalSheet } from '@/ui/shop/ModalSheet';
import { BusyButton } from './Busy';
import { errorText } from './model';
import { openLockSheet } from './LockSheet';
import { href } from './parts';
import { hiddenOnlyHere, unsaved } from './syncText';

export function SignOutSheet({ onClosed }: { onClosed(): void }) {
  const c = useColors();
  const { t, night } = useStore();
  const friends = useFriends();
  const sync = useSync();
  const [busy, setBusy] = useState<'wipe' | 'keep' | null>(null);
  const account = friends.account;
  if (!account) return null;
  const notSaved = unsaved(sync);
  // Hidden trees not locked in the account yet: removing the forest would lose them.
  const hiddenStay = hiddenOnlyHere(sync);

  const go = async (mode: 'wipe' | 'keep', close: () => void) => {
    if (busy) return;
    cue(mode === 'wipe' ? 'delete' : 'tap');
    setBusy(mode);
    const nick = account.nick;
    try {
      await friends.logout(mode);
      close();
      // The forest left this phone: the app opens as on the first start, on the home screen.
      if (mode === 'wipe') router.dismissTo(href('/'));
      showQuestHint(t('accSignedOut', { nick }), 2500);
    } catch (e) {
      cue('error');
      showQuestHint(errorText(t, e), 3000);
      setBusy(null);
    }
  };

  return (
    <ModalSheet onClosed={onClosed} label={t('accSignOutTitle', { nick: account.nick })}>
      {(close) => (
        <View style={styles.body}>
          <View style={styles.head}>
            <Avatar id={account.avatar as AvatarId} color={account.color} size={44} />
            <Txt variant="title2" style={styles.title} numberOfLines={2}>{t('accSignOutTitle', { nick: account.nick })}</Txt>
          </View>
          {notSaved || hiddenStay ? (
            <View style={[styles.warn, { backgroundColor: c.goldSoft, borderColor: c.goldEdge }]} accessibilityRole="alert">
              {hiddenStay ? <Vault size={20} /> : <Icon name="cloudOff" size={20} color={night ? c.gold : c.goldInk} />}
              <Txt style={[styles.statusText, { color: night ? c.text : c.goldInk }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                {hiddenStay
                  ? t('accSignOutHiddenHere')
                  : sync.pending > 0
                    ? t('accSignOutUnsaved', { n: sync.pending, changes: t.dict.accChangeWords[pluralForm(t.lang, sync.pending)] })
                    : t('accSignOutUnsavedAny')}
              </Txt>
            </View>
          ) : (
            <View style={styles.status}>
              <Icon name="cloudCheck" size={20} color={c.doneInk} />
              <Txt style={[styles.statusText, { color: c.doneInk }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accSignOutSaved')}</Txt>
            </View>
          )}
          <BusyButton
            busy={busy === 'wipe'}
            busyTitle={t('accSignOutWipe')}
            title={t('accSignOutWipe')}
            disabled={notSaved || hiddenStay || busy !== null}
            cue={null}
            onPress={() => go('wipe', close)}
            style={styles.main}
            testID="signout-wipe"
          />
          <Txt style={[styles.note, notSaved || hiddenStay ? { color: c.dangerText, fontFamily: fonts.bold } : { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
            {hiddenStay ? t('accSignOutLockFirst') : notSaved ? t('accSignOutNeedNet') : t('accSignOutWipeHint')}
          </Txt>
          {hiddenStay ? (
            <Button
              title={t('accSyncLock')}
              variant="text"
              size="m"
              icon="lockOpen"
              disabled={busy !== null}
              onPress={() => {
                close();
                openLockSheet();
              }}
              style={styles.lock}
              testID="signout-lock"
            />
          ) : null}
          <BusyButton
            busy={busy === 'keep'}
            busyTitle={t('accSignOutKeep')}
            title={t('accSignOutKeep')}
            variant="secondary"
            size="m"
            disabled={busy !== null}
            cue={null}
            onPress={() => go('keep', close)}
            style={styles.second}
            testID="signout-keep"
          />
          <Txt style={[styles.note, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accSignOutKeepHint')}</Txt>
          <Button title={t('cancel')} variant="text" size="m" onPress={close} style={styles.cancel} />
        </View>
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1 },
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14 },
  warn: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, borderRadius: 14, borderWidth: 1.5, padding: 12 },
  statusText: { flex: 1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  main: { marginTop: 16 },
  note: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: 6, paddingHorizontal: 12 },
  second: { marginTop: 14 },
  lock: { marginTop: 2 },
  cancel: { marginTop: 8 },
});
