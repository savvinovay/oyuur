// The list from the 4th place on (спец-друзья 9.3): a card of 60-high rows — place, avatar 40,
// name, under it the week's 7 dots or the best tree's line, the value on the right. My row is
// green with a ring; without open trees the value is "—" and a link to share a tree. A shared
// place is "=2", so a tie doesn't read as a mistake.
// Entry (9.5): rows come in at 420 + 60 × row (opacity, 10 px up, 240 ms), the card's face with
// the first row, then my row glows once. A tab switch is a new list (keyed by the board in
// leaders.tsx) whose rows fade in: rows sliding past each other overlapped mid-way (wave 5 fixes).
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import type { Board } from '@/game/leaders';
import { useStore } from '@/state/store';
import { elevation, fonts, motion, Txt, useColors, withAlpha } from '@/ui/ds';
import { BoardRow, Dot, placeLabel } from './model';
import { Breathing, FadeSwap, PlayerAvatar, valueText } from './parts';

const ROW = 60;
const ROWS_AT = 420;
const ROW_STEP = 60;

export function LeaderList({ rows, board, intro, motionOn, onOpenTrees }: {
  rows: BoardRow[];
  board: Board;
  intro: boolean;
  motionOn: boolean;
  /** "Share a tree with friends" on my row. */
  onOpenTrees: () => void;
}) {
  const c = useColors();
  const { night } = useStore();
  const [playing] = useState(intro);
  const face = useSharedValue(playing ? 0 : 1);
  useEffect(() => {
    if (playing) face.set(withDelay(motionOn ? ROWS_AT : 0, withTiming(1, { duration: motionOn ? motion.base : motion.still, easing: motion.ease.out })));
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const faceStyle = useAnimatedStyle(() => ({ opacity: face.get() }));
  if (rows.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.card, elevation(1, night), { backgroundColor: c.card }, faceStyle]} />
      {rows.map((row, i) => {
        const prev = rows[i - 1];
        const divider = i > 0 && !row.player.me && !prev.player.me;
        return (
          <LeaderRow
            key={row.player.nick}
            row={row}
            board={board}
            index={i}
            intro={intro}
            motionOn={motionOn}
            divider={divider}
            onOpenTrees={onOpenTrees}
          />
        );
      })}
    </View>
  );
}

function LeaderRow({ row, board, index, intro, motionOn, divider, onOpenTrees }: {
  row: BoardRow; board: Board; index: number; intro: boolean; motionOn: boolean; divider: boolean; onOpenTrees: () => void;
}) {
  const c = useColors();
  const { t } = useStore();
  const [playing] = useState(intro);
  const me = row.player.me;
  const at = motionOn ? ROWS_AT + ROW_STEP * index : 0;
  const glow = useSharedValue(0);
  const show = useSharedValue(0);
  useEffect(() => {
    // A row that comes later (a tab switch) just fades in, 200 ms.
    if (!playing) {
      show.set(withTiming(1, { duration: motionOn ? 200 : motion.still, easing: motion.ease.out }));
      return;
    }
    show.set(withDelay(at, withTiming(1, { duration: motionOn ? motion.base : motion.still, easing: motion.ease.out })));
    if (me && motionOn) glow.set(withDelay(at + motion.base, withSequence(withTiming(1, { duration: 350 }), withTiming(0, { duration: 350 }))));
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: show.get(), transform: [{ translateY: motionOn && playing ? 10 * (1 - show.get()) : 0 }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.get() }));

  const value = valueText(t, board, row.value);
  const place = placeLabel(row);
  const ink = me ? c.doneInk : c.text;
  const out = row.value === null;
  let detail;
  if (out) {
    detail = me ? (
      <Txt numberOfLines={2} style={[styles.detail, styles.twoLines, { color: c.waterInk }]}>{t('leadersOpenToJoin')}</Txt>
    ) : (
      <Txt numberOfLines={1} style={[styles.detail, { color: c.textSoft }]}>{t('leadersNotSharing')}</Txt>
    );
  } else if (board === 'week') {
    detail = <WeekDots dots={row.dots} />;
  } else {
    detail = (
      <Txt numberOfLines={1} style={[styles.detail, { color: c.textSoft }]}>
        {row.best ? t('leadersBestTree', { habit: row.best.habit, kind: t.dict.skinNames[row.best.skin].toLocaleLowerCase(t.lang) }) : t('leadersNoGrowing')}
      </Txt>
    );
  }
  const tie = row.tiedWith.length ? `, ${t('leadersTieA11y', { names: row.tiedWith.join(', ') })}` : '';
  const label = out ? `${row.player.name}, ${t('leadersOutA11y')}` : `${t('leadersPlaceA11y', { n: row.place ?? 0 })}${tie}. ${row.player.name}. ${value}`;

  const body = (
    <>
      {divider && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
      <Txt numberOfLines={1} style={[styles.place, place.length > 2 && styles.placeLong, { color: me ? c.doneInk : c.textSoft }]}>{place}</Txt>
      <PlayerAvatar player={row.player} size={40} ring={0} shadow={false} />
      <View style={styles.middle}>
        <Txt numberOfLines={1} style={[styles.name, { color: ink }]}>{row.player.name}</Txt>
        {detail}
      </View>
      <FadeSwap value={value} on={motionOn}>
        <Txt style={[styles.value, { color: out ? c.textMuted : c.text }]}>{value}</Txt>
      </FadeSwap>
    </>
  );

  return (
    <Animated.View
      exiting={FadeOut.duration(motionOn ? 120 : motion.still)}
      style={style}
    >
      {me && (
        <>
          <View pointerEvents="none" style={[styles.meRow, { backgroundColor: c.meRow, borderColor: c.accent }]} />
          <Animated.View pointerEvents="none" style={[styles.meGlow, { borderColor: c.accent }, glowStyle]} />
        </>
      )}
      {me && out ? (
        <Pressable onPress={onOpenTrees} accessibilityRole="button" accessibilityLabel={`${label}. ${t('leadersOpenToJoin')}`} style={styles.row}>
          {body}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={label} style={styles.row}>
          {body}
        </View>
      )}
    </Animated.View>
  );
}

function WeekDots({ dots }: { dots: Dot[] }) {
  const c = useColors();
  const { night } = useStore();
  // A missed day must still show on the white card (sunken beige melted into it by day).
  const off = night ? c.sunken : withAlpha(c.textMuted, 0.38);
  return (
    <View style={styles.dots}>
      {dots.map((d, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            d === 'on' ? { backgroundColor: c.accent } : d === 'off' ? { backgroundColor: off } : { borderWidth: 2, borderColor: c.water },
          ]}
        />
      ))}
    </View>
  );
}

/** Two skeleton rows while the first data loads (спец-друзья 11.2). */
export function ListSkeleton({ motionOn }: { motionOn: boolean }) {
  const c = useColors();
  const { night } = useStore();
  return (
    <View style={[styles.wrap, styles.card, elevation(1, night), { backgroundColor: c.card }]}>
      {[1, 0.7].map((o, i) => (
        <View key={i} style={{ opacity: o }}>
          <Breathing on={motionOn} style={styles.row}>
          <View style={[styles.skelPlace, { backgroundColor: c.sunken }]} />
          <View style={[styles.skelCircle, { backgroundColor: c.sunken }]} />
          <View style={styles.middle}>
            <View style={[styles.bar, { width: 120, height: 14, backgroundColor: c.sunken }]} />
            <View style={[styles.bar, { width: 88, height: 8, marginTop: 8, backgroundColor: c.sunken }]} />
          </View>
          <View style={[styles.bar, { width: 44, height: 14, backgroundColor: c.sunken }]} />
          </Breathing>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20 },
  card: { borderRadius: 20 },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingRight: 14 },
  divider: { position: 'absolute', top: 0, left: 90, right: 0, height: 1 },
  meRow: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 20, borderWidth: 2 },
  meGlow: { position: 'absolute', left: -2, right: -2, top: -2, bottom: -2, borderRadius: 22, borderWidth: 4 },
  place: { width: 30, textAlign: 'center', fontFamily: fonts.black, fontSize: 16, lineHeight: 20 },
  placeLong: { fontSize: 13 },
  middle: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.black, fontSize: 16, lineHeight: 21 },
  detail: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 16 },
  twoLines: { lineHeight: 15 },
  value: { fontFamily: fonts.black, fontSize: 16, lineHeight: 20 },
  dots: { flexDirection: 'row', gap: 4, marginTop: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  skelPlace: { width: 16, height: 14, borderRadius: 7, marginHorizontal: 6 },
  skelCircle: { width: 40, height: 40, borderRadius: 20 },
  bar: { borderRadius: 7 },
});
