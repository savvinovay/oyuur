// The profile's numbers (wave 5 spec, 11.1): six tiles, three in a row — a glyph, the
// number, a soft label of up to two lines.
import { StyleSheet, View } from 'react-native';
import type { Stats } from '@/game/achievements';
import { useStore } from '@/state/store';
import { elevation, fonts, Glyph, GlyphName, Txt, useColors } from '@/ui/ds';
import { formatCount } from './model';

const GAP = 10;

export function StatsGrid({ stats, earned, width }: { stats: Stats; earned: number; width: number }) {
  const { t, night } = useStore();
  const c = useColors();
  const narrow = width < 330;
  const items: [GlyphName, number, string][] = [
    ['drop', stats.waterings, t('meStatWatered')],
    ['rings', stats.bestDays, t('meStatBest')],
    ['acorn', earned, t('meStatAcorns')],
    ['sprout', stats.growing, t('meStatGrowing')],
    ['forest', stats.lockedIn, t('meStatForest')],
    ['tombstone', stats.memories, t('meStatMemory')],
  ];
  return (
    <View style={styles.grid}>
      {[items.slice(0, 3), items.slice(3)].map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map(([glyph, n, label]) => {
            const value = formatCount(n, t.lang);
            return (
              <View
                key={glyph}
                style={[styles.tile, elevation(1, night), { backgroundColor: c.card }]}
                accessible
                accessibilityLabel={`${value} ${label}`}
              >
                <Glyph name={glyph} size={22} />
                <Txt numberOfLines={1} adjustsFontSizeToFit style={[styles.n, narrow && styles.nNarrow]}>{value}</Txt>
                <Txt numberOfLines={2} color={c.textSoft} style={styles.label}>{label}</Txt>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Rows of three equal tiles: they share whatever width there is (a browser's scroll bar too).
  grid: { gap: GAP },
  row: { flexDirection: 'row', gap: GAP },
  tile: { flex: 1, minWidth: 0, minHeight: 86, borderRadius: 16, paddingTop: 10, paddingHorizontal: 10, paddingBottom: 8 },
  n: { fontFamily: fonts.black, fontSize: 22, lineHeight: 26, marginTop: 4, fontVariant: ['tabular-nums'] },
  nNarrow: { fontSize: 20 },
  label: { fontFamily: fonts.bold, fontSize: 11.5, lineHeight: 14 },
});
