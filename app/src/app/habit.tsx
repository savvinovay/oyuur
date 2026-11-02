// Read-only look at a locked-in habit, opened from the forest (spec 4.11, frame 21):
// its tree, every generation (arrows) and the whole history of days. Nothing here
// can be tapped except the way back.
import { Href, Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DayKey } from '@/game/dates';
import { growthDays, isCompleted, isDead } from '@/game/tree';
import { useStore } from '@/state/store';
import { DayStrip } from '@/ui/DayStrip';
import { Button, elevation, Glyph, Grabber, Icon, Pill, SheetSurface, Txt, useColors } from '@/ui/ds';
import { Backdrop, GROUND_LIFT } from '@/ui/Scene';
import { TreeArt } from '@/ui/TreeArt';
import { GenerationArrow, TreeHeader } from '@/ui/TreeHeader';
import { friendForestPath } from '@/ui/friends/nav';
import { friendForest } from '@/ui/together/friendForests';

export default function HabitView() {
  const { habits: mine, palette, night, t } = useStore();
  const c = useColors();
  // `friend`: a friend's tree, opened from their forest (wave 5, спец-друзья 7).
  const { lineage, friend } = useLocalSearchParams<{ lineage?: string; friend?: string }>();
  const habits = friend ? friendForest(friend) ?? [] : mine;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // A past generation being looked at; null means the newest one.
  const [genId, setGenId] = useState<string | null>(null);
  const [groundY, setGroundY] = useState<number | null>(null);

  // A friend's trees are kept only in memory: after a reload in the browser they are gone, so
  // back to their forest (it fetches them again), not to mine.
  const forestPath = (friend ? friendForestPath(friend, lineage) : '/forest') as Href;
  const habit = habits.find((h) => h.lineageId === lineage);
  if (!habit) return <Redirect href={forestPath} />;

  const generations = habit.generations;
  const found = generations.findIndex((x) => x.id === genId);
  const genIndex = found >= 0 ? found : generations.length - 1;
  const tree = generations[genIndex];
  const goGeneration = (delta: number) => {
    const next = generations[genIndex + delta];
    if (next) setGenId(next.id);
  };
  const back = () => (router.canGoBack() ? router.back() : router.replace(forestPath));

  const date = (day: DayKey) => {
    const d = new Date(`${day}T12:00:00`);
    return `${d.getDate()} ${t.dict.months[d.getMonth()]}`;
  };
  const facts = [t('plantedOn', { date: date(tree.plantedOn) })];
  if (tree.completedOn) facts.push(t('lockedOn', { date: date(tree.completedOn) }));
  if (tree.diedOn) facts.push(t('diedOn', { date: date(tree.diedOn) }));
  const title = isDead(tree) ? t('diedTitle') : isCompleted(tree) ? t('lockedTitle') : t('alive');
  const glyph = isDead(tree) ? 'tombstone' : isCompleted(tree) ? 'plaque' : 'rings';

  return (
    <View style={styles.screen}>
      <Backdrop palette={palette} groundY={groundY} />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={back} accessibilityRole="button" accessibilityLabel={t('back')} style={[styles.backBtn, elevation(1, night), { backgroundColor: c.card }]}>
          <Icon name="chevronLeft" size={24} color={c.text} />
        </Pressable>
        <Pill icon="eye" label={t('viewOnly')} />
        <View style={styles.backBtnSpace} />
      </View>

      <TreeHeader tree={tree} position={genIndex + 1} total={generations.length} />

      <View style={styles.stage} onLayout={(e) => setGroundY(e.nativeEvent.layout.y + e.nativeEvent.layout.height - GROUND_LIFT)}>
        <View style={styles.treeWrap} accessibilityLabel={title}>
          <TreeArt days={growthDays(tree)} dead={isDead(tree)} completed={isCompleted(tree)} palette={palette} size={Math.min(width, 460) * 0.86} skin={tree.skin} seed={tree.id} />
        </View>
        {genIndex > 0 && <GenerationArrow side="left" onPress={() => goGeneration(-1)} />}
        {genIndex < generations.length - 1 && <GenerationArrow side="right" onPress={() => goGeneration(1)} />}
      </View>

      <SheetSurface style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.grabber}>
          <Grabber />
        </View>
        <View style={styles.status}>
          <View style={styles.titleRow}>
            <Glyph name={glyph} size={24} />
            <Txt variant="title3" numberOfLines={1} style={styles.title}>{title}</Txt>
          </View>
          <View style={styles.facts}>
            {facts.map((f) => <Pill key={f} size="s" label={f} />)}
            <Pill size="s" glyph="snowflake" label={String(tree.frozen.length)} />
          </View>
        </View>
        {/* A look back: missed days in a quiet tone, not a row of red crosses. */}
        <DayStrip tree={tree} full calm />
        <Button size="m" variant="secondary" glyph="forest" title={t('backToForest')} onPress={back} style={styles.backToForest} />
      </SheetSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  backBtnSpace: { width: 44 },
  stage: { flex: 1, justifyContent: 'flex-end' },
  treeWrap: { alignItems: 'center', marginBottom: 6 },
  sheet: { paddingTop: 8, gap: 6 },
  grabber: { marginBottom: 2 },
  status: { alignItems: 'center', paddingHorizontal: 16, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  title: { flexShrink: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  backToForest: { marginHorizontal: 16, marginTop: 2 },
});
