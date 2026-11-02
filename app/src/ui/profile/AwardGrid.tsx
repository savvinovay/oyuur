// The achievements grid (wave 5 spec, 11.2, frame 25): four in a row, medals 64 (56 on a
// 320 phone). Ready ones first with a red "+80", then the claimed, then those with progress
// (a ring and "48/100"), then the rest. A tap opens the achievement window.
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { AchievementId, AchievementView } from '@/game/achievements';
import { useStore } from '@/state/store';
import { Badge } from '@/ui/awards/Badge';
import { fonts, Txt, useColors } from '@/ui/ds';
import { awardOrder, progressOf, showsProgress } from './model';

const GAP_X = 8;
const GAP_Y = 14;

export function AwardGrid({ views, width, onOpen }: { views: AchievementView[]; width: number; onOpen(id: AchievementId): void }) {
  const narrow = width < 330;
  const ordered = awardOrder(views);
  const rows = Array.from({ length: Math.ceil(ordered.length / 4) }, (_, r) => ordered.slice(r * 4, r * 4 + 4));
  // Rows of four equal cells: they share whatever width there is (a browser's scroll bar too).
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((v) => (
            <Cell key={v.id} view={v} medal={narrow ? 56 : 64} onOpen={onOpen} />
          ))}
          {Array.from({ length: 4 - row.length }, (_, i) => (
            <View key={`gap${i}`} style={styles.cell} />
          ))}
        </View>
      ))}
    </View>
  );
}

const Cell = memo(function Cell({ view, medal, onOpen }: { view: AchievementView; medal: number; onOpen(id: AchievementId): void }) {
  const { t } = useStore();
  const c = useColors();
  const name = t.dict.awardNames[view.id];
  const progress = showsProgress(view);
  const a11y =
    view.state === 'ready' ? t('awardA11yReady', { name, n: view.reward })
      : view.state === 'claimed' ? t('awardA11yClaimed', { name })
        : progress ? t('awardA11yProgress', { name, v: view.value, g: view.goal }) : t('awardA11yLocked', { name });
  return (
    <Pressable
      onPress={() => onOpen(view.id)}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
    >
      <Badge id={view.id} state={view.state} progress={progress ? progressOf(view) : 0} size={medal} />
      {view.state === 'ready' && (
        <View style={[styles.pill, { backgroundColor: c.badge, borderColor: c.page }]}>
          <Txt style={styles.pillText} color="#FFFFFF">{`+${view.reward}`}</Txt>
        </View>
      )}
      <Txt numberOfLines={2} style={styles.name} color={view.state === 'locked' ? c.textSoft : c.text}>{name}</Txt>
      {progress && <Txt style={styles.progress} color={c.textSoft}>{`${view.value}/${view.goal}`}</Txt>}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  grid: { gap: GAP_Y },
  row: { flexDirection: 'row', gap: GAP_X },
  cell: { flex: 1, minWidth: 0, alignItems: 'center' },
  pressed: { opacity: 0.7 },
  pill: { position: 'absolute', top: -4, right: 0, minWidth: 34, height: 22, borderRadius: 11, borderWidth: 2, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: fonts.black, fontSize: 12, lineHeight: 15 },
  name: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 15, textAlign: 'center', marginTop: 6 },
  progress: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, marginTop: 2, fontVariant: ['tabular-nums'] },
});
