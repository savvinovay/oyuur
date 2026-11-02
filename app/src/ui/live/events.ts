// How the live tree talks to the parts of the screen it doesn't own: the ring counter
// in the header (where to fly the +1, when it landed) and the "new stage" ribbon.
// Plain listeners, no React state: a few events per watering.
import { useEffect } from 'react';
import { Stage } from '@/game/tree';

function channel<T>() {
  const listeners = new Set<(value: T) => void>();
  return {
    emit(value: T) {
      listeners.forEach((l) => l(value));
    },
    on(listener: (value: T) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Subscribe for the life of a component. */
export function useChannel<T>(ch: { on(l: (v: T) => void): () => void }, listener: (v: T) => void) {
  useEffect(() => ch.on(listener), [ch, listener]);
}

/**
 * Sent right before the tap reaches the store: the counter of this tree should keep
 * showing the old number until the token lands (in `arriveIn` ms, 0 = right away).
 */
export const tokenLaunched = channel<{ treeId: string; arriveIn: number }>();

/** The +1 reached the counter (or the celebration was skipped): show the new number. */
export const tokenLanded = channel<{ treeId: string }>();

export interface BannerShow {
  treeId: string;
  stage: Stage;
  days: number;
  /** Animations off: just fade in and out. */
  reduced: boolean;
}

/** The ribbon: a new stage to show, or null to take it away. */
export const banner = channel<BannerShow | null>();

/** The user tapped the ribbon: skip the rest of the celebration. */
export const skipCelebration = channel<void>();

export type Point = { x: number; y: number };

// Measures where the middle of the rings icon is now, in window coordinates. Set by the
// counter while it is on screen; asked at the moment of a tap, so a header that moved
// with the camera is measured where it really is.
let ringMeasure: (() => Promise<Point | null>) | null = null;
export function setRingMeasure(measure: (() => Promise<Point | null>) | null) {
  ringMeasure = measure;
}
export const measureRing = (): Promise<Point | null> => (ringMeasure ? ringMeasure() : Promise.resolve(null));

// The habit whose live tree was mounted last. A new tree of the same habit is another
// generation: it appears softly. A different habit came in with the camera: no fade,
// its picture is already standing there.
let lastLineage: string | null = null;
export const sameLineage = (lineageId: string) => lastLineage === lineageId;
export function rememberLineage(lineageId: string) {
  lastLineage = lineageId;
}

/** The tree got (or changed, or lost) its name: the header plays its part of the show (wave 4, 4). */
export const named = channel<{ treeId: string; kind: 'named' | 'renamed' | 'removed'; reduced: boolean }>();

/** The tree sways with joy (wave 4, 4). */
export const cheer = channel<{ treeId: string }>();

// ---- Watering time (OYUUR-33, 5.2) ----

/** A "too early" tap on this tree: the status line counts them (the third in 10 s pulses its arrow). */
export const earlyTap = channel<{ treeId: string }>();

/** Open the watering-time sheet of this tree (the main screen's id; a shared tree's is `shared:<id>`). */
export const askTime = channel<{ treeId: string }>();

/** Show the "Too early" pill over this tree without a tap (a quest's "go" to a tree that waits). */
export const showEarly = channel<{ treeId: string }>();

/** A short note over this tree's crown, like "Already watered" (the watering time was changed). */
export const treeNote = channel<{ treeId: string; text: string }>();
