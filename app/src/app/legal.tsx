// Terms and Privacy (`/legal?doc=terms|privacy`), opened from the consent line under "Create
// account" (spec 3.3). Short and honest, for the test version: who keeps the data, what goes to
// the server and what doesn't, deleting, age, how to reach the owner. Not checked by a lawyer yet
// (spec 17.9): before a public release the texts get replaced.
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/state/store';
import { href } from '@/ui/account/parts';
import { fonts, Icon, Page, Txt, useColors } from '@/ui/ds';

type LegalDoc = 'terms' | 'privacy';

export default function Legal() {
  const { t } = useStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const doc: LegalDoc = useLocalSearchParams<{ doc?: string }>().doc === 'privacy' ? 'privacy' : 'terms';
  const other: LegalDoc = doc === 'terms' ? 'privacy' : 'terms';
  const title = (d: LegalDoc) => (d === 'terms' ? t('accRules') : t('accPrivacyTitle'));
  const sections = doc === 'terms' ? t.dict.accTerms : t.dict.accPrivacyDoc;

  return (
    <Page title={title(doc)}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}>
        <Txt variant="caption" style={[styles.test, { color: c.textSoft }]}>{t('accLegalTest')}</Txt>
        {sections.map((x) => (
          <View key={x.h} style={styles.section}>
            <Txt variant="title3" accessibilityRole="header">{x.h}</Txt>
            <Txt style={[styles.text, { color: c.textSoft }]}>{x.p}</Txt>
          </View>
        ))}
        <Pressable
          onPress={() => router.replace(href('/legal', { doc: other }))}
          accessibilityRole="link"
          hitSlop={8}
          style={({ pressed }) => [styles.other, pressed && { opacity: 0.6 }]}
        >
          <Txt style={[styles.otherText, { color: c.doneInk }]}>{t('accLegalOther', { doc: title(other) })}</Txt>
          <Icon name="chevronRight" size={14} color={c.doneInk} />
        </Pressable>
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 16 },
  test: { fontFamily: fonts.black, textTransform: 'uppercase', letterSpacing: 0.8 },
  section: { marginTop: 18, gap: 4 },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
  other: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 24, minHeight: 44 },
  otherText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, flexShrink: 1 },
});
