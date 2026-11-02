// The forest's bottom sheet (wave 3 spec, section 6): the main screen's surface and
// gesture over the map — folded (three facts), the card of the tapped tree, the list of
// all trees, hidden while a tree is moved, or the invitation to plant. The screen says
// where it should be (`place`); a drag or a tap on the grabber asks the screen to go
// somewhere else (`onGesture`). Everything that moves is computed on the UI thread from
// one shared value, `visible`, which the map reads for its visible area.
import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { DayKey } from '@/game/dates';
import { Habit } from '@/game/tree';
import { useStore } from '@/state/store';
import { Grabber, motion, SheetSurface } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { dragVisible } from '@/ui/sheet/detents';
import type { SharedRow } from '@/ui/together/model';
import { EmptyPlot } from './EmptyPlot';
import {
  dragPath,
  expectedCard,
  ForestDetent,
  forestHeights,
  GRAB,
  listProgress,
  NARROW,
  pickForestDetent,
  SHEET_TOP,
  tapTarget,
} from './forestDetents';
import { SheetFacts } from './SheetFacts';
import { Anchor, CardAction, CardView, TreeCard } from './TreeCard';
import { Filter, TreeList } from './TreeList';

interface Props {
  /** Where the sheet should be. */
  place: ForestDetent;
  /** The place under the list: card, folded, empty, or hidden while moving. */
  base: ForestDetent;
  habits: Habit[];
  /** The tree whose card is shown; null — none. */
  selected: Habit | null;
  /** The tree just locked in (spec 5.4): its card's "View" is gold. */
  highlight: string | null;
  today: DayKey;
  screenW: number;
  screenH: number;
  topInset: number;
  bottomInset: number;
  animations: boolean;
  /** How much of the sheet shows above the bottom edge, px: written here, read by the map and the toast. */
  visible: SharedValue<number>;
  /** 0 at the base place, 1 in the list: the scrim. */
  progressList: SharedValue<number>;
  /** A drag or the grabber took the sheet to a place. */
  onGesture(place: ForestDetent): void;
  /** The sheet came to rest in a place. */
  onSettle?(place: ForestDetent): void;
  onClose(): void;
  onAction(action: CardAction): void;
  onMove(): void;
  onMore(at: Anchor): void;
  onPick(lineageId: string): void;
  /** A friend's forest (wave 5): the card's buttons are "View", "Cheer" and "⋯". */
  view?: CardView;
  /** My shared trees for the list and the folded sheet's pill (wave 5); a friend's forest has none. */
  shared?: SharedRow[];
  /** A shared tree in the list was tapped. */
  onShared?(id: string): void;
  /** The card's watering-time chip (my forest, OYUUR-34). */
  onHour?(): void;
}

const NO_SHARED: SharedRow[] = [];

export function ForestSheet(props: Props) {
  const {
    place, base, habits, selected, highlight, today, screenW, screenH, topInset, bottomInset, animations, visible, progressList,
    onGesture, onSettle, onClose, onAction, onMove, onMore, onPick, view, shared = NO_SHARED, onShared, onHour,
  } = props;
  const { t } = useStore();
  const narrow = screenW < NARROW;

  // ---- Sizes: the card is measured (its height depends on the state and the screen) ----
  const [cardH, setCardH] = useState(() => expectedCard(screenW, false));
  const onCardLayout = (e: LayoutChangeEvent) => {
    const v = Math.ceil(SHEET_TOP + GRAB + e.nativeEvent.layout.height);
    setCardH((old) => (Math.abs(v - old) >= 1 ? v : old));
  };
  const h = useMemo(() => forestHeights({ card: cardH, bottomInset, topInset, screenH }), [cardH, bottomInset, topInset, screenH]);

  // What the base layer shows: while hidden it keeps the last content, so it slides away with it.
  const shownBase = useRef<ForestDetent>(base === 'hidden' ? 'peek' : base);
  if (base !== 'hidden') shownBase.current = base;
  // The last card stays while the sheet goes down from it.
  const lastCard = useRef<Habit | null>(selected);
  if (selected) lastCard.current = selected;
  const card = selected ?? lastCard.current;

  // ---- Shared state for the worklets ----
  const heights = useSharedValue(h);
  const cur = useSharedValue<ForestDetent>(place);
  const baseV = useSharedValue<ForestDetent>(base);
  const moving = useSharedValue(animations);

  const settledRef = useRef<(to: ForestDetent) => void>(() => {});
  settledRef.current = (to) => onSettle?.(to);
  const settled = useCallback((to: ForestDetent) => settledRef.current(to), []);
  const gestureRef = useRef<(to: ForestDetent) => void>(() => {});
  gestureRef.current = onGesture;
  const gestured = useCallback((to: ForestDetent) => gestureRef.current(to), []);

  /** Spring (or, without animations, a 120 ms glide) to a place; going hidden it drops in 240 ms. */
  const go = useCallback(
    (target: ForestDetent, velocity: number, instant = false) => {
      'worklet';
      const to = heights.value[target];
      cur.value = target;
      const done = (finished?: boolean) => {
        'worklet';
        if (finished) scheduleOnRN(settled, target);
      };
      if (instant) {
        cancelAnimation(visible);
        visible.value = to;
        scheduleOnRN(settled, target);
      } else if (!moving.value) {
        visible.value = withTiming(to, { duration: motion.still, easing: motion.ease.out }, done);
      } else if (target === 'hidden') {
        visible.value = withTiming(to, { duration: motion.base, easing: motion.ease.in }, done);
      } else {
        visible.value = withSpring(to, { ...motion.spring.sheet, velocity, energyThreshold: 1e-4 }, done);
      }
    },
    [heights, cur, visible, moving, settled],
  );

  // The screen moved the sheet, or the sizes changed: go there.
  useLayoutEffect(() => {
    heights.value = h;
    baseV.value = base;
    moving.value = animations;
    if (cur.value !== place || Math.abs(visible.value - h[place]) > 0.5) {
      // The very first layout jumps: the screen slides in with the sheet already in place.
      go(place, 0, visible.value === 0 && place !== 'hidden');
    }
    // Shared values are stable; go is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, place, base, animations]);

  useAnimatedReaction(
    () => {
      const b = baseV.value;
      const hh = heights.value;
      return b === 'hidden' || b === 'empty' ? 0 : listProgress(visible.value, hh[b], hh.list);
    },
    (p) => progressList.set(p),
  );

  // ---- Gesture: the finger pulls the sheet 1:1, the release picks a place on the path ----
  const startV = useSharedValue(0);
  const startD = useSharedValue<ForestDetent>(place);
  // A touch that pulled the sheet is not also a tap on what it started on (in a browser
  // the pressable under the finger still gets its click). Cleared on the next touch.
  const dragged = useSharedValue(false);
  const guard = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
    if (!dragged.value) fn(...args);
  };
  const pan = {
    activeOffsetY: [-8, 8] as [number, number],
    failOffsetX: [-16, 16] as [number, number],
    enabled: place === 'peek' || place === 'card' || place === 'list',
    onBegin: () => {
      'worklet';
      dragged.value = false;
    },
    onActivate: () => {
      'worklet';
      dragged.value = true;
      cancelAnimation(visible);
      startD.value = cur.value;
      startV.value = visible.value;
    },
    onUpdate: (e: { translationY: number }) => {
      'worklet';
      const path = dragPath(startD.value, baseV.value);
      const hh = heights.value;
      visible.value = dragVisible(startV.value - e.translationY, hh[path[0]], hh[path[path.length - 1]]);
    },
    onDeactivate: (e: { velocityY: number }) => {
      'worklet';
      const path = dragPath(startD.value, baseV.value);
      const vy = -e.velocityY;
      const target = pickForestDetent(visible.value, vy, startD.value, path, heights.value);
      go(target, vy);
      if (target !== startD.value) scheduleOnRN(gestured, target);
    },
  };
  // One gesture per detector: the sheet itself and the list's header.
  const panSheet = usePanGesture(pan);
  const panList = usePanGesture(pan);

  const onGrabber = () => {
    if (dragged.value) return;
    const target = tapTarget(cur.value, base);
    if (target === cur.value) return;
    go(target, 0);
    onGesture(target);
  };
  // The folded sheet's "together" pill: the list, on the shared trees.
  const [ask, setAsk] = useState<{ filter: Filter; n: number } | null>(null);
  const openTogether = () => {
    setAsk((a) => ({ filter: 'together', n: (a?.n ?? 0) + 1 }));
    cue('select');
    go('list', 0);
    onGesture('list');
  };

  // ---- Looks ----
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: screenH - visible.value }] }));
  const baseStyle = useAnimatedStyle(() => ({ opacity: 1 - progressList.value }));
  const listStyle = useAnimatedStyle(() => ({ opacity: progressList.value }));
  const listOpen = place === 'list';
  const listBody = h.list - SHEET_TOP - GRAB;

  const wrapHeader = useCallback(
    (node: ReactNode) => (
      <GestureDetector gesture={panList}>
        <View collapsable={false}>{node}</View>
      </GestureDetector>
    ),
    [panList],
  );

  let content: ReactNode = null;
  const what = shownBase.current;
  if (what === 'empty') content = <EmptyPlot />;
  else if (what === 'card' && card) {
    content = (
      <TreeCard
        habit={card}
        narrow={narrow}
        golden={card.lineageId === highlight}
        onClose={guard(onClose)}
        onAction={guard(onAction)}
        onMove={guard(onMove)}
        onMore={guard(onMore)}
        onLayout={onCardLayout}
        view={view}
        onHour={onHour ? guard(onHour) : undefined}
      />
    );
  } else content = <SheetFacts habits={habits} compact={narrow} together={shared.length} onTogether={guard(openTogether)} />;

  return (
    <Animated.View style={[styles.wrap, styles.noSelect, { height: screenH }, sheetStyle]} pointerEvents={place === 'hidden' ? 'none' : 'box-none'}>
      <SheetSurface style={styles.surface}>
        <GestureDetector gesture={panSheet}>
          <View style={styles.fill} collapsable={false}>
            <Pressable
              onPress={onGrabber}
              hitSlop={{ top: 12, bottom: 12 }}
              accessibilityRole="button"
              accessibilityLabel={listOpen ? t('close') : t('allTrees')}
              accessibilityState={{ expanded: listOpen }}
              style={styles.grabber}
            >
              <Grabber progress={progressList} />
            </Pressable>
            <Animated.View
              style={baseStyle}
              pointerEvents={listOpen ? 'none' : 'auto'}
              accessibilityElementsHidden={listOpen}
              importantForAccessibility={listOpen ? 'no-hide-descendants' : 'auto'}
            >
              {content}
            </Animated.View>
          </View>
        </GestureDetector>

        {habits.length + shared.length > 0 && (
          <Animated.View
            style={[styles.list, { height: listBody }, listStyle]}
            pointerEvents={listOpen ? 'auto' : 'none'}
            accessibilityElementsHidden={!listOpen}
            importantForAccessibility={listOpen ? 'auto' : 'no-hide-descendants'}
          >
            <TreeList
              habits={habits}
              shared={shared}
              ask={ask}
              today={today}
              open={listOpen}
              bottomPad={bottomInset}
              wrapHeader={wrapHeader}
              canPress={() => !dragged.value}
              onPick={onPick}
              onShared={onShared}
            />
          </Animated.View>
        )}
      </SheetSurface>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0 },
  // No cartoon outline here: over the darkened map it reads as a hard dark rim (review, frame 45).
  surface: { flex: 1, paddingTop: SHEET_TOP, borderWidth: 0 },
  fill: { flex: 1 },
  grabber: { height: GRAB, alignItems: 'center', justifyContent: 'center' },
  list: { position: 'absolute', left: 0, right: 0, top: SHEET_TOP + GRAB },
  // In a browser a drag must not select the texts it passes over.
  noSelect: (Platform.OS === 'web' ? { userSelect: 'none' } : {}) as ViewStyle,
});
