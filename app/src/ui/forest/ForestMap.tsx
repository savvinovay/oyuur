// The forest map (wave 3 spec, sections 1–5, 7–9): the fenced plot on the meadow, full
// screen, scrolled in every direction and pinched closer. Layers from the bottom: one Skia
// canvas with the ground (ForestGround), the tree pictures in one moving "world"
// (MapTrees), the markers (MapMarkers). The camera, the gestures and every tree's motion
// live on the UI thread; React re-renders only when something starts or ends: a tree is
// lifted or lands, the target cell changes, the camera has gone far enough to mount other trees.
// The screen owns the data: the map reports a move (onMoveEnd) and the screen saves it.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, LayoutChangeEvent, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import {
  GestureDetector, useCompetingGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture,
} from 'react-native-gesture-handler';
import { useIsFocused } from 'expo-router';
import {
  Easing, FrameInfo, useAnimatedReaction, useDerivedValue, useFrameCallback, useSharedValue, withDelay, withSequence,
  withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Transforms3d } from '@shopify/react-native-skia';
import { scheduleOnRN } from 'react-native-worklets';
import { Cell, freeCells, occupant } from '@/game/plot';
import { useStore } from '@/state/store';
import { motion } from '@/ui/ds/tokens';
import { cue } from '@/ui/feedback';
import { dark, light } from '@/ui/theme';
import { themes } from './colors';
import type { ForestMapHandle, ForestMapProps, MoveResult } from './contract';
import { Dust, ForestGround, Target } from './ForestGround';
import { freeCellRings, GroundTree } from './ground';
import { backOnPlot, Cam, cellAt, cellCenter, cellUnder, flyDuration, focusCam, toScreen, toWorld, Z_MAX } from './iso';
import { badgeHideZoom } from './badges';
import { MapMarkers } from './MapMarkers';
import { MapTrees } from './MapTrees';
import { FEET_Y, mapItems, MapItem, Motions, THUMB_W, treeLabel } from './model';
import { DragFollower, Finger, FINGER_GAP } from './MoveLayer';
import { useIntro } from './useIntro';
import { useMapCamera } from './useMapCamera';

/** The folded sheet without the bottom inset (spec 6): the map is laid out over it. */
const PEEK = 80;
/** Long press that lifts a tree, and when it starts to stretch (4.2). */
const LIFT_MS = 350;
const STRETCH_AT = 200;
/** Lifted: this much bigger and higher, world px (4.2; raised after the check: it has to feel picked up). */
const LIFT_SCALE = 1.15;
const LIFT_UP = 28;
/** A tree on the target cell squats: "we'll swap" (4.3). */
const SWAP_SQUAT = 0.92;
/** Trees in front of the selected one, covering it, fade while it is selected. */
const COVER_ALPHA = 0.35;
const COVER_MS = 200;
/** The dotted hole of an empty plot answers taps on at least this square around it, screen px (spec 7). */
const PLANT_HIT = 44;
/** Taps on empty ground wait this long for a second tap (2.7). */
const DOUBLE_TAP_WAIT = 250;
const DOUBLE_TAP_MS = 360;
const FIT_MS = 520;
/** Flights of a tree from cell to cell (4.5, 4.7) and their arcs, world px. */
const HOP_MS = 420;
const SWAP_ARC = 28;
const CHOOSE_ARC = 36;
const SWAP_DELAY = 60;
/** A flown tree touches the ground this long after the drop. */
const TOUCH_MS = 150;
/** Mounted trees: the picture is within this far of the screen (spec 8). */
const MOUNT_MARGIN = 200;
/** A mounted tree stays until it is this far out: panning to and fro does not remount it. */
const KEEP_MARGIN = 600;
/** New trees mount at most this many a frame, the nearest first: a zoom in on 200 trees is no freeze. */
const MOUNT_STEP = 24;
const CROWD = 200;
/** A tapped tree is brought into view once the card has risen. */
const REVEAL_WAIT = 300;
/**
 * After a drop or a delete the sheet (and the toast) settle by then: the camera comes back over
 * the plot if it was left at its side, and brings a moved tree out from under the card.
 */
const SETTLE_WAIT = 700;
/** The toast over the sheet: 48 px and 12 above it, and a little air. */
const TOAST_ROOM = 68;
const EDGE_PAD = 8;
/** The phone-wide column of the app in a desktop browser (app/_layout). */
const WEB_MAX_W = 460;

/** `front` hides part of `back`: their crowns (narrowed to 70 %, as for taps) overlap. */
function covers(front: MapItem, back: MapItem): boolean {
  return (
    Math.abs(front.x - back.x) < 0.35 * (front.w + back.w) &&
    front.y - front.h < back.y &&
    front.y > back.y - back.h
  );
}

type MoveKind = 'drag' | 'choose';

export const ForestMap = forwardRef<ForestMapHandle, ForestMapProps>(function ForestMap(props, ref) {
  const { habits, plot, today, night, animations, areaTop, sheetVisible, selected, highlight, fresh, grewFrom } = props;
  const readOnly = props.readOnly ?? false;
  const { t, shop } = useStore();
  const palette = night ? dark : light;
  // The plot wears the meadow the player has put on (wave 5 spec, 10.4).
  const plotTheme = themes[props.meadow && props.meadow in themes ? props.meadow : shop.meadow];
  // The map fills its parent; in a desktop browser the app is a phone-wide column (app/_layout).
  const win = useWindowDimensions();
  const [{ width, height }, setBox] = useState(() => ({ width: Platform.OS === 'web' ? Math.min(win.width, WEB_MAX_W) : win.width, height: win.height }));
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBox((b) => (Math.abs(b.width - w) < 0.5 && Math.abs(b.height - h) < 0.5 ? b : { width: w, height: h }));
  }, []);
  const insets = useSafeAreaInsets();
  const latest = useRef(props);
  latest.current = props;
  const size = plot.size;

  // Every timer of the map, so none fires after the map is gone. Timers of one tree's flight
  // are kept apart: a new flight of the same tree (undo during a move) clears the old ones.
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const treeTimers = useRef(new Map<string, Set<ReturnType<typeof setTimeout>>>());
  const later = useCallback((ms: number, fn: () => void, id?: string) => {
    const handle = setTimeout(() => {
      timers.current.delete(handle);
      if (id) treeTimers.current.get(id)?.delete(handle);
      fn();
    }, ms);
    timers.current.add(handle);
    if (id) {
      let own = treeTimers.current.get(id);
      if (!own) treeTimers.current.set(id, (own = new Set()));
      own.add(handle);
    }
  }, []);
  const clearTree = (id: string) => {
    const own = treeTimers.current.get(id);
    if (!own) return;
    for (const handle of own) {
      clearTimeout(handle);
      timers.current.delete(handle);
    }
    own.clear();
  };
  useEffect(() => () => {
    for (const handle of timers.current) clearTimeout(handle);
    timers.current.clear();
    treeTimers.current.clear();
  }, []);

  const waiting = props.waiting;
  const items = useMemo(() => mapItems(habits, plot, today, waiting), [habits, plot, today, waiting]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const plotRef = useRef(plot);
  plotRef.current = plot;

  // New trees wait in the ground for their sprout.
  const freshSet = useMemo(() => new Set(fresh), [fresh]);
  const [motions] = useState(() => {
    const m = new Motions();
    for (const item of items) if (freshSet.has(item.id)) m.get(item.id, item, animations ? 'sprout' : 'fade');
    return m;
  });

  // ---------- Camera ----------
  const onFitChange = useCallback((atFit: boolean) => latest.current.onFitChange(atFit), []);
  const cam = useMapCamera({
    size, width, height, areaTop, sheetVisible, restSheet: PEEK + insets.bottom, animations, onFitChange,
  });
  const { cx, cy, z, view, anchorY, stop, current, set, rubberMap, release, clampMap, coasting } = cam;
  // A finger on the map: it pans, pinches or drives the map. The camera is the person's then.
  const panning = useSharedValue(false);
  const pinching = useSharedValue(false);
  const dragCam = useSharedValue(false);
  const handsOn = () => panning.value || pinching.value || dragCam.value;

  // One clock for the drops, clouds and fireflies; it stands still without animations and
  // while another screen covers the forest. It adds up frame times: a callback registered
  // again (or paused and resumed) never sends it back to 0, so nothing jumps.
  const clock = useSharedValue(0);
  const focused = useIsFocused();
  const tick = useCallback((frame: FrameInfo) => {
    'worklet';
    clock.value += Math.min(0.1, (frame.timeSincePreviousFrame ?? 0) / 1000);
  }, [clock]);
  const ticking = animations && focused;
  const ticker = useFrameCallback(tick, ticking);
  useEffect(() => {
    ticker.setActive(ticking);
  }, [ticking, ticker]);

  const matrix = useDerivedValue<Transforms3d>(() => [
    { translateX: width / 2 - cx.value * z.value },
    { translateY: anchorY - cy.value * z.value },
    { scale: z.value },
  ]);

  // The drawn side of the plot: fractional while it grows (5.3).
  const growing = grewFrom !== null && grewFrom < size && animations;
  const grow = useSharedValue(growing ? grewFrom : size);

  // ---------- Trees in motion ----------
  // Trees whose position the map animates itself: a new place from the screen must not snap them.
  const flying = useRef(new Set<string>());
  const [moving, setMoving] = useState<string[]>([]);
  const [move, setMove] = useState<{ id: string; kind: MoveKind } | null>(null);
  const moveRef = useRef(move);
  moveRef.current = move;
  const ghost = useRef<string>('');

  // Pictures stand on their cells; a new place (moved, undone, grown plot) puts them there at once.
  useLayoutEffect(() => {
    for (const item of items) {
      const m = motions.get(item.id, item);
      if (flying.current.has(item.id)) continue;
      if (m.px.value !== item.x) m.px.value = item.x;
      if (m.py.value !== item.y) m.py.value = item.y;
    }
  }, [items, motions]);

  // A deleted tree dissolves (3.3): its picture stays a moment, fading and shrinking.
  const prevItems = useRef(items);
  const [leaving, setLeaving] = useState<MapItem[]>([]);
  useLayoutEffect(() => {
    const now = new Set(items.map((i) => i.id));
    const gone = prevItems.current.filter((i) => !now.has(i.id));
    prevItems.current = items;
    if (gone.length === 0) return;
    for (const item of gone) {
      const m = motions.get(item.id, item);
      const fade = { duration: animations ? motion.base : motion.still };
      m.alpha.value = withTiming(0, fade);
      if (animations) {
        m.sx.value = withTiming(0.9, fade);
        m.sy.value = withTiming(0.9, fade);
      }
    }
    setLeaving((list) => [...list, ...gone]);
    // Not cleared on the next change: every gone tree must leave the list.
    later(motion.base + 60, () => setLeaving((list) => list.filter((i) => !gone.includes(i))));
    // The card goes with the deleted tree: a camera left close in at the plot's side comes back.
    later(SETTLE_WAIT, () => handlersRef.current.settle(null));
  }, [items, motions, animations, later]);

  const setFlying = (ids: string[], on: boolean) => {
    for (const id of ids) {
      if (on) flying.current.add(id);
      else flying.current.delete(id);
    }
    setMoving([...flying.current]);
  };

  // ---------- Hit testing (UI thread and JS) ----------
  const hits = useSharedValue<{ id: string; x: number; y: number; w: number; h: number }[]>([]);
  const occ = useSharedValue<Record<string, string>>({});
  useEffect(() => {
    hits.value = [...items].reverse().map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
    const cells: Record<string, string> = {};
    for (const i of items) cells[`${i.cell.c},${i.cell.r}`] = i.id;
    occ.value = cells;
  }, [items, hits, occ]);
  const plotSize = cam.plotSize;

  /** The tree under a screen point (2.7): front to back, the crown narrowed to 70 %, never under 44×44 at the feet; then the cell. */
  const hitAt = useCallback((sx: number, sy: number): string => {
    'worklet';
    const camNow = { x: cx.value, y: cy.value, z: z.value };
    const p = toWorld(sx, sy, camNow, view);
    const half = 22 / camNow.z;
    const list = hits.value;
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      const dx = Math.max(0.35 * h.w, half);
      if (p.x >= h.x - dx && p.x <= h.x + dx && p.y >= h.y - Math.max(h.h, half) && p.y <= h.y + half) return h.id;
    }
    const cell = cellAt(p.x, p.y, plotSize.value);
    return cell ? (occ.value[`${cell.c},${cell.r}`] ?? '') : '';
  }, [cx, cy, z, view, hits, occ, plotSize]);

  // ---------- Effects in the ground ----------
  const [dust, setDust] = useState<Dust[]>([]);
  const dustKey = useRef(0);
  const addDust = (x: number, y: number, count: number) => {
    if (!animations) return;
    const key = ++dustKey.current;
    setDust((list) => [...list, { key, x, y, count }]);
  };
  const onDustDone = useCallback((key: number) => setDust((list) => list.filter((d) => d.key !== key)), []);
  const [gold, setGold] = useState<{ key: string; x: number; y: number; w: number; h: number } | null>(null);
  const target = useSharedValue<Target>({ c: 0, r: 0, kind: 0 });
  const wave = useSharedValue(0);

  // ---------- Mounted trees ----------
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const [marked, setMarked] = useState<Set<string>>(() => new Set());
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const moreFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(moreFrame.current), []);
  const recompute = useCallback(() => {
    cancelAnimationFrame(moreFrame.current);
    const camNow: Cam = { x: cx.value, y: cy.value, z: z.value };
    const near = (i: MapItem, margin: number) => {
      const a = toWorld(-margin, -margin, camNow, view);
      const b = toWorld(width + margin, height + margin, camNow, view);
      return i.x + THUMB_W / 2 > a.x && i.x - THUMB_W / 2 < b.x && i.y + 8 > a.y && i.y - FEET_Y < b.y;
    };
    const prev = shownRef.current;
    const next = new Set<string>();
    const wanted: MapItem[] = [];
    // Markers (drops bob every frame) only over trees near the screen, not over every kept one.
    const marks = new Set<string>();
    for (const i of itemsRef.current) {
      const close = near(i, MOUNT_MARGIN);
      if (close) marks.add(i.id);
      if (prev.has(i.id) ? close || near(i, KEEP_MARGIN) : close) {
        if (prev.has(i.id)) next.add(i.id);
        else wanted.push(i);
      }
    }
    setMarked((was) => (was.size === marks.size && [...marks].every((id) => was.has(id)) ? was : marks));
    // The newcomers nearest the middle of the screen first; the rest in the next frames.
    const mid = toWorld(width / 2, (view.top + view.bottom) / 2, camNow, view);
    wanted.sort((p, q) => Math.hypot(p.x - mid.x, p.y - mid.y) - Math.hypot(q.x - mid.x, q.y - mid.y));
    for (const i of wanted.slice(0, MOUNT_STEP)) next.add(i.id);
    if (wanted.length > MOUNT_STEP) moreFrame.current = requestAnimationFrame(() => recomputeRef.current());
    for (const id of flying.current) next.add(id);
    const same = prev.size === next.size && [...next].every((id) => prev.has(id));
    if (!same) {
      shownRef.current = next;
      setShown(next);
    }
  }, [cx, cy, z, view, width, height]);
  const recomputeRef = useRef(recompute);
  recomputeRef.current = recompute;
  // Again when the camera has gone 200 px or zoomed a step, at most every 150 ms, and once it stops.
  const trailing = useRef<ReturnType<typeof setTimeout>>(undefined);
  const lastRecompute = useRef(0);
  const requestRecompute = useCallback(() => {
    clearTimeout(trailing.current);
    const now = Date.now();
    if (now - lastRecompute.current >= 150) {
      lastRecompute.current = now;
      recompute();
    }
    trailing.current = setTimeout(recompute, 160);
  }, [recompute]);
  useEffect(() => () => clearTimeout(trailing.current), []);
  const lastCam = useSharedValue({ x: 0, y: 0, z: 1 });
  useAnimatedReaction(
    () => ({ x: cx.value, y: cy.value, z: z.value }),
    (now) => {
      const was = lastCam.value;
      const far = Math.abs(now.x - was.x) * now.z > 40 || Math.abs(now.y - was.y) * now.z > 40 || Math.abs(now.z / was.z - 1) > 0.05;
      if (!far) return;
      lastCam.value = now;
      scheduleOnRN(requestRecompute);
    },
    [requestRecompute],
  );
  useEffect(() => {
    recompute();
  }, [items, recompute]);

  // ---------- Tree animations ----------
  const spring = (to: number, config: { damping: number; stiffness: number; mass: number }) =>
    animations ? withSpring(to, config) : to;

  /** A new tree sprouts from its hole (5.2); `badge` — and gets "new" over it. */
  const sprout = useCallback((id: string, delay: number, badge: boolean) => {
    const item = byIdRef.current.get(id);
    if (!item) return;
    const m = motions.get(id, item);
    if (!animations) {
      m.sx.value = 1;
      m.sy.value = 1;
      m.alpha.value = 0;
      m.alpha.value = withTiming(1, { duration: 200 });
      if (badge) m.badge.value = 1;
      return;
    }
    m.alpha.value = 1;
    m.sy.value = 0;
    m.sx.value = 0.9;
    m.sy.value = withDelay(delay, withSpring(1, motion.spring.pop));
    m.sx.value = withDelay(delay, withSequence(withTiming(1.12, { duration: 220, easing: motion.ease.out }), withSpring(1, motion.spring.pop)));
    later(delay + 120, () => addDust(item.x, item.y, 5));
    if (badge) m.badge.value = withDelay(delay + 380, withSpring(1, motion.spring.pop));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animations, motions]);

  const stand = useCallback((id: string) => {
    const m = motions.get(id);
    m.sx.value = 1;
    m.sy.value = 1;
    m.alpha.value = 1;
    m.badge.value = 1;
  }, [motions]);

  const showGold = useCallback((item: MapItem) => {
    setGold({ key: `${item.id}-${Date.now()}`, x: item.x, y: item.y, w: item.w, h: item.h });
    motions.get(item.id, item).badge.value = animations ? withSpring(1, motion.spring.pop) : 1;
  }, [animations, motions]);
  useEffect(() => {
    if (!gold) return;
    const id = setTimeout(() => setGold(null), 6500);
    return () => clearTimeout(id);
  }, [gold]);

  // ---------- Intro ----------
  // The card of the tree just locked in rises: the camera brings the tree above it (3.1), unless a
  // finger took the map during the show (then only the card comes) or the camera went elsewhere.
  const onIntroDone = useCallback((cut: boolean) => {
    latest.current.onIntroDone();
    const id = latest.current.highlight;
    if (cut || !id) return;
    clearTimeout(revealTimer.current);
    revealTimer.current = setTimeout(() => handlersRef.current.flyTo(id), REVEAL_WAIT);
  }, []);
  const intro = useIntro({ animations, size, grewFrom, cam, grow, sprout, stand, showGold, onDone: onIntroDone });
  useLayoutEffect(() => {
    const placed = (ids: string[]) => ids.map((id) => byId.get(id)).filter((i): i is MapItem => !!i);
    intro.start({ items, fresh: placed(fresh), highlight: highlight ? (byId.get(highlight) ?? null) : null });
    recompute();
    return intro.stop;
    // Once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The plot grew while the map is open: no show, it simply is bigger.
  useEffect(() => {
    if (!intro.isRunning()) grow.value = size;
  }, [size, grow, intro]);

  // ---------- Selection ----------
  const selItem = selected ? byId.get(selected) : undefined;
  const lastSel = useRef<{ x: number; y: number; w: number } | null>(null);
  if (selItem) lastSel.current = { x: selItem.x, y: selItem.y, w: selItem.w };
  // The ground canvas is memoized: the ring object changes only when the ring does.
  const ringAt = selItem && !move ? { ...lastSel.current!, on: 1 } : lastSel.current ? { ...lastSel.current, on: 0 } : null;
  const ringKey = ringAt ? `${ringAt.x},${ringAt.y},${ringAt.w},${ringAt.on}` : '';
  const ring = useMemo(() => {
    if (!ringKey) return null;
    const [x, y, w, on] = ringKey.split(',').map(Number);
    return { x, y, w, on: on === 1 };
  }, [ringKey]);
  useEffect(() => {
    if (!selected || move) return;
    const m = motions.get(selected);
    m.press.value = spring(1.04, motion.spring.press);
    return () => {
      m.press.value = spring(1, motion.spring.press);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, move, motions]);
  // Trees in front of the selected one that cover it go see-through while it is selected.
  useEffect(() => {
    const sel = selected && !move ? byIdRef.current.get(selected) : undefined;
    if (!sel) return;
    const cover = itemsRef.current.filter((i) => i.depth > sel.depth && covers(i, sel));
    const fade = (to: number) => {
      for (const i of cover) motions.get(i.id, i).alpha.value = withTiming(to, { duration: COVER_MS });
    };
    fade(COVER_ALPHA);
    return () => fade(1);
  }, [selected, move, motions, items]);

  // ---------- Camera moves ----------
  /** The tree the camera's last flight went to, and when it lands: the same flight is not started again. */
  const flight = useRef<{ id: string; until: number } | null>(null);
  /** A tap on a tree or "To the tree": the camera comes close (≥ 1.4) and sets it in the upper half, over the card. */
  const flyTo = (id: string) => {
    const item = byIdRef.current.get(id);
    // Never against a finger on the map.
    if (!item || handsOn()) return;
    const was = flight.current;
    if (was && was.id === id && cam.flying.value && Date.now() < was.until) return;
    intro.skip(false);
    const area = cam.liveArea();
    const now = cam.toArea(current(), area);
    const goal = focusCam(item.x, item.y, item.h, now.z, area);
    const dist = Math.hypot((goal.x - now.x) * now.z, (goal.y - now.y) * now.z);
    // Already there.
    if (dist < 6 && Math.abs(goal.z / now.z - 1) < 0.02) return;
    const duration = flyDuration(dist);
    cam.go(goal, { duration });
    flight.current = { id, until: Date.now() + duration };
  };

  /**
   * After a drop, a cancelled move or a delete: a camera left at the plot's side (driven to an
   * edge, or close in on a tree now gone) comes back over the plot, and a moved tree (`id`) is
   * brought out from under the card and the toast. Nothing moves when all is in view already.
   */
  const settle = (id: string | null) => {
    if (moveRef.current || handsOn() || cam.flying.value) return;
    const area = cam.liveArea();
    const from = current();
    let to = backOnPlot(from, size, area, view) ?? from;
    const item = id ? byIdRef.current.get(id) : undefined;
    if (item) {
      // The picture from its crown to its feet, between the header and the toast over the card.
      const top = toScreen(item.x, item.y - item.h, to, view);
      const feet = toScreen(item.x, item.y + 10, to, view);
      const half = (item.w * to.z) / 2;
      let dx = 0;
      let dy = 0;
      if (feet.y > area.bottom - TOAST_ROOM) dy = feet.y - (area.bottom - TOAST_ROOM);
      if (top.y - dy < area.top + EDGE_PAD) dy = top.y - (area.top + EDGE_PAD);
      if (feet.x - half < EDGE_PAD) dx = feet.x - half - EDGE_PAD;
      else if (feet.x + half > width - EDGE_PAD) dx = feet.x + half - (width - EDGE_PAD);
      to = { x: to.x + dx / to.z, y: to.y + dy / to.z, z: to.z };
    }
    if (Math.hypot((to.x - from.x) * from.z, (to.y - from.y) * from.z) < 4) return;
    cam.go(to, { duration: FIT_MS, live: false });
  };
  const fitPlot = () => {
    intro.skip(false);
    cam.go(cam.plotView(), { duration: FIT_MS });
  };
  const fitTrees = () => {
    intro.skip(false);
    cam.go(cam.treesView(itemsRef.current), { duration: FIT_MS });
  };

  /** Double tap (2.5): 1.5× closer around the point, or the whole plot when already close. */
  const zoomAt = (sx: number, sy: number) => {
    const now = current();
    if (now.z >= 1.45) {
      fitPlot();
      return;
    }
    const p = toWorld(sx, sy, now, view);
    const zz = Math.min(Z_MAX, now.z * 1.5);
    const goal = clampMap({ x: p.x - (sx - width / 2) / zz, y: p.y - (sy - anchorY) / zz, z: zz });
    cam.go(goal, { duration: DOUBLE_TAP_MS, live: false });
  };

  // ---------- Moving trees (section 4) ----------
  const finger = useSharedValue<Finger>({ x: 0, y: 0, vx: 0 });
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(-FINGER_GAP);

  const press = (id: string) => {
    if (!animations || moveRef.current) return;
    const m = motions.get(id);
    // "About to lift": a little taller and slimmer.
    m.sy.value = withDelay(STRETCH_AT, withTiming(1.03, { duration: 150, easing: motion.ease.out }));
    m.sx.value = withDelay(STRETCH_AT, withTiming(0.98, { duration: 150, easing: motion.ease.out }));
  };
  const unpress = (id: string) => {
    if (moveRef.current?.id === id) return;
    const m = motions.get(id);
    m.sy.value = withTiming(1, { duration: motion.still });
    m.sx.value = withTiming(1, { duration: motion.still });
  };

  const lift = (id: string, kind: MoveKind, notify: boolean) => {
    if (readOnly || moveRef.current) return;
    const item = byIdRef.current.get(id);
    if (!item) return;
    intro.skip(false);
    clearTree(id);
    const m = motions.get(id, item);
    m.press.value = 1;
    m.sx.value = spring(LIFT_SCALE, motion.spring.pop);
    m.sy.value = spring(LIFT_SCALE, motion.spring.pop);
    m.lift.value = spring(LIFT_UP, motion.spring.pop);
    setFlying([id], true);
    target.value = { c: item.cell.c, r: item.cell.r, kind: 0 };
    wave.value = 0;
    wave.value = withTiming(800, { duration: 800, easing: Easing.linear });
    const next = { id, kind };
    moveRef.current = next;
    setMove(next);
    cue('pickUp');
    // Choosing a spot: close enough for a finger on every "+", the plot in view (the sheet goes away).
    if (kind === 'choose') cam.go(cam.chooseView(item), { duration: FIT_MS, live: false });
    if (notify) latest.current.onMoveStart(id, kind);
  };

  /** Brings a tree's picture back to rest on `to` (its feet are wherever they are now). */
  const hop = (id: string, to: Cell, how: 'drop' | 'arc', arc: number, delay: number, lumps: number, landCue: 'place' | 'swap' | null) => {
    const item = byIdRef.current.get(id);
    const m = motions.get(id, item);
    const dest = cellCenter(to);
    const touch = how === 'drop' ? TOUCH_MS : HOP_MS;
    clearTree(id);
    if (!animations) {
      // 4.8: on its place in 120 ms, a flight 160 ms straight; no squash, no dust.
      const ms = how === 'drop' ? motion.still : motion.fast;
      for (const [sv, v] of [[m.px, dest.x], [m.py, dest.y], [m.lift, 0], [m.sx, 1], [m.sy, 1], [m.rot, 0], [m.alpha, 1]] as const) {
        sv.value = withDelay(delay, withTiming(v, { duration: ms }));
      }
      if (landCue) later(delay + ms, () => cue(landCue), id);
      return delay + ms;
    }
    if (how === 'drop') {
      m.px.value = withSpring(dest.x, motion.spring.drop);
      m.py.value = withSpring(dest.y, motion.spring.drop);
      m.lift.value = withSpring(0, motion.spring.drop);
    } else {
      const fly = { duration: HOP_MS, easing: motion.ease.inOut };
      const half = { duration: HOP_MS / 2 };
      const base = m.lift.value;
      m.px.value = withDelay(delay, withTiming(dest.x, fly));
      m.py.value = withDelay(delay, withTiming(dest.y, fly));
      m.lift.value = withDelay(delay, withSequence(
        withTiming(base / 2 + arc, { ...half, easing: Easing.out(Easing.quad) }),
        withTiming(0, { ...half, easing: Easing.in(Easing.quad) }),
      ));
      if (landCue === 'swap') {
        // The jumped-over tree grows a little in flight.
        m.sx.value = withDelay(delay, withSequence(withTiming(1.05, half), withTiming(1, half)));
        m.sy.value = withDelay(delay, withSequence(withTiming(1.05, half), withTiming(1, half)));
      }
    }
    m.rot.value = withSpring(0, motion.spring.press);
    m.alpha.value = withDelay(delay, withTiming(1, { duration: motion.still }));
    if (landCue === 'place') {
      // Touches the ground: a squash, then a bounce back (4.5).
      m.sx.value = withDelay(delay + touch, withSequence(withTiming(1.1, { duration: 80 }), withSpring(1, motion.spring.bounce)));
      m.sy.value = withDelay(delay + touch, withSequence(withTiming(0.9, { duration: 80 }), withSpring(1, motion.spring.bounce)));
    }
    later(delay + touch, () => {
      addDust(dest.x, dest.y, lumps);
      if (landCue) cue(landCue);
    }, id);
    return delay + touch + 400;
  };

  /** Ends the move mode: the cells fade, the target goes. */
  const endMove = () => {
    moveRef.current = null;
    setMove(null);
    target.value = { ...target.value, kind: 0 };
    if (ghost.current) {
      motions.get(ghost.current).press.value = withTiming(1, { duration: motion.still });
      ghost.current = '';
    }
  };

  /** After the flights: back to rest; a place the screen did not save is taken back. */
  const settleLater = (ids: string[], ms: number) => {
    for (const id of ids) {
      // Each tree on its own timer: a new flight of this tree (undo) clears it, the other's stays.
      later(ms, () => {
        setFlying([id], false);
        const item = byIdRef.current.get(id);
        if (!item) return;
        const m = motions.get(id, item);
        if (Math.abs(m.px.value - item.x) > 0.5 || Math.abs(m.py.value - item.y) > 0.5) {
          m.px.value = withTiming(item.x, { duration: motion.base });
          m.py.value = withTiming(item.y, { duration: motion.base });
        }
      }, id);
    }
  };

  /** The moved tree goes to `to`; whoever stood there goes to the moved tree's cell. */
  const place = (to: Cell, how: 'drop' | 'arc') => {
    const mv = moveRef.current;
    const item = mv && byIdRef.current.get(mv.id);
    if (!mv || !item) return;
    const from = item.cell;
    const swapped = occupant(plotRef.current, to);
    endMove();
    const ids = swapped ? [mv.id, swapped] : [mv.id];
    setFlying(ids, true);
    let ms = hop(mv.id, to, how, CHOOSE_ARC, 0, 6, 'place');
    if (swapped) ms = Math.max(ms, hop(swapped, from, 'arc', SWAP_ARC, SWAP_DELAY, 4, 'swap'));
    settleLater(ids, ms);
    const result: MoveResult = { lineageId: mv.id, from, to, swapped };
    latest.current.onMoveEnd(result);
    later(SETTLE_WAIT, () => settle(mv.id));
  };

  /** Back to its own cell: cancelled, or dropped where it stood. */
  const goHome = () => {
    const mv = moveRef.current;
    const item = mv && byIdRef.current.get(mv.id);
    if (!mv || !item) return;
    endMove();
    clearTree(mv.id);
    const m = motions.get(mv.id, item);
    if (animations) {
      const back = { duration: 300, easing: motion.ease.out };
      m.px.value = withTiming(item.x, back);
      m.py.value = withTiming(item.y, back);
      m.lift.value = withTiming(0, back);
      m.sx.value = withTiming(1, back);
      m.sy.value = withTiming(1, back);
      m.rot.value = withTiming(0, back);
    } else {
      for (const [sv, v] of [[m.px, item.x], [m.py, item.y], [m.lift, 0], [m.sx, 1], [m.sy, 1], [m.rot, 0]] as const) {
        sv.value = withTiming(v, { duration: motion.still });
      }
    }
    settleLater([mv.id], 320);
    cue('select');
    latest.current.onMoveEnd(null);
    later(SETTLE_WAIT, () => settle(null));
  };

  /** The finger let go of a dragged tree. */
  const drop = () => {
    const mv = moveRef.current;
    if (!mv) return;
    const tg = target.value;
    if (tg.kind === 0) goHome();
    else place({ c: tg.c, r: tg.r }, 'drop');
  };

  /**
   * "Choose a spot" (4.7): a tap on a free cell, another tree's cell (swap) or the tree's own
   * (cancel). The cell under the finger decides, not the pictures: crowns standing over the
   * cells behind them would catch taps meant for those cells' "+". Off the plot a crown counts.
   */
  const chooseAt = (sx: number, sy: number) => {
    const mv = moveRef.current;
    if (!mv) return;
    const cell = cellUnder(sx, sy, current(), view, size);
    const id = cell ? (occupant(plotRef.current, cell) ?? '') : hitAt(sx, sy);
    if (id === mv.id) return goHome();
    // A place with no tree on the map yet (a habit synced a frame later) counts as its cell.
    const item = id ? byIdRef.current.get(id) : undefined;
    if (item) return place(item.cell, 'arc');
    if (cell) place(cell, 'arc');
  };

  /** The target cell changed while dragging: a click; the tree standing there squats, ready to swap. */
  const onTarget = useCallback((who: string) => {
    if (!moveRef.current) return;
    cue('hover');
    const squat = (id: string, to: number) => {
      motions.get(id).press.value = animations ? withSpring(to, motion.spring.press) : withTiming(to, { duration: motion.still });
    };
    if (ghost.current && ghost.current !== who) squat(ghost.current, 1);
    if (who) squat(who, SWAP_SQUAT);
    ghost.current = who;
  }, [motions, animations]);

  // ---------- Taps ----------
  const pendingTap = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pendingTap.current), []);
  const revealTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(revealTimer.current), []);

  const onTap = (sx: number, sy: number) => {
    if (intro.isRunning()) return intro.skip();
    const mv = moveRef.current;
    if (mv) {
      if (mv.kind === 'choose') chooseAt(sx, sy);
      return;
    }
    clearTimeout(pendingTap.current);
    // An empty plot: its dotted hole leads to planting (spec 7).
    if (itemsRef.current.length === 0 && !readOnly) {
      const now = current();
      const mid = cellCenter({ c: (size - 1) / 2, r: (size - 1) / 2 });
      const hole = toScreen(mid.x, mid.y, now, view);
      // The 52×22 hole, never a smaller target than 44×44.
      if (Math.abs(sx - hole.x) <= Math.max(PLANT_HIT / 2, 26 * now.z) && Math.abs(sy - hole.y) <= Math.max(PLANT_HIT / 2, 11 * now.z)) {
        cue('select');
        latest.current.onPlantTap?.();
        return;
      }
    }
    const id = hitAt(sx, sy);
    if (id) {
      cue('select');
      latest.current.onSelect(id);
      // If the card would cover the tree, the camera brings it up (3.1).
      clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => flyTo(id), REVEAL_WAIT);
      return;
    }
    pendingTap.current = setTimeout(() => {
      if (latest.current.selected) latest.current.onSelect(null);
    }, DOUBLE_TAP_WAIT);
  };

  const onDoubleTap = (sx: number, sy: number) => {
    if (moveRef.current) return;
    if (hitAt(sx, sy)) return;
    intro.skip(false);
    clearTimeout(pendingTap.current);
    zoomAt(sx, sy);
  };

  // Gesture worklets call back into React through one stable function that runs the latest handlers.
  // A finger that pans, pinches or drives the map ends the show where the camera is.
  const handlers = { onTap, onDoubleTap, press, unpress, lift, drop, cancel: goHome, touched: () => intro.skip(false), flyTo, settle };
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const call = useCallback((name: keyof typeof handlers, a?: number | string, b?: number) => {
    const h = handlersRef.current;
    switch (name) {
      case 'onTap': return h.onTap(a as number, b as number);
      case 'onDoubleTap': return h.onDoubleTap(a as number, b as number);
      case 'press': return h.press(a as string);
      case 'unpress': return h.unpress(a as string);
      case 'lift': return h.lift(a as string, 'drag', true);
      case 'drop': return h.drop();
      case 'cancel': return h.cancel();
      case 'touched': return h.touched();
    }
  }, []);

  // ---------- Gestures (2.4–2.7) ----------
  const swallow = useSharedValue(false);
  const raw = useSharedValue<Cam>({ x: 0, y: 0, z: 1 });
  const pinchStart = useSharedValue({ z: 1, x: 0, y: 0 });
  const pressId = useSharedValue('');
  const dragging = useSharedValue(false);

  const panBy = (dx: number, dy: number) => {
    'worklet';
    const r = raw.value;
    const k = z.value;
    raw.value = { x: r.x - dx / k, y: r.y - dy / k, z: r.z };
    set(rubberMap(raw.value));
  };

  const tap = useTapGesture({
    maxDistance: 10,
    onBegin: () => {
      'worklet';
      // A tap on a coasting map only stops it.
      swallow.value = coasting.value;
      if (coasting.value) stop();
    },
    onActivate: (e) => {
      'worklet';
      if (!swallow.value) scheduleOnRN(call, 'onTap', e.x, e.y);
    },
  });
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    maxDistance: 20,
    onActivate: (e) => {
      'worklet';
      scheduleOnRN(call, 'onDoubleTap', e.x, e.y);
    },
  });
  const pan = usePanGesture({
    minDistance: 6,
    enabled: move?.kind !== 'drag',
    onActivate: () => {
      'worklet';
      stop();
      panning.value = true;
      raw.value = current();
      scheduleOnRN(call, 'touched');
    },
    onUpdate: (e) => {
      'worklet';
      if (!pinching.value) panBy(e.changeX, e.changeY);
    },
    onDeactivate: (e) => {
      'worklet';
      if (!pinching.value) release(e.velocityX, e.velocityY);
    },
    onFinalize: () => {
      'worklet';
      panning.value = false;
    },
  });
  const pinch = usePinchGesture({
    enabled: move?.kind !== 'drag',
    onActivate: (e) => {
      'worklet';
      stop();
      pinching.value = true;
      const c = current();
      raw.value = c;
      // The world point under the fingers stays under them.
      const f = toWorld(e.focalX, e.focalY, c, view);
      pinchStart.value = { z: c.z, x: f.x, y: f.y };
      scheduleOnRN(call, 'touched');
    },
    onUpdate: (e) => {
      'worklet';
      const s = pinchStart.value;
      const zz = s.z * e.scale;
      raw.value = { x: s.x - (e.focalX - width / 2) / zz, y: s.y - (e.focalY - anchorY) / zz, z: zz };
      set(rubberMap(raw.value));
    },
    onDeactivate: () => {
      'worklet';
      pinching.value = false;
      raw.value = current();
      release(0, 0);
    },
    onFinalize: () => {
      'worklet';
      pinching.value = false;
    },
  });
  const drag = usePanGesture({
    activateAfterLongPress: LIFT_MS,
    // Off while choosing a spot; never toggled during its own drag (that would cancel it).
    enabled: !readOnly && move?.kind !== 'choose',
    onBegin: (e) => {
      'worklet';
      const id = hitAt(e.x, e.y);
      pressId.value = id;
      if (id) scheduleOnRN(call, 'press', id);
    },
    onActivate: (e) => {
      'worklet';
      const id = pressId.value;
      stop();
      if (!id) {
        // A long press on the lawn: the finger moves the map.
        dragCam.value = true;
        raw.value = current();
        scheduleOnRN(call, 'touched');
        return;
      }
      dragging.value = true;
      finger.value = { x: e.x, y: e.y, vx: 0 };
      // Grabbed where the finger is; the feet spring up to 30 px above it.
      const h = hits.value.find((i) => i.id === id);
      if (h) {
        const feet = toScreen(h.x, h.y, current(), view);
        grabX.value = feet.x - e.x;
        grabY.value = feet.y - e.y;
        grabX.value = withSpring(0, motion.spring.pop);
        grabY.value = withSpring(-FINGER_GAP, motion.spring.pop);
      }
      scheduleOnRN(call, 'lift', id);
    },
    onUpdate: (e) => {
      'worklet';
      if (dragCam.value) panBy(e.changeX, e.changeY);
      else if (dragging.value) finger.value = { x: e.x, y: e.y, vx: e.velocityX };
    },
    onDeactivate: (e) => {
      'worklet';
      if (dragCam.value) release(e.velocityX, e.velocityY);
      else if (dragging.value) scheduleOnRN(call, e.canceled ? 'cancel' : 'drop');
    },
    onFinalize: () => {
      'worklet';
      if (pressId.value && !dragging.value) scheduleOnRN(call, 'unpress', pressId.value);
      pressId.value = '';
      dragging.value = false;
      dragCam.value = false;
    },
  });
  const camera = useSimultaneousGestures(pan, pinch, tap, doubleTap);
  const gesture = useCompetingGestures(drag, camera);

  // ---------- Handle ----------
  useImperativeHandle(ref, () => ({
    flyTo: (id) => flyTo(id),
    fitPlot: () => fitPlot(),
    fitTrees: () => fitTrees(),
    startMove: (id) => lift(id, 'choose', false),
    cancelMove: () => {
      if (moveRef.current) goHome();
    },
    playUndo: (mv) => {
      // The screen has already put the trees back: fly them from where they stand now.
      const ids = mv.swapped ? [mv.lineageId, mv.swapped] : [mv.lineageId];
      setFlying(ids, true);
      let ms = hop(mv.lineageId, mv.from, 'arc', SWAP_ARC, 0, 4, null);
      if (mv.swapped) ms = Math.max(ms, hop(mv.swapped, mv.to, 'arc', SWAP_ARC, SWAP_DELAY, 4, null));
      settleLater(ids, ms);
    },
    playSprout: (id) => sprout(id, 0, false),
  }));

  // ---------- Screen reader ----------
  const [reader, setReader] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setReader).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setReader);
    return () => sub.remove();
  }, []);
  const labels = useMemo(() => new Map(items.map((i) => [i.id, treeLabel(i, t, today)])), [items, t, today]);
  const onAction = useCallback((id: string, action: 'activate' | 'move') => {
    if (action === 'activate') {
      latest.current.onSelect(id);
      clearTimeout(revealTimer.current);
      revealTimer.current = setTimeout(() => handlersRef.current.flyTo(id), REVEAL_WAIT);
    } else handlersRef.current.lift(id, 'choose', true);
  }, []);

  // ---------- What to draw ----------
  const movingSet = useMemo(() => new Set(moving), [moving]);
  // Back to front; trees in flight on top of the others.
  const mounted = useMemo(() => {
    const list = items.filter((i) => shown.has(i.id) && !movingSet.has(i.id));
    for (const id of moving) {
      const item = byId.get(id);
      if (item) list.push(item);
    }
    return [...list, ...leaving];
  }, [items, shown, movingSet, moving, byId, leaving]);
  const groundTrees: GroundTree[] = useMemo(
    () => items.filter((i) => !movingSet.has(i.id)).map((i) => ({ x: i.x, y: i.y, w: i.w, past: i.past })),
    [items, movingSet],
  );
  const groundMoving = useMemo(
    () => moving.flatMap((id) => {
      const item = byId.get(id);
      return item ? [{ id, m: motions.get(id, item), w: item.w }] : [];
    }),
    [moving, byId, motions],
  );
  const moveItem = move ? byId.get(move.id) : undefined;
  const home = useMemo(() => (moveItem ? { x: moveItem.x, y: moveItem.y, w: moveItem.w, past: 0 } : null), [moveItem]);
  // Free cells: the moved tree's own cell counts as free while it is up.
  const free = useMemo(() => {
    if (!move) return null;
    const mine = plot.places[move.id];
    if (!mine) return null;
    const places = { ...plot.places };
    delete places[move.id];
    const cells = freeCells({ ...plot, places });
    return { rings: freeCellRings(cells, mine), plus: move.kind === 'choose' ? freeCells(plot) : null };
  }, [move, plot]);
  // Markers only over mounted trees: a drop or a badge waits for its tree's picture (MapMarkers).
  const allBadges = useMemo(() => items.filter((i) => freshSet.has(i.id) || i.id === highlight), [items, freshSet, highlight]);
  const badges = useMemo(() => allBadges.filter((i) => shown.has(i.id)), [allBadges, shown]);
  const newLabel = t('newBadge');
  const hideBelow = useMemo(() => {
    const mark = (i: MapItem) => ({ id: i.id, x: i.x, top: i.y - i.h, w: i.w, depth: i.depth });
    // The badge is a short uppercase word: about 7.5 px a letter and 14 of padding.
    const badgeW = newLabel.length * 7.5 + 16;
    return badgeHideZoom(allBadges.map(mark), items.filter((i) => i.thirsty).map(mark), badgeW);
  }, [allBadges, items, newLabel]);
  const markedItems = useMemo(
    () => items.filter((i) => (marked.has(i.id) && shown.has(i.id)) || movingSet.has(i.id)),
    [items, marked, shown, movingSet],
  );
  const freeMarks = useMemo(
    () => (free ? { rings: free.rings, wave, step: animations ? 12 : 0, fade: animations ? motion.fast : motion.still } : null),
    [free, wave, animations],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View style={StyleSheet.absoluteFill} collapsable={false} onLayout={onLayout}>
        <View style={StyleSheet.absoluteFill} accessible accessibilityLabel={t('mapA11y')}>
          <ForestGround
            theme={plotTheme}
            size={size}
            grow={grow}
            night={night}
            animations={animations}
            width={width}
            height={height}
            matrix={matrix}
            z={z}
            clock={clock}
            trees={groundTrees}
            moving={groundMoving}
            home={home}
            crowded={items.length >= CROWD}
            selected={ring}
            gold={gold}
            free={freeMarks}
            plus={free?.plus ?? null}
            target={target}
            dust={dust}
            onDustDone={onDustDone}
          />
        </View>
        <MapTrees
          items={mounted}
          motions={motions}
          palette={palette}
          width={width}
          anchorY={anchorY}
          cx={cx}
          cy={cy}
          z={z}
          labels={labels}
          moveLabel={t('moveTree')}
          readOnly={readOnly}
          onAction={onAction}
          freeCells={reader && move?.kind === 'choose' ? (free?.plus ?? null) : null}
          freeLabel={(cell) => t('freeCellA11y', { r: cell.r + 1, c: cell.c + 1 })}
          onFreeCell={(cell) => moveRef.current && place(cell, 'arc')}
        />
        <MapMarkers
          items={markedItems}
          badges={badges}
          hideBelow={hideBelow}
          badgesOff={move !== null}
          motions={motions}
          night={night}
          animations={animations}
          crowded={items.length >= CROWD}
          width={width}
          anchorY={anchorY}
          cx={cx}
          cy={cy}
          z={z}
          clock={clock}
          newLabel={newLabel}
        />
        {move?.kind === 'drag' && moveItem && (
          <DragFollower
            m={motions.get(move.id, moveItem)}
            home={moveItem.cell}
            size={size}
            finger={finger}
            active={dragging}
            grabX={grabX}
            grabY={grabY}
            occ={occ}
            target={target}
            cx={cx}
            cy={cy}
            z={z}
            view={view}
            areaTop={areaTop}
            width={width}
            height={height}
            clampMap={clampMap}
            onTarget={onTarget}
          />
        )}
      </View>
    </GestureDetector>
  );
});
