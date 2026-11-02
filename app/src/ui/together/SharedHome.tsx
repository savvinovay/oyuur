// A shared tree on the main screen (спец-друзья 8.4, frame 26): what the header's second line,
// the sheet's two status lines and its bottom link say. The tree itself is the usual live
// tree (LiveTree with `shared`); the day cards are PairStrip.
import { router } from 'expo-router';
import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { canWaterAt, nextStage, wateringOpensAt } from '@/game/tree';
import { partnerOf, SharedTree, sharedAsTree, todayOf } from '@/game/shared';
import { pluralForm, stageDaysText } from '@/i18n';
import { useStore } from '@/state/store';
import { fonts, Glyph, GlyphName, Icon, MAX_FONT_SCALE, Txt, useColors } from '@/ui/ds';
import { waitLine } from '@/ui/sheet/wait';
import { LateLine, WaitTitle } from '@/ui/sheet/WaitStatus';
import { nameIn, nameOf, sharedPhase, sharedTreeId } from './model';
import { PairAvatar } from './PairAvatar';
import { PairStrip } from './PairDays';

/** The header's line 2: the half avatars and "with Aisha". */
export function SharedLine({ s, me }: { s: SharedTree; me: string }) {
  const { t, profile, today } = useStore();
  const c = useColors();
  const friend = partnerOf(s, me);
  const { mine, theirs } = todayOf(s, me, today);
  return (
    <View style={styles.with}>
      <PairAvatar me={profile} friend={friend} size={24} both={mine && theirs} />
      <Txt numberOfLines={1} style={[styles.withText, { color: c.textSoft }]}>{t('tgWithFriend', { name: nameIn(friend, t.lang) })}</Txt>
    </View>
  );
}

/** The sheet's two lines: my half's state, then the friend's or the next stage. */
export function SharedStatus({ s, me, animations }: { s: SharedTree; me: string; animations: boolean }) {
  const { t, today, clock, sharedHalf } = useStore();
  const c = useColors();
  const friend = partnerOf(s, me);
  const phase = sharedPhase(s, me, today);
  const tree = sharedAsTree(s, today);
  let glyph: GlyphName;
  let title: string;
  let color = c.text;
  let second: ReactNode;
  let titleRow: ReactNode = null;
  if (phase === 'dead') {
    glyph = 'tombstone';
    title = t('tgDiedOn', { n: tree.checkins.length + tree.frozen.length + 1 });
    second = <Line>{t('tgDeadShort', { days: stageDaysText(t, tree.checkins.length) })}</Line>;
  } else if (phase === 'both') {
    glyph = 'check';
    title = t('tgBothDone');
    color = c.doneInk;
    const next = nextStage(tree, today);
    second = next ? <Forecast on={next.on} taps={next.taps} stage={t.dict.stageNames[next.stage]} /> : <View style={styles.empty} />;
  } else if (phase === 'mine') {
    glyph = 'check';
    title = t('tgHalfDone');
    color = c.doneInk;
    second = <Wait text={t('tgWaitFriend', { name: nameIn(friend, t.lang) })} />;
  } else {
    glyph = 'drop';
    title = t('tgHalfMine');
    color = c.waterInk;
    second = phase === 'theirs' ? <Line>{t('tgFriendDone', { name: nameOf(friend) })}</Line> : <Wait text={t('tgWaitFriend', { name: nameIn(friend, t.lang) })} />;
    // My half before my watering hour (OYUUR-33 6): the clock line, as on my own trees.
    const wait = waitLine(sharedHalf(s), today, clock, true);
    if (wait?.kind === 'late' && phase === 'none') second = <LateLine />;
    else if (wait && wait.kind !== 'late') {
      titleRow = <WaitTitle treeId={sharedTreeId(s.id)} line={wait} animations={animations} />;
      // Nobody can water it yet: not "waiting for the friend", the next stage as on my own trees.
      if (phase === 'none') {
        const next = nextStage(tree, today);
        second = next ? <Forecast on={next.on} taps={next.taps} stage={t.dict.stageNames[next.stage]} /> : <View style={styles.empty} />;
      }
    }
  }
  return (
    <View style={styles.status}>
      <Animated.View key={`${s.id}|${phase}|${titleRow ? 'wait' : ''}`} entering={animations ? FadeIn.duration(180) : undefined} style={styles.lines}>
        {titleRow ?? (
          <View style={styles.row}>
            <Glyph name={glyph} size={22} />
            <Txt variant="bodyStrong" color={color} numberOfLines={1} style={styles.title}>{title}</Txt>
          </View>
        )}
        {second}
      </Animated.View>
    </View>
  );
}

/** The five day cards with two dots each; today before my watering hour — the clock and the hour. */
export function SharedDays({ s, me }: { s: SharedTree; me: string }) {
  const { today, clock, sharedHalf } = useStore();
  const half = sharedHalf(s);
  const waits = s.status === 'active' && !todayOf(s, me, today).mine && !canWaterAt(half, today, clock);
  return <PairStrip s={s} me={me} waitHour={waits ? wateringOpensAt(half, today) : null} />;
}

/** "Shared tree ›" in the place of "Lock in the result". */
export function SharedLink({ s }: { s: SharedTree }) {
  const { t } = useStore();
  const c = useColors();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/together', params: { id: s.id } })}
      hitSlop={6}
      accessibilityRole="link"
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
      testID="shared-link"
    >
      <Glyph name="friends" size={18} />
      <Txt variant="small" color={c.textSoft} style={styles.strong}>{t('tgOpenShared')}</Txt>
      <Icon name="chevronRight" size={16} color={c.textSoft} />
    </Pressable>
  );
}

function Line({ children }: { children: string }) {
  const c = useColors();
  return (
    <Txt numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.second, { color: c.textSoft }]}>
      {children}
    </Txt>
  );
}

function Wait({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={styles.row}>
      <Icon name="hourglass" size={15} color={c.textSoft} />
      <Line>{text}</Line>
    </View>
  );
}

function Forecast({ on, taps, stage }: { on: string; taps: number; stage: string }) {
  const { t, today } = useStore();
  const date = new Date(`${on}T12:00:00`);
  return (
    <View style={styles.row}>
      <Glyph name="rings" size={16} />
      <Line>
        {on === today
          ? t('nextStageToday', { stage })
          : t('nextStage', { stage, n: taps, days: t.dict.dayWords[pluralForm(t.lang, taps)], date: `${t.dict.weekdays[date.getDay()]} ${date.getDate()}` })}
      </Line>
    </View>
  );
}

const styles = StyleSheet.create({
  with: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  withText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  status: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 16 },
  lines: { alignItems: 'center', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, maxWidth: '100%' },
  title: { flexShrink: 1 },
  second: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, flexShrink: 1, textAlign: 'center' },
  empty: { height: 20 },
  link: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: 12 },
  strong: { fontFamily: fonts.bold },
});
