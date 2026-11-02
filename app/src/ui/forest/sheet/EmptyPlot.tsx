// The forest sheet when there are no trees yet (spec 6 `empty`, frame 04): an invitation
// to plant the first one.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useStore } from '@/state/store';
import { Button, fonts, Txt, useColors } from '@/ui/ds';
import { EMPTY_BODY } from './forestDetents';

export function EmptyPlot() {
  const { t } = useStore();
  const c = useColors();
  return (
    <View style={styles.wrap}>
      <Txt variant="title2" numberOfLines={2} style={styles.center}>{t('emptyForestTitle')}</Txt>
      <Txt numberOfLines={3} style={[styles.text, { color: c.textSoft }]}>{t('emptyForestText')}</Txt>
      <Button title={t('plant')} variant="primary" size="l" glyph="seed" onPress={() => router.push('/new')} style={styles.plant} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: EMPTY_BODY, alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 4 },
  center: { textAlign: 'center' },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center', paddingHorizontal: 8 },
  plant: { alignSelf: 'stretch', marginTop: 10 },
});
