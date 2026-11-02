// The podium (спец-друзья 9.2, 9.5, frames 32–38): three columns of 100 with gaps of 8 —
// the first record in the middle, the second on the left, the third on the right. A block's
// height is by place (1 → 96, 2 → 72, 3+ → 56); above it the avatar, the name, the value.
// Fewer than three — dashed free places with "+" (tap → find a friend).
// Drawn in a 375-wide box; narrower screens scale it whole (×0.853 at 320).
//
// Motion, on the UI thread: on entry the blocks rise right, left, center (0 / 90 / 180 ms),
// people sit down 140 ms after their block, the crown drops at 620 ms. A block is a long bar
// sliding up out of a clip (transform only), so a new height after a tab switch is the same
// slide with the `thumb` spring. Without animations everything just fades in (120 ms).
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { Board } from '@/game/leaders';
import { useStore } from '@/state/store';
import { fonts, Glyph, Icon, motion, Txt, useColors, withAlpha } from '@/ui/ds';
import { elevation } from '@/ui/ds/tokens';
import { BoardRow, placeLabel } from './model';
import { FadeSwap, PlayerAvatar, valueText } from './parts';

/** The frame the podium is drawn in (375 wide), and the blocks' bottom in it. */
export const PODIUM_W = 375;
export const PODIUM_H = 268;
const BASE = 256;
const COL_W = 100;
const COL_X = [29.5, 137.5, 245.5];
/** The clip a block slides out of: room for the spring's overshoot above 96. */
const CLIP = 116;
const LIP = 4;
const BLOCK_H = { 1: 96, 2: 72, 3: 56 } as const;
/** Brand colors of the places (face, lip, number); the theme doesn't change them. */
const MEDAL = {
  1: ['#FFCF4D', '#D99A1E', '#5A3A0E'],
  2: ['#E7E9EE', '#8D93A1', '#4A4F5C'],
  3: ['#F2B98A', '#B97A4A', '#5E3517'],
} as const;
/** When each slot's block starts rising on entry: left, center, right. */
const RISE_AT = [90, 180, 0];
const RISE = { damping: 14, stiffness: 220, mass: 1 };
const CROWN_AT = 620;

const medalOf = (place: number) => Math.min(Math.max(place, 1), 3) as 1 | 2 | 3;

export type PodiumMode = 'board' | 'loading';

export function Podium({ rows, board, width, intro, motionOn, mode = 'board', crown = true, onFree }: {
  /** The first three records (fewer — free places). */
  rows: BoardRow[];
  board: Board;
  /** The width it has; the box scales down under 375. */
  width: number;
  /** Play the entry (first time the screen has data). */
  intro: boolean;
  motionOn: boolean;
  /** 'loading' — all three dashed, nothing to tap. */
  mode?: PodiumMode;
  /** False when I'm alone: no crown for winning against nobody (frame 37). */
  crown?: boolean;
  onFree?: () => void;
}) {
  const c = useColors();
  const s = Math.min(1, width / PODIUM_W);
  // Slots left, center, right ← records 2, 1, 3.
  const slots = [rows[1] ?? null, rows[0] ?? null, rows[2] ?? null];
  return (
    <View style={{ width, height: PODIUM_H * s }}>
      <View style={[styles.floor, { top: (BASE + LIP) * s, height: 8 * s, borderRadius: 4 * s, backgroundColor: c.sunken }]} />
      <View
        style={{
          position: 'absolute',
          left: (width - PODIUM_W * s) / 2,
          top: 0,
          width: PODIUM_W,
          height: PODIUM_H,
          // Scale around the top-left corner.
          transform: [{ translateX: (-PODIUM_W * (1 - s)) / 2 }, { translateY: (-PODIUM_H * (1 - s)) / 2 }, { scale: s }],
        }}
      >
        {slots.map((row, i) =>
          row && mode === 'board' ? (
            <Column key={i} slot={i} row={row} board={board} intro={intro} motionOn={motionOn} crown={crown} />
          ) : (
            <FreePlace key={i} slot={i} place={i === 1 ? 1 : i === 0 ? 2 : 3} loading={mode === 'loading'} intro={intro} motionOn={motionOn} onPress={onFree} />
          ),
        )}
      </View>
    </View>
  );
}

function Column({ slot, row, board, intro, motionOn, crown }: {
  slot: number; row: BoardRow; board: Board; intro: boolean; motionOn: boolean; crown: boolean;
}) {
  const { t } = useStore();
  const c = useColors();
  const place = row.place ?? 1;
  const medal = medalOf(place);
  const bh = BLOCK_H[medal];
  const [face, lip, ink] = MEDAL[medal];
  const avatar = place === 1 ? 88 : 64;
  const x = COL_X[slot];
  const at = RISE_AT[slot];
  const [playing] = useState(intro && motionOn);

  // Visible block height; the person's lift above the floor; their "sit down"; the number; the crown.
  const h = useSharedValue(playing ? 0 : bh);
  const lift = useSharedValue(bh);
  const show = useSharedValue(playing ? 0 : 1);
  const num = useSharedValue(playing ? 0 : 1);
  const fade = useSharedValue(intro && !motionOn ? 0 : 1);
  const [first, setFirst] = useState(true);

  useEffect(() => {
    if (first) {
      setFirst(false);
      if (playing) {
        h.set(withDelay(at, withSpring(bh, RISE)));
        num.set(withDelay(at + 260, withTiming(1, { duration: 160 })));
        show.set(withDelay(at + 140, withSpring(1, motion.spring.pop)));
      } else if (intro) {
        fade.set(withTiming(1, { duration: motion.still }));
      }
      return;
    }
    // A tab switch: the block and the person go to the new height.
    h.set(motionOn ? withSpring(bh, motion.spring.thumb) : withTiming(bh, { duration: motion.still }));
    lift.set(motionOn ? withSpring(bh, motion.spring.thumb) : withTiming(bh, { duration: motion.still }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bh]);

  const blockStyle = useAnimatedStyle(() => ({ transform: [{ translateY: CLIP - h.get() }] }));
  const numStyle = useAnimatedStyle(() => ({ opacity: num.get() }));
  const personStyle = useAnimatedStyle(() => {
    const p = show.get();
    return { opacity: Math.min(1, Math.max(0, p)), transform: [{ translateY: -lift.get() - LIP + 16 * (1 - p) }, { scale: 0.8 + 0.2 * p }] };
  });
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.get() }));

  const colH = avatar + 6 + 18 + 4 + 24;
  const tie = row.tiedWith.length ? `, ${t('leadersTieA11y', { names: row.tiedWith.join(', ') })}` : '';
  const value = valueText(t, board, row.value);
  const label = `${t('leadersPlaceA11y', { n: place })}${tie}. ${row.player.name}. ${value}`;
  // After the entry a new person comes in 200 ms, the old one leaves in 120 (9.5).
  const swap = !first;

  return (
    <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]} pointerEvents="box-none" entering={intro ? undefined : FadeIn.duration(200)}>
      <View style={[styles.clip, { left: x, top: BASE - CLIP, height: CLIP + LIP }]}>
        <Animated.View style={[styles.block, { height: CLIP + LIP, backgroundColor: lip }, blockStyle]}>
          <View style={[styles.face, { height: CLIP, backgroundColor: face }]}>
            <View style={styles.shine} />
            <Animated.View style={numStyle}>
              <Txt style={[styles.number, { color: ink }]}>{placeLabel(row)}</Txt>
              {row.tiedWith.length > 0 && <Txt style={[styles.tie, { color: ink }]}>{t('leadersTie')}</Txt>}
            </Animated.View>
          </View>
        </Animated.View>
      </View>
      <Animated.View
        style={[styles.person, { left: x, top: BASE - colH }, personStyle]}
        accessible
        accessibilityLabel={label}
      >
        <Animated.View
          key={row.player.nick}
          entering={swap ? FadeIn.duration(200) : undefined}
          exiting={swap ? FadeOut.duration(120) : undefined}
          style={styles.personInner}
        >
          <PlayerAvatar player={row.player} size={avatar} />
          <Txt numberOfLines={1} style={[styles.name, row.player.me && { color: c.doneInk }]}>{row.player.name}</Txt>
          <ValuePill board={board} text={value} swap={swap} />
          {place === 1 && crown && <Crown play={playing} motionOn={motionOn} />}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

function ValuePill({ board, text, swap }: { board: Board; text: string; swap: boolean }) {
  const c = useColors();
  const { night } = useStore();
  return (
    <View style={[styles.pill, elevation(1, night), { backgroundColor: c.card }]}>
      <Glyph name={board === 'week' ? 'drop' : 'rings'} size={14} />
      <FadeSwap value={text} on={swap}>
        <Txt style={styles.pillText}>{text}</Txt>
      </FadeSwap>
    </View>
  );
}

/** The crown over a first place: drops from 30 above, −20° → −10°, then two sparkles. */
function Crown({ play, motionOn }: { play: boolean; motionOn: boolean }) {
  const drop = useSharedValue(play ? 0 : 1);
  const spark = useSharedValue(play ? 0 : 1);
  useEffect(() => {
    if (!play) return;
    drop.set(withDelay(CROWN_AT, withSpring(1, motion.spring.bounce)));
    spark.set(withDelay(CROWN_AT + 180, withTiming(1, { duration: 240, easing: motion.ease.out })));
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const crownStyle = useAnimatedStyle(() => {
    const p = drop.get();
    return { opacity: Math.min(1, Math.max(0, p * 2)), transform: [{ translateY: -30 * (1 - p) }, { rotate: `${-20 + 10 * p}deg` }] };
  });
  const sparkStyle = useAnimatedStyle(() => ({ opacity: spark.get(), transform: [{ scale: 0.6 + 0.4 * spark.get() }] }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.crown, crownStyle]}>
        <Glyph name="crown" size={32} />
      </Animated.View>
      {motionOn || !play ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.spark1, sparkStyle]}>
            <Glyph name="sparkle" size={12} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.spark2, sparkStyle]}>
            <Glyph name="sparkle" size={10} />
          </Animated.View>
        </>
      ) : null}
    </>
  );
}

/** A dashed free place: "+" to find a friend; while loading — just the outline, breathing outside. */
function FreePlace({ slot, place, loading, intro, motionOn, onPress }: {
  slot: number; place: 1 | 2 | 3; loading: boolean; intro: boolean; motionOn: boolean; onPress?: () => void;
}) {
  const c = useColors();
  const { t } = useStore();
  const bh = BLOCK_H[place];
  const x = COL_X[slot];
  const dash = withAlpha(c.textMuted, 0.6);
  const o = useSharedValue(intro ? 0 : 1);
  useEffect(() => {
    if (intro) o.set(withDelay(motionOn ? RISE_AT[slot] + 140 : 0, withTiming(1, { duration: motionOn ? motion.base : motion.still })));
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="box-none">
      <View style={[styles.free, { left: x, top: BASE - bh, height: bh, borderColor: dash }]}>
        <Txt style={[styles.number, { color: dash }]}>{place}</Txt>
      </View>
      {!loading && (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={t('leadersFreeA11y')}
          style={[styles.freeAvatar, { left: x + 18, top: BASE - bh - 80, borderColor: dash }]}
        >
          <Icon name="plus" size={22} color={dash} strokeWidth={2.6} />
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  floor: { position: 'absolute', left: 16, right: 16 },
  clip: { position: 'absolute', width: COL_W, overflow: 'hidden', borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  block: { position: 'absolute', left: 0, top: 0, width: COL_W, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  face: { borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, alignItems: 'center', paddingTop: 8, overflow: 'hidden' },
  shine: { position: 'absolute', left: 6, right: 6, top: 4, height: 8, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.4)' },
  number: { fontFamily: fonts.black, fontSize: 28, lineHeight: 34, textAlign: 'center' },
  tie: { fontFamily: fonts.black, fontSize: 11, lineHeight: 13, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.75 },
  person: { position: 'absolute', width: COL_W },
  // A fixed width: on the web a layout animation takes the view out of the flow while it plays.
  personInner: { width: COL_W, alignItems: 'center' },
  name: { fontFamily: fonts.black, fontSize: 15, lineHeight: 18, height: 18, maxWidth: COL_W, marginTop: 6, textAlign: 'center' },
  pill: { height: 24, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, marginTop: 4 },
  pillText: { fontFamily: fonts.black, fontSize: 13, lineHeight: 16 },
  crown: { position: 'absolute', left: 34, top: -22 },
  spark1: { position: 'absolute', left: 14, top: -18 },
  spark2: { position: 'absolute', left: 77, top: -7 },
  free: { position: 'absolute', width: COL_W, borderWidth: 2, borderStyle: 'dashed', borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, alignItems: 'center', paddingTop: 6 },
  freeAvatar: { position: 'absolute', width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
});
