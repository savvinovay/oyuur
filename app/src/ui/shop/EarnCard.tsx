// "How to earn acorns" under the shop's grid (spec 6.3): five rows of what pays and how
// much. The daily quest and the achievements rows lead to them.
import { Fragment } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ACHIEVEMENTS } from '@/game/achievements';
import { STAGE_REWARDS, WATER_REWARD } from '@/game/economy';
import { ALL_QUESTS_BONUS, QUEST_REWARD } from '@/game/quests';
import { useStore } from '@/state/store';
import { elevation, fonts, Glyph, GlyphName, Icon, MAX_FONT_SCALE, Txt, useColors } from '@/ui/ds';
import { shopCue } from './cues';
import { openProfile, openQuests } from './links';

const awards = ACHIEVEMENTS.map((a) => a.reward);
const AWARDS = `+${Math.min(...awards)}…${Math.max(...awards)}`;

export function EarnCard() {
  const { t, night } = useStore();
  const c = useColors();
  const stages = STAGE_REWARDS.filter((n) => n > 0);
  const rows: { glyph: GlyphName; text: string; sum: string; onPress?: () => void }[] = [
    { glyph: 'drop', text: t('shopEarnWater'), sum: `+${WATER_REWARD}` },
    { glyph: 'stageUp', text: t('shopEarnStage'), sum: `+${stages[0]}…${stages[stages.length - 1]}` },
    { glyph: 'tasks', text: t('shopEarnQuest'), sum: `+${QUEST_REWARD}`, onPress: openQuests },
    { glyph: 'basket', text: t('shopEarnAll'), sum: `+${ALL_QUESTS_BONUS}` },
    { glyph: 'plaque', text: t('shopEarnAward'), sum: AWARDS, onPress: openProfile },
  ];
  return (
    <View style={[styles.card, elevation(1, night), { backgroundColor: c.card }]}>
      <View style={styles.head}>
        <Glyph name="acorn" size={24} />
        <Txt variant="title3" accessibilityRole="header" style={styles.title}>{t('shopEarnTitle')}</Txt>
      </View>
      {rows.map((r) => {
        const line = (
          <>
            <Glyph name={r.glyph} size={24} />
            <Txt variant="small" maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.text, { color: c.text }]}>{r.text}</Txt>
            <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.sum, { color: c.text }]}>{r.sum}</Txt>
            {r.onPress && <Icon name="chevronRight" size={16} color={c.textSoft} />}
          </>
        );
        return (
          <Fragment key={r.glyph}>
            <View style={[styles.divider, { backgroundColor: c.divider }]} />
            {r.onPress ? (
              <Pressable
                onPress={() => {
                  shopCue('tap');
                  r.onPress!();
                }}
                accessibilityRole="link"
                accessibilityLabel={`${r.text}, ${r.sum}`}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              >
                {line}
              </Pressable>
            ) : (
              <View style={styles.row} accessible accessibilityLabel={`${r.text}, ${r.sum}`}>{line}</View>
            )}
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  title: { flexShrink: 1 },
  divider: { height: 1 },
  row: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  text: { flex: 1, fontSize: 14, lineHeight: 18 },
  sum: { fontFamily: fonts.black, fontSize: 14, lineHeight: 18, fontVariant: ['tabular-nums'] },
});
