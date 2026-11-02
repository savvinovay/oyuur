// What every event feels and sounds like (wave 2 spec, table 4.9), as data, plus the
// pure rules around it. Playing lives in haptic.ts and sound.ts.

export type Cue = 'tap' | 'select' | 'detent' | 'menuOpen' | 'menuClose' | 'water' | 'revive' | 'grow' | 'already'
  | 'stageGather' | 'stageFlash' | 'swipe' | 'theme' | 'lockConfirm' | 'lockIn' | 'fly' | 'land' | 'plant' | 'longPress' | 'delete' | 'error'
  | 'pickUp' | 'hover' | 'place' | 'swap' | 'expand' | 'reveal'
  | 'nameAsk' | 'named'
  | 'acornTick' | 'acornDone' | 'claim' | 'buy' | 'unlock' | 'poor' | 'skinChange' | 'award'
  | 'cheer' | 'incoming' | 'friendAdded';

/** One vibration of expo-haptics: impacts, the selection tick and the three notifications. */
export type HapticKind = 'light' | 'medium' | 'heavy' | 'soft' | 'selection' | 'success' | 'warning' | 'error';

/** A file in app/assets/sounds (spec 4.10). */
export type SoundName = 'tap' | 'pop' | 'menu-open' | 'menu-close' | 'switch' | 'water' | 'grow' | 'stage' | 'lock' | 'whoosh' | 'plant' | 'rustle'
  | 'acorn' | 'spend' | 'unlock' | 'cheer';

export interface HapticStep {
  kind: HapticKind;
  /** ms after the cue. */
  at: number;
}

export interface CueSpec {
  haptic: HapticStep[];
  sound?: SoundName;
  /** 0..1. */
  volume?: number;
}

const now = (kind: HapticKind): HapticStep => ({ kind, at: 0 });

export const CUES: Record<Cue, CueSpec> = {
  tap: { haptic: [now('light')], sound: 'tap', volume: 0.25 },
  select: { haptic: [now('selection')] },
  detent: { haptic: [now('selection')] },
  menuOpen: { haptic: [now('light')], sound: 'menu-open', volume: 0.3 },
  menuClose: { haptic: [now('selection')], sound: 'menu-close', volume: 0.25 },
  water: { haptic: [now('light')], sound: 'water', volume: 0.55 },
  // The water is still sounding.
  revive: { haptic: [now('success')] },
  grow: { haptic: [now('selection')], sound: 'grow', volume: 0.45 },
  already: { haptic: [now('soft')], sound: 'rustle', volume: 0.3 },
  // The celebration starts (its C = 0): three taps of gathering, the chord swells into the flash.
  stageGather: { haptic: [now('light'), { kind: 'light', at: 150 }, { kind: 'medium', at: 300 }], sound: 'stage', volume: 0.5 },
  // The flash itself sounds inside `stage`.
  stageFlash: { haptic: [now('heavy'), { kind: 'success', at: 150 }] },
  // A click on every habit passed; the sound once, when the camera stops (see cueSound).
  swipe: { haptic: [now('selection')], sound: 'switch', volume: 0.2 },
  theme: { haptic: [now('light')], sound: 'switch', volume: 0.2 },
  lockConfirm: { haptic: [now('medium')] },
  lockIn: { haptic: [now('success')], sound: 'lock', volume: 0.5 },
  fly: { haptic: [], sound: 'whoosh', volume: 0.35 },
  land: { haptic: [now('selection'), { kind: 'light', at: 80 }], sound: 'grow', volume: 0.45 },
  plant: { haptic: [now('success')], sound: 'plant', volume: 0.5 },
  longPress: { haptic: [now('medium')] },
  delete: { haptic: [now('warning')] },
  error: { haptic: [now('error')] },
  // Wave 3, the forest plot (spec, section 12).
  pickUp: { haptic: [now('medium')], sound: 'rustle', volume: 0.25 },
  hover: { haptic: [now('selection')] },
  place: { haptic: [now('light'), { kind: 'soft', at: 60 }], sound: 'plant', volume: 0.35 },
  swap: { haptic: [now('selection')], sound: 'rustle', volume: 0.2 },
  expand: { haptic: [now('success')], sound: 'grow', volume: 0.45 },
  reveal: { haptic: [now('selection')], sound: 'plant', volume: 0.3 },
  // Wave 4, the tree's name (spec, section 11).
  nameAsk: { haptic: [now('soft')], sound: 'pop', volume: 0.2 },
  named: { haptic: [now('light'), { kind: 'success', at: 120 }], sound: 'grow', volume: 0.4 },
  // Wave 5, acorns and the shop (spec 14.1). Acorns land 85 ms apart, over the 80 ms rule: each is heard.
  acornTick: { haptic: [], sound: 'acorn', volume: 0.25 },
  acornDone: { haptic: [now('selection'), { kind: 'light', at: 60 }], sound: 'acorn', volume: 0.35 },
  claim: { haptic: [now('light')], sound: 'pop', volume: 0.25 },
  buy: { haptic: [now('medium')], sound: 'spend', volume: 0.35 },
  unlock: { haptic: [now('success')], sound: 'unlock', volume: 0.5 },
  poor: { haptic: [now('soft')], sound: 'rustle', volume: 0.2 },
  skinChange: { haptic: [now('light')], sound: 'rustle', volume: 0.3 },
  award: { haptic: [now('success')], sound: 'lock', volume: 0.35 },
  // Wave 5, friends (design/волна-5/спец-друзья.md, 13).
  cheer: { haptic: [now('light'), { kind: 'success', at: 620 }], sound: 'cheer', volume: 0.45 },
  incoming: { haptic: [now('soft')], sound: 'pop', volume: 0.2 },
  friendAdded: { haptic: [now('light'), { kind: 'success', at: 120 }], sound: 'grow', volume: 0.4 },
};

/** The same cue never comes faster than this, ms. */
export const MIN_GAP = 80;

/** May `name` play at `now` (ms), given when each cue last played? */
export function shouldPlay(name: Cue, now: number, last: Partial<Record<Cue, number>>): boolean {
  const before = last[name];
  return before === undefined || now - before >= MIN_GAP;
}

export interface FeedbackSettings {
  vibration: boolean;
  sounds: boolean;
  /** No vibration motor to talk to in a browser. */
  web: boolean;
}

/** What `name` does with these settings: the vibrations and the sound left to play. */
export function resolveCue(name: Cue, { vibration, sounds, web }: FeedbackSettings): { haptic: HapticStep[]; sound: SoundName | null; volume: number } {
  const spec = CUES[name];
  return {
    haptic: vibration && !web ? spec.haptic : [],
    sound: sounds && spec.sound ? spec.sound : null,
    volume: spec.volume ?? 1,
  };
}
