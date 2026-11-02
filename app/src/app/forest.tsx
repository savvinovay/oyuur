// My forest (wave 3 spec): the plot on a map over the whole screen, the floating header
// on top, the sheet below — folded with three facts, the card of a tapped tree, or the
// list of all trees. The screen holds what is chosen and whether a tree is being moved;
// the map (ui/forest/ForestMap) draws, flies and drags, the store keeps the places.
// `?highlight=<lineageId>` comes after a lock-in: the map rings that tree in gold and
// the sheet then shows its card, the only one with a gold "View".
// "⋯ → Rename / Give a name" opens the name sheet over everything (wave 4, section 6).
// OYUUR-34 (design/oyuur-33/спец.md 4.2, 5.3): a tree waiting for its watering hour has no drop
// on the map; its card's chip and "⋯ → Watering time" open the watering-time sheet ("Done: from
// tomorrow…" after it); "Water" before the hour tells how long to wait, with "Change time".
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, BackHandler, LayoutChangeEvent, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { titleOf } from '@/game/naming';
import { canWaterAt, checkedInToday, Habit, isGrowing, minutesUntilOpen, nextOpenHour, OpenHour, openHourOn, Tree, wateringOpensAt } from '@/game/tree';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { confirmDialog, motion, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import type { ForestMapHandle, MoveResult } from '@/ui/forest/contract';
import { ForestMap } from '@/ui/forest/ForestMap';
import { ForestSheet } from '@/ui/forest/sheet/ForestSheet';
import { baseDetent, ForestDetent } from '@/ui/forest/sheet/forestDetents';
import { KindSheet } from '@/ui/forest/sheet/KindSheet';
import { HEADER_H, MapHeader } from '@/ui/forest/sheet/MapHeader';
import { ThumbBox } from '@/ui/forest/sheet/ThumbBox';
import { Anchor, CardAction } from '@/ui/forest/sheet/TreeCard';
import { TreeMenu } from '@/ui/forest/sheet/TreeMenu';
import { ToastData, UndoToast } from '@/ui/forest/sheet/UndoToast';
import { NameSheet } from '@/ui/naming/NameSheet';
import { FriendForest } from '@/ui/together/FriendForest';
import { forestShared, sharedRow } from '@/ui/together/model';
import { fromText, untilText } from '@/ui/watering/format';
import { WateringTimeSheet } from '@/ui/watering/TimeSheet';

/** After the drop the sheet and the header come back (spec 4.5), and the toast shows. */
const BACK_AFTER = 200;
const TOAST_AFTER = 420;
/** `?highlight` is cleared this long after entry (spec 5.4, step 4). */
const HIGHLIGHT_CLEAR = 600;
/** The "plot grew" toast, from the opening (spec 5.3). */
const GREW_TOAST = 1000;
const NO_WAITING: string[] = [];
/**
 * In a browser a "hidden" box still scrolls when a field in it takes focus (the name sheet's):
 * the whole screen slid up and aside and stayed so. "clip" cuts the same way and never scrolls.
 */
const NO_SCROLL_WEB = Platform.OS === 'web' ? ({ overflow: 'clip' } as unknown as ViewStyle) : null;

interface Moving {
  lineageId: string;
  /** 'drag' — lifted by a long press; 'choose' — "Move" in the card, then a tap on a cell. */
  mode: 'drag' | 'choose';
  /** The card was open: it comes back for the moved tree. */
  hadCard: boolean;
}

/** `?friend=<nick>`: that friend's forest, view only (wave 5, спец-друзья 7). */
export default function ForestRoute() {
  const { friend, tree } = useLocalSearchParams<{ friend?: string; tree?: string }>();
  return friend ? <FriendForest nick={friend} tree={tree ?? null} /> : <Forest />;
}

function Forest() {
  const store = useStore();
  const { habits, trees, plot, today, night, settings, t, moveTree, forestShown, plantSeed, deleteHabit, nameTree, clock, setTreeHour, canWaterNow } = store;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const animations = settings.animations && !reduced;
  const params = useLocalSearchParams<{ highlight?: string }>();
  const mapRef = useRef<ForestMapHandle>(null);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const sheetVisible = useSharedValue(0);
  const progressList = useSharedValue(0);

  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((old) => (old && old.w === width && old.h === height ? old : { w: width, h: height }));
  };

  // ---- The opening show: read once on entry, before forestShown() clears them (spec 5.2–5.4) ----
  const [grewFrom] = useState(() => (plot.shownSize < plot.size ? plot.shownSize : null));
  const [highlight, setHighlight] = useState<string | null>(params.highlight ?? null);
  useEffect(() => {
    if (!params.highlight) return;
    setHighlight(params.highlight);
    // Cleared a moment later (spec 5.4, step 4): right on entry the router may not take it yet.
    const id = setTimeout(() => router.setParams({ highlight: undefined }), HIGHLIGHT_CLEAR);
    return () => clearTimeout(id);
  }, [params.highlight]);
  const fresh = habits.filter((h) => !plot.seen.includes(h.lineageId)).map((h) => h.lineageId);

  // ---- What is chosen, open and moving ----
  const [selected, setSelected] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  /** The tree in the name sheet (wave 4, section 6); null — closed. */
  const [naming, setNaming] = useState<Tree | null>(null);
  /** The tree in the "Kind of tree" sheet (wave 5, 8.1); null — closed. */
  const [kindOf, setKindOf] = useState<Tree | null>(null);
  const [atFit, setAtFit] = useState(false);
  const selectedHabit = habits.find((h) => h.lineageId === selected) ?? null;
  /** The tree in the watering-time sheet (OYUUR-34); null — closed. */
  const [hourOf, setHourOf] = useState<Tree | null>(null);
  const [hourOpen, setHourOpen] = useState(false);

  // Trees whose watering hour hasn't come: no drop over them on the map (спец 5.3). Kept as one
  // string, so the map's list changes only when a tree's hour comes, not every clock tick.
  const waitingKey = habits
    .filter((h) => isGrowing(h.current) && !checkedInToday(h.current, today) && !canWaterAt(h.current, today, clock))
    .map((h) => h.lineageId)
    .join(',');
  const waiting = useMemo(() => (waitingKey ? waitingKey.split(',') : NO_WAITING), [waitingKey]);

  // ---- Shared trees (wave 5, спец-друзья 8.4, 8.7): not on the plot, but in the list — the
  // growing ones and the memories of stopped ones; the folded sheet counts them ----
  const friends = useFriends();
  const me = friends.account?.nick ?? null;
  const shared = useMemo(() => (me ? forestShared(friends.shared).map((s) => sharedRow(s, me, today)) : []), [me, friends.shared, today]);
  const openShared = useCallback((id: string) => router.push({ pathname: '/together', params: { id } }), []);

  // No trees of my own and no shared ones: the invitation to plant. With only shared ones the
  // sheet folds as usual (its facts count them), the plot itself is still empty.
  const empty = habits.length === 0 && shared.length === 0;
  const base = baseDetent({ empty, moving: moving !== null, selected: selectedHabit !== null });
  const place: ForestDetent = moving ? 'hidden' : listOpen && !empty ? 'list' : base;

  const movingRef = useRef(moving);
  movingRef.current = moving;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  /** The last move, for "Undo". */
  const lastMove = useRef<MoveResult | null>(null);
  /**
   * A tree picked in the list: the camera flies to it once the card has settled (so it knows how
   * tall the card is). A tree tapped on the map, or rung in gold after a lock-in, the map brings
   * into view itself: one flight, not two cutting each other short.
   */
  const flyAfter = useRef<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // A deleted tree takes its card with it.
  useEffect(() => {
    if (selected && !selectedHabit) setSelected(null);
  }, [selected, selectedHabit]);

  // The screen is left: every tree is seen, the plot size is shown (spec 5.2).
  useFocusEffect(useCallback(() => () => forestShown(), [forestShown]));

  // With a screen reader the list is the way to find a tree: open it at once (spec 9).
  // A browser can't tell (react-native-web always answers yes), so not there.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (on && habits.length > 0) setListOpen(true);
      })
      .catch(() => {});
    // Once, on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The plot grew since the last visit: the map plays it, the toast tells it.
  useEffect(() => {
    if (grewFrom === null) return;
    const id = setTimeout(() => setToast({ id: Date.now(), kind: 'grew', n: plot.size }), animations ? GREW_TOAST : 300);
    return () => clearTimeout(id);
    // Once, on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Choosing a tree ----
  const choose = useCallback((lineageId: string | null, fly = false) => {
    setMenu(null);
    if (lineageId === null) {
      setSelected(null);
      return;
    }
    if (lineageId !== selectedRef.current) cue('select');
    flyAfter.current = fly ? lineageId : null;
    setSelected(lineageId);
    setListOpen(false);
  }, []);
  const pick = useCallback((lineageId: string) => choose(lineageId, true), [choose]);
  const onSettle = (p: ForestDetent) => {
    const id = flyAfter.current;
    if (p !== 'card' || !id) return;
    flyAfter.current = null;
    if (id === selectedRef.current) mapRef.current?.flyTo(id);
  };
  // The map calls this 600 ms after the gold ring (spec 5.4, step 3): the card comes at once.
  const onIntroDone = useCallback(() => {
    if (highlight && !movingRef.current) choose(highlight);
  }, [highlight, choose]);

  const onGesture = (p: ForestDetent) => {
    if (p === 'list') {
      setListOpen(true);
      setMenu(null);
    } else {
      setListOpen(false);
      if (p === 'peek') setSelected(null);
    }
  };

  // ---- Moving (spec 4) ----
  const onMoveStart = useCallback((lineageId: string, kind: 'drag' | 'choose') => {
    setMenu(null);
    setListOpen(false);
    setMoving((m) => (m && m.lineageId === lineageId ? m : { lineageId, mode: kind, hadCard: selectedRef.current !== null }));
  }, []);
  const finishMove = useCallback(
    (move: MoveResult | null) => {
      const was = movingRef.current;
      if (!was) return;
      movingRef.current = null;
      const back = () => {
        setMoving(null);
        setSelected(was.hadCard ? was.lineageId : null);
      };
      if (animations) later(back, BACK_AFTER);
      else back();
      if (!move) return;
      const { swapped } = moveTree(move.lineageId, move.to);
      lastMove.current = { ...move, swapped };
      later(() => setToast({ id: Date.now(), kind: swapped ? 'swapped' : 'moved' }), animations ? TOAST_AFTER : motion.still);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [animations, moveTree],
  );
  const cancelMove = () => {
    cue('select');
    mapRef.current?.cancelMove();
    // The map answers with onMoveEnd(null) too; finishing twice does nothing.
    finishMove(null);
  };
  const undo = () => {
    const move = lastMove.current;
    if (!move) return;
    lastMove.current = null;
    // Back to where it was: a swap swaps back, so both trees stand as before.
    moveTree(move.lineageId, move.from);
    mapRef.current?.playUndo(move);
  };

  // ---- The card's buttons ----
  const sprout = useRef<{ lineageId: string; treeId: string } | null>(null);
  useEffect(() => {
    const s = sprout.current;
    if (!s) return;
    const h = habits.find((x) => x.lineageId === s.lineageId);
    if (h?.current.id !== s.treeId) return;
    sprout.current = null;
    mapRef.current?.playSprout(s.lineageId);
  }, [habits]);

  const onAction = (action: CardAction) => {
    const habit = selectedHabit;
    if (!habit) return;
    switch (action) {
      case 'water': {
        // Before its hour: not an error, a hint how long to wait (спец 5.2, 5.3).
        // (The card's button already played the soft "already".)
        if (!canWaterNow(habit.current)) {
          setToast({ id: Date.now(), kind: 'early', text: t('wtEarly', { time: untilText(minutesUntilOpen(habit.current, today, clock), t) }) });
          break;
        }
        // The main screen opens on this tree (index.tsx reads `tree`). The forest opened straight
        // from a link (a reload in the browser) has no main screen under it to go back to.
        const to = { pathname: '/', params: { tree: habit.current.id } } as const;
        if (router.canGoBack()) router.dismissTo(to);
        else router.replace(to);
        break;
      }
      case 'view':
        router.push({ pathname: '/habit', params: { lineage: habit.lineageId } });
        break;
      case 'plant': {
        const id = plantSeed(habit.current.id);
        if (id) sprout.current = { lineageId: habit.lineageId, treeId: id };
        break;
      }
    }
  };
  const startChoose = () => {
    const habit = selectedHabit;
    if (!habit) return;
    setMenu(null);
    setMoving({ lineageId: habit.lineageId, mode: 'choose', hadCard: true });
    movingRef.current = { lineageId: habit.lineageId, mode: 'choose', hadCard: true };
    mapRef.current?.startMove(habit.lineageId);
  };
  const onMore = (at: Anchor) => {
    // The menu is laid out in the screen; in a browser the screen is not at the window's corner.
    if (!rootRef.current) return;
    rootRef.current.measureInWindow((x, y) => setMenu({ ...at, x: at.x - x, y: at.y - y }));
  };
  const history = () => {
    setMenu(null);
    if (selectedHabit) router.push({ pathname: '/habit', params: { lineage: selectedHabit.lineageId } });
  };
  // ---- The tree's own name (wave 4, sections 4 and 6) ----
  const rename = () => {
    setMenu(null);
    if (!selectedHabit) return;
    cue('select');
    setNaming(selectedHabit.current);
  };
  // ---- Watering time (OYUUR-34) ----
  const openHours = () => {
    setMenu(null);
    if (!selectedHabit || !isGrowing(selectedHabit.current)) return;
    setToast((x) => (x?.kind === 'early' ? null : x));
    setHourOf(selectedHabit.current);
    setHourOpen(true);
  };
  const onHourPicked = (hour: OpenHour) => {
    const tree = hourOf;
    if (!tree) return;
    const now = openHourOn(tree, today);
    const was = nextOpenHour(tree, today) ?? now;
    if (hour === was) return;
    setTreeHour(tree.id, hour);
    setToast({ id: Date.now(), kind: 'hour', text: t(hour === now ? 'wtKept' : 'wtSaved', { when: fromText(hour, t) }) });
  };

  const chooseKind = () => {
    setMenu(null);
    if (!selectedHabit) return;
    cue('select');
    setKindOf(selectedHabit.current);
  };
  // A tree without a name is offered its previous generation's name as "… II" (section 7).
  const heirOf = naming && naming.nickname === null
    ? (habits.find((h) => h.lineageId === naming.lineageId)?.generations.find((g) => g.generation === naming.generation - 1)?.nickname ?? null)
    : null;
  const taken = naming ? trees.flatMap((x) => (x.id !== naming.id && x.nickname !== null ? [x.nickname] : [])) : [];
  const onNamed = (result: { nickname: string | null } | null) => {
    const tree = naming;
    setNaming(null);
    if (!tree || !result) return;
    nameTree(tree.id, result.nickname);
    // The card's name fades to the new one; no sparks here: the forest is a calm screen.
    if (result.nickname === null) {
      cue('select');
      return;
    }
    cue('named');
    AccessibilityInfo.announceForAccessibility(t('namedA11y', { name: result.nickname }));
  };

  const askDelete = async () => {
    setMenu(null);
    const habit = selectedHabit;
    if (!habit) return;
    const yes = await confirmDialog({
      title: t('deleteHabitTitle', { name: habit.current.name }),
      message: t('deleteHabitText'),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      tone: 'danger',
      picture: <DeletePicture habit={habit} />,
    });
    if (!yes) return;
    cue('delete');
    setSelected(null);
    deleteHabit(habit.lineageId);
  };

  // ---- Back: the header's button, and Android's in steps (spec 2.8) ----
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const onHardwareBack = useRef<() => boolean>(() => false);
  onHardwareBack.current = () => {
    // The name sheet closes on its own "back"; if it didn't take it, it closes here.
    if (naming) {
      setNaming(null);
      return true;
    }
    // The kind sheet closes on its own "back".
    if (kindOf) return true;
    // So does the watering-time sheet.
    if (hourOpen) return true;
    if (movingRef.current) {
      cancelMove();
      return true;
    }
    if (menu) {
      setMenu(null);
      return true;
    }
    if (listOpen) {
      setListOpen(false);
      return true;
    }
    if (selected) {
      setSelected(null);
      return true;
    }
    return false;
  };
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => onHardwareBack.current());
      return () => sub.remove();
    }, []),
  );

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progressList.value }));
  const movingHabit: Habit | undefined = moving ? habits.find((h) => h.lineageId === moving.lineageId) : undefined;
  const banner = moving ? t(moving.mode === 'choose' ? 'moveChoose' : 'moveBanner', { name: movingHabit ? titleOf(movingHabit.current) : '' }) : null;

  return (
    <View ref={rootRef} style={[styles.root, NO_SCROLL_WEB, { backgroundColor: c.page }]} onLayout={onLayout}>
      {/* An edge swipe back would fight the map's own drag: back is the button (spec 2.8). */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      {box && (
        <>
          {/* Everything under the name sheet: hidden from a screen reader while the sheet is open (Android has no modal flag). */}
          <View
            style={StyleSheet.absoluteFill}
            pointerEvents="box-none"
            // Always a real native view: if it were flattened away while the sheet is closed, opening
            // the sheet would move every canvas under it and Android would rebuild their surfaces.
            collapsable={false}
            accessibilityElementsHidden={naming !== null}
            importantForAccessibility={naming !== null ? 'no-hide-descendants' : 'auto'}
            aria-hidden={naming !== null ? true : undefined}
          >
            <ForestMap
              ref={mapRef}
              habits={habits}
              plot={plot}
              today={today}
              night={night}
              animations={animations}
              areaTop={insets.top + HEADER_H}
              sheetVisible={sheetVisible}
              selected={moving ? null : selected}
              highlight={highlight}
              fresh={fresh}
              grewFrom={grewFrom}
              onIntroDone={onIntroDone}
              onSelect={choose}
              onMoveStart={onMoveStart}
              onMoveEnd={finishMove}
              onFitChange={setAtFit}
              onPlantTap={() => router.push('/new')}
              waiting={waiting}
            />
            <MapHeader
              topInset={insets.top}
              width={box.w}
              banner={banner}
              showFit={habits.length > 0}
              atFit={atFit}
              onBack={leave}
              onFit={() => (atFit ? mapRef.current?.fitTrees() : mapRef.current?.fitPlot())}
              onCancelMove={cancelMove}
            />
            {/* Under the list the map darkens; a tap on it closes the list. */}
            <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrimStyle]} pointerEvents={listOpen ? 'auto' : 'none'}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setListOpen(false)} accessibilityLabel={t('close')} />
            </Animated.View>
            <ForestSheet
              place={place}
              base={base}
              habits={habits}
              selected={selectedHabit}
              highlight={highlight}
              today={today}
              screenW={box.w}
              screenH={box.h}
              topInset={insets.top}
              bottomInset={insets.bottom}
              animations={animations}
              visible={sheetVisible}
              progressList={progressList}
              onGesture={onGesture}
              onSettle={onSettle}
              onClose={() => choose(null)}
              onAction={onAction}
              onMove={startChoose}
              onMore={onMore}
              onPick={pick}
              shared={shared}
              onShared={openShared}
              onHour={openHours}
            />
            <UndoToast
              toast={toast}
              sheetVisible={sheetVisible}
              onUndo={undo}
              onChangeTime={openHours}
              onDone={(id) => setToast((x) => (x?.id === id ? null : x))}
            />
            {menu && (
              <TreeMenu
                anchor={menu}
                screenW={box.w}
                screenH={box.h}
                named={selectedHabit?.current.nickname != null}
                onRename={rename}
                onKind={selectedHabit && isGrowing(selectedHabit.current) ? chooseKind : undefined}
                onHour={selectedHabit && isGrowing(selectedHabit.current) ? openHours : undefined}
                onHistory={history}
                onDelete={askDelete}
                onClose={() => setMenu(null)}
              />
            )}
          </View>
          {/* Over the sheet, the toast and the menu (wave 4, 3.1). */}
          <NameSheet tree={naming} mode="rename" heirOf={heirOf} taken={taken} onClose={onNamed} />
          {kindOf && <KindSheet tree={kindOf} onClosed={() => setKindOf(null)} />}
          {hourOf && (
            <WateringTimeSheet
              visible={hourOpen}
              mode="change"
              kind={hourOf.kind}
              hour={nextOpenHour(hourOf, today) ?? openHourOn(hourOf, today)}
              // Today's real hour: the planting day is open at once ("Today — any time").
              todayHour={wateringOpensAt(hourOf, today)}
              habit={habits.find((h) => h.lineageId === hourOf.lineageId)}
              onPick={onHourPicked}
              onClose={() => {
                setHourOpen(false);
                setHourOf(null);
              }}
            />
          )}
        </>
      )}
    </View>
  );
}

/** The tree on its piece of sky, for the delete dialog: the card's picture, already drawn. */
function DeletePicture({ habit }: { habit: Habit }) {
  return <ThumbBox habit={habit} kind="card" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
});
