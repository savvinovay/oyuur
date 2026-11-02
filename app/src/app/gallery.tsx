// Development only: every kind of tree at every stage side by side, to compare drawings.
import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SKINS } from '@/game/tree';
import { useStore } from '@/state/store';
import { Glyph, Page, Txt, useColors } from '@/ui/ds';
import { TreeThumb } from '@/ui/TreeArt';

const AGES: { days: number; dead?: boolean; completed?: boolean }[] = [
  { days: 0 }, { days: 2 }, { days: 3 }, { days: 6 }, { days: 7 }, { days: 20 }, { days: 21 }, { days: 49 },
  { days: 50 }, { days: 99 }, { days: 100 }, { days: 200, completed: true }, { days: 3, dead: true }, { days: 30, dead: true },
];

export default function Gallery() {
  const { palette } = useStore();
  const c = useColors();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Page title="Gallery">
      <ScrollView contentContainerStyle={styles.body}>
        {SKINS.map((skin) => (
          <View key={skin} style={{ gap: 6 }}>
            <Txt variant="title3">{skin}</Txt>
            <View style={styles.grid}>
              {AGES.map((a) => (
                <View key={`${a.days}${a.dead}`} style={[styles.cell, { backgroundColor: c.skyCard }]}>
                  <TreeThumb {...a} skin={skin} seed={`${skin}${a.days}`} palette={palette} size={160} />
                  <View style={styles.label}>
                    {a.dead && <Glyph name="tombstone" size={14} />}
                    <Txt variant="caption">{a.days}</Txt>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  body: { padding: 12, gap: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: { borderRadius: 12, alignItems: 'center', overflow: 'hidden' },
  label: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 4 },
});
