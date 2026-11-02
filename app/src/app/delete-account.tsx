// "Delete account" (wave 5 spec 3.7; required by Google Play when an app makes accounts): says
// plainly what goes and what stays, asks for the password, then the red "Delete forever?"
// dialog. Trees on the phone stay; the app goes on without an account.
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiError } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { Field, FieldHandle } from '@/ui/account/Field';
import { FormPage } from '@/ui/account/FormPage';
import { errorText } from '@/ui/account/model';
import { ErrorLine, href } from '@/ui/account/parts';
import { Button, confirmDialog, fonts, Icon, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';

export default function DeleteAccount() {
  const c = useColors();
  const { t } = useStore();
  const friends = useFriends();
  const nick = friends.account?.nick ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<{ text: string; wrong: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<FieldHandle>(null);

  const remove = async () => {
    if (busy) return;
    if (!password) {
      cue('error');
      return field.current?.shake();
    }
    const yes = await confirmDialog({
      title: t('accDeleteTitle'),
      message: t('accDeleteDialog'),
      confirmLabel: t('accDeleteForever'),
      cancelLabel: t('cancel'),
      tone: 'danger',
    });
    if (!yes) return;
    setBusy(true);
    setError(null);
    try {
      await friends.deleteAccount(password);
      cue('delete');
      showQuestHint(t('accDeleted'), 3000);
      router.dismissTo(href('/settings'));
    } catch (e) {
      cue('error');
      const wrong = e instanceof ApiError && e.code === 'wrong_password';
      setError({ text: errorText(t, e), wrong });
      if (wrong) field.current?.shake();
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormPage
      title={t('accDelete')}
      footer={
        <>
          {error && !error.wrong ? <ErrorLine text={error.text} /> : null}
          <Button
            title={busy ? t('accDeleting') : t('accDeleteForever')}
            variant="danger"
            disabled={busy || !nick}
            onPress={remove}
            cue={null}
            testID="delete-forever"
          />
          <Button title={t('cancel')} variant="text" size="m" onPress={() => router.back()} style={styles.cancel} />
        </>
      }
    >
      <View style={styles.head}>
        <View style={[styles.circle, { backgroundColor: c.danger }]}>
          <Icon name="trash" size={40} color="#FFFFFF" />
        </View>
        <Txt style={[styles.text, { color: c.textSoft }]}>{t('accDeleteText', { nick })}</Txt>
      </View>
      <Field
        ref={field}
        label={t('accDeletePassword')}
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
        onSubmitEditing={remove}
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
  circle: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center', paddingHorizontal: 8 },
  cancel: { marginTop: 4 },
});
