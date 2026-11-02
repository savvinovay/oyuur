// "No code?" (design/oyuur-29/спец.md 3.7 В, 8.4; frame 07): without the password and the code
// nobody can open the account, not even us. Two ways on: the hint about a phone that is still
// signed in (it can set a new password), and "Create a new account" with an honest line under it.
import { StyleSheet, View } from 'react-native';
import { useStore } from '@/state/store';
import { Button, fonts, Icon, MAX_FONT_SCALE, Txt, useColors } from '@/ui/ds';
import { ModalSheet } from '@/ui/shop/ModalSheet';

export function NoCodeSheet({ text, onCreate, onClosed }: {
  /** The line under "Create a new account": with the @nick typed, or without. */
  text: string;
  onCreate(): void;
  onClosed(): void;
}) {
  const c = useColors();
  const { t } = useStore();
  return (
    <ModalSheet onClosed={onClosed} label={t('accNoCodeTitle')}>
      {(close) => (
        <View style={styles.body}>
          <Txt variant="title2" accessibilityRole="header">{t('accNoCodeTitle')}</Txt>
          <Txt style={[styles.text, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accNoCodeText')}</Txt>
          <View style={styles.hint}>
            <Icon name="phone" size={24} color={c.doneInk} />
            <Txt style={[styles.hintText, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
              <Txt style={[styles.hintText, styles.strong, { color: c.text }]}>{t('accNoCodeOther')}</Txt>
              {'\n'}
              {t('accNoCodeOtherText')}
            </Txt>
          </View>
          <Button
            title={t('accNoCodeNew')}
            variant="secondary"
            onPress={() => {
              close();
              onCreate();
            }}
            style={styles.create}
            testID="no-code-create"
          />
          <Txt style={[styles.note, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{text}</Txt>
          <Button title={t('back')} variant="text" size="m" onPress={close} style={styles.back} />
        </View>
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 2 },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, marginTop: 8 },
  hint: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 18 },
  hintText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  strong: { fontFamily: fonts.black },
  create: { marginTop: 22 },
  note: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: 8, paddingHorizontal: 12 },
  back: { marginTop: 8 },
});
