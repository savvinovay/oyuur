// "New recovery code" (design/oyuur-29/спец.md 3.5): the old code is lost but the password is
// remembered. Asks for the password, then shows the new code once; the old one stops working.
// `handed=1` (OYUUR-31): "Lock your hidden trees" made a new code already, or one made earlier never
// got its screen (net/pendingCode.ts) — shown at once. A code that changed before a later step
// failed (newCodeOf) is shown too: the old one is dead.
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiError } from '@/net/api';
import { newCodeOf, useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { BusyButton } from '@/ui/account/Busy';
import { Field, FieldHandle } from '@/ui/account/Field';
import { FormPage } from '@/ui/account/FormPage';
import { errorText } from '@/ui/account/model';
import { takeHandedCode } from '@/ui/account/handoff';
import { ErrorLine, href } from '@/ui/account/parts';
import { RecoveryCode } from '@/ui/account/RecoveryCode';
import { fonts, Icon, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';

export default function NewCode() {
  const c = useColors();
  const { t } = useStore();
  const friends = useFriends();
  const nick = friends.account?.nick ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ text: string; wrong: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const handedParam = useLocalSearchParams<{ handed?: string }>().handed === '1';
  // Taken once: after a reload there is none, and the screen asks for the password as usual.
  const [handed] = useState(() => (handedParam ? takeHandedCode() : null));
  const [code, setCode] = useState<string | null>(handed?.code ?? null);
  const field = useRef<FieldHandle>(null);

  const submit = async () => {
    if (busy) return;
    if (!password) {
      cue('error');
      return field.current?.shake();
    }
    setBusy(true);
    setError(null);
    try {
      setCode(await friends.newRecoveryCode(password));
      cue('lockIn');
    } catch (e) {
      cue('error');
      const kept = newCodeOf(e);
      if (kept) {
        // The code changed before a later step failed: shown, whatever went wrong after.
        showQuestHint(errorText(t, e), 3000);
        setCode(kept);
        return;
      }
      const wrong = e instanceof ApiError && (e.code === 'wrong_password' || e.code === 'wrong_login');
      setError({ text: errorText(t, e), wrong });
      if (wrong) field.current?.shake();
    } finally {
      setBusy(false);
    }
  };

  if (code && handed) {
    const back = () => (router.canGoBack() ? router.back() : router.replace(href('/')));
    return <RecoveryCode code={code} nick={nick} renewed text={handed.why === 'pending' ? t('accCodePendingText') : t('accCodeLockText')} onDone={back} />;
  }
  if (code) return <RecoveryCode code={code} nick={nick} renewed onDone={() => router.dismissTo(href('/settings'))} />;

  return (
    <FormPage
      title={t('accNewCodePage')}
      footer={
        <>
          {error && !error.wrong ? <ErrorLine text={error.text} /> : null}
          <BusyButton
            busy={busy}
            busyTitle={t('accNewCodeMaking')}
            title={t('accNewCodeButton')}
            disabled={!password}
            onDisabledPress={submit}
            onPress={submit}
            cue={null}
            testID="new-code"
          />
        </>
      }
    >
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: c.waterSoft }]}>
          <Icon name="code" size={40} color={c.waterInk} />
        </View>
        <Txt style={[styles.text, { color: c.textSoft }]}>{t('accNewCodeText')}</Txt>
      </View>
      <Field
        ref={field}
        label={t('accPasswordLabel')}
        secret
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          setError(null);
        }}
        autoFocus
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        accessibilityLabel={t('accPasswordLabel')}
        testID="password"
        error={!!error?.wrong}
        help={error?.wrong ? error.text : undefined}
        helpColor={c.dangerText}
        helpIcon
      />
    </FormPage>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingTop: 8 },
  badge: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center', paddingHorizontal: 8 },
});
