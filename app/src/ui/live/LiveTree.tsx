// The live tree in front of the camera: sways in the wind, droops and fades while it
// waits for water, gets watered with a can, comes back to life, and celebrates a new
// stage. One Skia canvas over the whole scene holds the tree and every effect; all
// motion is a function of one clock (`ms`, see timeline.ts) and the wind, so React
// renders only when something starts or ends, never per frame.
import { Canvas, Circle, ColorMatrix, Group, Paint, RadialGradient, vec } from '@shopify/react-native-skia';
import { ComponentRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, useTapGesture } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, Easing, SharedValue, useDerivedValue, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { canWaterAt, growthDays, isDead, isGrowing, Tree, wateringOpensAt, WithHours } from '@/game/tree';
import { hourText } from '@/ui/watering/format';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { canWaterShared, sharedTreeId } from '@/ui/together/model';
import { useMeadow } from '../meadow/useMeadow';
import { SceneGeo, slotAt, Wind } from '../scene/contract';
import { TreeBody } from '../TreeArt';
import { Look, lookOf, treeZoom } from '../trees/layout';
import { hashString } from '../trees/parts';
import { AlreadyChip } from './AlreadyChip';
import { EarlyChip, earlyText, useMinutesToOpen } from './EarlyChip';
import { Dim, Flash, Rays, Token } from './Celebration';
import { cue } from '../feedback';
import { hexRgb, liveColors, MOON, treeMatrix } from './colors';
import { askTime, banner, cheer, earlyTap, measureRing, Point, rememberLineage, sameLineage, showEarly, skipCelebration, tokenLanded, tokenLaunched, treeNote, useChannel } from './events';
import { stageUp, treeMood } from './mood';
import { Particles } from './Particles';
import { holeWidth, Soil } from './Soil';
import { bubbleSpot, drawnSize, treeK } from './bubble';
import { ThirstBubble } from './ThirstBubble';
import { busyTime, CHIP, DONE, frameAt, landingTime, lerp, REDUCED, restFrame, seg, SKIP_FADE, STAGE, WATER, wiggleAt } from './timeline';
import { HOUR_DROP, HourDrop } from './HourDrop';
import { WateringCan } from './WateringCan';
import { NameBubble } from '../naming/NameBubble';

export interface LiveTreeProps {
  /** The generation on show. */
  tree: Tree;
  geo: SceneGeo;
  /** liveIndex − cameraX; 0 is in front, in the middle. */
  depth: SharedValue<number>;
  wind: Wind;
  /** Already off when the system asks for reduced motion. */
  animations: boolean;
  /** Not read any more: ui/feedback follows the vibration setting itself. */
  vibration?: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** The first frame is drawn: the picture under it can go. */
  onReady?: () => void;
  /** The tree asks for a name today: the "What's my name?" bubble is up (wave 4, section 2). */
  askName?: boolean;
  /** Asked in this session and not heard yet: the bubble pops in 400 ms with its sound; else 600 ms, quietly. */
  askFresh?: boolean;
  /** The fresh bubble came out with its sound. */
  onAskShown?: () => void;
  /** The bubble was tapped: open the name sheet. */
  onAskName?: () => void;
  /**
   * A shared tree (wave 5, спец-друзья 8.4): a tap waters my half. It grows (the usual show, "+1")
   * only when the friend has watered too; my half alone revives it halfway, without "+1".
   * With one half watered the tree is half thirsty.
   * `hours` — my half's watering hours; `canNow` — my half can be watered right now (OYUUR-34).
   */
  shared?: { mine: boolean; theirs: boolean; onWater: () => void; hours: WithHours; canNow: () => boolean };
}

/** The watering hour came: the tree turns thirsty in this long, ms (OYUUR-33, frames 10a–c). */
const HOUR_TURN = 600;

/** Smallest drawn height of a far tree, px (spec section 2). */
const MIN_FAR_HEIGHT = 28;

/** The canvas reaches a little under the bottom sheet, so the soil is never cut. */
const BELOW = 34;

/** Wind sway by stage: small plants bend more. */
const SWAY: Record<Look, number> = { sprout: 1.4, seedling: 1.3, bush: 1.1, young: 1, tree: 0.8, grand: 0.65, deadSmall: 1, dead: 1 };

// The tree's size on screen lives in bubble.ts (pure, tested); others import it from here.
export { treeK } from './bubble';

/** `half`: my half of a shared tree — no growth, no "+1". */
type Show = { kind: 'idle' } | { kind: 'water' | 'stage'; from: number; to: number; id: number; half?: boolean };

export function LiveTree({ tree, geo, depth, wind, animations, onBusyChange, onReady, askName = false, askFresh = false, onAskShown, onAskName, shared }: LiveTreeProps) {
  const { tapTree, today, t, night, clock, canWaterNow } = useStore();
  // Whether my half of a shared tree can be watered right now (its data is the friends' state).
  const friends = useFriends();
  // The meadow's earth under the tree (paletteFor) and its horizon for the haze.
  const { theme, palette } = useMeadow();
  const reduced = !animations;
  const plainMood = treeMood(tree, today);
  // Before its watering hour (OYUUR-33 5.1) the tree waits calmly: it doesn't ask for water.
  const hours: WithHours = shared?.hours ?? tree;
  const waiting = plainMood === 'thirsty' && !shared?.mine && !canWaterAt(hours, today, clock);
  // A shared tree with my half watered rests: nothing more for me to do today.
  const mood = (shared?.mine || waiting) && plainMood === 'thirsty' ? 'watered' : plainMood;
  // A shared tree with one half watered: half the thirst at most (one of us) and at least (me only).
  const halfCap = shared && shared.mine !== shared.theirs ? 0.5 : 1;
  const halfFloor = shared && shared.mine && !shared.theirs ? 0.5 : 0;
  const days = growthDays(tree);
  const dead = isDead(tree);
  const skin = tree.skin;
  const colors = liveColors(night);

  const [show, setShow] = useState<Show>({ kind: 'idle' });
  // The leaves stop hanging the moment the tree comes back to life.
  const [revived, setRevived] = useState(false);
  const [skippable, setSkippable] = useState(false);
  const [chip, setChip] = useState({ pulse: 0, text: '' });
  // A new generation of the habit on show fades in; a tree that came with the camera doesn't.
  const [soft] = useState(() => animations && sameLineage(tree.lineageId));

  // ---- Geometry (px, from the tree's feet) ----
  const k = treeK(geo);
  const size = drawnSize(skin, days, dead, k);
  const crown = { x: 0, y: -size.h * 0.6 };
  const spot = bubbleSpot(skin, days, dead, geo);
  const hole = holeWidth(size.w);
  const look = lookOf(days, dead);
  const period = look === 'sprout' || look === 'seedling' ? 2.4 : 3.2;
  const phase = ((hashString(tree.id) % 1000) / 1000) * Math.PI * 2;
  const sway = SWAY[look] * (dead ? 0.25 : 1);
  const growFrom = show.kind === 'water' ? treeZoom(skin, show.from, false) / treeZoom(skin, show.to, false) : 1;
  const hazeRgb = hexRgb(theme.sky[night ? 'night' : 'day'].horizon);

  // ---- The clock and everything derived from it ----
  const ms = useSharedValue(mood === 'thirsty' ? -1 : DONE);
  const stageMode = useSharedValue(0);
  const poke = useSharedValue(-1);
  const skipAt = useSharedValue(-1);
  const appear = useSharedValue(soft ? 0 : 1);
  // 0 by day, 1 by night; follows the theme over 0.9 s, like the sky and the meadow.
  const nightness = useSharedValue(night ? 1 : 0);
  useEffect(() => {
    nightness.set(animations ? withTiming(night ? 1 : 0, { duration: 900, easing: Easing.inOut(Easing.cubic) }) : night ? 1 : 0);
  }, [night, animations, nightness]);
  // Joy after a name (wave 4, 4): ms into the sway, −1 — still.
  const joy = useSharedValue(-1);
  const tokenFrom = useSharedValue<Point>({ x: 0, y: 0 });
  const tokenTo = useSharedValue<Point>({ x: 0, y: 0 });

  // How thirsty the tree at rest looks: 1, unless its watering hour has just come (0 → 1 in 0.6 s).
  const thirstIn = useSharedValue(1);
  const frame = useDerivedValue(() => {
    const m = ms.get();
    return m < 0 ? restFrame(thirstIn.get()) : frameAt(m, stageMode.get() === 1, reduced);
  }, [reduced]);
  // The half thirst of a shared tree eases in with the watering, never jumps.
  const cap = useSharedValue(halfCap);
  const floor = useSharedValue(halfFloor);
  useEffect(() => {
    const to = (v: number) => (reduced ? v : withTiming(v, { duration: 700, easing: Easing.out(Easing.cubic) }));
    cap.set(to(halfCap));
    floor.set(to(halfFloor));
  }, [halfCap, halfFloor, reduced, cap, floor]);
  const fade = useDerivedValue(() => {
    const s = skipAt.get();
    return s < 0 ? 1 : 1 - seg(ms.get(), s, s + SKIP_FADE);
  });
  const slot = useDerivedValue(() => slotAt(depth.get(), geo), [geo]);
  // Far away a tree is never drawn under 28 px tall, same as the neighbors' pictures,
  // so a sprout doesn't jump when its picture and the live tree swap.
  const minScale = Math.min(1, MIN_FAR_HEIGHT / size.h);
  const feet = useDerivedValue(() => {
    const s = slot.get();
    return [{ translateX: s.x }, { translateY: s.feetY }, { scale: Math.max(s.scale, minScale) * lerp(0.96, 1, appear.get()) }];
  }, [minScale]);
  const feetAlpha = useDerivedValue(() => slot.get().opacity * appear.get());

  // Wind, pose and the little extra motions, around the feet.
  const pose = useDerivedValue(() => {
    const f = frame.get();
    const time = wind.t.get();
    const gust = wind.gust.get();
    const th = f.thirst;
    const w = 2 * Math.PI * time;
    // A thirsty tree sways slower and less. Two swings mixed, so the change never jumps.
    const swing = lerp(Math.sin(w / period + phase), Math.sin(w / (period * 1.2) + phase), th);
    const windDeg = (0.5 + 1.6 * gust) * sway * lerp(1, 0.6, th) * swing + (dead ? 0 : 1.2 * gust);
    const p = poke.get();
    // θ = 3°·e^(−t/250)·sin(2πt/350): right, left, and it calms down.
    const j = joy.get();
    const glee = j >= 0 ? 3 * Math.exp(-j / 250) * Math.sin((2 * Math.PI * j) / 350) : 0;
    const turn = lerp(-1.5, 0, f.pose) + (p >= 0 ? wiggleAt(p) : 0) + f.jitter * Math.sin((2 * Math.PI * 9 * ms.get()) / 1000) + glee;
    const breath = 1 + 0.008 * Math.sin(w / 1.1);
    return {
      skew: (-windDeg * Math.PI) / 180,
      rot: (turn * Math.PI) / 180,
      sx: lerp(1.02, 1, f.pose) * f.squashX * breath,
      sy: lerp(0.955, 1, f.pose) * f.squashY,
    };
  }, [period, phase, sway, dead]);
  const mainTransform = useDerivedValue(() => {
    const p = pose.get();
    const f = frame.get();
    const grow = stageMode.get() === 1 ? f.newScale : lerp(growFrom, 1, f.grow);
    return [{ skewX: p.skew }, { rotate: p.rot }, { scaleX: p.sx }, { scaleY: p.sy }, { scale: grow }];
  }, [growFrom]);
  const ghostTransform = useDerivedValue(() => {
    const p = pose.get();
    return [{ skewX: p.skew }, { rotate: p.rot }, { scaleX: p.sx }, { scaleY: p.sy }, { scale: frame.get().oldScale }];
  });
  const mainAlpha = useDerivedValue(() => (stageMode.get() === 1 ? frame.get().newAlpha : 1));
  const ghostAlpha = useDerivedValue(() => (stageMode.get() === 1 ? frame.get().oldAlpha : 0));
  const mainMatrix = useDerivedValue(() => {
    const f = frame.get();
    const thirst = Math.max(f.thirst * cap.get(), floor.get());
    return treeMatrix(dead ? 0 : thirst, f.glow, stageMode.get() === 1 ? f.white : 0, slot.get().haze, hazeRgb, nightness.get(), skin);
  }, [dead, hazeRgb, skin]);
  // The moon spot: only while the tree is thirsty and only at night; it leaves with the thirst.
  const moonAlpha = useDerivedValue(() => frame.get().thirst * nightness.get());
  const ghostMatrix = useDerivedValue(() => {
    const f = frame.get();
    return treeMatrix(f.thirst, f.glow, 0, slot.get().haze, hazeRgb, nightness.get(), skin);
  }, [hazeRgb, skin]);

  // ---- Timers for the moments React and the phone take part in ----
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  const at = (delay: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, delay));
  };
  // What must not be left behind if the tree goes away mid-show.
  const pending = useRef({ banner: false, token: false });

  const land = () => {
    if (!pending.current.token) return;
    pending.current.token = false;
    tokenLanded.emit({ treeId: tree.id });
  };
  const hideBanner = () => {
    if (!pending.current.banner) return;
    pending.current.banner = false;
    banner.emit(null);
  };

  const finish = () => {
    clearTimers();
    land();
    hideBanner();
    cancelAnimation(ms);
    stageMode.set(0);
    skipAt.set(-1);
    ms.set(DONE);
    setShow({ kind: 'idle' });
    setRevived(false);
    setSkippable(false);
  };

  // Start the show once it is on screen (layout effect: before the frame is painted).
  useLayoutEffect(() => {
    if (show.kind === 'idle') return;
    const stage = show.kind === 'stage';
    stageMode.set(stage ? 1 : 0);
    skipAt.set(-1);
    ms.set(0);
    const total = busyTime(stage, reduced);
    ms.set(withTiming(total, { duration: total, easing: Easing.linear }));
    const next = stage ? stageUp(show.from, show.to) : null;
    const showBanner = () => {
      if (!next) return;
      pending.current.banner = true;
      banner.emit({ treeId: tree.id, stage: next, days: show.to, reduced });
      setSkippable(true);
    };
    if (reduced) {
      at(REDUCED.fade, () => cue('revive'));
      land();
      if (stage) {
        at(REDUCED.fade, () => {
          cue('stageFlash');
          showBanner();
        });
        at(REDUCED.fade + REDUCED.banner, finish);
      } else {
        at(REDUCED.fade, finish);
      }
    } else {
      at(WATER.reviveFrom, () => setRevived(true));
      at(WATER.success, () => cue('revive'));
      if (stage) {
        const c = (after: number) => STAGE.origin + after;
        // The gathering's three taps (0 / 150 / 300) and the chord that swells into the flash.
        at(c(0), () => cue('stageGather'));
        // The flash, and STAGE.success − STAGE.flash = 150 ms later the success.
        at(c(STAGE.flash), () => cue('stageFlash'));
        at(c(STAGE.bannerFrom), showBanner);
        at(c(STAGE.bannerTo), hideBanner);
      }
      at(landingTime(stage, false), () => {
        land();
        if (!show.half) cue('grow');
      });
      at(total, finish);
    }
    return clearTimers;
    // Runs once per show; the rest is read when it starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // At rest the clock just says how the tree looks: thirsty, or watered (also dead / resting).
  useEffect(() => {
    if (show.kind !== 'idle') return;
    ms.set(mood === 'thirsty' ? -1 : DONE);
  }, [mood, show.kind, ms]);

  useEffect(() => {
    onBusyChange?.(show.kind !== 'idle');
  }, [show.kind, onBusyChange]);

  // ---- The watering hour came while the screen is open (OYUUR-33 5.1, frames 10a–c) ----
  // One drawing turns thirsty in 0.6 s (the colors and the pose; the leaves droop halfway), one
  // drop falls into the hole, no sound; the "water me" bubble comes up after it. 1 — the colors
  // move, 2 — the leaves hang, 0 — over.
  const [wake, setWake] = useState<0 | 1 | 2>(0);
  const dropT = useSharedValue(-1);
  const wasWaiting = useRef(waiting);
  const wakeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => wakeTimers.current.forEach(clearTimeout), []);
  useLayoutEffect(() => {
    const was = wasWaiting.current;
    wasWaiting.current = waiting;
    if (!was || waiting || mood !== 'thirsty' || show.kind !== 'idle' || reduced) return;
    thirstIn.set(0);
    thirstIn.set(withTiming(1, { duration: HOUR_TURN, easing: Easing.inOut(Easing.cubic) }));
    dropT.set(0);
    dropT.set(withTiming(HOUR_DROP.end, { duration: HOUR_DROP.end, easing: Easing.linear }, (done) => {
      if (done) dropT.set(-1);
    }));
    setWake(1);
    wakeTimers.current.forEach(clearTimeout);
    wakeTimers.current = [setTimeout(() => setWake(2), HOUR_TURN / 2), setTimeout(() => setWake(0), HOUR_DROP.end + 150)];
    // Only when the waiting ends; the rest is read then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  // Appear, then tell the screen the live tree is drawn.
  useEffect(() => {
    rememberLineage(tree.lineageId);
    let frameId = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (soft) {
      appear.set(withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) }));
      timer = setTimeout(() => onReady?.(), 240);
    } else {
      frameId = requestAnimationFrame(() => {
        frameId = requestAnimationFrame(() => onReady?.());
      });
    }
    return () => {
      cancelAnimationFrame(frameId);
      if (timer) clearTimeout(timer);
    };
    // Once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving mid-show: give the counter its number and take the ribbon away.
  useEffect(
    () => () => {
      clearTimers();
      land();
      hideBanner();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ---- Taps ----
  const root = useRef<ComponentRef<typeof View>>(null);
  const aimToken = (stage: boolean) => {
    // Watering: over the crown. Celebration: out of the flash at the right of the crown,
    // so it goes up the right side and never through the ribbon.
    const start = stage
      ? { x: Math.min(geo.width / 2 + size.w * 0.42, geo.width - 72), y: geo.feetY + crown.y }
      : { x: geo.width / 2 + crown.x, y: Math.max(geo.feetY - size.h - 14, geo.headerBottom + 18) };
    tokenFrom.set(start);
    tokenTo.set({ x: geo.width / 2 - 40, y: geo.headerBottom - 70 });
    Promise.all([
      measureRing(),
      new Promise<Point | null>((resolve) => {
        if (!root.current) return resolve(null);
        root.current.measureInWindow((x: number, y: number) => resolve({ x, y }));
      }),
    ]).then(([ring, origin]) => {
      if (ring && origin) tokenTo.set({ x: ring.x - origin.x, y: ring.y - origin.y });
    });
  };

  const onTap = () => {
    if (show.kind !== 'idle' || !isGrowing(tree)) return;
    if (Math.abs(depth.get()) > 0.3) return;
    // My half of a shared tree that can't be watered now (signed out, the tree stopped meanwhile):
    // the watering would do nothing, so nothing plays — no "+1", no growth.
    if (shared && !shared.mine && !canWaterShared(friends.shared.find((s) => sharedTreeId(s.id) === tree.id), friends.account?.nick ?? null, today)) {
      cue('error');
      return;
    }
    // Before the watering hour (read from the clock now): a hint, not a watering — nothing flies,
    // nothing is paid (OYUUR-33 5.2).
    const early = shared ? !shared.mine && !shared.canNow() : plainMood === 'thirsty' && !canWaterNow(tree);
    if (early) {
      tooEarly(true);
      return;
    }
    const before = growthDays(tree);
    const next = stageUp(before, before + 1);
    // My half of a shared tree, the friend's not yet: it comes to life halfway, no growth.
    const half = !!shared && !shared.mine && !shared.theirs;
    // The counter must keep its old number until the token lands: tell it before the store changes.
    // (Not `mood`: the screen's clock may still say "waiting" for a few seconds after the hour came.)
    const expect = plainMood === 'thirsty' && !shared?.mine && !half;
    if (expect) {
      pending.current.token = true;
      tokenLaunched.emit({ treeId: tree.id, arriveIn: landingTime(!!next, reduced) });
      aimToken(!!next);
    }
    if (shared && !shared.mine) {
      shared.onWater();
      cue('water');
      if (reduced) setRevived(true);
      setShow(half ? { kind: 'water', from: before, to: before, id: Date.now(), half: true } : { kind: next ? 'stage' : 'water', from: before, to: before + 1, id: Date.now() });
      return;
    }
    const result = shared ? 'already' : tapTree(tree.id);
    if (result === 'early') {
      // The clock passed the hour back meanwhile (the time changed): the same hint.
      land();
      tooEarly(true);
      return;
    }
    if (result === 'grown') {
      cue('water');
      if (reduced) setRevived(true);
      setShow({ kind: next ? 'stage' : 'water', from: before, to: before + 1, id: Date.now() });
      return;
    }
    land();
    if (result === 'already' || result === 'closed') {
      cue('already');
      setChip((c) => ({ pulse: c.pulse + 1, text: t(result === 'already' ? 'alreadyWatered' : 'dayClosed') }));
      if (animations) {
        poke.set(0);
        poke.set(withTiming(1000, { duration: 1000, easing: Easing.linear }, (done) => {
          if (done) poke.set(-1);
        }));
      }
    }
  };
  /** "Too early: in 3 h 20 min": a light sway, the quiet `already` sound (only for a tap), the pill. */
  const minutesToOpen = useMinutesToOpen();
  const [early, setEarly] = useState({ pulse: 0, text: '' });
  const tooEarly = (tapped: boolean) => {
    setEarly((e) => ({ pulse: e.pulse + 1, text: earlyText(minutesToOpen(hours), t) }));
    if (!tapped) return;
    cue('already');
    earlyTap.emit({ treeId: tree.id });
    if (animations) {
      poke.set(0);
      poke.set(withTiming(1000, { duration: 1000, easing: Easing.linear }, (done) => {
        if (done) poke.set(-1);
      }));
    }
  };
  const earlyRef = useRef(tooEarly);
  earlyRef.current = tooEarly;
  useChannel(
    showEarly,
    useCallback((e: { treeId: string }) => e.treeId === tree.id && earlyRef.current(false), [tree.id]),
  );
  const onChangeTime = useCallback(() => askTime.emit({ treeId: tree.id }), [tree.id]);
  useChannel(
    treeNote,
    useCallback((e: { treeId: string; text: string }) => {
      if (e.treeId === tree.id) setChip((c) => ({ pulse: c.pulse + 1, text: e.text }));
    }, [tree.id]),
  );

  const tapRef = useRef(onTap);
  tapRef.current = onTap;

  const skip = () => {
    if (show.kind !== 'stage' || !skippable) return;
    clearTimers();
    hideBanner();
    land();
    cue('select');
    setSkippable(false);
    const now = ms.get();
    cancelAnimation(ms);
    skipAt.set(now);
    ms.set(withTiming(now + SKIP_FADE, { duration: SKIP_FADE, easing: Easing.linear }));
    at(SKIP_FADE, finish);
  };
  const skipRef = useRef(skip);
  skipRef.current = skip;
  useChannel(skipCelebration, useCallback(() => skipRef.current(), []));

  // The tree got its name: it sways with joy from its feet, 360–1060 ms after the tap.
  useChannel(
    cheer,
    useCallback(
      (e: { treeId: string }) => {
        if (e.treeId !== tree.id || reduced) return;
        joy.set(0);
        joy.set(withDelay(360, withTiming(700, { duration: 700, easing: Easing.linear }, (done) => {
          if (done) joy.set(-1);
        })));
      },
      [tree.id, reduced, joy],
    ),
  );

  // While "Already watered" shows over the crown the name bubble steps aside, then comes back.
  const [chipUp, setChipUp] = useState(false);
  useEffect(() => {
    if (!chip.pulse) return;
    setChipUp(true);
    const id = setTimeout(() => setChipUp(false), CHIP.in + CHIP.hold + CHIP.out);
    return () => clearTimeout(id);
  }, [chip.pulse]);
  const [earlyUp, setEarlyUp] = useState(false);
  useEffect(() => {
    if (!early.pulse) return;
    setEarlyUp(true);
    const id = setTimeout(() => setEarlyUp(false), 3000);
    return () => clearTimeout(id);
  }, [early.pulse]);

  const treeTap = useTapGesture({ maxDistance: 10, runOnJS: true, onActivate: () => tapRef.current() });

  // ---- Drawing ----
  const thirstyLook = show.kind === 'idle' ? mood === 'thirsty' && wake !== 1 : !revived;
  const droop = thirstyLook ? halfCap : halfFloor;
  const neutralSoil = mood === 'dead' || mood === 'resting';
  const ghost = show.kind === 'stage' ? show.from : null;
  const next = show.kind === 'stage' ? stageUp(show.from, show.to) : null;
  const canvasH = geo.height + BELOW;
  const bubbleShown = (mood === 'thirsty' && wake === 0) || show.kind !== 'idle';
  const hit = { w: Math.max(size.w, 96), h: size.h + 24 };
  const label = waiting
    ? t('wbFrom', { time: hourText(wateringOpensAt(hours, today), t.lang) })
    : mood === 'thirsty' ? t('waterMe') : t('alreadyWatered');
  const treeProps = { palette, skin, seed: tree.id, k };

  return (
    <View ref={root} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Canvas style={{ position: 'absolute', left: 0, top: 0, width: geo.width, height: canvasH }}>
          {next && (
            <Dim width={geo.width} height={canvasH} cx={geo.width / 2} cy={geo.feetY + crown.y} frame={frame} fade={fade} colors={colors} />
          )}
          <Group transform={feet} opacity={feetAlpha}>
            {next && <Rays cx={crown.x} cy={crown.y} frame={frame} fade={fade} bright={next === 'grand'} />}
            {bubbleShown && <MoonLight treeW={size.w} treeH={size.h} alpha={moonAlpha} />}
            <Soil width={hole} frame={frame} neutral={neutralSoil} colors={colors} skin={skin} />
            {bubbleShown && <MoonGround treeW={size.w} alpha={moonAlpha} />}
            {ghost !== null && (
              <Group layer={<Paint><ColorMatrix matrix={ghostMatrix} /></Paint>} transform={ghostTransform} opacity={ghostAlpha}>
                <TreeBody {...treeProps} days={ghost} ground={false} />
              </Group>
            )}
            <Group layer={<Paint><ColorMatrix matrix={mainMatrix} /></Paint>} transform={mainTransform} opacity={mainAlpha}>
              <TreeBody {...treeProps} days={days} dead={dead} completed={tree.completedOn !== null} thirst={droop} ground={false} />
            </Group>
            {!reduced && show.kind !== 'idle' && <WateringCan frame={frame} />}
            {next && <Flash cx={crown.x} cy={crown.y} reach={1.3 * Math.max(geo.width, geo.height)} frame={frame} fade={fade} colors={colors} />}
            <Particles
              frame={frame}
              ms={ms}
              stage={stageMode}
              poke={poke}
              fade={fade}
              reduced={reduced}
              bounds={{ width: geo.width, height: canvasH }}
              scene={{ crownX: crown.x, crownY: crown.y, treeW: size.w, treeH: size.h, bubbleX: spot.x, bubbleY: spot.y, skin, big: next === 'grand' }}
            />
          </Group>
          {!reduced && show.kind !== 'idle' && !show.half && <Token frame={frame} from={tokenFrom} to={tokenTo} fade={fade} stage={show.kind === 'stage'} />}
        </Canvas>
      </View>

      {isGrowing(tree) && (
        <GestureDetector gesture={treeTap}>
          <Animated.View
            testID="tree"
            accessibilityRole="button"
            accessibilityLabel={label}
            style={[styles.hit, { left: geo.width / 2 - hit.w / 2, top: geo.feetY - hit.h + 8, width: hit.w, height: hit.h }]}
          />
        </GestureDetector>
      )}
      {bubbleShown && isGrowing(tree) && (
        <ThirstBubble
          spot={spot}
          geo={geo}
          depth={depth}
          time={wind.t}
          nightness={nightness}
          background={colors.bubble}
          animations={animations}
          popping={show.kind !== 'idle'}
          label={t('waterMe')}
          onTap={() => tapRef.current()}
        />
      )}
      {/* Never with the "water me" bubble: that one is for a thirsty tree, this one for a watered one. */}
      {askName && !bubbleShown && isGrowing(tree) && (
        <NameBubble
          spot={spot}
          geo={geo}
          depth={depth}
          time={wind.t}
          nightness={nightness}
          background={colors.bubble}
          ink={colors.bubbleInk}
          animations={animations}
          fresh={askFresh}
          hidden={chipUp || earlyUp}
          label={t('nameAsk')}
          a11yLabel={t('nameAskA11y')}
          onTap={() => onAskName?.()}
          onShown={onAskShown}
        />
      )}
      <AlreadyChip pulse={chip.pulse} text={chip.text} top={Math.max(-size.h - 44, geo.headerBottom + 8 - geo.feetY)} geo={geo} depth={depth} />
      <EarlyChip pulse={early.pulse} text={early.text} top={Math.max(-size.h - 48, geo.headerBottom + 8 - geo.feetY)} geo={geo} depth={depth} onChange={onChangeTime} />
      {!reduced && <HourDrop t={dropT} geo={geo} depth={depth} dx={Math.max(12, hole * 0.3)} />}
      {show.kind === 'stage' && skippable && <Pressable style={StyleSheet.absoluteFill} onPress={skip} accessibilityLabel={t('newStage')} />}
    </View>
  );
}

// ---- The moon spot (wave 2 spec, 5.3): a thirsty tree at night stands in soft moonlight
// instead of grey murk. Drawn around the feet, behind the tree. ----

// The spec's α 0.22 / 0.18 read much thinner on the phone than in frame 13: the light
// is held brighter over its middle half and reaches a little past the crown.
/** Soft light around the trunk: an ellipse fading out from the middle. */
function MoonLight({ treeW, treeH, alpha }: { treeW: number; treeH: number; alpha: SharedValue<number> }) {
  const rx = Math.max(0.95 * treeW, 120);
  const ry = 0.8 * treeH + 24;
  const cy = -0.48 * treeH;
  return (
    <Group opacity={alpha} transform={[{ translateY: cy }, { scaleY: ry / rx }]}>
      <Circle cx={0} cy={0} r={rx}>
        <RadialGradient c={vec(0, 0)} r={rx} colors={[moon(0.4), moon(0.26), moon(0)]} positions={[0, 0.5, 1]} />
      </Circle>
    </Group>
  );
}

/** The lit patch of ground at the feet, the tree's width and 22 px tall. */
function MoonGround({ treeW, alpha }: { treeW: number; alpha: SharedValue<number> }) {
  const rx = Math.max(0.5 * treeW, 40);
  return (
    <Group opacity={alpha} transform={[{ scaleY: 11 / rx }]}>
      <Circle cx={0} cy={0} r={rx}>
        <RadialGradient c={vec(0, 0)} r={rx} colors={[moon(0.36), moon(0.3), moon(0)]} positions={[0, 0.5, 1]} />
      </Circle>
    </Group>
  );
}

const moon = (a: number) => {
  const [r, g, b] = hexRgb(MOON);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
};

const styles = StyleSheet.create({
  hit: { position: 'absolute' },
});
