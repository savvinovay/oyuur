// "Sign in" (wave 5 spec 3.6, frame 04): @nick and password. A wrong pair turns both rings red,
// says so under the password with an "i" and shakes it; the password is not wiped. "Forgot
// password" goes to the recovery code (recover.tsx). `again=1&nick=` — the session ended:
// "Sign in again" with the nick filled in. OYUUR-30: "Signing in…" holds 1–3 s (the phone works
// out the sign-in key); an old account moves to the new sign-in and gets a new recovery code.
// A code that changed before a later step failed (newCodeOf) is shown all the same.
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { NICK_MIN, typeNick } from '@/game/nick';
import { ApiError } from '@/net/api';
import { newCodeOf, useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { Field, FieldHandle } from '@/ui/account/Field';
import { FormPage } from '@/ui/account/FormPage';
import { BusyButton } from '@/ui/account/Busy';
import { errorText, parseFrom } from '@/ui/account/model';
import { href, leaveAccount, LinkLine } from '@/ui/account/parts';
import { RecoveryCode } from '@/ui/account/RecoveryCode';
import { fonts, MAX_FONT_SCALE, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';

export default function SignIn() {
  const c = useColors();
  const { t } = useStore();
  const friends = useFriends();
  const params = useLocalSearchParams<{ from?: string; nick?: string; again?: string }>();
  const from = parseFrom(params.from);

  const [nick, setNick] = useState(() => typeNick(params.nick ?? ''));
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ text: string; both: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const nickField = useRef<FieldHandle>(null);
  const passwordField = useRef<FieldHandle>(null);

  const canSignIn = nick.length >= NICK_MIN && password.length > 0;

  const complain = () => {
    cue('error');
    (nick.length < NICK_MIN ? nickField : passwordField).current?.shake();
  };

  const signIn = async () => {
    if (busy) return;
    if (!canSignIn) return complain();
    setBusy(true);
    setError(null);
    try {
      const { newCode: fresh } = await friends.login(nick, password);
      cue('friendAdded');
      // An old account moved to the new sign-in: its old code no longer works (spec 5.2).
      if (fresh) return setNewCode(fresh);
      showQuestHint(t('accWelcomeBack', { nick }), 2500);
      leaveAccount(from);
    } catch (e) {
      cue('error');
      const kept = newCodeOf(e);
      if (kept) {
        // The code changed before a later step failed: the old one is dead, this one is shown first.
        showQuestHint(errorText(t, e), 3000);
        return setNewCode(kept);
      }
      setError({ text: errorText(t, e), both: e instanceof ApiError && e.code === 'wrong_login' });
      passwordField.current?.shake();
    } finally {
      setBusy(false);
    }
  };

  if (newCode) {
    return (
      <RecoveryCode
        code={newCode}
        nick={nick}
        renewed
        text={t('accCodeMovedText')}
        onDone={() => {
          if (friends.account) showQuestHint(t('accWelcomeBack', { nick }), 2500);
          leaveAccount(from);
        }}
      />
    );
  }

  return (
    <FormPage
      title={params.again ? t('accSignInAgain') : t('accSignInTitle')}
      footer={
        <>
          <BusyButton
            busy={busy}
            busyTitle={t('accSigningIn')}
            title={t('accSignInButton')}
            disabled={!canSignIn}
            onDisabledPress={complain}
            onPress={signIn}
            cue={null}
            testID="signin"
          />
          <LinkLine lead={t('accNoAccount')} action={t('accCreateLink')} onPress={() => router.replace(href('/account', { from }))} testID="to-create" />
        </>
      }
    >
      <Field
        ref={nickField}
        label={t('accNickField')}
        top={4}
        prefix="@"
        value={nick}
        onChangeText={(v) => {
          setNick(typeNick(v));
          setError(null);
        }}
        autoFocus={!params.nick}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        keyboardType={Platform.OS === 'android' ? 'visible-password' : 'ascii-capable'}
        returnKeyType="next"
        onSubmitEditing={() => passwordField.current?.focus()}
        accessibilityLabel={t('accNickA11y')}
        testID="nick"
        error={!!error?.both}
      />
      <Field
        ref={passwordField}
        label={t('accPasswordLabel')}
        secret
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setError(null);
        }}
        autoFocus={!!params.nick}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={signIn}
        accessibilityLabel={t('accPasswordLabel')}
        testID="password"
        error={!!error?.both}
        help={error?.text}
        helpColor={c.dangerText}
        helpIcon
      />
      <Pressable
        onPress={() => router.push(href('/recover', { from, nick }))}
        accessibilityRole="button"
        hitSlop={6}
        style={({ pressed }) => [styles.forgot, pressed && { opacity: 0.6 }]}
        testID="forgot"
      >
        <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.forgotText, { color: c.textSoft }]}>{t('accForgot')}</Txt>
      </Pressable>
    </FormPage>
  );
}

const styles = StyleSheet.create({
  forgot: { alignSelf: 'flex-end', height: 44, justifyContent: 'center', paddingHorizontal: 4, marginTop: 4 },
  forgotText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
});
