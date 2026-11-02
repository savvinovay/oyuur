// "Change password" (design/oyuur-29/спец.md 3.4, 3.7 А; frames 08, 10): the current and the new
// password; other devices are signed out. "Forgot password" here (`forgot=1`) is frame 08: this
// phone is signed in, so it is the key — a new password without the old one, then a new
// recovery code. Passwords never leave the phone (net/kdf.ts makes the sign-in key).
// OYUUR-31: before "Forgot password" the phone asks whether it has the key of the account's chest
// (resetCheck, needs the network; a calm wait meanwhile). Without it (frame 09) a warm card says
// so, and "Set password" asks first in red: the hidden trees in the account would be lost for good.
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { passwordProblem } from '@/game/password';
import { pluralForm } from '@/i18n';
import { ApiError } from '@/net/api';
import { newCodeOf, useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { BusyButton, Ring } from '@/ui/account/Busy';
import { Field, FieldHandle } from '@/ui/account/Field';
import { FormPage } from '@/ui/account/FormPage';
import { errorText, passwordHelp } from '@/ui/account/model';
import { ChestBadge, ErrorLine, href } from '@/ui/account/parts';
import { RecoveryCode } from '@/ui/account/RecoveryCode';
import { Button, confirmDialog, fonts, Glyph, Icon, MAX_FONT_SCALE, Txt, useColors, Vault } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';

/** "Forgot password" here: what the phone knows about the account's key (spec 3.7 А/Б). */
type KeyCheck =
  | { kind: 'loading' }
  | { kind: 'failed'; text: string }
  | { kind: 'ok' }
  | { kind: 'lost'; hiddenHere: number };

export default function ChangePassword() {
  const c = useColors();
  const { t } = useStore();
  const friends = useFriends();
  const forgot = useLocalSearchParams<{ forgot?: string }>().forgot === '1';
  const nick = friends.account?.nick ?? '';

  const [old, setOld] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<{ text: string; wrongOld: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  /** The code is new but the password didn't change (an old account): back to the form after it. */
  const [codeOnly, setCodeOnly] = useState(false);
  /** The rule turns red only after a tap on the button (or for a common password): not while typing. */
  const [tried, setTried] = useState(false);
  const oldField = useRef<FieldHandle>(null);
  const newField = useRef<FieldHandle>(null);

  const [check, setCheck] = useState<KeyCheck>({ kind: 'loading' });
  const resetCheck = useRef(friends.resetCheck);
  resetCheck.current = friends.resetCheck;
  const runCheck = useCallback(async () => {
    setCheck({ kind: 'loading' });
    try {
      const r = await resetCheck.current();
      setCheck(r.key === 'lost' ? { kind: 'lost', hiddenHere: r.hiddenHere } : { kind: 'ok' });
    } catch (e) {
      setCheck({ kind: 'failed', text: errorText(t, e) });
    }
  }, [t]);
  useEffect(() => {
    if (forgot) runCheck();
    // Once, when the screen opens in this mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forgot]);
  const checked = check.kind === 'ok' || check.kind === 'lost';
  // The new password's field takes the focus once the key is known to be here (frame 08).
  useEffect(() => {
    if (forgot && check.kind === 'ok') newField.current?.focus();
  }, [forgot, check.kind]);

  const problem = passwordProblem(next, nick);
  const ready = (forgot ? checked : old.length > 0) && problem === null;
  const help = passwordHelp(t, problem, tried || problem === 'common', t('accNewPasswordHint'));

  const complain = () => {
    if (forgot && !checked) return cue('error');
    setTried(true);
    cue('error');
    (!forgot && !old ? oldField : newField).current?.shake();
  };

  const done = () => {
    showQuestHint(t('accPasswordChanged'), 3500);
    router.dismissTo(href('/settings'));
  };

  /** Frame 09: the red question before a new password loses the account's hidden trees. */
  const askLost = (hiddenHere: number) =>
    confirmDialog({
      title: t('accNoKeyTitle'),
      message: t('accNoKeyText'),
      confirmLabel: t('accNoKeyGo'),
      cancelLabel: t('accNoKeyBack'),
      tone: 'danger',
      picture: <Vault size={64} />,
      note:
        hiddenHere > 0 ? (
          <View style={[styles.keep, { backgroundColor: c.accentSoft }]}>
            <Glyph name="check" size={20} />
            <Txt style={[styles.keepText, { color: c.doneInk }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              {t('accNoKeyLocal', { trees: `${hiddenHere} ${t.dict.accHiddenTreeWords[pluralForm(t.lang, hiddenHere)]}` })}
            </Txt>
          </View>
        ) : undefined,
    });

  const submit = async () => {
    if (busy) return;
    if (!ready) return complain();
    if (forgot && check.kind === 'lost') {
      if (!(await askLost(check.hiddenHere))) return;
      cue('delete');
    }
    setBusy(true);
    setError(null);
    try {
      const fresh = forgot ? await friends.resetPassword(next) : (await friends.changePassword(old, next)).newCode;
      cue('lockIn');
      if (fresh) setCode(fresh);
      else done();
    } catch (e) {
      cue('error');
      const kept = newCodeOf(e);
      if (kept) {
        // The old code is dead already: the new one is shown first, whatever went wrong after.
        setCodeOnly(true);
        setCode(kept);
        setError({ text: t('accCodeButNotPassword'), wrongOld: false });
        return;
      }
      const wrongOld = e instanceof ApiError && (e.code === 'wrong_password' || e.code === 'wrong_login');
      setError({ text: errorText(t, e), wrongOld });
      (wrongOld ? oldField : newField).current?.shake();
    } finally {
      setBusy(false);
    }
  };

  if (code) {
    const after = codeOnly
      ? () => {
          setCode(null);
          setCodeOnly(false);
        }
      : done;
    return <RecoveryCode code={code} nick={nick} renewed onDone={after} />;
  }

  return (
    <FormPage
      title={forgot ? t('accRecoverTitle') : t('accChangePassword')}
      footer={
        <>
          {error && !error.wrongOld ? <ErrorLine text={error.text} /> : null}
          <BusyButton
            busy={busy}
            busyTitle={t('accChanging')}
            title={forgot ? t('accRecoverButton') : t('accChangeButton')}
            disabled={!ready}
            onDisabledPress={complain}
            onPress={submit}
            cue={null}
            testID="change-password"
          />
        </>
      }
    >
      {forgot && check.kind === 'loading' ? (
        <View style={[styles.card, styles.waitCard, { backgroundColor: c.sunken, borderColor: 'transparent' }]} accessibilityLiveRegion="polite">
          <Ring size={22} color={c.textSoft} track={c.divider} />
          <Txt style={[styles.cardBody, styles.flex, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accResetChecking')}</Txt>
        </View>
      ) : forgot && check.kind === 'failed' ? (
        <View style={[styles.card, { backgroundColor: c.goldSoft, borderColor: c.goldEdge }]} accessibilityRole="alert">
          <Icon name="wifiOff" size={28} color={c.text} />
          <View style={styles.cardText}>
            <Txt style={[styles.cardTitle, { color: c.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accResetCheckFailed')}</Txt>
            <Txt style={[styles.cardBody, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{check.text}</Txt>
            <Button title={t('accRetry')} variant="secondary" size="s" onPress={runCheck} style={styles.retry} testID="reset-check-retry" />
          </View>
        </View>
      ) : forgot && check.kind === 'lost' ? (
        <View style={[styles.card, { backgroundColor: c.goldSoft, borderColor: c.goldEdge }]} testID="no-key-card">
          <ChestBadge />
          <View style={styles.cardText}>
            <Txt style={[styles.cardTitle, { color: c.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accNoKeyCard')}</Txt>
            <Txt style={[styles.cardBody, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accNoKeyCardText')}</Txt>
          </View>
        </View>
      ) : forgot ? (
        <View style={[styles.card, { backgroundColor: c.accentSoft, borderColor: 'rgba(76,199,100,0.45)' }]}>
          <Icon name="phone" size={30} color={c.doneInk} />
          <View style={styles.cardText}>
            <Txt style={[styles.cardTitle, { color: c.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accDeviceKeyTitle')}</Txt>
            <Txt style={[styles.cardBody, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accDeviceKeyText')}</Txt>
          </View>
        </View>
      ) : (
        <>
          <Field
            ref={oldField}
            label={t('accOldPassword')}
            top={4}
            secret
            value={old}
            onChangeText={(v) => {
              setOld(v);
              setError(null);
            }}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="next"
            onSubmitEditing={() => newField.current?.focus()}
            accessibilityLabel={t('accOldPassword')}
            testID="old-password"
            error={!!error?.wrongOld}
            help={error?.wrongOld ? error.text : undefined}
            helpColor={c.dangerText}
            helpIcon
          />
          <Pressable
            onPress={() => router.replace(href('/password', { forgot: '1' }))}
            accessibilityRole="button"
            hitSlop={6}
            style={({ pressed }) => [styles.forgot, pressed && { opacity: 0.6 }]}
            testID="forgot"
          >
            <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.forgotText, { color: c.textSoft }]}>{t('accForgot')}</Txt>
          </Pressable>
        </>
      )}
      <Field
        ref={newField}
        label={t('accNewPasswordLabel')}
        top={forgot ? 20 : 4}
        secret
        value={next}
        onChangeText={(v) => {
          setNext(v);
          setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
        accessibilityLabel={t('accNewPasswordLabel')}
        testID="new-password"
        error={help.bad}
        help={help.text}
        helpColor={help.bad ? c.dangerText : undefined}
      />
      {forgot ? (
        <View style={styles.codeLine}>
          <Icon name="code" size={20} color={c.textSoft} />
          <Txt style={[styles.codeText, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accDeviceKeyCode')}</Txt>
        </View>
      ) : null}
    </FormPage>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, borderRadius: 18, borderWidth: 1.5, padding: 16 },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20 },
  cardBody: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  forgot: { alignSelf: 'flex-end', height: 44, justifyContent: 'center', paddingHorizontal: 4, marginTop: 4 },
  forgotText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
  codeLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 20, marginHorizontal: 4 },
  codeText: { flex: 1, fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  waitCard: { alignItems: 'center' },
  flex: { flex: 1, marginTop: 0 },
  retry: { alignSelf: 'flex-start', marginTop: 10 },
  keep: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  keepText: { flex: 1, fontFamily: fonts.bold, fontSize: 13.5, lineHeight: 18 },
});
