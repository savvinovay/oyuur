// Today's quests (wave 5 spec, section 5): a sheet over the main screen, not a screen of
// its own — the scene and the acorn wallet stay in sight above the shade, and the acorns
// of "Claim" fly right into the wallet. Three rows, the basket for all of them, the time
// to new quests. A quest not done yet is a way there: a tap closes the sheet and goes
// where it is done. Closed by a swipe down, a tap on the shade or "back".
import { ComponentRef, Ref, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { ALL_QUESTS_BONUS, QUEST_REWARD, QuestId } from '@/game/quests';
import { acornsText } from '@/i18n';
import type { OpenHour } from '@/game/tree';
import { useFriends } from '@/state/friends';
import { clockNow, useStore } from '@/state/store';
import { acornFlights, measureCenter } from '@/ui/acorns';
import { Button, elevation, fonts, Glyph, GlyphName, Grabber, Icon, MAX_FONT_SCALE, mixColor, motion, SheetSurface, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { treeMood } from '@/ui/live/mood';
import { canWaterShared, homeShared } from '@/ui/together/model';
import { hourText } from '@/ui/watering/format';
import { basketOf, QuestRow, questRows, RowState, untilNewDay, waitFrom } from './model';

/** The glyph of each quest (spec 5.8). Cheering has a heart until the friends' palm glyph comes. */
const GLYPHS: Record<QuestId, GlyphName> = {
  waterAll: 'drop',
  visitForest: 'forest',
  nameTree: 'nameTag',
  moveTree: 'plot',
  visitFriend: 'friends',
  cheerFriend: 'heart',
  plantHabit: 'newHabit',
  waterShared: 'drop',
};

/** A claimed row turns to "done" this long after the press, when its acorns are already flying (spec 5.6). */
const SETTLE = 300;
/** The basket's acorns leave a little after the row's. */
const BASKET_DELAY = 300;
/** Taps on the shade this soon after opening are the rest of the tap that opened it. */
const SHADE_DEAF = 400;
const CLOSE_DRAG = 60;
const CLOSE_SPEED = 800;

export interface QuestSheetProps {
  open: boolean;
  onClose: () => void;
  /** A quest not done yet was tapped: the sheet is on its way down, go where it is done. */
  onGo: (id: QuestId) => void;
}

/** Stays on screen while it leaves: the parent sets `open` to false at once. */
export function QuestSheet({ open, onClose, onGo }: QuestSheetProps) {
  const [session, setSession] = useState<{ key: number; leaving: boolean } | null>(null);
  useEffect(() => {
    if (open) setSession((s) => (s && !s.leaving ? s : { key: Date.now(), leaving: false }));
    else setSession((s) => (s && !s.leaving ? { ...s, leaving: true } : s));
  }, [open]);
  const gone = useCallback((key: number) => setSession((s) => (s && s.key === key ? null : s)), []);
  if (!session) return null;
  return <Sheet key={session.key} leaving={session.leaving} onClose={onClose} onGo={onGo} onGone={() => gone(session.key)} />;
}

function Sheet({ leaving, onClose, onGo, onGone }: { leaving: boolean; onClose: () => void; onGo: (id: QuestId) => void; onGone: () => void }) {
  const { t, quests, today, trees, claimQuest, settings, clock, sharedHalf } = useStore();
  const friends = useFriends();
  const c = useColors();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  // ---- Coming and going ----
  const slide = useSharedValue(1);
  const shade = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(500);
  const left = useRef(false);
  const openedAt = useRef(Date.now());
  useEffect(() => {
    if (motionOn) {
      shade.set(withTiming(1, { duration: motion.base, easing: motion.ease.out }));
      slide.set(withSpring(0, motion.spring.sheet));
    } else {
      shade.set(withTiming(1, { duration: motion.fast }));
      slide.set(0);
    }
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const goAway = () => {
    if (left.current) return;
    left.current = true;
    const time = motionOn ? 200 : motion.fast;
    shade.set(withTiming(0, { duration: time, easing: motionOn ? Easing.in(Easing.cubic) : Easing.linear }));
    if (motionOn) {
      slide.set(withTiming(1, { duration: time, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) scheduleOnRN(onGone);
      }));
    } else {
      setTimeout(onGone, time);
    }
  };
  useEffect(() => {
    if (leaving) goAway();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);
  const dismiss = () => {
    if (left.current) return;
    cue('select');
    goAway();
    onClose();
  };
  const onShade = () => {
    if (Date.now() - openedAt.current < SHADE_DEAF) return;
    dismiss();
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  // Android "back" closes the sheet; Esc does the same in a browser.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (left.current) return false;
      dismissRef.current();
      return true;
    });
    if (Platform.OS !== 'web') return () => sub.remove();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || left.current) return;
      e.preventDefault();
      dismissRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      sub.remove();
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slide.get() * (height.get() + 24) + drag.get() }] }));
  const shadeStyle = useAnimatedStyle(() => ({ opacity: shade.get() }));
  const onSheetLayout = (e: LayoutChangeEvent) => height.set(e.nativeEvent.layout.height);
  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      'worklet';
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (drag.get() > CLOSE_DRAG || e.velocityY > CLOSE_SPEED) scheduleOnRN(dismissRef.current);
      else drag.set(withSpring(0, motion.spring.sheet));
    },
  });

  // ---- The time to new quests (the new game day at 3:00), once a minute while open (spec 5.9) ----
  const { minuteOffset } = settings;
  const [now, setNow] = useState(() => clockNow(minuteOffset));
  useEffect(() => {
    setNow(clockNow(minuteOffset));
    const id = setInterval(() => setNow(clockNow(minuteOffset)), 60_000);
    return () => clearInterval(id);
  }, [minuteOffset]);
  const until = untilNewDay(now);
  // "from 18:00" under the watering quests while everything left to water waits for its hour (OYUUR-33 9).
  const me = friends.account?.nick ?? null;
  const waits: Partial<Record<QuestId, OpenHour | null>> = {
    waterAll: waitFrom(trees.filter((x) => treeMood(x, today) === 'thirsty'), today, clock),
    waterShared: waitFrom(
      homeShared(friends.shared).filter((x) => canWaterShared(x, me, today)).map(sharedHalf),
      today,
      clock,
    ),
  };
  const time = until.h > 0 ? t('questsTimeHM', until) : until.m > 0 ? t('questsTimeM', { m: until.m }) : t('questsTimeSoon');

  // ---- Rows ----
  // A row just claimed keeps its button a moment, while its acorns leave (spec 5.6).
  const [settling, setSettling] = useState<QuestId[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const rows = questRows(quests, today, trees).map((r) => (r.state === 'claimed' && settling.includes(r.id) ? { ...r, state: 'done' as RowState } : r));
  const basket = basketOf(quests, today);
  const basketShown = basket.state === 'claimed' && rows.some((r) => settling.includes(r.id)) ? 'ready' : basket.state;
  const allClaimed = rows.length > 0 && rows.every((r) => r.state === 'claimed') && basketShown === 'claimed';
  // What each row was when the sheet opened: only a change while it is open pops.
  const atOpen = useRef<Partial<Record<QuestId, RowState>> | null>(null);
  if (atOpen.current === null) atOpen.current = Object.fromEntries(rows.map((r) => [r.id, r.state]));
  const basketAtOpen = useRef(basketShown);

  const basketRef = useRef<ComponentRef<typeof View>>(null);
  const claim = (id: QuestId, button: ComponentRef<typeof View> | null) => {
    const last = quests.ids.every((x) => x === id || quests.claimed.includes(x)) && !quests.bonus;
    const from = () => measureCenter({ current: button });
    // The last claim also pays the basket: its acorns leave from the basket.
    acornFlights.prepare(
      'quest',
      last ? [{ from, amount: QUEST_REWARD }, { from: () => measureCenter(basketRef), delay: BASKET_DELAY }] : { from },
    );
    if (claimQuest(id) === 0) return;
    setSettling((s) => [...s, id]);
    timers.current.push(setTimeout(() => setSettling((s) => s.filter((x) => x !== id)), SETTLE));
  };
  const go = (id: QuestId) => {
    if (left.current) return;
    cue('tap');
    goAway();
    onClose();
    onGo(id);
  };

  const maxH = screenH - (insets.top + 56);
  const some = rows.length < 3;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={leaving ? 'none' : 'box-none'} accessibilityViewIsModal aria-modal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrimDialog }, shadeStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onShade} accessibilityRole="button" accessibilityLabel={t('close')} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { maxHeight: maxH }, sheetStyle]} onLayout={onSheetLayout}>
        <SheetSurface style={[styles.surface, { maxHeight: maxH }]}>
          <GestureDetector gesture={pan}>
            <View style={styles.grab}>
              <Grabber />
            </View>
          </GestureDetector>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 + insets.bottom }}>
            <Animated.View key={quests.day ?? 'none'} entering={motionOn ? FadeIn.duration(240) : undefined}>
              {allClaimed ? (
                <View style={styles.doneHead}>
                  <View style={styles.doneArt}>
                    <Glyph name="sparkle" size={12} style={styles.sparkLeft} />
                    <Glyph name="basket" size={64} />
                    <Glyph name="sparkle" size={16} style={styles.sparkRight} />
                  </View>
                  <Txt variant="title2" accessibilityRole="header" style={styles.center}>{t('questsAllDone')}</Txt>
                  <View style={[styles.timer, styles.centerRow]}>
                    <Icon name="clock" size={16} color={c.textSoft} />
                    <Txt variant="small" color={c.textSoft}>{t('questsAllIn', { t: time })}</Txt>
                  </View>
                </View>
              ) : (
                <View style={styles.head}>
                  <Txt variant="title2" accessibilityRole="header">{t('questsTitle')}</Txt>
                  <View style={styles.timer}>
                    <Icon name="clock" size={16} color={c.textSoft} />
                    <Txt variant="small" color={c.textSoft}>{t('questsIn', { t: time })}</Txt>
                  </View>
                </View>
              )}
              <View style={styles.rows}>
                {rows.map((r) => (
                  <Row
                    key={r.id}
                    row={r}
                    fresh={atOpen.current?.[r.id] === 'open' && r.state === 'done'}
                    waitsFrom={r.state === 'open' ? waits[r.id] ?? null : null}
                    onClaim={(button) => claim(r.id, button)}
                    onGo={() => go(r.id)}
                  />
                ))}
                {rows.length > 0 && (
                  <Basket
                    ref={basketRef}
                    state={basketShown}
                    dots={basket.dots}
                    some={some}
                    fresh={basketAtOpen.current === 'waiting' && basketShown === 'ready'}
                  />
                )}
              </View>
              <Txt variant="caption" color={c.textSoft} style={[styles.center, styles.note]}>{t('questsNote')}</Txt>
            </Animated.View>
          </ScrollView>
        </SheetSurface>
      </Animated.View>
    </View>
  );
}

/** One quest (spec 5.4): its glyph, its name (and bar), and on the right what can be done. */
function Row({ row, fresh, waitsFrom = null, onClaim, onGo }: {
  row: QuestRow;
  fresh: boolean;
  /** Every tree left waits for its watering hour: "from 18:00" under the name. */
  waitsFrom?: OpenHour | null;
  onClaim: (button: ComponentRef<typeof View> | null) => void;
  onGo: () => void;
}) {
  const { t, night } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const button = useRef<ComponentRef<typeof View>>(null);
  const name = t.dict.questNames[row.id];
  const claimed = row.state === 'claimed';
  const done = row.state === 'done';

  // Done while the sheet is open: the ring shows, the button pops (spec 5.4).
  const ring = useSharedValue(done ? 1 : 0);
  const pop = useSharedValue(1);
  useEffect(() => {
    ring.set(withTiming(done ? 1 : 0, { duration: 200 }));
  }, [done, ring]);
  useEffect(() => {
    if (!fresh) return;
    cue('select');
    if (motionOn) {
      pop.set(0.6);
      pop.set(withSpring(1, motion.spring.pop));
    }
  }, [fresh, motionOn, pop]);
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.get() }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  const progress = row.progress;
  const a11y = t('questA11y', {
    name,
    progress: progress ? t('questProgressA11y', progress) : '',
    reward: acornsText(t, QUEST_REWARD),
  });
  const face = claimed ? mixColor(c.card, c.sheet, 0.4) : c.card;

  const middle = (
    <View style={styles.middle}>
      <Txt numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} color={claimed ? c.textSoft : c.text} style={styles.name}>{name}</Txt>
      {progress && (
        <View style={styles.barRow}>
          <View style={[styles.track, { backgroundColor: c.sunken }]}>
            <View style={[styles.fill, { backgroundColor: c.accent, width: `${(100 * progress.n) / progress.total}%` }]} />
          </View>
          <Txt variant="caption" color={c.textSoft} style={styles.count}>{`${progress.n} / ${progress.total}`}</Txt>
        </View>
      )}
      {waitsFrom !== null && (
        <View style={styles.waits}>
          <Icon name="clock" size={13} color={c.textSoft} strokeWidth={2.4} />
          <Txt variant="caption" color={c.textSoft} style={styles.count} numberOfLines={1}>{t('wbQuestFrom', { time: hourText(waitsFrom, t.lang) })}</Txt>
        </View>
      )}
    </View>
  );
  const left = claimed ? (
    <View style={styles.circleBox}>
      <Glyph name="check" size={30} />
    </View>
  ) : (
    <View style={[styles.circle, { backgroundColor: c.tintQuests }]}>
      <Glyph name={GLYPHS[row.id]} size={28} />
    </View>
  );

  const card = [styles.card, { backgroundColor: face }, !claimed && elevation(1, night)];
  if (row.state === 'open') {
    return (
      <Pressable onPress={onGo} accessibilityRole="button" accessibilityLabel={a11y} style={card}>
        {left}
        {middle}
        <RewardPill amount={QUEST_REWARD} />
        <View style={styles.chevron}>
          <Icon name="chevronRight" size={16} color={c.textSoft} />
        </View>
      </Pressable>
    );
  }
  return (
    <View style={card} accessible={claimed} accessibilityLabel={claimed ? `${name}, ${t('questsReady')}` : undefined}>
      <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: c.accent }, ringStyle]} />
      {left}
      <View style={styles.middleWrap} accessible={done} accessibilityLabel={done ? a11y : undefined}>{middle}</View>
      {done ? (
        <Animated.View ref={button} style={popStyle} collapsable={false}>
          <Button title={t('questsClaim')} size="s" glyph="acorn" cue="claim" onPress={() => onClaim(button.current)} />
        </Animated.View>
      ) : (
        <Animated.View entering={motionOn ? FadeIn.duration(200) : undefined}>
          <Txt variant="caption" color={c.textSoft} style={styles.ready}>{t('questsReady')}</Txt>
        </Animated.View>
      )}
    </View>
  );
}

/** "+10" with the acorn on a sunken pill (or gold, for the basket that is ready). */
function RewardPill({ amount, gold = false }: { amount: number; gold?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.reward, { backgroundColor: gold ? c.gold : c.sunken }]}>
      <Glyph name="acorn" size={18} />
      <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} color={gold ? c.goldInk : c.textSoft} style={styles.rewardText}>+{amount}</Txt>
    </View>
  );
}

/** The basket for all of today's quests (spec 5.5): a dot per quest, "+15", then "Done". */
function Basket({ ref, state, dots, some, fresh }: {
  ref: Ref<ComponentRef<typeof View>>;
  state: 'waiting' | 'ready' | 'claimed';
  dots: boolean[];
  some: boolean;
  fresh: boolean;
}) {
  const { t } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const jump = useSharedValue(1);
  useEffect(() => {
    if (!fresh) return;
    cue('select');
    if (motionOn) jump.set(withSequence(withTiming(1.12, { duration: 90, easing: motion.ease.out }), withSpring(1, motion.spring.bounce)));
  }, [fresh, motionOn, jump]);
  const jumpStyle = useAnimatedStyle(() => ({ transform: [{ scale: jump.get() }] }));
  const title = some ? t('questsBonusSome') : t('questsBonusAll');
  const ready = state === 'ready';
  return (
    <View
      style={[styles.basket, { backgroundColor: c.goldSoft, borderColor: c.goldEdge }]}
      accessible
      accessibilityLabel={`${title}, ${state === 'claimed' ? t('questsReady') : acornsText(t, ALL_QUESTS_BONUS)}`}
    >
      <Animated.View ref={ref} style={[styles.basketArt, jumpStyle]} collapsable={false}>
        <Glyph name="basket" size={ready ? 52 : 46} />
      </Animated.View>
      <View style={styles.middle}>
        <Txt numberOfLines={3} maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.name}>{title}</Txt>
        <View style={styles.dots}>
          {dots.map((on, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: on ? c.accent : c.sunken }]} />
          ))}
        </View>
      </View>
      {state === 'claimed' ? (
        <Txt variant="caption" color={c.textSoft} style={styles.ready}>{t('questsReady')}</Txt>
      ) : (
        <RewardPill amount={ALL_QUESTS_BONUS} gold={ready} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  surface: { paddingTop: 8, overflow: 'hidden' },
  grab: { height: 20, alignItems: 'center', justifyContent: 'center' },
  head: { paddingHorizontal: 16, paddingTop: 4 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 20, marginTop: 2, marginBottom: 14 },
  centerRow: { justifyContent: 'center' },
  doneHead: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 4 },
  doneArt: { width: 120, height: 66, alignItems: 'center', justifyContent: 'center' },
  sparkLeft: { position: 'absolute', left: 14, top: 30 },
  sparkRight: { position: 'absolute', right: 10, top: 6 },
  center: { textAlign: 'center' },
  rows: { paddingHorizontal: 16, gap: 10 },
  card: { minHeight: 76, borderRadius: 20, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  ring: { position: 'absolute', left: -2, right: -2, top: -2, bottom: -2, borderRadius: 22, borderWidth: 2 },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  circleBox: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  middleWrap: { flex: 1, minWidth: 0 },
  middle: { flex: 1, minWidth: 0, gap: 6 },
  name: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 19 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waits: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: -2 },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  count: { fontFamily: fonts.bold },
  reward: { height: 28, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 6, paddingRight: 10 },
  rewardText: { fontFamily: fonts.black, fontSize: 14, lineHeight: 18, fontVariant: ['tabular-nums'] },
  chevron: { opacity: 0.6, marginLeft: -6 },
  ready: { fontFamily: fonts.bold, paddingHorizontal: 4 },
  basket: { minHeight: 84, marginTop: 4, borderRadius: 20, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  basketArt: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  note: { marginTop: 14, paddingHorizontal: 16 },
});
