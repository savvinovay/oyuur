// "Friend isn't on Oyuur yet?" (спец-друзья 5.1): the invite card under the search results.
import { StyleSheet, View } from 'react-native';
import { useStore } from '@/state/store';
import { Button, elevation, fonts, Glyph, Txt, useColors } from '@/ui/ds';

export function InviteCard({ onShare }: { onShare: () => void }) {
  const { t, night } = useStore();
  const c = useColors();
  return (
    <View style={[styles.card, elevation(1, night), { backgroundColor: c.card }]}>
      <View style={styles.top}>
        <Glyph name="invite" size={40} />
        <View style={styles.text}>
          <Txt style={styles.title}>{t('frNotInApp')}</Txt>
          <Txt style={[styles.sub, { color: c.textSoft }]}>{t('frNotInAppText')}</Txt>
        </View>
      </View>
      <Button title={t('frShareLink')} icon="share" variant="secondary" size="m" cue="tap" onPress={onShare} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 14, gap: 14 },
  top: { flexDirection: 'row', gap: 12 },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20 },
  sub: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, marginTop: 2 },
});
