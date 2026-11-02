// A friend in the list (спец-друзья 4.2, frames 05, 08): avatar with today's badge, name (and
// "together" for a shared tree), best streak and growing trees, what they did today; on the
// right the "cheered" mark and a chevron. Pressed it shrinks to 0.98 and springs back.
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { DayKey } from '@/game/dates';
import type { Friend } from '@/net/api';
import { useStore } from '@/state/store';
import { hourText } from '@/ui/watering/format';
import { elevation, fonts, Glyph, Icon, motion, Txt, useColors, useMotionOn } from '@/ui/ds';
import { AvatarBadge, FriendAvatar } from './FriendAvatar';
import { displayName, statsOf, TodayState, todayState, treesOf, treesText } from './model';

export const ROW_H = 84;
export const ROW_H_COMPACT = 72;
export const ROW_GAP = 10;

const BADGE: Record<TodayState['kind'], AvatarBadge> = { all: 'check', some: 'drop', none: 'drop', noData: 'hourglass', noTrees: null, waiting: null };

export const FriendRow = memo(function FriendRow({ friend, today, together, compact, onPress }: {
  friend: Friend;
  today: DayKey;
  together: boolean;
  /** 320 px wide: avatar 40, row 72. */
  compact: boolean;
  onPress: (nick: string) => void;
}) {
  const { t, night, clock } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const trees = treesOf(friend.forest);
  const stats = statsOf(trees, today);
  const state = todayState(trees, friend.forestAt, today, clock);
  const name = displayName(friend);

  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  const todayLine = (() => {
    switch (state.kind) {
      case 'all': return { text: t('frWateredAll'), color: c.doneInk, glyph: 'check' as const };
      case 'some': return { text: t('frWateredSome', { a: state.watered, b: state.total }), color: c.waterInk, glyph: 'drop' as const };
      case 'none': return { text: t('frWateredNone'), color: c.waterInk, glyph: 'drop' as const };
      case 'waiting': return { text: t('wtChipFrom', { time: hourText(state.hour, t.lang) }), color: c.textSoft, glyph: null };
      case 'noData': return { text: t('frNoDataToday'), color: c.textSoft, glyph: null };
      default: return null;
    }
  })();
  const daysText = t('frDaysShort', { n: stats.best });
  const a11y = [
    t('frRowA11y', { name, nick: `@${friend.nick}`, days: daysText, trees: treesText(t, stats.growing), today: todayLine?.text ?? '' }),
    friend.cheeredToday ? t('frCheerSentA11y') : '',
  ].join(' ').trim();

  const av = compact ? 40 : 64;
  return (
    <Pressable
      onPress={() => onPress(friend.nick)}
      onPressIn={() => scale.set(withTiming(0.98, { duration: motion.press }))}
      onPressOut={() => scale.set(motionOn ? withSpring(1, motion.spring.press) : withTiming(1, { duration: motion.still }))}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Animated.View style={[styles.card, elevation(1, night), { height: compact ? ROW_H_COMPACT : ROW_H, backgroundColor: c.card }, pressStyle]}>
        <FriendAvatar person={friend} size={av} badge={BADGE[state.kind]} />
        <View style={styles.text}>
          <View style={styles.nameLine}>
            <Txt numberOfLines={1} style={[styles.name, { color: c.text }]}>{name}</Txt>
            {together && (
              <View style={[styles.tag, { backgroundColor: c.accentSoft }]}>
                <Txt variant="micro" color={c.doneInk}>{t('frTogether')}</Txt>
              </View>
            )}
          </View>
          <View style={styles.facts}>
            <Glyph name="rings" size={16} />
            <Txt style={[styles.fact, { color: c.textSoft, flexShrink: 0 }]}>{daysText}</Txt>
            <View style={[styles.dot, { backgroundColor: c.textMuted }]} />
            <Glyph name="sprout" size={16} />
            <Txt numberOfLines={1} style={[styles.fact, { color: c.textSoft, flexShrink: 1 }]}>{treesText(t, stats.growing)}</Txt>
          </View>
          {todayLine && (
            <View style={styles.facts}>
              {todayLine.glyph ? <Glyph name={todayLine.glyph} size={14} /> : <Icon name="hourglass" size={14} color={c.textSoft} strokeWidth={2} />}
              <Txt numberOfLines={1} style={[styles.fact, { color: todayLine.color, flexShrink: 1 }]}>{todayLine.text}</Txt>
            </View>
          )}
        </View>
        {friend.cheeredToday && (
          <View style={[styles.cheered, { backgroundColor: c.warmSoft }]}>
            <Glyph name="cheer" size={20} />
          </View>
        )}
        <Icon name="chevronRight" size={18} color={c.textSoft} />
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 20, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  text: { flex: 1, minWidth: 0, gap: 1 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: fonts.black, fontSize: 17, lineHeight: 22, flexShrink: 1 },
  tag: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  facts: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fact: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  dot: { width: 3, height: 3, borderRadius: 2, marginHorizontal: 3 },
  cheered: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
