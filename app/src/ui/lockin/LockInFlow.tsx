// What happens after "Lock in for good" (spec section 3): the tree gets a gold plaque,
// folds into a gold medal, and the medal flies into "My forest" in the raised menu.
// An overlay over the whole main screen: the live tree is swapped for its picture
// (TreeThumb), everything else is react-native-svg and Reanimated views driven by one
// clock (`ms`). React and the store take part only at the steps of timeline.ts.
import { Ref, RefObject, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { DayKey } from '@/game/dates';
import { growthDays, isDead, Tree } from '@/game/tree';
import { stageDaysText } from '@/i18n';
import { useStore } from '@/state/store';
import { motion } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { treeK } from '@/ui/live/LiveTree';
import { treeMood } from '@/ui/live/mood';
import { hash01, inCubic, outCubic, seg, spring } from '@/ui/live/timeline';
import { SceneGeo } from '@/ui/scene/contract';
import type { HomeSheetHandle } from '@/ui/sheet/HomeSheet';
import { Palette } from '@/ui/theme';
import { TreeArtProps, TreeThumb, warmThumb } from '@/ui/TreeArt';
import { BASE_Y, CANVAS_W, lookOf, SIZES, treeZoom } from '@/ui/trees/layout';
import { LockRibbon } from './LockRibbon';
import { Medal, MEDAL } from './Medal';
import { Plaque, PLAQUE } from './Plaque';
import {
  finishSteps,
  flightAt,
  FLY,
  LOCK,
  LOCK_REDUCED,
  LockStep,
  LockStepName,
  lockSteps,
  perchY,
  plaqueK,
  plaqueX,
  skipSteps,
  sparkleAt,
} from './timeline';

/** Where the flow is, for the main screen. */
export type LockPhase = 'before' | 'after' | 'landed' | null;

export interface LockInFlowHandle {
  /** Draw the tree's picture ahead of time (while the "Lock in?" dialog is open). */
  warm(tree: Tree): void;
  start(tree: Tree): void;
}

interface Props {
  ref?: Ref<LockInFlowHandle>;
  geo: SceneGeo | null;
  /** Height of the main screen: the sheet's top is screenH − visible. */
  screenH: number;
  /** Where the ribbon goes: under the header (and the development bar). */
  ribbonTop: number;
  animations: boolean;
  sheet: RefObject<HomeSheetHandle | null>;
  /** The sheet's visible height: the medal's target moves with it. */
  visible: SharedValue<number>;
  /** 1 hides the live tree (its picture stands in for it). */
  hideLive: SharedValue<number>;
  /** 1 dims the header while the ribbon is shown. */
  headerDim: SharedValue<number>;
  onPhase: (phase: LockPhase) => void;
  /** Lock the tree in the store (the camera then stands on the next habit). */
  onLockIn: (tree: Tree) => void;
  /** The medal landed on "My forest". */
  onLand: () => void;
}

/** Everything the overlay needs about the tree, fixed when the flow starts. */
interface Run {
  tree: Tree;
  reduced: boolean;
  /** The picture standing in for the live tree: the same size and look. */
  thumb: TreeArtProps;
  /** Crown center and feet, screen px. */
  crown: { x: number; y: number };
  feetY: number;
  plaque: { x: number; k: number };
  /** Drawn tree size, px. */
  treeW: number;
  treeH: number;
}

const SPARKLES = 10;
const TRAIL = FLY.trail;
const GLOW_R = 130;
/** The picture shrinks to this around the crown while it folds. */
const FOLD_TO = 0.3;
/** Plaque spring (spec 3.2). */
const PLAQUE_SPRING = { damping: 11, stiffness: 200 };

/** The live tree's picture: the same width, colors, thirst and night as on the meadow. */
function thumbOf(tree: Tree, geo: SceneGeo, palette: Palette, night: boolean, today: DayKey): TreeArtProps {
  return {
    days: growthDays(tree),
    dead: isDead(tree),
    palette,
    size: CANVAS_W * treeK(geo),
    skin: tree.skin,
    seed: tree.id,
    thirsty: treeMood(tree, today) === 'thirsty',
    night,
  };
}

export function LockInFlow(props: Props) {
  const { ref, geo, screenH, ribbonTop, animations, sheet, visible, hideLive, headerDim, onPhase, onLockIn, onLand } = props;
  const { t, palette, night, today } = useStore();
  const [run, setRun] = useState<Run | null>(null);
  const runRef = useRef<Run | null>(null);

  const ms = useSharedValue(0);
  const ribbonShown = useSharedValue(0);
  const ribbonAway = useSharedValue(0);
  const target = useSharedValue({ x: 0, dy: 0 });
  /** How high the medal waits before its dive, screen px. */
  const perch = useSharedValue(0);

  // ---- Steps ----
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  /** Steps still to run and when the clock was at 0 (Date.now), for skipping and pausing. */
  const plan = useRef<{ steps: LockStep[]; zero: number }>({ steps: [], zero: 0 });
  /** Steps already run: a skip or a pause finishes every other one, whatever the time. */
  const done = useRef(new Set<LockStepName>());
  const locked = useRef(false);
  /** The picture is drawn / the sequence wants it in place of the live tree. */
  const thumbReady = useRef(false);
  const wantSnapshot = useRef(false);

  // The clock is the sequence itself, not decoration: the system "reduce motion" must
  // not jump it to the end (our own "no animations" has its own short sequence).
  const startClock = (from: number, end: number) => {
    cancelAnimation(ms);
    ms.set(from);
    ms.set(withTiming(end, { duration: Math.max(0, end - from), easing: Easing.linear, reduceMotion: ReduceMotion.Never }));
  };

  /** Hide the live tree only when its picture is really there to stand in for it. */
  const swapIfReady = () => {
    if (wantSnapshot.current && thumbReady.current && !done.current.has('nextTree')) hideLive.set(1);
  };

  const doStep = (step: LockStepName, instant = false) => {
    const r = runRef.current;
    if (!r) return;
    const fade = (to: number, ms: number) => (instant ? to : withTiming(to, { duration: ms, easing: motion.ease.out }));
    switch (step) {
      case 'peek':
        sheet.current?.snapTo('peek', { quiet: true });
        break;
      case 'snapshot':
        wantSnapshot.current = true;
        swapIfReady();
        break;
      case 'cueLockIn':
        cue('lockIn');
        break;
      case 'ribbon':
        ribbonAway.set(0);
        ribbonShown.set(r.reduced ? withTiming(1, { duration: LOCK_REDUCED.fade }) : withSpring(1, { damping: 12, stiffness: 200 }));
        headerDim.set(withTiming(1, { duration: 200 }));
        break;
      case 'ribbonOut':
        ribbonAway.set(withTiming(1, { duration: 200, easing: motion.ease.in }));
        headerDim.set(withTiming(0, { duration: 200 }));
        break;
      case 'lockIn':
        if (locked.current) break;
        locked.current = true;
        onLockIn(r.tree);
        onPhase('after');
        break;
      case 'nextTree':
        hideLive.set(fade(0, r.reduced ? LOCK_REDUCED.fade : LOCK.nextTo - LOCK.nextFrom));
        break;
      case 'menu': {
        // Where "My forest" sits inside the sheet; the layout is the one after the lock-in.
        // The sheet spans the screen like this overlay, so its x is ours too.
        sheet.current?.measureForest().then((p) => {
          if (p && runRef.current) target.set(p);
        });
        sheet.current?.snapTo('menu', { quiet: true, instant });
        break;
      }
      case 'fly':
        if (!instant) cue('fly');
        break;
      case 'land':
        onLand();
        onPhase('landed');
        cue('land');
        break;
      case 'end':
        finish();
        break;
    }
  };
  const doStepRef = useRef(doStep);
  doStepRef.current = doStep;
  /** Each step runs once, however it is reached (its timer, a skip, a pause). */
  const runStep = (step: LockStepName, instant = false) => {
    if (!runRef.current || done.current.has(step)) return;
    done.current.add(step);
    doStepRef.current(step, instant);
  };
  const runStepRef = useRef(runStep);
  runStepRef.current = runStep;

  const schedule = (steps: LockStep[], zero: number) => {
    clearTimers();
    plan.current = { steps, zero };
    for (const s of steps) {
      const delay = Math.max(0, zero + s.at - Date.now());
      timers.current.push(setTimeout(() => runStepRef.current(s.step), delay));
    }
  };

  const reset = () => {
    clearTimers();
    runRef.current = null;
    setRun(null);
    cancelAnimation(ms);
    ribbonShown.set(0);
    ribbonAway.set(0);
    headerDim.set(0);
    hideLive.set(0);
    wantSnapshot.current = false;
    thumbReady.current = false;
  };

  const finish = () => {
    reset();
    onPhase(null);
  };

  /** Before the lock-in nothing was saved: put everything back as it was. */
  const cancel = () => {
    reset();
    sheet.current?.snapTo('rest', { instant: true, quiet: true });
    onPhase(null);
  };

  const warm = (tree: Tree) => {
    if (!geo) return;
    warmThumb(thumbOf(tree, geo, palette, night, today)).catch(() => {});
  };

  const start = (tree: Tree) => {
    if (!geo || runRef.current) return;
    const reduced = !animations;
    const k = treeK(geo);
    const days = growthDays(tree);
    const dead = isDead(tree);
    const s = SIZES[tree.skin][lookOf(days, dead)];
    const zoom = treeZoom(tree.skin, days, dead) * k;
    const treeW = s.w * zoom;
    const treeH = s.h * zoom;
    const trunkX = geo.width / 2;
    const r: Run = {
      tree,
      reduced,
      thumb: thumbOf(tree, geo, palette, night, today),
      crown: { x: trunkX, y: geo.feetY - treeH * 0.6 },
      feetY: geo.feetY,
      plaque: { x: plaqueX(trunkX, treeW), k: plaqueK(treeH) },
      treeW,
      treeH,
    };
    runRef.current = r;
    locked.current = false;
    done.current = new Set();
    wantSnapshot.current = false;
    thumbReady.current = false;
    // The medal waits above where the sheet's top will be once the menu is up.
    perch.set(perchY(r.crown.y, sheet.current?.menuTop() ?? geo.topInset + 56, geo.topInset));
    setRun(r);
    onPhase('before');
    cue('lockConfirm');
    const steps = lockSteps(reduced);
    const end = steps[steps.length - 1].at;
    startClock(0, end);
    schedule(steps, Date.now());
  };

  /** A tap on the ribbon: straight to the lock-in. */
  const skip = () => {
    const r = runRef.current;
    if (!r) return;
    const now = Date.now() - plan.current.zero;
    const { steps, clock } = skipSteps(plan.current.steps, done.current, now);
    ribbonAway.set(withTiming(1, { duration: 160, easing: motion.ease.in }));
    headerDim.set(withTiming(0, { duration: 160 }));
    const end = lockSteps(r.reduced).slice(-1)[0].at;
    startClock(Math.min(clock, end), end);
    // Steps keep their times relative to the lock-in, which is now.
    schedule(steps.map((s) => ({ ...s, at: s.at + clock })), Date.now() - clock);
  };

  // The app went to the background: before the lock-in the flow is undone, after it
  // the end state shows at once.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'background' || !runRef.current) return;
      if (!locked.current) {
        cancel();
        return;
      }
      const rest = finishSteps(plan.current.steps, done.current);
      clearTimers();
      cancelAnimation(ms);
      ms.set(LOCK.end + 1);
      for (const s of rest) runStepRef.current(s.step, true);
    });
    return () => sub.remove();
    // Reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving the screen for good mid-flow (it never happens on the root screen, but
  // timers must not outlive the overlay).
  useEffect(() => () => clearTimers(), []);

  useImperativeHandle(ref, () => ({ warm, start }));

  const onThumbReady = () => {
    thumbReady.current = true;
    swapIfReady();
  };

  // ---- Looks, all from the clock ----
  const crownX = run?.crown.x ?? 0;
  const crownY = run?.crown.y ?? 0;
  const reduced = run?.reduced ?? false;

  const glowStyle = useAnimatedStyle(() => {
    const m = ms.get();
    const up = reduced ? seg(m, 0, LOCK_REDUCED.fade) : outCubic(seg(m, LOCK.plaqueFrom, LOCK.plaqueFrom + LOCK.glow));
    const down = reduced ? 1 - seg(m, LOCK_REDUCED.lockIn, LOCK_REDUCED.end) : 1 - seg(m, LOCK.foldFrom, LOCK.foldTo);
    return { opacity: 0.55 * up * down };
  });
  // The picture and the plaque: shown from 200 ms, fold into the crown at 2000.
  const pictureStyle = useAnimatedStyle(() => {
    const m = ms.get();
    if (reduced) return { opacity: 1 - seg(m, LOCK_REDUCED.lockIn, LOCK_REDUCED.end), transform: [{ scale: 1 }] };
    const f = inCubic(seg(m, LOCK.foldFrom, LOCK.foldTo));
    return { opacity: (m >= LOCK.snapshot ? 1 : 0) * (1 - f), transform: [{ scale: 1 + (FOLD_TO - 1) * f }] };
  });
  const plaqueStyle = useAnimatedStyle(() => {
    const m = ms.get();
    if (reduced) return { opacity: seg(m, 0, LOCK_REDUCED.fade), transform: [{ translateY: 0 }, { scale: 1 }] };
    const p = m < LOCK.plaqueFrom ? 0 : spring(m - LOCK.plaqueFrom, PLAQUE_SPRING.damping, PLAQUE_SPRING.stiffness);
    return { opacity: m < LOCK.plaqueFrom ? 0 : Math.min(1, p * 2), transform: [{ translateY: 20 * (1 - p) }, { scale: 0.4 + 0.6 * p }] };
  });
  // Instead of a white copy of the picture (TreeThumb has no tint), a white glow flashes as it folds.
  const flashStyle = useAnimatedStyle(() => {
    if (reduced) return { opacity: 0 };
    const f = seg(ms.get(), LOCK.foldFrom, LOCK.foldTo);
    return { opacity: 0.8 * Math.sin(Math.PI * f) };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={run ? 'auto' : 'none'}>
      {run && geo && (
        <>
          {/* Taps during the sequence are ignored (spec 3.3). */}
          <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} />
          <Animated.View pointerEvents="none" style={[styles.abs, { left: crownX - GLOW_R, top: crownY - GLOW_R }, glowStyle]}>
            <Svg width={GLOW_R * 2} height={GLOW_R * 2}>
              <Defs>
                <RadialGradient id="lockGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#FFE7A0" stopOpacity={1} />
                  <Stop offset="1" stopColor="#FFE7A0" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={GLOW_R} cy={GLOW_R} r={GLOW_R} fill="url(#lockGlow)" />
            </Svg>
          </Animated.View>

          {/* The picture is drawn around the crown, so it folds toward it. */}
          <Animated.View pointerEvents="none" style={[styles.abs, { left: crownX, top: crownY, width: 0, height: 0 }, pictureStyle]}>
            <View style={[styles.abs, { left: geo.width / 2 - run.thumb.size / 2 - crownX, top: run.feetY - BASE_Y * (run.thumb.size / CANVAS_W) - crownY }]}>
              <TreeThumb {...run.thumb} onReady={onThumbReady} />
            </View>
            <Animated.View
              style={[
                styles.abs,
                { left: run.plaque.x - (PLAQUE.w * run.plaque.k) / 2 - crownX, top: run.feetY - PLAQUE.h * run.plaque.k + 3 - crownY },
                plaqueStyle,
              ]}
            >
              <Plaque k={run.plaque.k} />
            </Animated.View>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.abs, { left: crownX - 90, top: crownY - 90 }, flashStyle]}>
            <Svg width={180} height={180}>
              <Defs>
                <RadialGradient id="lockFlash" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#FFF7E0" stopOpacity={1} />
                  <Stop offset="1" stopColor="#FFF7E0" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={90} cy={90} r={90} fill="url(#lockFlash)" />
            </Svg>
          </Animated.View>

          {!reduced && Array.from({ length: SPARKLES }, (_, i) => <Sparkle key={i} i={i} run={run} ms={ms} />)}

          {!reduced && (
            <>
              {Array.from({ length: TRAIL }, (_, i) => (
                <TrailDot key={i} i={i + 1} from={run.crown} ms={ms} target={target} perch={perch} visible={visible} screenH={screenH} />
              ))}
              <FlyingMedal run={run} ms={ms} target={target} perch={perch} visible={visible} screenH={screenH} palette={palette} night={night} />
            </>
          )}

          <LockRibbon
            top={ribbonTop}
            title={t('lockedTitle')}
            line={stageDaysText(t, growthDays(run.tree))}
            shown={ribbonShown}
            away={ribbonAway}
            onPress={skip}
          />
        </>
      )}
    </View>
  );
}

/** A gold four-point star twinkling around the crown (500–1700 ms). */
function Sparkle({ i, run, ms }: { i: number; run: Run; ms: SharedValue<number> }) {
  const a = hash01(i, 1) * 2 * Math.PI;
  const d = 0.35 + 0.45 * hash01(i, 2);
  const x = run.crown.x + Math.cos(a) * Math.max(run.treeW, 90) * 0.62 * d;
  const y = run.crown.y + Math.sin(a) * Math.max(run.treeH, 90) * 0.55 * d;
  const size = 4 + 5 * hash01(i, 3);
  const color = i % 2 ? '#FFE27A' : '#FFF6C2';
  const style = useAnimatedStyle(() => ({ transform: [{ scale: sparkleAt(i, ms.get()) }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.abs, { left: x - size, top: y - size }, style]}>
      <Svg width={size * 2} height={size * 2} viewBox="-1 -1 2 2">
        <Path d="M0 -1 Q .16 -.16 1 0 Q .16 .16 0 1 Q -.16 .16 -1 0 Q -.16 -.16 0 -1Z" fill={color} />
      </Svg>
    </Animated.View>
  );
}

interface FlightProps {
  ms: SharedValue<number>;
  target: SharedValue<{ x: number; dy: number }>;
  perch: SharedValue<number>;
  visible: SharedValue<number>;
  screenH: number;
}

/** Where the medal is at `m` (center, scale, opacity). */
function medalAt(m: number, from: { x: number; y: number }, perch: number, target: { x: number; dy: number }, top: number) {
  'worklet';
  if (m < LOCK.foldFrom) return { x: from.x, y: from.y, scale: 0, alpha: 0 };
  // It grows out of the crown with the pop spring, which may still settle on the way.
  const s = spring(m - LOCK.foldFrom, motion.spring.pop.damping, motion.spring.pop.stiffness);
  if (m < LOCK.flyFrom) return { x: from.x, y: from.y, scale: s, alpha: 1 };
  const p = flightAt(seg(m, LOCK.flyFrom, LOCK.flyTo), from, perch, { x: target.x, y: top + target.dy });
  return { x: p.x, y: p.y, scale: p.scale * s, alpha: m >= LOCK.flyTo ? 0 : p.alpha };
}

function FlyingMedal({ run, ms, target, perch, visible, screenH, palette, night }: FlightProps & { run: Run; palette: Palette; night: boolean }) {
  const from = run.crown;
  const style = useAnimatedStyle(() => {
    const p = medalAt(ms.get(), from, perch.get(), target.get(), screenH - visible.get());
    return { opacity: p.alpha, transform: [{ translateX: p.x - (MEDAL + 4) / 2 }, { translateY: p.y - (MEDAL + 4) / 2 }, { scale: p.scale }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.medal, style]}>
      <Medal tree={run.tree} palette={palette} night={night} />
    </Animated.View>
  );
}

/** One of six gold dots trailing the medal, 0.04 of the way behind each other. */
function TrailDot({ i, from, ms, target, perch, visible, screenH }: FlightProps & { i: number; from: { x: number; y: number } }) {
  const style = useAnimatedStyle(() => {
    const m = ms.get();
    if (m <= LOCK.flyFrom || m >= LOCK.flyTo) return { opacity: 0 };
    const u = seg(m, LOCK.flyFrom, LOCK.flyTo) - FLY.trailLag * i;
    if (u <= 0) return { opacity: 0 };
    const tg = target.get();
    const p = flightAt(u, from, perch.get(), { x: tg.x, y: screenH - visible.get() + tg.dy });
    const alpha = (0.6 - (0.5 * (i - 1)) / (TRAIL - 1)) * flightAt(u + FLY.trailLag * i, from, perch.get(), { x: tg.x, y: 0 }).alpha;
    return { opacity: alpha, transform: [{ translateX: p.x - 3 }, { translateY: p.y - 3 }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  medal: { position: 'absolute', left: 0, top: 0, width: MEDAL + 4, height: MEDAL + 4, borderRadius: (MEDAL + 4) / 2 },
  dot: { position: 'absolute', left: 0, top: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFE27A' },
});
