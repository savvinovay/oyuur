// The recovery code, shown once after an account is created or a password is set anew (decision
// of the architect for spec 17.1: there is no e-mail, the code is the only way back). The code
// is selectable text in groups of four with dashes (as typed on "Forgot password"); "Copy" in the browser, "Save to notes" (the system share)
// on phones — no clipboard module yet. No way back from here: only "I saved it". A warm line with
// the chest says what is at stake (OYUUR-31): without the password and the code the hidden trees go.
import { Stack } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, StyleSheet, TextStyle, View } from 'react-native';
import { atNick } from '@/game/nick';
import { dropPending } from '@/net/pendingCode';
import { useStore } from '@/state/store';
import { Button, elevation, fonts, Icon, MAX_FONT_SCALE, Txt, useColors, Vault } from '@/ui/ds';
import { FormPage } from './FormPage';
import { softOnCard } from './look';
import { dashCode } from './model';
import { canCopy, copyText, shareText } from './parts';

const SELECTABLE = Platform.OS === 'web' ? ({ userSelect: 'text' } as unknown as TextStyle) : null;

/** `text` — another reason for a new code (sign-in moved to the new protection, OYUUR-30). */
export function RecoveryCode({ code, nick, renewed, text, onDone: done }: { code: string; nick: string; renewed: boolean; text?: string; onDone(): void }) {
  const c = useColors();
  // "I saved it": the code kept on the phone in case its answer was lost (net/pendingCode.ts) can go.
  const onDone = useCallback(() => {
    dropPending(code);
    done();
  }, [code, done]);
  const { t, night } = useStore();
  const shown = dashCode(code);
  // "Copy" says "Copied" for 1.5 s.
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  // Android "back" is "I saved it": the code must not be lost behind a half-closed screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onDone();
      return true;
    });
    return () => sub.remove();
  }, [onDone]);

  const copy = async () => {
    if (!(await copyText(shown))) return;
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 1500);
  };
  const save = () => shareText(t('accCodeShareMessage', { nick, code: shown }));

  return (
    <FormPage title={t('accCodeTitle')} hideBack footer={<Button title={t('accCodeDone')} onPress={onDone} testID="code-done" />}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: c.waterSoft }]}>
          <Icon name="code" size={40} color={c.waterInk} />
        </View>
        <Txt variant="title2" style={styles.center}>{renewed ? t('accCodeNewHead') : t('accCodeHead')}</Txt>
        <Txt style={[styles.text, { color: c.textSoft }]}>{text ?? (renewed ? t('accCodeNewText') : t('accCodeText'))}</Txt>
      </View>
      <View
        style={[styles.card, elevation(1, night), { backgroundColor: c.card }]}
        accessible
        accessibilityLabel={t('accCodeA11y', { code: code.split('').join(' ') })}
      >
        <Txt selectable maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.code, SELECTABLE]} testID="recovery-code">
          {shown}
        </Txt>
        <Txt style={[styles.center, styles.nick, { color: softOnCard(c, night) }]}>{atNick(nick)}</Txt>
      </View>
      <View style={styles.actions}>
        {canCopy() ? (
          <Button
            title={copied ? t('accCopiedShort') : t('accCopy')}
            variant="secondary"
            size="m"
            icon={copied ? 'check' : 'copy'}
            onPress={copy}
            accessibilityLabel={copied ? t('accCopied') : undefined}
            testID="code-copy"
          />
        ) : (
          <Button title={t('accSaveCode')} variant="secondary" size="m" icon="share" onPress={save} />
        )}
      </View>
      <View style={[styles.warn, { backgroundColor: c.warmSoft }]}>
        <Vault size={28} />
        <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.warnText, { color: c.text }]}>{t('accCodeKeepWarn')}</Txt>
      </View>
    </FormPage>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingTop: 8, paddingHorizontal: 8 },
  badge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  center: { textAlign: 'center' },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  card: { borderRadius: 20, paddingVertical: 20, paddingHorizontal: 12, marginTop: 24, alignItems: 'center' },
  code: { fontFamily: fonts.black, fontSize: 28, lineHeight: 34, letterSpacing: 1.6, textAlign: 'center' },
  nick: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, marginTop: 6 },
  actions: { marginTop: 16 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, marginTop: 20 },
  warnText: { flex: 1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
});
