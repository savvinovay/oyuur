// "Create an account" (wave 5 spec 3.3, frames 02–03): the @nick checked on the fly, a password,
// what friends will see, and the button that works only with a free nick and a long enough
// password (a tap on it otherwise shakes the field at fault). Then the recovery code, once.
// `from=first` — shown by itself on the first start: no back, "Later" on the right.
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { passwordProblem } from '@/game/password';
import { ApiError } from '@/net/api';
import { newCodeOf, useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { Avatar } from '@/ui/avatars/Avatar';
import { Field, FieldHandle } from '@/ui/account/Field';
import { FormPage } from '@/ui/account/FormPage';
import { BusyButton } from '@/ui/account/Busy';
import { errorText, parseFrom, passwordHelp, takenSuggestions } from '@/ui/account/model';
import { NickField, useNickCheck } from '@/ui/account/NickField';
import { BarText, ErrorLine, href, leaveAccount, LinkLine } from '@/ui/account/parts';
import { RecoveryCode } from '@/ui/account/RecoveryCode';
import { elevation, fonts, Icon, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';

export default function CreateAccount() {
  const c = useColors();
  const { t, profile, night } = useStore();
  const friends = useFriends();
  const from = parseFrom(useLocalSearchParams<{ from?: string }>().from);
  const first = from === 'first';

  const [nick, setNick] = useState('');
  const [password, setPassword] = useState('');
  const { check, markTaken } = useNickCheck(nick, friends.checkNick);
  const [passwordBad, setPasswordBad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ nick: string; code: string } | null>(null);
  const nickField = useRef<FieldHandle>(null);
  const passwordField = useRef<FieldHandle>(null);

  // New passwords: 8 characters and not a common one (spec 3.1, 12.3).
  const problem = passwordProblem(password, nick);
  const passwordOk = problem === null;
  const help = passwordHelp(t, problem, passwordBad || problem === 'common', t('accPasswordHint'));
  const canCreate = check.kind === 'free' && passwordOk;

  const complain = () => {
    cue('error');
    if (check.kind !== 'free') return nickField.current?.shake();
    setPasswordBad(true);
    passwordField.current?.shake();
  };

  const create = async () => {
    if (busy) return;
    if (!canCreate) return complain();
    setBusy(true);
    setError(null);
    try {
      const code = await friends.signup(nick, password);
      cue('friendAdded');
      setMade({ nick, code });
    } catch (e) {
      cue('error');
      const kept = newCodeOf(e);
      if (kept) {
        // The account was made but its answer was lost: the code is the only way in — shown first.
        showQuestHint(errorText(t, e), 3000);
        setMade({ nick, code: kept });
        return;
      }
      const free = takenSuggestions(e);
      if (free) {
        // Someone took it a second ago: the same "taken" with free ones (spec 3.4).
        markTaken(free);
        nickField.current?.shake();
      } else {
        if (e instanceof ApiError && e.code === 'bad_password') setPasswordBad(true);
        setError(errorText(t, e));
      }
    } finally {
      setBusy(false);
    }
  };

  if (made) {
    return (
      <RecoveryCode
        code={made.code}
        nick={made.nick}
        renewed={false}
        onDone={() => {
          if (friends.account) {
            showQuestHint(t('accWelcomeNew', { nick: made.nick }), 2500);
            leaveAccount(from);
            // Made without its answer (no session here): sign in with the password.
          } else router.replace(href('/signin', { from, nick: made.nick }));
        }}
      />
    );
  }

  const later = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <FormPage
      title={t('accCreateTitle')}
      hideBack={first}
      right={first ? <BarText title={t('accLater')} onPress={later} /> : undefined}
      footer={
        <>
          <ErrorLine text={error} />
          <BusyButton
            busy={busy}
            busyTitle={t('accCreating')}
            title={t('accCreate')}
            disabled={!canCreate}
            onDisabledPress={complain}
            onPress={create}
            cue={null}
            testID="create"
          />
          <Txt style={[styles.legal, { color: c.textSoft }]}>
            {legal(t.dict.accConsentLegal, t('accRules'), t('accPrivacy'), c.textSoft)}
          </Txt>
          <LinkLine lead={t('accHave')} action={t('accSignInLink')} onPress={() => router.replace(href('/signin', { from }))} testID="to-signin" />
        </>
      }
    >
      <View style={styles.me}>
        <View style={[styles.avatar, elevation(1, night)]}>
          <Avatar id={profile.avatar} color={profile.color} size={64} />
        </View>
        <Txt style={[styles.meText, { color: c.textSoft }]}>{t('accAvatarLater')}</Txt>
      </View>

      <NickField ref={nickField} nick={nick} onChange={setNick} check={check} autoFocus onSubmitEditing={() => passwordField.current?.focus()} />

      <Field
        ref={passwordField}
        label={t('accPasswordLabel')}
        secret
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          if (passwordBad && passwordProblem(v, nick) === null) setPasswordBad(false);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={create}
        accessibilityLabel={t('accPasswordLabel')}
        testID="password"
        error={help.bad}
        help={help.text}
        helpColor={help.bad ? c.dangerText : undefined}
      />

      <View style={styles.consent}>
        <Icon name="people" size={20} color={c.textSoft} />
        <Txt style={[styles.consentText, { color: c.textSoft }]}>{t('accConsentFriends')}</Txt>
      </View>
    </FormPage>
  );
}

/**
 * "By continuing you accept the Terms and Privacy Policy": the two names are links to legal.tsx.
 * `line` is the raw text with its {rules} and {privacy} still in it (t.dict, not t()).
 */
function legal(line: string, rules: string, privacy: string, color: string) {
  return line.split(/(\{rules\}|\{privacy\})/).map((part, i) => {
    if (part !== '{rules}' && part !== '{privacy}') return part;
    const doc = part === '{rules}' ? 'terms' : 'privacy';
    return (
      <Txt
        key={i}
        onPress={() => router.push(href('/legal', { doc }))}
        accessibilityRole="link"
        style={styles.underline}
        color={color}
        testID={`legal-${doc}`}
      >
        {doc === 'terms' ? rules : privacy}
      </Txt>
    );
  });
}

const styles = StyleSheet.create({
  me: { alignItems: 'center' },
  avatar: { borderRadius: 32 },
  meText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18, marginHorizontal: 4 },
  consentText: { flex: 1, fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  legal: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, textAlign: 'center', marginTop: 10, paddingHorizontal: 8 },
  underline: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, textDecorationLine: 'underline' },
});
