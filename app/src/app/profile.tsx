// The profile (wave 5 spec, section 11, frames 25–30): the avatar and name, six numbers, the
// achievements grid, and who sees the trees. `/profile?award=days7` opens that achievement's
// window (the "new achievement" toast on the main screen leads here).
// With an account (OYUUR-31, design/oyuur-29/спец.md 1) showing a tree to friends asks first — it
// leaves the locked chest, with all its days — and hiding one says honestly that backups may keep
// it for 14 days. Without an account the switch just works, as before.
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACHIEVEMENT_IDS, AchievementId } from '@/game/achievements';
import type { Visibility } from '@/game/tree';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { confirmDialog, elevation, fonts, Icon, Page, Txt, useColors, withAlpha } from '@/ui/ds';
import { showAccountToast } from '@/ui/account/SyncToasts';
import { cue } from '@/ui/feedback';
import { AwardDialog } from '@/ui/profile/AwardDialog';
import { AwardGrid } from '@/ui/profile/AwardGrid';
import { EditSheet } from '@/ui/profile/EditSheet';
import { friendsSeeText } from '@/ui/profile/model';
import { ProfileHead } from '@/ui/profile/ProfileHead';
import { StatsGrid } from '@/ui/profile/StatsGrid';
import { VisibilitySheet } from '@/ui/profile/VisibilitySheet';
import { Wallet } from '@/ui/acorns';

const SIDE = 16;
/** The "who sees" row's square (spec 11.1). */
const EYE_TINT = '#4FB6E8';

export default function ProfileScreen() {
  const { t, profile, stats, wallet, achievements, habits, night, setVisibility: setHabitVisibility } = useStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const signedIn = !!useFriends().account;
  const params = useLocalSearchParams<{ award?: string }>();
  // The room the grids have, measured (a desktop browser's column, a scroll bar).
  const windowW = useWindowDimensions().width;
  const [measured, setMeasured] = useState(0);
  const inner = measured || windowW - 2 * SIDE;
  const onLayout = (e: LayoutChangeEvent) => setMeasured(Math.floor(e.nativeEvent.layout.width));

  const [editing, setEditing] = useState(false);
  const [whoSees, setWhoSees] = useState(false);
  /** "Show to friends?" is open: the sheet is away under it. */
  const [asking, setAsking] = useState(false);
  const [award, setAward] = useState<AchievementId | null>(() =>
    ACHIEVEMENT_IDS.includes(params.award as AchievementId) ? (params.award as AchievementId) : null,
  );
  const awardView = award ? achievements.find((a) => a.id === award) ?? null : null;

  // The switch is per habit: every generation of it gets the mark.
  const overrides: Record<string, Visibility> = {};
  const setVisibility = async (treeId: string, v: Visibility) => {
    const habit = habits.find((h) => h.generations.some((g) => g.id === treeId));
    if (!habit || habit.current.visibility === v) return;
    if (signedIn && v === 'friends') {
      // The sheet steps away under the question (no cut-off title peeking out), and comes back after.
      setAsking(true);
      const yes = await confirmDialog({
        title: t('visibilityToFriendsTitle'),
        message: t('visibilityToFriends', { name: habit.current.name }),
        confirmLabel: t('visibilityShow'),
        cancelLabel: t('cancel'),
        glyph: 'friends',
      }).finally(() => setAsking(false));
      if (!yes) return;
    }
    setHabitVisibility(habit.lineageId, v);
    if (signedIn && v === 'private') {
      showAccountToast({ icon: 'lock', iconColor: '#FFCF4D', title: t('visibilityToPrivate'), sub: t('visibilityToPrivateNote'), ms: 4500 });
    }
  };

  const claimedCount = achievements.filter((a) => a.state === 'claimed').length;
  const openAward = (id: AchievementId) => {
    cue('select');
    setAward(id);
  };

  return (
    <View style={styles.root}>
      <Page title={t('meTitle')} right={<Wallet />}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <ProfileHead profile={profile} onEdit={() => setEditing(true)} />

          <View style={styles.stats} onLayout={onLayout}>
            <StatsGrid stats={stats} earned={wallet.earned} width={inner} />
          </View>

          <View style={styles.titleRow}>
            <Txt variant="title3" accessibilityRole="header">{t('meAwards')}</Txt>
            <Txt variant="caption" color={c.textSoft} style={styles.count}>
              {t('meAwardsOf', { n: claimedCount, total: achievements.length })}
            </Txt>
          </View>
          <View style={styles.side}>
            <AwardGrid views={achievements} width={inner} onOpen={openAward} />
          </View>

          {habits.length > 0 && (
            <>
              <Txt variant="title3" accessibilityRole="header" style={styles.whoTitle}>{t('meWhoSees')}</Txt>
              {/* The shadow outside, the clipping inside: on iOS a clipped view loses its shadow. */}
              <View style={[styles.side, styles.card, elevation(1, night), { backgroundColor: c.card }]}>
                <View style={styles.clip}>
                  <Pressable
                    onPress={() => {
                      cue('select');
                      setWhoSees(true);
                    }}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.row, pressed && { backgroundColor: withAlpha(c.sunken, 0.5) }]}
                  >
                    <View style={[styles.square, { backgroundColor: EYE_TINT }]}>
                      <Icon name="eye" size={20} color="#FFFFFF" strokeWidth={2.3} />
                    </View>
                    <View style={styles.rowText}>
                      <Txt variant="bodyStrong" numberOfLines={2}>{friendsSeeText(t, habits, overrides)}</Txt>
                      <Txt variant="caption" color={c.textSoft} style={styles.caption}>{t('mePrivateNote')}</Txt>
                    </View>
                    <Icon name="chevronRight" size={18} color={c.textSoft} strokeWidth={2.6} />
                  </Pressable>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </Page>

      <EditSheet open={editing} onClose={() => setEditing(false)} />
      <VisibilitySheet
        open={whoSees && !asking}
        onClose={() => setWhoSees(false)}
        habits={habits}
        overrides={overrides}
        onChange={setVisibility}
      />
      <AwardDialog view={awardView} onClose={() => setAward(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  side: { marginHorizontal: SIDE },
  stats: { marginTop: 20, marginHorizontal: SIDE },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 24, marginBottom: 12, marginHorizontal: 20 },
  count: { fontFamily: fonts.bold },
  whoTitle: { marginTop: 24, marginBottom: 10, marginHorizontal: 20 },
  card: { borderRadius: 20 },
  clip: { borderRadius: 20, overflow: 'hidden' },
  row: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  square: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0 },
  caption: { fontFamily: fonts.bold, marginTop: 2 },
});
