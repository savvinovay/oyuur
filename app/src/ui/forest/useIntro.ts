// The opening show of the forest (spec 2.3, 5.2–5.4), in this order: the camera comes in,
// the plot grows, new trees sprout, the gold ring lands under a tree just locked in. A tap
// skips it: everything jumps to its end state. Without animations the end state comes at once.
import { useCallback, useRef } from 'react';
import { SharedValue, withTiming } from 'react-native-reanimated';
import { cue } from '@/ui/feedback';
import { motion } from '@/ui/ds/tokens';
import { Cam, flyDuration, toScreen, treesBox, Z_MAX } from './iso';
import type { MapItem } from './model';
import type { MapCamera } from './useMapCamera';

/** The camera starts this much further out and comes in (2.3). */
const ENTER_ZOOM = 0.92;
const ENTER_MS = 600;
/** Plot growth (5.3): wait, grow, then back to the trees. */
const GROW_WAIT = 300;
const GROW_MS = 900;
const GROW_BACK = 1300;
/** New trees sprout one after another (5.2). */
const SPROUT_STEP = 140;
const SPROUT_MS = 600;
/** The gold ring: the camera sets off this long after the opening, comes this close (5.4). */
const HIGHLIGHT_WAIT = 400;
const HIGHLIGHT_Z = 1.25;
/** The sheet turns into the tree's card this long after the ring lands. */
const CARD_WAIT = 600;

interface Options {
  animations: boolean;
  size: number;
  grewFrom: number | null;
  cam: MapCamera;
  grow: SharedValue<number>;
  /** Plays a tree's sprout after `delay` ms; `badge` — with the "new" badge. */
  sprout: (id: string, delay: number, badge: boolean) => void;
  /** The end state of a new tree: standing, with its badge. */
  stand: (id: string) => void;
  showGold: (item: MapItem) => void;
  /** `cut`: a finger or a camera move of the screen's own ended the show; the camera is theirs. */
  onDone: (cut: boolean) => void;
}

/** What the intro needs to know when it starts (read once). */
export interface IntroCast {
  items: MapItem[];
  fresh: MapItem[];
  highlight: MapItem | null;
}

export function useIntro(o: Options) {
  const opts = useRef(o);
  opts.current = o;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const running = useRef(false);
  const cast = useRef<IntroCast>({ items: [], fresh: [], highlight: null });

  const after = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const finish = useCallback((cut = false) => {
    if (!running.current) return;
    running.current = false;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    opts.current.onDone(cut);
  }, []);

  /** Where the camera looks at a tree with its whole picture in the area, at least `minZ` close. */
  const treeCam = (item: MapItem, minZ: number): Cam => {
    const z = Math.min(Z_MAX, Math.max(opts.current.cam.z.value, minZ));
    return { x: item.x, y: item.y - item.h / 2, z };
  };

  const highlightStep = (waited: boolean) => {
    const { highlight } = cast.current;
    const { cam, animations } = opts.current;
    if (!highlight) return finish();
    const land = () => {
      if (!running.current) return;
      opts.current.showGold(highlight);
      cue('land');
      after(CARD_WAIT, () => finish());
    };
    const go = () => {
      if (!running.current) return;
      const target = treeCam(highlight, HIGHLIGHT_Z);
      const now = cam.toArea(cam.current(), cam.liveArea());
      const dist = Math.hypot((target.x - now.x) * now.z, (target.y - now.y) * now.z);
      cam.go(target, { duration: animations ? flyDuration(dist) : 0, onDone: land });
    };
    if (waited || !animations) go();
    else after(HIGHLIGHT_WAIT, go);
  };

  const freshStep = () => {
    if (!running.current) return;
    const { fresh } = cast.current;
    const { cam, animations, sprout } = opts.current;
    if (fresh.length === 0) return highlightStep(true);
    const play = () => {
      if (!running.current) return;
      fresh.forEach((item, i) => sprout(item.id, animations ? i * SPROUT_STEP : 0, true));
      cue('reveal');
      after(animations ? (fresh.length - 1) * SPROUT_STEP + SPROUT_MS : 200, () => highlightStep(true));
    };
    // New trees out of sight: the camera flies to them first.
    const box = treesBox(fresh.map((i) => ({ cell: i.cell, w: i.w, h: i.h })))!;
    const area = cam.liveArea();
    const now = cam.toArea(cam.current(), area);
    const a = toScreen(box.left, box.top, now, area);
    const b = toScreen(box.right, box.bottom, now, area);
    if (a.x >= 0 && b.x <= area.width && a.y >= area.top && b.y <= area.bottom) return play();
    const target = cam.treesView(fresh);
    const dist = Math.hypot((target.x - now.x) * now.z, (target.y - now.y) * now.z);
    cam.go(target, { duration: animations ? flyDuration(dist) : 0, onDone: play });
  };

  /** Starts the show; the camera is set at once, so the first frame already shows the forest. */
  const start = useCallback((c: IntroCast) => {
    const { cam, animations, size, grewFrom, grow } = opts.current;
    cast.current = c;
    running.current = true;
    const trees = cam.treesView(c.items);
    const growing = animations && grewFrom !== null && grewFrom < size;
    if (growing) {
      // In the new coordinates the old plot is the middle of the new one.
      const old = cam.plotView(grewFrom);
      const shift = ((size - grewFrom) / 2) * 40;
      cam.go({ ...old, y: old.y + shift }, { duration: 0 });
      grow.value = grewFrom;
      after(GROW_WAIT, () => {
        cue('expand');
        grow.value = withTiming(size, { duration: GROW_MS, easing: motion.ease.out });
        cam.go(cam.plotView(), { duration: GROW_MS });
      });
      after(GROW_BACK, () => cam.go(cam.treesView(cast.current.items), { duration: ENTER_MS, onDone: freshStep }));
      return;
    }
    grow.value = size;
    if (grewFrom !== null && grewFrom < size) cue('expand');
    if (!animations) {
      cam.go(trees, { duration: 0 });
      freshStep();
      return;
    }
    cam.go({ ...trees, z: trees.z * ENTER_ZOOM }, { duration: 0 });
    if (c.fresh.length === 0 && c.highlight) {
      // Only the gold ring: the camera comes in and sets off to the tree 400 ms after opening.
      cam.go(trees, { duration: ENTER_MS, easing: motion.ease.out });
      highlightStep(false);
      return;
    }
    cam.go(trees, { duration: ENTER_MS, easing: motion.ease.out, onDone: freshStep });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Anything the person does during the show: everything to its end state. A tap also puts
   * the camera where the show would leave it (`moveCamera`); a finger that pans, pinches or
   * lifts a tree, or a camera move of the screen's own, keeps the camera as it is: it is
   * theirs now. An interrupted flight never calls its `onDone`, so this is also what ends
   * a show whose flight was cut short.
   */
  const skip = useCallback((moveCamera = true) => {
    if (!running.current) return;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const { cam, size, grow, stand, showGold } = opts.current;
    grow.value = size;
    const { fresh, highlight, items } = cast.current;
    fresh.forEach((i) => stand(i.id));
    if (highlight) {
      if (moveCamera) cam.go(treeCam(highlight, HIGHLIGHT_Z), { duration: 0 });
      showGold(highlight);
    } else if (moveCamera) {
      cam.go(cam.treesView(items), { duration: 0 });
    }
    finish(!moveCamera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finish]);

  const stop = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    running.current = false;
  }, []);

  return { start, skip, stop, isRunning: () => running.current };
}
