// The camera of the forest map (spec 2): three shared values on the UI thread, read by
// the ground canvas, the world of tree pictures and the markers. React does not re-render
// while the camera moves.
// The map is laid out against a fixed reference area (from under the header to the top of
// the folded sheet), so it stays still while the sheet slides. Views that should fit the
// area actually visible (the whole plot, a tree above the card) are computed against the
// live sheet height every frame of their flight, so they land right even while the sheet moves.
import { useCallback, useEffect, useMemo } from 'react';
import {
  cancelAnimation, SharedValue, useAnimatedReaction, useSharedValue, withDecay, withSpring, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { motion } from '@/ui/ds/tokens';
import { Area, Cam, camRange, chooseCam, clampCam, plotWithTrees, rubberCam, treesCam, wholeCam } from './iso';
import type { MapItem } from './model';

/** "At the whole plot" while zoom and centre are within 2 % (2.5). */
const FIT_TOLERANCE = 0.02;
const DECAY = 0.997;

export interface FlyOptions {
  duration: number;
  easing?: (t: number) => number;
  /** The target is relative to the live visible area (default) or already in map coordinates. */
  live?: boolean;
  onDone?: () => void;
}

interface Options {
  size: number;
  width: number;
  height: number;
  areaTop: number;
  sheetVisible: SharedValue<number>;
  /** Visible height of the folded sheet (80 + bottom inset): the reference the map is laid out against. */
  restSheet: number;
  animations: boolean;
  onFitChange: (atFit: boolean) => void;
}

export type MapCamera = ReturnType<typeof useMapCamera>;

export function useMapCamera({ size, width, height, areaTop, sheetVisible, restSheet, animations, onFitChange }: Options) {
  // The reference area: every camera value below is relative to it.
  const view: Area = useMemo(() => ({ width, top: areaTop, bottom: height - restSheet }), [width, areaTop, height, restSheet]);
  const anchorY = (view.top + view.bottom) / 2;

  const cx = useSharedValue(0);
  const cy = useSharedValue(plotWithTrees(size).bottom / 2);
  const z = useSharedValue(1);
  const plotSize = useSharedValue(size);
  useEffect(() => {
    plotSize.value = size;
  }, [size, plotSize]);

  const flight = useSharedValue(0);
  const flying = useSharedValue(false);
  const flyFrom = useSharedValue<Cam>({ x: 0, y: 0, z: 1 });
  const flyTo = useSharedValue<Cam>({ x: 0, y: 0, z: 1 });
  const flyLive = useSharedValue(true);
  /** Coasting after a swipe: a tap stops it. */
  const coasting = useSharedValue(false);

  // Until the sheet has shown itself its height is 0: the area is taken over the folded sheet,
  // or the trees at the bottom of the opening view would end up under it.
  const sheetSeen = useSharedValue(false);
  useAnimatedReaction(
    () => sheetVisible.value > 0,
    (seen) => {
      if (seen && !sheetSeen.value) sheetSeen.value = true;
    },
  );

  /** The area actually visible now, over the live sheet. */
  const liveArea = useCallback((): Area => {
    'worklet';
    return { width, top: areaTop, bottom: height - (sheetSeen.value ? sheetVisible.value : restSheet) };
  }, [width, areaTop, height, sheetVisible, sheetSeen, restSheet]);

  /** A camera relative to `area` → map coordinates. */
  const fromArea = useCallback((cam: Cam, area: Area): Cam => {
    'worklet';
    return { x: cam.x, y: cam.y - ((area.top + area.bottom) / 2 - anchorY) / cam.z, z: cam.z };
  }, [anchorY]);

  /** Map coordinates → a camera relative to `area`. */
  const toArea = useCallback((cam: Cam, area: Area): Cam => {
    'worklet';
    return { x: cam.x, y: cam.y + ((area.top + area.bottom) / 2 - anchorY) / cam.z, z: cam.z };
  }, [anchorY]);

  const current = useCallback((): Cam => {
    'worklet';
    return { x: cx.value, y: cy.value, z: z.value };
  }, [cx, cy, z]);

  const set = useCallback((cam: Cam) => {
    'worklet';
    cx.value = cam.x;
    cy.value = cam.y;
    z.value = cam.z;
  }, [cx, cy, z]);

  /** Stops every camera motion (a finger came down). */
  const stop = useCallback(() => {
    'worklet';
    flying.value = false;
    coasting.value = false;
    cancelAnimation(flight);
    cancelAnimation(cx);
    cancelAnimation(cy);
    cancelAnimation(z);
  }, [flying, coasting, flight, cx, cy, z]);

  // A flight: zoom changes evenly in scale, the centre moves along; a live target follows the sheet.
  useAnimatedReaction(
    () => [flight.value, sheetVisible.value],
    ([p]) => {
      if (!flying.value) return;
      const to = flyLive.value ? fromArea(flyTo.value, liveArea()) : flyTo.value;
      const from = flyFrom.value;
      cx.value = from.x + (to.x - from.x) * p;
      cy.value = from.y + (to.y - from.y) * p;
      z.value = from.z * Math.pow(to.z / from.z, p);
    },
    [fromArea, liveArea],
  );

  /** Moves the camera to `target` (relative to the live area unless `live: false`). */
  const go = useCallback((target: Cam, { duration, easing = motion.ease.inOut, live = true, onDone }: FlyOptions) => {
    stop();
    if (!animations || duration <= 0) {
      set(live ? fromArea(target, liveArea()) : target);
      onDone?.();
      return;
    }
    flyFrom.value = current();
    flyTo.value = target;
    flyLive.value = live;
    flying.value = true;
    flight.value = 0;
    flight.value = withTiming(1, { duration, easing }, (finished) => {
      'worklet';
      if (!finished) return;
      flying.value = false;
      if (onDone) scheduleOnRN(onDone);
    });
  }, [animations, stop, set, fromArea, liveArea, current, flyFrom, flyTo, flyLive, flying, flight]);

  /** Within the limits, in map coordinates. */
  const clampMap = useCallback((cam: Cam): Cam => {
    'worklet';
    return clampCam(cam, plotSize.value, view);
  }, [plotSize, view]);

  const rubberMap = useCallback((cam: Cam): Cam => {
    'worklet';
    return rubberCam(cam, plotSize.value, view);
  }, [plotSize, view]);

  /** A released finger: coast with the speed (px/s), or spring back inside the limits. */
  const release = useCallback((vx: number, vy: number) => {
    'worklet';
    const cam = current();
    const inside = clampMap(cam);
    const spring = motion.spring.sheet;
    if (inside.z !== cam.z || !animations) {
      if (animations) {
        cx.value = withSpring(inside.x, spring);
        cy.value = withSpring(inside.y, spring);
        z.value = withSpring(inside.z, spring);
      } else set(inside);
      return;
    }
    const range = camRange(plotSize.value, cam.z);
    const coast = (sv: SharedValue<number>, v: number, at: number, lo: number, hi: number, to: number) => {
      if (at !== to) {
        sv.value = withSpring(to, spring);
        return;
      }
      coasting.value = true;
      sv.value = withDecay({ velocity: v, deceleration: DECAY, clamp: [lo, hi], rubberBandEffect: true }, () => {
        coasting.value = false;
      });
    };
    coast(cx, -vx / cam.z, cam.x, range.left, range.right, inside.x);
    coast(cy, -vy / cam.z, cam.y, range.top, range.bottom, inside.y);
  }, [current, clampMap, animations, cx, cy, z, set, plotSize, coasting]);

  /** The whole plot (2.5) for the live area, never past the zoom limits. */
  const plotView = useCallback((plot = size): Cam => wholeCam(plot, liveArea(), view), [size, liveArea, view]);

  /** The calm view (2.3): a small plot whole, a big one around every crown; an empty plot from its middle. */
  const treesView = useCallback(
    (items: MapItem[]): Cam => treesCam(size, items.map((i) => ({ cell: i.cell, w: i.w, h: i.h })), liveArea(), view),
    [size, liveArea, view],
  );

  /** "Choose a spot" (4.7), in map coordinates: the sheet is gone, the area runs to the bottom of the screen. */
  const chooseView = useCallback((at: { x: number; y: number }): Cam => {
    const area: Area = { width, top: areaTop, bottom: height };
    return clampCam(fromArea(chooseCam(plotSize.value, at, area), area), plotSize.value, view);
  }, [width, areaTop, height, fromArea, plotSize, view]);

  // "At the whole plot" for the header button: zoom and centre within 2 %.
  useAnimatedReaction(
    () => {
      const area = liveArea();
      const target = fromArea(wholeCam(plotSize.value, area, view), area);
      const box = plotWithTrees(plotSize.value);
      return (
        Math.abs(z.value / target.z - 1) < FIT_TOLERANCE &&
        Math.abs(cx.value - target.x) < FIT_TOLERANCE * (box.right - box.left) &&
        Math.abs(cy.value - target.y) < FIT_TOLERANCE * (box.bottom - box.top)
      );
    },
    (atFit, before) => {
      if (atFit !== before) scheduleOnRN(onFitChange, atFit);
    },
    [liveArea, fromArea, view, onFitChange],
  );

  return {
    cx, cy, z, view, anchorY, plotSize, flying, coasting,
    liveArea, fromArea, toArea, current, set, stop, go, clampMap, rubberMap, release, plotView, treesView, chooseView,
  };
}
