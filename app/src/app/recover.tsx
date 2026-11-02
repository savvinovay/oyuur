// "Forgot password" (decision of the architect for spec 17.1; OYUUR-30 — design/oyuur-29/спец.md
// 3.6, 8.4, frames 06, 07, 18): the @nick, the recovery code shown when the account was made
// (typed in groups, the dashes put in by themselves) and a new password. An honest card with the
// chest says the hidden trees come back too: the code is their key (OYUUR-31). "No code?" opens the sheet of frame 07. The server ends the old sessions and the
// phone makes a new code — shown once, like the first one. The button rides on the keyboard (FormPage).
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { NICK_MIN, typeNick } from '@/game/nick';
import { passwordProblem } from '@/game/password';
import { ApiError } from '@/net/api';
import { newCodeOf, useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { BusyButton } from '@/ui/account/Busy';
import { Field, FieldHandle } from '@/ui/account/Field';
import { FormPage } from '@/ui/account/FormPage';
import { CODE_LENGTH, dashCode, errorText, parseFrom, passwordHelp, typeCode } from '@/ui/account/model';
import { NoCodeSheet } from '@/ui/account/NoCodeSheet';
import { ChestBadge, href, leaveAccount } from '@/ui/account/parts';
import { RecoveryCode } from '@/ui/account/RecoveryCode';
import { fonts, MAX_FONT_SCALE, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';

type Problem = { text: string; field: 'pair' | 'password' | 'other' };

export default function Recover() {
  const c = useColors();
  const { t } = useStore();
  const friends = useFriends();
  const params = useLocalSearchParams<{ from?: string; nick?: string }>();
  const from = parseFrom(params.from);

  const [nick, setNick] = useState(() => typeNick(params.nick ?? ''));
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [renewed, setRenewed] = useState<string | null>(null);
  const [noCode, setNoCode] = useState(false);
  /** The password's rule turns red only after a tap on the button (or for a common one): not while typing. */
  const [tried, setTried] = useState(false);
  const fields = { nick: useRef<FieldHandle>(null), code: useRef<FieldHandle>(null), password: useRef<FieldHandle>(null) };

  const rule = passwordProblem(password, nick);
  const ready = nick.length >= NICK_MIN && code.length === CODE_LENGTH && rule === null;
  // The card above already says the other devices sign in again: only the rule here.
  const help = passwordHelp(t, rule, tried || rule === 'common', t('accNewPasswordRule'));

  const complain = () => {
    setTried(true);
    cue('error');
    if (nick.length < NICK_MIN) return fields.nick.current?.shake();
    if (code.length !== CODE_LENGTH) return fields.code.current?.shake();
    fields.password.current?.shake();
  };

  const submit = async () => {
    if (busy) return;
    if (!ready) return complain();
    setBusy(true);
    setProblem(null);
    try {
      const next = await friends.recover(nick, code, password);
      cue('lockIn');
      setRenewed(next);
    } catch (e) {
      cue('error');
      const kept = newCodeOf(e);
      if (kept) {
        // The new password and code are in force, but a later step failed (the answer was lost, the
        // key couldn't be kept): the old code is dead, so the new one is shown first.
        showQuestHint(errorText(t, e), 3000);
        setRenewed(kept);
        return;
      }
      const kind = e instanceof ApiError ? e.code : '';
      setProblem({ text: errorText(t, e), field: kind === 'wrong_code' ? 'pair' : kind === 'bad_password' ? 'password' : 'other' });
      (kind === 'bad_password' ? fields.password : fields.code).current?.shake();
    } finally {
      setBusy(false);
    }
  };

  if (renewed) {
    return (
      <RecoveryCode
        code={renewed}
        nick={nick}
        renewed
        onDone={() => {
          if (friends.account) {
            showQuestHint(t('accWelcomeBack', { nick }), 2500);
            leaveAccount(from);
            // The answer was lost with the session: sign in with the new password.
          } else router.replace(href('/signin', { from, nick }));
        }}
      />
    );
  }

  const clear = () => setProblem(null);
  return (
    <>
      <FormPage
        title={t('accRecoverTitle')}
        footer={
          <BusyButton
            busy={busy}
            busyTitle={t('accRecoverChecking')}
            title={t('accRecoverButton')}
            disabled={!ready}
            onDisabledPress={complain}
            onPress={submit}
            cue={null}
            testID="recover"
          />
        }
      >
        <Txt style={[styles.lead, { color: c.textSoft }]}>{t('accRecoverText')}</Txt>
        <View style={[styles.card, { backgroundColor: c.goldSoft, borderColor: c.goldEdge }]}>
          <ChestBadge />
          <View style={styles.cardText}>
            <Txt style={[styles.cardTitle, { color: c.text }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accRecoverHiddenTitle')}</Txt>
            <Txt style={[styles.cardBody, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accRecoverHiddenText')}</Txt>
          </View>
        </View>
        <Field
          ref={fields.nick}
          label={t('accNickField')}
          prefix="@"
          value={nick}
          onChangeText={(v) => {
            setNick(typeNick(v));
            clear();
          }}
          autoFocus={!params.nick}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          keyboardType={Platform.OS === 'android' ? 'visible-password' : 'ascii-capable'}
          returnKeyType="next"
          onSubmitEditing={() => fields.code.current?.focus()}
          accessibilityLabel={t('accNickA11y')}
          testID="nick"
          error={problem?.field === 'pair'}
        />
        <Field
          ref={fields.code}
          label={t('accCodeLabel')}
          value={dashCode(code)}
          onChangeText={(v) => {
            setCode(typeCode(v));
            clear();
          }}
          placeholder={t('accCodeShape')}
          autoFocus={!!params.nick}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          keyboardType={Platform.OS === 'android' ? 'visible-password' : 'ascii-capable'}
          returnKeyType="next"
          onSubmitEditing={() => fields.password.current?.focus()}
          accessibilityLabel={t('accCodeLabel')}
          testID="code"
          spaced
          error={problem?.field === 'pair'}
          help={problem && problem.field !== 'password' ? problem.text : undefined}
          helpColor={c.dangerText}
          helpIcon
        />
        <Field
          ref={fields.password}
          label={t('accNewPasswordLabel')}
          secret
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            clear();
          }}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={submit}
          accessibilityLabel={t('accNewPasswordLabel')}
          testID="password"
          error={problem?.field === 'password' || help.bad}
          help={problem?.field === 'password' ? problem.text : help.text}
          helpColor={problem?.field === 'password' || help.bad ? c.dangerText : undefined}
        />
        <Pressable
          onPress={() => {
            cue('select');
            setNoCode(true);
          }}
          disabled={busy}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => [styles.link, (pressed || busy) && { opacity: busy ? 0.4 : 0.6 }]}
          testID="no-code"
        >
          <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.linkText, { color: c.textSoft }]}>{t('accNoCodeLink')}</Txt>
        </Pressable>
      </FormPage>
      {noCode ? (
        <NoCodeSheet
          text={nick.length >= NICK_MIN ? t('accNoCodeNewText', { nick }) : t('accNoCodeNewTextAny')}
          onCreate={() => router.replace(href('/account', { from }))}
          onClosed={() => setNoCode(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, marginHorizontal: 4 },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, borderRadius: 18, borderWidth: 1.5, padding: 16, marginTop: 16 },
  cardText: { flex: 1 },
  cardTitle: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20 },
  cardBody: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  link: { alignSelf: 'center', minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 8 },
  linkText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
});
