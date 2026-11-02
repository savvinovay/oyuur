// The bottom sheet of the main screen (spec section 1): one surface that follows the
// finger 1:1 between three places — folded (status), normal (plus day cards) and
// menu (plus the sections) — and springs to the nearest one on release. Everything
// that moves is computed on the UI thread from one shared value, `visible` (how much
// of the sheet shows above the bottom edge); React renders only when it settles.
import { router } from 'expo-router';
import { ComponentRef, ReactNode, Ref, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  FadeOut,
  scrollTo,
  SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect as SvgRect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { isGrowing, Tree } from '@/game/tree';
import { useStore } from '@/state/store';
import { DayStrip } from '@/ui/DayStrip';
import { Button, colorsFor, fonts, Glyph, Grabber, motion, SheetSurface, Txt } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import {
  DEFAULT_SIZES,
  Detent,
  detentHeights,
  detentList,
  dragVisible,
  GAP,
  GRAB,
  isMenu,
  menuHeight,
  PEEK_PAD,
  pickDetent,
  progress,
  restDetent,
  sameDetent,
  SHEET_TOP,
  SheetSizes,
  tapTarget,
} from './detents';
import { MenuGrid, MenuTarget, newsDotColor } from './MenuGrid';
import { MenuHint } from './MenuHint';
import { useMenuNews } from './news';
import { SheetStatus } from './SheetStatus';

export interface HomeSheetHandle {
  /** Move to a place; 'rest' is the default one. `instant`: no motion; `quiet`: no feedback. */
  snapTo(place: Detent | 'rest', o?: { instant?: boolean; quiet?: boolean }): void;
  /** Any touch on the screen: the hint goes away. */
  touched(): void;
  /** Center of the "My forest" glyph: x from the screen's left edge, y below the sheet's top edge. */
  measureForest(): Promise<{ x: number; dy: number } | null>;
  /** The sheet's top, px from the screen's top, in the menu place. */
  menuTop(): number;
}

interface Props {
  ref?: Ref<HomeSheetHandle>;
  /** The habit's tree on show; null — no habit on the meadow. */
  tree: Tree | null;
  /** No habit on the meadow because every one is locked in. */
  allDone: boolean;
  screenW: number;
  screenH: number;
  topInset: number;
  bottomInset: number;
  headerBottom: number | null;
  /** How much of the sheet shows above the bottom edge, px. */
  visible: SharedValue<number>;
  /** 0 in normal, 1 in the menu: written here, read by the scrim and the header. */
  progressMenu: SharedValue<number>;
  /** Watering, a celebration or the lock-in: the sheet can't be pulled. */
  disabled: boolean;
  /** The lock-in sequence: the status says "Result locked in". */
  locking: boolean;
  animations: boolean;
  focused: boolean;
  /** Habits in the forest, for "3 trees" on "My forest". */
  forestCount: number;
  /** Grows by one when a lock-in medal lands on "My forest". */
  landing: number;
  /** The habit locked in this session: the forest opens with it highlighted. */
  forestHighlight: string | null;
  /** Top of the sheet in its rest place: the scene is laid out above it. */
  onRest: (top: number) => void;
  /** The sheet settled in a place. */
  onDetent?: (d: Detent) => void;
  onLockIn: (tree: Tree) => void;
  /** "Quests" in the menu: the sheet goes to rest while the quest sheet comes up (wave 5 spec 4.4). */
  onQuests: () => void;
  /**
   * A shared tree is in front (спец-друзья 8.4): its own status lines, day cards with two dots
   * and "Shared tree ›" instead of "Lock in the result" (a shared tree can't be locked in).
   */
  shared?: { status: ReactNode; days: ReactNode; link: ReactNode } | null;
}

/** Quiet time before the hint, how long it stays, and how many times it is shown (spec 1.6). */
const HINT = { idle: 1200, stay: 3500, shows: 2, jump: 24 };
/** Hint shows in this app session (with the saved flag it decides when to stop). */
let hintShows = 0;
/** Fades over the top and the bottom of a menu that scrolls. */
const FADE = 16;
/** What a drag on the sheet moves: nothing yet, the sheet, or the menu inside it. */
const DRAG = { none: 0, sheet: 1, scroll: 2 };

export function HomeSheet(props: Props) {
  const {
    ref, tree, allDone, screenW, screenH, topInset, bottomInset, headerBottom, visible, progressMenu,
    disabled, locking, animations, focused, forestCount, landing, forestHighlight, onRest, onDetent, onLockIn, onQuests, shared,
  } = props;
  const { t, night, settings, updateSettings } = useStore();
  const c = colorsFor(night);
  const hasHabits = tree !== null;

  // ---- Sizes: measured blocks, the tallest seen (so places don't hop between habits) ----
  const [measured, setMeasured] = useState({ status: DEFAULT_SIZES.status, days: DEFAULT_SIZES.days, empty: DEFAULT_SIZES.empty, menu: 0 });
  // A new screen size starts over.
  useEffect(() => {
    setMeasured({ status: DEFAULT_SIZES.status, days: DEFAULT_SIZES.days, empty: DEFAULT_SIZES.empty, menu: 0 });
  }, [screenW, screenH]);
  const grow = (key: 'status' | 'days' | 'empty') => (e: LayoutChangeEvent) => {
    const v = Math.ceil(e.nativeEvent.layout.height);
    setMeasured((m) => (v > m[key] ? { ...m, [key]: v } : m));
  };
  const onMenuLayout = (e: LayoutChangeEvent) => {
    const v = Math.ceil(e.nativeEvent.layout.height);
    setMeasured((m) => (v !== m.menu ? { ...m, menu: v } : m));
  };
  const sizes: SheetSizes = useMemo(
    () => ({ ...measured, menu: measured.menu || menuHeight(screenW), bottomInset, topInset, screenH }),
    [measured, screenW, bottomInset, topInset, screenH],
  );
  const h = useMemo(() => detentHeights(sizes), [sizes]);
  const rest = restDetent(sizes, headerBottom ?? topInset + 150, hasHabits);
  const menuPlace: Detent = hasHabits ? 'menu' : 'emptyMenu';
  // The menu's own window: when the menu doesn't fit under the top limit it scrolls inside.
  const menuTop = SHEET_TOP + GRAB + (hasHabits ? sizes.status + sizes.days + GAP : sizes.empty + PEEK_PAD + GAP);
  const menuSlot = Math.max(0, h[menuPlace] - bottomInset - menuTop);
  const scrollable = sizes.menu > menuSlot + 1;

  useEffect(() => {
    onRest(screenH - h[rest]);
  }, [screenH, h, rest, onRest]);

  const scroll = useAnimatedRef<Animated.ScrollView>();
  const forestGlyph = useRef<ComponentRef<typeof View>>(null);
  const menuContent = useRef<ComponentRef<typeof View>>(null);
  /** Where the menu block starts inside the sheet (it may move when the last habit goes). */
  const menuY = useRef(menuTop);
  const onMenuBlockLayout = (e: LayoutChangeEvent) => {
    menuY.current = e.nativeEvent.layout.y;
  };

  // ---- Shared state for the worklets ----
  const heights = useSharedValue(h);
  const habitsOn = useSharedValue(hasHabits);
  const moving = useSharedValue(animations);
  const canScroll = useSharedValue(scrollable);
  const menuStart = useSharedValue(menuTop);
  const maxScroll = useSharedValue(Math.max(0, sizes.menu - menuSlot));
  /** How far the menu is scrolled. The sheet's drag scrolls it (one gesture for both, spec 1.5). */
  const scrollPos = useSharedValue(0);
  /** The menu still glides after a flick; a touch that stops it is not a tap. */
  const gliding = useSharedValue(false);
  const caught = useSharedValue(false);
  const cur = useSharedValue<Detent>(rest);
  const [detent, setDetent] = useState<Detent>(rest);
  const detentRef = useRef(detent);
  detentRef.current = detent;
  const restRef = useRef(rest);

  // ---- Settling: feedback, the hint flag, the parent ----
  const settledRef = useRef<(from: Detent, to: Detent, quiet: boolean) => void>(() => {});
  settledRef.current = (from, to, quiet) => {
    setDetent(to);
    onDetent?.(to);
    if (!quiet && from !== to) cue(isMenu(to) ? 'menuOpen' : isMenu(from) ? 'menuClose' : 'detent');
    if (isMenu(to) && !settings.menuHintSeen) updateSettings({ menuHintSeen: true });
    if (!isMenu(to)) {
      cancelAnimation(scrollPos);
      scrollPos.value = 0;
    }
  };
  const settled = useCallback((from: Detent, to: Detent, quiet: boolean) => settledRef.current(from, to, quiet), []);

  /** Spring (or, without animations, a 120 ms glide) to a place. Runs on either thread. */
  const moveTo = useCallback(
    (target: Detent, velocity: number, from: Detent, quiet: boolean, instant = false) => {
      'worklet';
      const to = heights.value[target];
      cur.value = target;
      if (instant) {
        cancelAnimation(visible);
        visible.value = to;
        scheduleOnRN(settled, from, target, quiet);
        return;
      }
      const done = (finished?: boolean) => {
        'worklet';
        if (finished) scheduleOnRN(settled, from, target, quiet);
      };
      visible.value = moving.value
        ? withSpring(to, { ...motion.spring.sheet, velocity, energyThreshold: 1e-4 }, done)
        : withTiming(to, { duration: motion.still, easing: motion.ease.out }, done);
    },
    [heights, cur, visible, moving, settled],
  );

  // Sizes, the list of places or the rest place changed: stay in the same place.
  useLayoutEffect(() => {
    heights.value = h;
    habitsOn.value = hasHabits;
    moving.value = animations;
    canScroll.value = scrollable;
    menuStart.value = menuTop;
    maxScroll.value = scrollable ? Math.max(0, sizes.menu - menuSlot) : 0;
    if (scrollPos.value > maxScroll.value) scrollPos.value = maxScroll.value;
    const was = cur.value;
    const wasRest = restRef.current;
    restRef.current = rest;
    const place = was === wasRest ? rest : sameDetent(was, hasHabits, rest);
    if (place !== was || Math.abs(visible.value - h[place]) > 0.5) {
      // Only the very first layout and a new screen size jump; the rest moves.
      const first = visible.value === 0;
      moveTo(place, 0, was, true, first || !animations);
    }
    // Shared values are stable; moveTo is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, hasHabits, rest, animations, scrollable, menuTop, menuSlot, sizes.menu]);

  // ---- Progress values for the scrim, the header and the blocks ----
  useAnimatedReaction(
    () => {
      const hh = heights.value;
      return habitsOn.value ? progress(visible.value, hh.normal, hh.menu) : progress(visible.value, hh.empty, hh.emptyMenu);
    },
    (pm) => progressMenu.set(pm),
  );

  // ---- Gesture ----
  // The menu scrolls by the sheet's own drag, not by a native scroll view: one gesture
  // decides what moves, so the grabber and the status always pull the sheet, and a pull
  // down on the menu scrolls it back to the top first, then pulls the sheet (spec 1.5).
  // In a browser a native scroller would also take the touch away from the sheet.
  useAnimatedReaction(
    () => scrollPos.value,
    (y, before) => {
      if (y !== before) scrollTo(scroll, 0, y, false);
    },
  );
  // A touch that pulled the sheet or scrolled the menu is not also a tap on what it
  // started on (in a browser the pressable under the finger still gets its click).
  // Cleared on the next touch.
  const dragged = useRef(false);
  const canPress = useCallback(() => !dragged.current && !caught.value, [caught]);
  const dragStartRef = useRef<() => void>(() => {});
  const dragEndRef = useRef<() => void>(() => {});
  const dragStart = useCallback(() => dragStartRef.current(), []);
  const dragEnd = useCallback(() => dragEndRef.current(), []);
  const startV = useSharedValue(0);
  const startD = useSharedValue<Detent>(rest);
  const startY = useSharedValue(0);
  const mode = useSharedValue(DRAG.none);
  const offset = useSharedValue(0);
  const lastY = useSharedValue(0);
  // Our own finger speed (px/s, down is plus): in a browser a drag that starts on a
  // pressable of the menu ends with no speed from the gesture.
  const speed = useSharedValue({ v: 0, y: 0, t: 0 });
  const track = (y: number) => {
    'worklet';
    const now = Date.now();
    const s = speed.value;
    const dt = now - s.t;
    if (dt <= 0) return;
    const v = ((y - s.y) / dt) * 1000;
    speed.value = { v: dt > 100 ? v : 0.6 * v + 0.4 * s.v, y, t: now };
  };
  const releaseSpeed = (gesture: number) => {
    'worklet';
    if (gesture !== 0) return gesture;
    const s = speed.value;
    return Date.now() - s.t > 100 ? 0 : s.v;
  };
  /** From here on the finger pulls the sheet, from where it is now. */
  const grabSheet = (translationY: number) => {
    'worklet';
    mode.value = DRAG.sheet;
    cancelAnimation(visible);
    startV.value = visible.value;
    offset.value = translationY;
  };
  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    failOffsetX: [-16, 16],
    enabled: !disabled && !locking,
    onBegin: (e) => {
      'worklet';
      startY.value = e.y;
      // Like a scroll view: a finger on a gliding menu stops it, and that touch opens nothing.
      caught.value = gliding.value;
      if (gliding.value) {
        cancelAnimation(scrollPos);
        gliding.value = false;
      }
    },
    onActivate: (e) => {
      'worklet';
      startD.value = cur.value;
      speed.value = { v: 0, y: e.translationY, t: Date.now() };
      scheduleOnRN(dragStart);
      // Only a touch that starts on a menu that doesn't fit scrolls it.
      if (canScroll.value && isMenu(cur.value) && startY.value >= menuStart.value) {
        mode.value = DRAG.scroll;
        cancelAnimation(scrollPos);
        lastY.value = e.translationY;
      } else {
        grabSheet(e.translationY);
      }
    },
    onUpdate: (e) => {
      'worklet';
      track(e.translationY);
      if (mode.value === DRAG.scroll) {
        const next = scrollPos.value - (e.translationY - lastY.value);
        lastY.value = e.translationY;
        if (next >= 0) {
          scrollPos.value = Math.min(next, maxScroll.value);
          return;
        }
        // Back at the top: the rest of the pull goes to the sheet.
        scrollPos.value = 0;
        grabSheet(e.translationY + next);
      }
      if (mode.value !== DRAG.sheet) return;
      const list = detentList(habitsOn.value);
      const hh = heights.value;
      visible.value = dragVisible(startV.value - (e.translationY - offset.value), hh[list[0]], hh[list[list.length - 1]]);
    },
    onDeactivate: (e) => {
      'worklet';
      const was = mode.value;
      mode.value = DRAG.none;
      scheduleOnRN(dragEnd);
      const velocityY = releaseSpeed(e.velocityY);
      if (was === DRAG.scroll) {
        // The menu glides on a little after a flick, like a scroll view.
        gliding.value = true;
        scrollPos.value = withDecay({ velocity: -velocityY, clamp: [0, maxScroll.value] }, () => {
          gliding.value = false;
        });
        return;
      }
      if (was !== DRAG.sheet) return;
      const list = detentList(habitsOn.value);
      const vy = -velocityY;
      moveTo(pickDetent(visible.value, vy, startD.value, list, heights.value), vy, startD.value, false);
    },
  });

  // ---- Looks ----
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: screenH - visible.value }] }));
  const daysStyle = useAnimatedStyle(() => {
    const hh = heights.value;
    const pn = progress(visible.value, hh.peek, hh.normal);
    return { opacity: Math.min(Math.max((pn - 0.3) / 0.7, 0), 1) };
  });
  const menuStyle = useAnimatedStyle(() => {
    const o = Math.min(Math.max((progressMenu.value - 0.3) / 0.7, 0), 1);
    return { opacity: o, transform: [{ translateY: 12 * (1 - o) }] };
  });
  // The fades show only where there is more menu to scroll to.
  const fadeTopStyle = useAnimatedStyle(() => ({ opacity: Math.min(scrollPos.value / FADE, 1) }));
  const fadeBottomStyle = useAnimatedStyle(() => ({ opacity: Math.min(Math.max(maxScroll.value - scrollPos.value, 0) / FADE, 1) }));

  // ---- Grabber, navigation ----
  const snapTo = useCallback(
    (place: Detent | 'rest', o: { instant?: boolean; quiet?: boolean } = {}) => {
      const target = place === 'rest' ? restRef.current : sameDetent(place, habitsOn.value, restRef.current);
      moveTo(target, 0, cur.value, !!o.quiet, !!o.instant);
    },
    [moveTo, habitsOn, cur],
  );
  const onGrabber = () => {
    if (disabled || locking || !canPress()) return;
    snapTo(tapTarget(cur.value, restRef.current));
  };
  const navTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onOpen = (target: MenuTarget) => {
    if (!canPress()) return;
    if (target === 'quests') {
      // Not another screen: the quest sheet comes up over this one as the menu goes down.
      snapTo('rest', { quiet: true });
      onQuests();
      return;
    }
    if (target === 'forest') {
      router.push(forestHighlight ? { pathname: '/forest', params: { highlight: forestHighlight } } : '/forest');
    } else {
      router.push(ROUTES[target]);
    }
    // The new screen covers this one by now: come back to a clean main screen.
    clearTimeout(navTimer.current);
    navTimer.current = setTimeout(() => snapTo('rest', { instant: true, quiet: true }), 300);
  };
  useEffect(() => () => clearTimeout(navTimer.current), []);

  // ---- First-run hint (spec 1.6) ----
  const [hint, setHint] = useState(false);
  const hintTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shownThisVisit = useRef(false);
  const hintWanted = !settings.menuHintSeen && hasHabits && focused && !disabled && !locking && detent === rest && hintShows < HINT.shows;
  const hintWantedRef = useRef(hintWanted);
  hintWantedRef.current = hintWanted;
  const clearHint = () => {
    hintTimers.current.forEach(clearTimeout);
    hintTimers.current = [];
  };
  const bounce = () => {
    if (!animations) return;
    const v = heights.value[cur.value];
    const up = withTiming(v + HINT.jump, { duration: 180, easing: motion.ease.out });
    const down = withSpring(v, motion.spring.pop);
    visible.value = withSequence(up, down, withDelay(250, withTiming(v + HINT.jump, { duration: 180, easing: motion.ease.out })), withSpring(v, motion.spring.pop));
  };
  const armHint = () => {
    clearHint();
    if (!hintWantedRef.current || shownThisVisit.current) return;
    hintTimers.current.push(
      setTimeout(() => {
        if (!hintWantedRef.current) return;
        shownThisVisit.current = true;
        hintShows += 1;
        bounce();
        setHint(true);
        hintTimers.current.push(
          setTimeout(() => {
            setHint(false);
            // Shown in full once: that is enough, it never comes back.
            updateSettings({ menuHintSeen: true });
          }, HINT.stay),
        );
      }, HINT.idle),
    );
  };
  const armRef = useRef(armHint);
  armRef.current = armHint;
  useEffect(() => {
    if (hintWanted) armRef.current();
    else {
      clearHint();
      setHint(false);
    }
  }, [hintWanted]);
  // Coming back to the main screen is a new visit: the hint may show once more.
  useEffect(() => {
    if (!focused) shownThisVisit.current = false;
  }, [focused]);
  useEffect(() => clearHint, []);
  // A drag is not "quiet": the hint waits until the finger is off, then counts again.
  dragStartRef.current = () => {
    dragged.current = true;
    clearHint();
    setHint(false);
  };
  dragEndRef.current = () => armRef.current();

  useImperativeHandle(
    ref,
    () => ({
      snapTo,
      touched: () => {
        dragged.current = false;
        if (hint) {
          setHint(false);
          if (hintShows >= HINT.shows) updateSettings({ menuHintSeen: true });
        }
        armRef.current();
      },
      // Inside the still menu nothing moves, so one measure there plus the menu block's
      // place in the sheet gives where the glyph will be, wherever the sheet is now.
      measureForest: () =>
        new Promise((resolve) => {
          const glyph = forestGlyph.current;
          const content = menuContent.current;
          if (!glyph || !content) return resolve(null);
          glyph.measureLayout(
            content,
            (x, y, w, gh) => resolve({ x: x + w / 2, dy: menuY.current + y + gh / 2 - scrollPos.value }),
            () => resolve(null),
          );
        }),
      menuTop: () => screenH - h[menuPlace],
    }),
    [snapTo, hint, updateSettings, scrollPos, screenH, h, menuPlace],
  );

  const up = isMenu(detent);
  // One dot beside the grabber while the menu is closed and something waits in it (spec 4.3):
  // red when something can be claimed, calm for news alone.
  const news = useMenuNews();

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.wrap, styles.noSelect, { height: screenH }, sheetStyle]}>
        <SheetSurface style={styles.surface}>
          <Pressable
            onPress={onGrabber}
            hitSlop={{ top: 12, bottom: 12 }}
            accessibilityRole="button"
            accessibilityLabel={up ? t('closeMenu') : t('openMenu')}
            accessibilityState={{ expanded: up }}
            style={styles.grabber}
          >
            <Grabber progress={progressMenu} />
          </Pressable>
          {news.any && <GrabberDot claim={news.claim} animations={animations} progressMenu={progressMenu} />}

          {tree ? (
            <>
              <View style={{ minHeight: sizes.status }} onLayout={grow('status')}>
                {shared ? shared.status : <SheetStatus tree={tree} locking={locking} animations={animations} />}
              </View>
              <Animated.View
                style={[{ minHeight: sizes.days }, daysStyle]}
                onLayout={grow('days')}
                pointerEvents={detent === 'peek' ? 'none' : 'auto'}
                accessibilityElementsHidden={detent === 'peek'}
                importantForAccessibility={detent === 'peek' ? 'no-hide-descendants' : 'auto'}
              >
                <View style={styles.days}>
                  {shared ? shared.days : <DayStrip tree={tree} />}
                </View>
                {shared ? (
                  shared.link
                ) : isGrowing(tree) && !locking ? (
                  <Pressable onPress={() => canPress() && onLockIn(tree)} hitSlop={6} accessibilityRole="button" style={styles.lockRow}>
                    <Glyph name="plaque" size={16} />
                    <Txt variant="small" color={c.textSoft} style={styles.lockText}>{t('lockIn')}</Txt>
                  </Pressable>
                ) : (
                  <View style={styles.lockRow} />
                )}
              </Animated.View>
            </>
          ) : (
            <View style={{ minHeight: sizes.empty }} onLayout={grow('empty')}>
              <EmptyBlock allDone={allDone} />
            </View>
          )}
          <View style={{ height: hasHabits ? GAP : PEEK_PAD + GAP }} />

          <Animated.View
            style={[scrollable ? { height: menuSlot } : null, menuStyle]}
            onLayout={onMenuBlockLayout}
            pointerEvents={up ? 'auto' : 'none'}
            accessibilityElementsHidden={!up}
            importantForAccessibility={up ? 'auto' : 'no-hide-descendants'}
          >
            {/* Scrolled only by the sheet's drag (see the gesture above). */}
            <Animated.ScrollView ref={scroll} scrollEnabled={false} bounces={false} overScrollMode="never" showsVerticalScrollIndicator={false}>
              <View ref={menuContent} onLayout={onMenuLayout}>
                <MenuGrid
                  forestCount={forestCount}
                  landing={landing}
                  animations={animations}
                  forestGlyph={forestGlyph}
                  canPress={canPress}
                  onOpen={onOpen}
                />
              </View>
            </Animated.ScrollView>
            {scrollable && (
              <>
                <Animated.View pointerEvents="none" style={[styles.fadeTop, fadeTopStyle]}>
                  <Fade id="sheetFadeTop" width={screenW} color={c.sheet} down={false} />
                </Animated.View>
                <Animated.View pointerEvents="none" style={[styles.fadeBottom, fadeBottomStyle]}>
                  <Fade id="sheetFadeBottom" width={screenW} color={c.sheet} down />
                </Animated.View>
              </>
            )}
          </Animated.View>
        </SheetSurface>

        <MenuHint visible={hint} animations={animations} />
      </Animated.View>
    </GestureDetector>
  );
}

/** Where the menu's cards lead (wave 5 spec 4.4); "My forest" and "Quests" are handled above. */
const ROUTES = { new: '/new', settings: '/settings', shop: '/shop', profile: '/profile', friends: '/friends', leaders: '/leaders' } as const;

/** The grabber's dot: 9 px (red, or calm gold) in a 2 px rim, 30 px right of the grabber's middle, level with its top. */
function GrabberDot({ claim, animations, progressMenu }: { claim: boolean; animations: boolean; progressMenu: SharedValue<number> }) {
  const { night } = useStore();
  const c = colorsFor(night);
  const scale = useSharedValue(animations ? 0 : 1);
  useEffect(() => {
    if (animations) scale.set(withSpring(1, motion.spring.pop));
    // Once, when it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The menu coming up shows what the dot was about: the dot goes as the menu comes.
  const style = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, progressMenu.get() * 2), transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View
      pointerEvents="none"
      exiting={FadeOut.duration(motion.fast)}
      style={[styles.grabberDot, { backgroundColor: claim ? c.badge : newsDotColor(night), borderColor: c.sheet }, style]}
    />
  );
}

/** 16 px from the sheet's color to clear: over the bottom edge of the menu window (`down`) or under its top edge. */
function Fade({ id, width, color, down }: { id: string; width: number; color: string; down: boolean }) {
  return (
    <Svg width={width} height={FADE}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={down ? 0 : 1} />
          <Stop offset="1" stopColor={color} stopOpacity={down ? 1 : 0} />
        </LinearGradient>
      </Defs>
      <SvgRect x={0} y={0} width={width} height={FADE} fill={`url(#${id})`} />
    </Svg>
  );
}

/** No habit on the meadow: an invitation to plant (spec 6, «Пусто» / «Все закреплены»). */
function EmptyBlock({ allDone }: { allDone: boolean }) {
  const { t, night } = useStore();
  const c = colorsFor(night);
  return (
    <View style={styles.empty}>
      <Txt variant="title2" style={styles.center} numberOfLines={2}>{allDone ? t('allDoneTitle') : t('emptyTitle')}</Txt>
      <Txt variant="small" color={c.textSoft} style={styles.center} numberOfLines={3}>{allDone ? t('allDoneText') : t('emptyText')}</Txt>
      <Button title={t('plant')} variant="primary" size="l" glyph="seed" onPress={() => router.push('/new')} style={styles.plant} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0 },
  surface: { flex: 1, paddingTop: SHEET_TOP },
  grabber: { height: GRAB, alignItems: 'center', justifyContent: 'center' },
  // The grabber's bars are 5 tall in the middle of their 20 px row: their top is 7.5 down.
  grabberDot: { position: 'absolute', top: SHEET_TOP + 7.5 - 6.5, left: '50%', marginLeft: 30 - 6.5, width: 13, height: 13, borderRadius: 6.5, borderWidth: 2 },
  days: { paddingTop: 4 },
  lockRow: { height: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: 12 },
  lockText: { fontFamily: fonts.bold },
  fadeTop: { position: 'absolute', left: 0, top: 0 },
  fadeBottom: { position: 'absolute', left: 0, bottom: 0 },
  // In a browser a drag must not select the texts it passes over.
  noSelect: (Platform.OS === 'web' ? { userSelect: 'none' } : {}) as ViewStyle,
  empty: { alignItems: 'center', gap: 4, paddingHorizontal: 20, paddingTop: 2 },
  center: { textAlign: 'center' },
  plant: { alignSelf: 'stretch', marginTop: 8 },
});
