// Main screen: a window into a living meadow. The current habit's tree stands in
// front, the other habits' trees behind it along an arc; a swipe (or the dots on top)
// rides the camera from tree to tree. Tap the tree once a day to grow it.
//
// Layers, back to front (spec section 3, wave 2 spec sections 1–3, wave 5 spec 2.5): sky,
// meadow, neighbour trees, the live tree (all inside the swipe area), then the generation
// arrows, the "new stage" ribbon, the top bar and the header, the scrim under the menu,
// the bottom sheet, the lock-in overlay, the quest sheet, and over their shades the acorn
// wallet and the "new achievement" toast.
import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import { ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedReaction, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { gameDay } from '@/game/dates';
import { nameAskOpen, shouldAskName } from '@/game/naming';
import { QuestId } from '@/game/quests';
import { setMyHour, SharedTree, todayOf } from '@/game/shared';
import { canWaterAt, checkedInToday, growthDays, Habit, isCompleted, isDead, isGrowing, minutesUntilOpen, OpenHour, setOpenHour, Tree, wateringOpensAt, WithHours } from '@/game/tree';
import { stageDaysText } from '@/i18n';
import { useFriends } from '@/state/friends';
import { clockNow, useStore } from '@/state/store';
import { acornFlights, Batch, Wallet } from '@/ui/acorns';
import { AccountPrompt } from '@/ui/account/AccountPrompt';
import { AwardToast } from '@/ui/awards/Toast';
import { colorsFor, confirmDialog } from '@/ui/ds';
import { warmForest } from '@/ui/forest/thumbs';
import { cue } from '@/ui/feedback';
import { AppText, textShadow } from '@/ui/kit';
import { drawnSize, treeK } from '@/ui/live/bubble';
import { askTime, cheer, named, showEarly, treeNote, useChannel } from '@/ui/live/events';
import { treeMood } from '@/ui/live/mood';
import { LiveTree } from '@/ui/live/LiveTree';
import { SeedSpot } from '@/ui/live/SeedSpot';
import { StageBanner } from '@/ui/live/StageBanner';
import { LockInFlow, LockInFlowHandle, LockPhase } from '@/ui/lockin/LockInFlow';
import { LockInPicture } from '@/ui/lockin/Plaque';
import { clipName } from '@/ui/lockin/timeline';
import { betweenHabits } from '@/ui/meadow/camera';
import { HabitDots } from '@/ui/meadow/HabitDots';
import { Meadow } from '@/ui/meadow/Meadow';
import { Neighbors } from '@/ui/meadow/Neighbors';
import { NAME_SHOW } from '@/ui/naming/NameCelebration';
import { NameSheet } from '@/ui/naming/NameSheet';
import { useCamera } from '@/ui/meadow/useCamera';
import { SceneGeo, sceneGeo } from '@/ui/scene/contract';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { QuestSheet } from '@/ui/quests/QuestSheet';
import { HomeSheet, HomeSheetHandle } from '@/ui/sheet/HomeSheet';
import { changeNote, clockText, EVENING_HOUR, eveningTrees, sheetHours, treeWaits } from '@/ui/sheet/wait';
import { EveningOffer } from '@/ui/watering/EveningOffer';
import { ReminderAsk, shouldAskReminders } from '@/remind/ReminderAsk';
import { fromText, hourText, uses24 } from '@/ui/watering/format';
import { WateringTimeSheet } from '@/ui/watering/TimeSheet';
import { waterTarget } from '@/ui/quests/model';
import { canWaterShared, homeShared, isSharedId, sharedHabit, sharedIdOf } from '@/ui/together/model';
import { SharedDays, SharedLine, SharedLink, SharedStatus } from '@/ui/together/SharedHome';
import { Sky, sunCenter } from '@/ui/sky/Sky';
import { useWind } from '@/ui/sky/wind';
import { GenerationArrow, TreeHeader } from '@/ui/TreeHeader';

/** Touch area of the sun / moon that switches the theme. */
const SUN_HIT = 56;
/** The acorn wallet is never narrower than this ("50"), right 16, centred in the top bar (wave 5 spec 2.1). */
const WALLET_W = 66;
const WALLET_RIGHT = 16;
const WALLET_TOP = 13;
/** Acorns of a watering leave the crown after the +1 has landed, or after the celebration (spec 3.2). */
const WATER_FLIGHT = 2150;
const STAGE_FLIGHT = 3400;
/** A quest's "Too early" hint comes this long after the tree stands in front, and is dropped after this long. */
const EARLY_AFTER_RIDE = 250;
const EARLY_GIVE_UP = 4000;
/** The name sheet of the "Name a tree" quest opens after the camera got there. */
const NAME_AFTER_RIDE = 700;
/** How often the friends' data is fetched while a shared tree stands on the meadow, ms. */
const SHARED_POLL = 25_000;

// Habits are switched by swiping or tapping the dots on top.
// The arrows walk through the generations of the current habit.
export default function Home() {
  const store = useStore();
  const { trees, palette, t, settings, night, today, updateSettings, lockIn } = store;
  const c = colorsFor(night);
  // Locked-in habits are finished: they live only in the forest. Shared trees (wave 5,
  // спец-друзья 8.4) stand after my own habits, each as a habit of one tree.
  const friends = useFriends();
  const me = friends.account?.nick ?? null;
  const sharedList = useMemo(() => (me ? homeShared(friends.shared) : []), [me, friends.shared]);
  const sharedHabits = useMemo(() => sharedList.map((x) => sharedHabit(x, today)), [sharedList, today]);
  const ownHabits = store.habits.filter((h) => !isCompleted(h.current));
  const habits = sharedHabits.length > 0 ? [...ownHabits, ...sharedHabits] : ownHabits;
  /** The server's shared tree behind a tree on the meadow; null — one of my own. */
  const sharedOf = (x: Tree | undefined | null) => (x && isSharedId(x.id) ? sharedList.find((y) => y.id === sharedIdOf(x.id)) ?? null : null);
  const params = useLocalSearchParams<{ tree?: string; sheet?: string }>();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const animations = settings.animations && !reduced;
  // Under the forest or the settings the scene is hidden: stop its clock to save battery.
  const focused = useIsFocused();
  const wind = useWind(animations && focused);

  // While the home screen idles, draw the forest's pictures ahead, so the forest opens ready.
  useEffect(() => {
    if (!focused) return;
    const id = setTimeout(() => {
      warmForest(store.habits, palette, store.plot.size, store.plot.places).catch(() => {});
    }, 2000);
    return () => clearTimeout(id);
  }, [focused, store.habits, store.plot, palette]);

  // The habit the camera rests on, by id (indexes shift when habits come and go).
  const [lineageId, setLineageId] = useState<string | null>(null);
  // A past generation being looked at; null means the newest one.
  const [genId, setGenId] = useState<string | null>(null);
  const [showChances, setShowChances] = useState(false);
  // Watering or a celebration is on: no switching habits meanwhile.
  const [busy, setBusy] = useState(false);
  // Today's quests (wave 5): a sheet over this screen.
  const [questsOpen, setQuestsOpen] = useState(false);
  // The name sheet (wave 4): which tree and why; and the 1.3 s of the name show.
  const [naming, setNaming] = useState<{ id: string; mode: 'ask' | 'rename' } | null>(null);
  const [nameShow, setNameShow] = useState(false);
  // The tree that asked for a name in this session and whose bubble has not been heard yet:
  // only its bubble pops in fresh, with the sound (not again after the sheet is closed).
  const [freshAsk, setFreshAsk] = useState<string | null>(null);

  // ---- The bottom sheet and the lock-in sequence ----
  const sheet = useRef<HomeSheetHandle>(null);
  const flow = useRef<LockInFlowHandle>(null);
  const visible = useSharedValue(0);
  const progressMenu = useSharedValue(0);
  const hideLive = useSharedValue(0);
  const headerDim = useSharedValue(0);
  const [phase, setPhase] = useState<LockPhase>(null);
  const lockFlow = phase !== null;
  // The sheet is above normal: the scene is under the scrim and does not take touches.
  const [sheetUp, setSheetUp] = useState(false);
  useAnimatedReaction(
    () => progressMenu.value > 0.001,
    (up, before) => {
      if (up !== before) scheduleOnRN(setSheetUp, up);
    },
  );
  // Medals landed on "My forest", and the habit locked in last (the forest highlights it).
  const [landing, setLanding] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  // The highlight is for the next screen only: the forest plays it once (spec 5.4).
  useEffect(() => {
    if (!focused && highlight) setHighlight(null);
  }, [focused, highlight]);

  // Scene size: the screen, the top of the sheet in its rest place and the bottom of the header.
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const [restTop, setRestTop] = useState<number | null>(null);
  const [headerBottom, setHeaderBottom] = useState<number | null>(null);
  // The scene is laid out for the sheet's rest place, not where it is now: while the
  // sheet moves the canvases are not rebuilt and the tree does not jump (spec 1.2).
  const geo = useMemo(
    () => (box && restTop !== null ? sceneGeo(box.w, restTop, insets.top, headerBottom ?? insets.top + 150) : null),
    [box, restTop, headerBottom, insets.top],
  );

  const habitsRef = useRef(habits);
  habitsRef.current = habits;
  const lineageRef = useRef(lineageId);
  lineageRef.current = lineageId;
  const onSettle = useCallback((index: number) => {
    const next = habitsRef.current[index];
    if (!next || next.lineageId === lineageRef.current) return;
    setLineageId(next.lineageId);
    setGenId(null);
    setShowChances(false);
  }, []);
  // No swipes while the menu is up, the lock-in plays, the tree is being named or the quests are open.
  const still = busy || lockFlow || sheetUp || naming !== null || nameShow || questsOpen;
  const camera = useCamera(habits.length, { initial: 0, animations, vibration: settings.vibration, busy: still, onSettle });
  const { cameraX, focusIndex, liveIndex } = camera;

  // Open the tree asked for in the link (from the forest or after planting), then clear
  // the link so later changes to the trees don't pull the screen back to it. Opened from
  // scratch (a reload on the forest) the trees are not loaded yet: wait for them.
  useEffect(() => {
    if (!params.tree || !store.ready) return;
    // A shared tree's id (`shared:<id>`) comes from its screen: it is one of the meadow's habits.
    const asked = trees.find((x) => x.id === params.tree) ?? habits.find((h) => h.current.id === params.tree)?.current;
    if (asked) {
      setLineageId(asked.lineageId);
      setGenId(null);
    }
    router.setParams({ tree: undefined });
    // Only react to a new link, not to tree changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tree, store.ready]);

  // Keep the camera on the chosen habit when it is chosen by a link, or when habits
  // are added, deleted or locked in under it (then the next one takes its place, or
  // the one before if it was the last).
  const habitIds = habits.map((h) => h.lineageId).join(',');
  useEffect(() => {
    // A link not read yet decides the habit: don't fall back to the first one before it.
    if (habits.length === 0 || params.tree) return;
    const found = habits.findIndex((h) => h.lineageId === lineageId);
    const index = found >= 0 ? found : Math.min(liveIndex, habits.length - 1);
    if (found < 0) setLineageId(habits[index].lineageId);
    if (index !== liveIndex) camera.jump(index);
    // Habits are compared by their ids; the camera's own moves come through onSettle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineageId, habitIds, params.tree]);

  // The live tree: the habit the camera rests on, in the generation being looked at.
  // Right after the last habit is locked in or deleted, liveIndex may point past the
  // end for one render, until the camera jumps back.
  const habit = habits[Math.min(liveIndex, habits.length - 1)];
  const generations = habit?.generations ?? [];
  const genFound = generations.findIndex((x) => x.id === genId);
  const genIndex = genFound >= 0 ? genFound : generations.length - 1;
  const tree = generations[genIndex];
  // The header and the sheet follow the habit nearest to the camera, even mid-ride.
  const onLive = focusIndex === liveIndex;
  const focusHabit = habits[focusIndex] ?? habit;
  const focusTree = onLive ? tree : focusHabit?.current;

  const goGeneration = (delta: number) => {
    const next = generations[genIndex + delta];
    if (next) setGenId(next.id);
  };

  // The one-time "Mark it in the evening?" with the trees it lists (OYUUR-33 7), and the trees
  // its "Yes" moved to the evening (told over the crown once the sheet is gone).
  const [offer, setOffer] = useState<Tree[] | null>(null);
  const [remindAsk, setRemindAsk] = useState(false);
  const offerAnswer = useRef<{ treeId: string; ids: string[] } | null>(null);
  // A quest's "go" led to a tree that waits for its hour: its "Too early" hint, shown when it stands in front.
  const [earlyFor, setEarlyFor] = useState<{ treeId: string; at: number } | null>(null);

  // ---- The tree's name (wave 4) ----
  // Once after each watering, when its show is over: maybe the tree asks for a name
  // (the bubble pops up 400 ms later, see NameBubble).
  const wasBusy = useRef(false);
  useEffect(() => {
    const was = wasBusy.current;
    wasBusy.current = busy;
    if (!was || busy || !tree || isSharedId(tree.id)) return;
    // Today as of now: the watering may have ended past midnight, before the screen's clock ticked.
    const day = gameDay(clockNow(settings.minuteOffset), settings.dayOffset);
    if (shouldAskName(tree, day, trees)) {
      store.askName(tree.id);
      setFreshAsk(tree.id);
      return;
    }
    // "Mark it in the evening?" (OYUUR-33 7): once, after an old "Quit" tree's watering, with no name bubble up.
    if (store.eveningOffer && tree.kind === 'quit' && !nameAskOpen(tree, day)) {
      const offered = eveningTrees(trees, day);
      if (offered.some((x) => x.id === tree.id)) {
        setOffer(offered);
        return;
      }
    }
    // "Remind you to water?" (OYUUR-23): once, after a watering — never at the first start.
    if (tree.checkins.includes(day) && !nameAskOpen(tree, day)) void shouldAskReminders().then((yes) => yes && setRemindAsk(true));
    // Only when the watering ends; the tree and the day are read then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
  // A shared tree has no name of its own (not in this wave).
  const asking = !!tree && !isSharedId(tree.id) && naming === null && nameAskOpen(tree, today);
  const onAskShown = useCallback(() => setFreshAsk(null), []);

  const namingTree = naming ? trees.find((x) => x.id === naming.id) ?? null : null;
  const namingGens = namingTree ? store.habits.find((h) => h.lineageId === namingTree.lineageId)?.generations ?? [] : [];
  const heirOf = namingTree ? namingGens[namingGens.findIndex((x) => x.id === namingTree.id) - 1]?.nickname ?? null : null;
  const taken = trees.flatMap((x) => (x.nickname !== null && x.id !== naming?.id ? [x.nickname] : []));
  const nameTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => nameTimers.current.forEach(clearTimeout), []);
  const onNameClose = (result: { nickname: string | null } | null, later?: boolean) => {
    const asked = naming;
    setNaming(null);
    if (!asked) return;
    // Only the offer's "Later" puts the bubble away for the rest of the day; closed any other
    // way (the scrim, "back") the sheet just goes and the bubble comes back, quietly.
    if (!result) {
      if (asked.mode === 'ask' && later) store.nameLater(asked.id);
      return;
    }
    const before = trees.find((x) => x.id === asked.id);
    if (!before || (result.nickname === null && before.nickname === null)) return;
    const kind = result.nickname === null ? 'removed' : before.nickname === null ? 'named' : 'renamed';
    // Saved at once; the header plays its part, the tree sways, the sound comes as the letters do.
    store.nameTree(asked.id, result.nickname);
    named.emit({ treeId: asked.id, kind, reduced: !animations });
    if (kind !== 'removed') {
      cheer.emit({ treeId: asked.id });
      nameTimers.current.push(setTimeout(() => cue('named'), animations ? 420 : 200));
    }
    setNameShow(true);
    nameTimers.current.push(setTimeout(() => setNameShow(false), animations ? NAME_SHOW : 200));
  };
  // A tap on the header's lines names or renames the tree in front, when nothing else is going on.
  const canRename = !!focusTree && onLive && !still && !isCompleted(focusTree) && !isSharedId(focusTree.id);
  const onNamePress = canRename && focusTree ? () => setNaming({ id: focusTree.id, mode: 'rename' }) : undefined;

  // The picture under the live tree goes only after the live tree drew its first frame.
  const [readyId, setReadyId] = useState<string | null>(null);
  const treeId = tree?.id ?? null;
  const onReady = useCallback(() => setReadyId(treeId), [treeId]);
  const liveReady = treeId !== null && readyId === treeId;

  const depth = useDerivedValue(() => liveIndex - cameraX.value, [liveIndex]);
  // With animations off the layers stand still: no parallax ride.
  const stillX = useSharedValue(0);

  // Between two habits the header (with the hearts) fades out and slides a little
  // (not when the rubber band pulls past the first or last habit). Under the menu the
  // header steps back a little; while the lock-in ribbon shows it dims.
  const lastIndex = Math.max(habits.length - 1, 0);
  const headerStyle = useAnimatedStyle(() => {
    const f = betweenHabits(Math.min(Math.max(cameraX.value, 0), lastIndex));
    const pm = progressMenu.value;
    return {
      opacity: (1 - 2 * Math.abs(f)) * (1 - 0.15 * pm) * (1 - 0.65 * headerDim.value),
      transform: [{ translateX: -f * 40 }, { translateY: -10 * pm }],
    };
  });
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progressMenu.value }));
  const liveStyle = useAnimatedStyle(() => ({ opacity: 1 - hideLive.value }));

  const toggleTheme = () => {
    cue('theme');
    updateSettings({ theme: night ? 'light' : 'dark' });
  };
  const sun = sunCenter(insets.top);
  // The dots stay centred, clear of the sun's touch area and of the acorn wallet.
  const [walletW, setWalletW] = useState(WALLET_W);
  const onWalletWidth = useCallback((w: number) => setWalletW(Math.max(WALLET_W, w)), []);
  const screenW = box?.w ?? 375;
  const dotsW = 2 * Math.max(0, Math.min(screenW / 2 - (sun.x + SUN_HIT / 2) - 4, screenW / 2 - WALLET_RIGHT - walletW - 6));
  // The "new stage" ribbon goes under the development bar, not over it.
  const [devBottom, setDevBottom] = useState<number | null>(null);
  // Only while the date is moved (in the settings' developer block): normally it is not there.
  const devBar = __DEV__ && (settings.dayOffset !== 0 || settings.minuteOffset !== 0);
  const onDevBar = (e: LayoutChangeEvent) => setDevBottom(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height));
  const onBox = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // Under another screen a browser squeezes this one to 0×0: keep the scene as it was,
    // so the canvases are not rebuilt (or drawn at no size) and come back as they were.
    if (width < 1 || height < 1) return;
    setBox((b) => (b && b.w === width && b.h === height ? b : { w: width, h: height }));
  };
  // The header is a line taller for habits with several generations. The scene keeps
  // room for the tallest header seen, so the sky, the meadow and the tree size don't
  // jump (and get rebuilt) while the camera rides past.
  const lastHeaderBottom = useRef<number | null>(null);
  const onHeader = (e: LayoutChangeEvent) => {
    const bottom = Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height);
    lastHeaderBottom.current = bottom;
    setHeaderBottom((prev) => (prev === null ? bottom : Math.max(prev, bottom)));
  };
  // A new screen size starts over from the header as it is now.
  useEffect(() => {
    setHeaderBottom(lastHeaderBottom.current);
  }, [box?.w, box?.h]);
  const onRest = useCallback((top: number) => setRestTop(Math.round(top)), []);

  // "Lock in the result": our own dialog, then the sequence (spec 3).
  const onLockIn = async (locking: Tree) => {
    if (busy || lockFlow) return;
    // The picture that stands in for the live tree is drawn while the dialog is open.
    flow.current?.warm(locking);
    const ok = await confirmDialog({
      title: t('lockInTitle', { name: clipName(locking.name) }),
      message: locking.nickname
        ? t('lockInTextNamed', { name: locking.nickname, days: stageDaysText(t, growthDays(locking)) })
        : t('lockInText', { days: stageDaysText(t, growthDays(locking)) }),
      confirmLabel: t('lockInButton'),
      cancelLabel: t('cancel'),
      tone: 'gold',
      glyph: 'plaque',
      picture: <LockInPicture tree={locking} />,
    });
    if (ok) flow.current?.start(locking);
  };
  const onLockedIn = useCallback(
    (locked: Tree) => {
      lockIn(locked.id);
      setHighlight(locked.lineageId);
    },
    [lockIn],
  );
  const onLand = useCallback(() => setLanding((n) => n + 1), []);
  // "My forest" counts every habit, as the forest shows them: growing, locked in and memories.
  const forestCount = store.habits.length;

  // Android "back": closes the menu; ignored during the lock-in.
  const lockFlowRef = useRef(lockFlow);
  lockFlowRef.current = lockFlow;
  const sheetUpRef = useRef(sheetUp);
  sheetUpRef.current = sheetUp;
  useEffect(() => {
    if (!focused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (lockFlowRef.current) return true;
      if (!sheetUpRef.current) return false;
      sheet.current?.snapTo('rest');
      return true;
    });
    return () => sub.remove();
  }, [focused]);

  const ribbonTop = geo ? Math.max(geo.headerBottom + 14, devBar && devBottom !== null ? devBottom + 8 : 0) : 0;

  // ---- Acorns of a watering fly out of the crown (wave 5 spec 3.2) ----
  const screenRoot = useRef<ComponentRef<typeof View>>(null);
  const crown = useRef<{ treeId: string; x: number; y: number } | null>(null);
  crown.current = tree && geo && onLive
    ? { treeId: tree.id, x: geo.width / 2, y: geo.feetY - 0.6 * drawnSize(tree.skin, growthDays(tree), isDead(tree), treeK(geo)).h }
    : null;
  useEffect(() => {
    if (!focused) return;
    const fromCrown = (b: Batch) => ({
      delay: b.sources.includes('stage') ? STAGE_FLIGHT : WATER_FLIGHT,
      // Measured when the flock starts: the tree has grown by then, and the camera may have left.
      from: () =>
        new Promise<{ x: number; y: number } | null>((resolve) => {
          const at = crown.current;
          if (!at || at.treeId !== b.treeId || !screenRoot.current) return resolve(null);
          screenRoot.current.measureInWindow((x, y) => resolve({ x: x + at.x, y: y + at.y }));
        }),
    });
    const offWater = acornFlights.provide('water', fromCrown);
    const offStage = acornFlights.provide('stage', fromCrown);
    return () => {
      offWater();
      offStage();
    };
  }, [focused]);
  // The flock waits while the name plays, the name sheet is up or the camera rides.
  const holdFlights = useRef(false);
  holdFlights.current = nameShow || naming !== null || !onLive;
  useEffect(() => (focused ? acornFlights.setGate(() => holdFlights.current) : undefined), [focused]);

  // "New achievement" only when this screen has nothing else going on (spec 11.7).
  const toastAllowed = focused && !busy && !lockFlow && !sheetUp && !questsOpen && naming === null && !nameShow;
  const [toastOn, setToastOn] = useState(false);

  // ---- Quests (wave 5 spec 5) ----
  const openQuests = useCallback(() => setQuestsOpen(true), []);
  // Other screens open the quests here with `/?sheet=quests` (the shop's "how to earn").
  useEffect(() => {
    if (params.sheet !== 'quests' || !store.ready) return;
    openQuests();
    router.setParams({ sheet: undefined });
  }, [params.sheet, store.ready, openQuests]);
  const closeQuests = useCallback(() => setQuestsOpen(false), []);
  // The camera can't ride while the quest sheet is still counted as open: it rides on the next render.
  const [ride, setRide] = useState<{ index: number; then?: () => void } | null>(null);
  useEffect(() => {
    if (!ride || still) return;
    setRide(null);
    const there = ride.index === liveIndex;
    camera.goTo(ride.index);
    if (ride.then) nameTimers.current.push(setTimeout(ride.then, there || !animations ? 0 : NAME_AFTER_RIDE));
    // camera.goTo changes with the camera's state; the ride is what starts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride, still]);
  const rideToWater = (list: { index: number; minutes: number }[]) => {
    const target = waterTarget(list);
    if (!target) return false;
    setRide({ index: target.index });
    // The "Too early" hint waits until that tree stands in front, however long the ride takes.
    setEarlyFor(target.waits ? { treeId: habits[target.index].current.id, at: Date.now() } : null);
    return true;
  };
  const onQuest = (id: QuestId) => {
    switch (id) {
      case 'waterAll': {
        // A tree that can be watered now; if every one waits for its hour — the one that opens soonest,
        // with the "Too early" hint over it (OYUUR-33 9).
        const list = habits.flatMap((h, index) =>
          isGrowing(h.current) && !checkedInToday(h.current, today) && !isSharedId(h.lineageId) && treeMood(h.current, today) === 'thirsty'
            ? [{ index, minutes: minutesUntilOpen(h.current, today, store.clock) }]
            : [],
        );
        rideToWater(list);
        return;
      }
      case 'waterShared': {
        // The shared trees on the meadow, the same way; with none here — the friends' screen.
        const list = habits.flatMap((h, index) => {
          const s = sharedOf(h.current);
          return s && canWaterShared(s, me, today) ? [{ index, minutes: minutesUntilOpen(store.sharedHalf(s), today, store.clock) }] : [];
        });
        if (!rideToWater(list)) router.push('/friends');
        return;
      }
      case 'nameTree': {
        const index = habits.findIndex((h) => isGrowing(h.current) && h.current.nickname === null && !isSharedId(h.lineageId));
        if (index < 0) return;
        const treeId = habits[index].current.id;
        setRide({ index, then: () => setNaming({ id: treeId, mode: 'rename' }) });
        return;
      }
      case 'visitForest':
        router.push('/forest');
        return;
      case 'moveTree':
        router.push('/forest');
        showQuestHint(t('questsMoveHint'));
        return;
      case 'plantHabit':
        router.push('/new');
        return;
      default:
        // Visiting and cheering friends, the shared tree: the friends' screen.
        router.push('/friends');
    }
  };

  // ---- A shared tree in front (спец-друзья 8.4): a tap waters my half ----
  const liveSharedTree = sharedOf(tree);
  const liveToday = liveSharedTree && me ? todayOf(liveSharedTree, me, today) : null;
  const liveSharedId = liveSharedTree?.id ?? null;
  const waterShared = friends.waterShared;
  const onWaterShared = useCallback(() => {
    if (liveSharedId) waterShared(liveSharedId);
  }, [liveSharedId, waterShared]);
  // My half's watering hours (OYUUR-34: each of us has our own, kept on this phone).
  const liveHalf = liveSharedTree ? store.sharedHalf(liveSharedTree) : null;
  const canWaterSharedNow = store.canWaterSharedNow;
  const liveCanNow = useCallback(() => (liveSharedTree ? canWaterSharedNow(liveSharedTree) : false), [liveSharedTree, canWaterSharedNow]);
  const liveShared = liveToday && liveHalf
    ? { mine: liveToday.mine, theirs: liveToday.theirs, onWater: onWaterShared, hours: liveHalf, canNow: liveCanNow }
    : undefined;
  const focusShared = sharedOf(focusTree);
  // With a shared tree on the meadow the friend's half shows up within half a minute (the friends'
  // own refresh is once a minute); the app coming back refreshes it there already.
  const refreshFriends = friends.refresh;
  const hasShared = sharedList.length > 0;
  useEffect(() => {
    if (!focused || !hasShared) return;
    const id = setInterval(() => AppState.currentState === 'active' && refreshFriends(), SHARED_POLL);
    return () => clearInterval(id);
  }, [focused, hasShared, refreshFriends]);

  // ---- The watering time (OYUUR-33 4–5): the status line, "Change time" in the early pill ----
  const [timeFor, setTimeFor] = useState<string | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  // Only while this screen is in front: the shared tree's screen over it has its own sheet.
  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  useChannel(
    askTime,
    useCallback((e: { treeId: string }) => {
      if (!focusedRef.current) return;
      setTimeFor(e.treeId);
      setTimeOpen(true);
    }, []),
  );
  useEffect(() => {
    if (!earlyFor) return;
    // Given up if the tree never came to the front (the camera was turned elsewhere).
    if (Date.now() - earlyFor.at > EARLY_GIVE_UP) return setEarlyFor(null);
    if (!liveReady || tree?.id !== earlyFor.treeId || still) return;
    const id = setTimeout(() => {
      showEarly.emit({ treeId: earlyFor.treeId });
      setEarlyFor(null);
    }, EARLY_AFTER_RIDE);
    return () => clearTimeout(id);
  }, [earlyFor, liveReady, tree?.id, still]);
  const timeTree = timeFor ? trees.find((x) => x.id === timeFor) ?? null : null;
  const timeShared: SharedTree | null = timeFor && isSharedId(timeFor) ? sharedList.find((x) => x.id === sharedIdOf(timeFor)) ?? null : null;
  const timeHours: WithHours | null = timeTree ?? (timeShared ? store.sharedHalf(timeShared) : null);
  const timeHabit: Habit | undefined = timeFor ? habits.find((h) => h.current.id === timeFor) : undefined;
  const onPickHour = (hour: OpenHour) => {
    if (!timeFor || !timeHours) return;
    // Nothing changed: the sheet just goes, no note.
    if (hour === sheetHours(timeHours, today).hour) return;
    let after: WithHours;
    if (timeTree) {
      after = setOpenHour(timeTree, hour, today);
      store.setTreeHour(timeTree.id, hour);
    } else if (timeShared) {
      after = { plantedOn: timeHours.plantedOn, openHours: setMyHour(timeHours, hour, today) };
      store.setSharedHour(timeShared, hour);
    } else return;
    const note = changeNote(after, today);
    cue('select');
    treeNote.emit({ treeId: timeFor, text: t(note.kind === 'saved' ? 'wtSaved' : 'wtKept', { when: fromText(note.hour, t) }) });
  };
  /** The hour a tree waits for today (the clock dot on top, a calm neighbour); null — it doesn't wait. */
  const hourWaited = (x: Tree): OpenHour | null => {
    const s = sharedOf(x);
    if (!s) return treeWaits(x, today, store.clock) ? wateringOpensAt(x, today) : null;
    if (!me || !canWaterShared(s, me, today)) return null;
    const half = store.sharedHalf(s);
    return canWaterAt(half, today, store.clock) ? null : wateringOpensAt(half, today);
  };

  return (
    <View
      ref={screenRoot}
      style={styles.screen}
      onLayout={onBox}
      // Any touch hides the first-run hint (never takes the touch).
      onStartShouldSetResponderCapture={() => {
        sheet.current?.touched();
        return false;
      }}
    >
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
        {geo && (
          <GestureDetector gesture={camera.gesture}>
            <View style={StyleSheet.absoluteFill}>
              <Sky geo={geo} night={night} animations={animations} cameraX={animations ? cameraX : stillX} wind={wind} busy={busy} />
              <Meadow geo={geo} night={night} animations={animations} cameraX={cameraX} wind={wind} />
              <Neighbors
                waits={(x) => hourWaited(x) !== null}
                habits={habits}
                liveTree={tree}
                {...{ liveIndex, focusIndex, liveReady, cameraX, geo, wind, today, animations }}
              />
              {tree ? (
                // The lock-in hides the live tree behind its picture; LiveTree itself is untouched.
                <Animated.View style={[StyleSheet.absoluteFill, liveStyle]} pointerEvents="box-none">
                  <LiveTree
                    key={tree.id}
                    tree={tree}
                    geo={geo}
                    depth={depth}
                    wind={wind}
                    animations={animations}
                    vibration={settings.vibration}
                    onBusyChange={setBusy}
                    onReady={onReady}
                    askName={asking}
                    askFresh={freshAsk === tree.id}
                    onAskShown={onAskShown}
                    onAskName={() => setNaming({ id: tree.id, mode: 'ask' })}
                    shared={liveShared}
                  />
                </Animated.View>
              ) : (
                <SeedSpot geo={geo} animations={animations} onPress={() => router.push('/new')} />
              )}
            </View>
          </GestureDetector>
        )}

        {geo && tree && onLive && generations.length > 1 && !lockFlow && (
          <View pointerEvents="box-none" style={[styles.arrows, { top: arrowY(geo) - ARROW_BOX * 0.7 }]}>
            {genIndex > 0 && <GenerationArrow side="left" onPress={() => goGeneration(-1)} color={palette.text} />}
            {genIndex < generations.length - 1 && <GenerationArrow side="right" onPress={() => goGeneration(1)} color={palette.text} />}
          </View>
        )}
        {geo && <StageBanner top={ribbonTop} />}

        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <View style={[styles.topBar, { marginTop: insets.top + 8 }]} pointerEvents="box-none">
            <HabitDots habits={habits} active={focusIndex} today={today} width={dotsW} disabled={still} onPress={camera.goTo} waitsFor={(h) => hourWaited(h.current)} />
          </View>

          {focusTree && focusHabit ? (
            <Animated.View style={headerStyle} onLayout={onHeader} pointerEvents="box-none">
              <TreeHeader
                tree={focusTree}
                position={onLive ? genIndex + 1 : focusHabit.generations.length}
                total={focusHabit.generations.length}
                onNamePress={onNamePress}
                chancesOpen={showChances && onLive}
                onChances={() => setShowChances((v) => !v)}
                line2={focusShared && me ? <SharedLine s={focusShared} me={me} /> : undefined}
              />
            </Animated.View>
          ) : (
            <Animated.View style={[styles.header, headerStyle]} onLayout={onHeader} pointerEvents="none">
              <AppText weight="black" style={[{ fontSize: 40 }, textShadow]}>{t('appName')}</AppText>
              <AppText weight="bold" style={{ color: palette.textSoft }}>{t('tagline')}</AppText>
            </Animated.View>
          )}
          {devBar && focusTree && (
            <View onLayout={onDevBar} pointerEvents="box-none">
              <DevBar />
            </View>
          )}
      </View>

      {/* The sun (or moon) in the sky is the theme switch. */}
      <Pressable
        onPress={toggleTheme}
        accessibilityRole="button"
        accessibilityLabel={t('theme')}
        style={[styles.sunHit, { left: sun.x - SUN_HIT / 2, top: sun.y - SUN_HIT / 2 }]}
      />

      {/* Darkens the scene as the menu comes up; a tap on it closes the menu. */}
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrimStyle]} pointerEvents={sheetUp ? 'auto' : 'none'}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => sheet.current?.snapTo('rest')}
          accessibilityRole="button"
          accessibilityLabel={t('closeMenu')}
          accessibilityElementsHidden={!sheetUp}
          importantForAccessibility={sheetUp ? 'auto' : 'no-hide-descendants'}
        />
      </Animated.View>

      {box && (
        <HomeSheet
          ref={sheet}
          tree={focusTree ?? null}
          allDone={store.habits.length > 0}
          screenW={box.w}
          screenH={box.h}
          topInset={insets.top}
          bottomInset={insets.bottom}
          headerBottom={headerBottom}
          visible={visible}
          progressMenu={progressMenu}
          disabled={busy || lockFlow || naming !== null || nameShow}
          locking={phase === 'before'}
          animations={animations}
          focused={focused}
          forestCount={forestCount}
          landing={landing}
          forestHighlight={highlight}
          onRest={onRest}
          onLockIn={onLockIn}
          onQuests={openQuests}
          shared={
            focusShared && me
              ? {
                  status: <SharedStatus s={focusShared} me={me} animations={animations} />,
                  days: <SharedDays s={focusShared} me={me} />,
                  link: <SharedLink s={focusShared} />,
                }
              : null
          }
        />
      )}

      {box && (
        <LockInFlow
          ref={flow}
          geo={geo}
          screenH={box.h}
          ribbonTop={ribbonTop}
          animations={animations}
          sheet={sheet}
          visible={visible}
          hideLive={hideLive}
          headerDim={headerDim}
          onPhase={setPhase}
          onLockIn={onLockedIn}
          onLand={onLand}
        />
      )}
      </View>

      <QuestSheet open={questsOpen} onClose={closeQuests} onGo={onQuest} />

      {/* The wallet stays bright over the menu's and the quests' shades: acorns fly into it (wave 5 spec 2.5). */}
      <Wallet style={[styles.wallet, { top: insets.top + WALLET_TOP }]} active={focused} onWidth={onWalletWidth} />
      {/* 8 under the header: the streak and the name stay in sight. */}
      <AwardToast allowed={toastAllowed} top={(headerBottom ?? insets.top + 150) + 8} onShowing={setToastOn} />
      {/* Wave 5: "Create an account" once, after the first watering, when the screen is quiet and the toast is gone. */}
      <AccountPrompt allowed={toastAllowed && !toastOn} />

      {/* Over everything but the dialogs (spec 3.1). */}
      <NameSheet tree={namingTree} mode={naming?.mode ?? 'rename'} heirOf={heirOf} taken={taken} onClose={onNameClose} />
      {timeHours && (
        <WateringTimeSheet
          visible={timeOpen}
          mode="change"
          kind={timeTree?.kind ?? timeShared?.kind ?? 'do'}
          {...sheetHours(timeHours, today)}
          habit={timeHabit}
          onPick={onPickHour}
          onClose={() => {
            setTimeOpen(false);
            setTimeFor(null);
          }}
        />
      )}
      {remindAsk && <ReminderAsk onClosed={() => setRemindAsk(false)} />}
      {offer && (
        <EveningOffer
          trees={offer}
          onAnswered={(ids) => {
            offerAnswer.current = tree && ids.length ? { treeId: tree.id, ids } : null;
          }}
          onClosed={() => {
            setOffer(null);
            const done = offerAnswer.current;
            offerAnswer.current = null;
            if (!done) return;
            cue('select');
            const time = hourText(EVENING_HOUR, t.lang);
            treeNote.emit({
              treeId: done.treeId,
              text: done.ids.length === 1 ? t('wtSaved', { when: fromText(EVENING_HOUR, t) }) : t('wbOfferSavedMany', { n: done.ids.length, time }),
            });
          }}
        />
      )}
    </View>
  );
}

/** Height of the box the generation arrows sit in; the arrow is centred at 70 % of it. */
const ARROW_BOX = 70;

/** The generation arrows stand a little above the middle of the front tree, below the header. */
function arrowY(geo: SceneGeo): number {
  return Math.round(geo.feetY - 0.55 * (geo.feetY - geo.headerBottom));
}

/** Time travel right on the main screen, only in development builds. */
function DevBar() {
  const { settings, updateSettings, today, palette, t, clock } = useStore();
  const travel = (days: number) => updateSettings({ dayOffset: settings.dayOffset + days });
  const shift = (minutes: number) => updateSettings({ minuteOffset: settings.minuteOffset + minutes });
  const btn = (label: string, onPress: () => void, key = label) => (
    <Pressable key={key} onPress={onPress} style={[styles.devBtn, { backgroundColor: palette.button }]}>
      <AppText style={[styles.devText, { color: palette.buttonText }]}>{label}</AppText>
    </Pressable>
  );
  const label = (text: string, testID?: string) => (
    <AppText testID={testID} style={[styles.devText, { color: palette.textSoft }]}>{text}</AppText>
  );
  return (
    <View pointerEvents="box-none">
      {/* The day: "29.10 +1 +7 +30 Today". */}
      <View style={styles.devBar} pointerEvents="box-none">
        {label(`${today.slice(8)}.${today.slice(5, 7)}`)}
        {[1, 7, 30].map((n) => btn(`+${n}`, () => travel(n)))}
        {settings.dayOffset !== 0 && btn(t('devBack'), () => updateSettings({ dayOffset: 0 }))}
      </View>
      {/* The clock within the day (OYUUR-34): the watering hours. */}
      <View style={styles.devBar} pointerEvents="box-none">
        {label(clockText(clock, uses24(t.lang)), 'dev-clock')}
        {btn(t('wbDevMinusHour'), () => shift(-60))}
        {btn(t('wbDevPlusHour'), () => shift(60))}
        {btn(t('wbDevPlus10'), () => shift(10))}
        {settings.minuteOffset !== 0 && btn(t('wbDevNow'), () => updateSettings({ minuteOffset: 0 }))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { height: 44, justifyContent: 'center', paddingHorizontal: 16 },
  wallet: { position: 'absolute', right: WALLET_RIGHT },
  header: { alignItems: 'center', paddingHorizontal: 24, marginTop: 4 },
  arrows: { position: 'absolute', left: 0, right: 0, height: ARROW_BOX },
  sunHit: { position: 'absolute', width: SUN_HIT, height: SUN_HIT, borderRadius: SUN_HIT / 2 },
  devBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 3 },
  devBtn: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7 },
  devText: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
