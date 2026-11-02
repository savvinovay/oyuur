// One way to give feedback: cue('water') vibrates and plays a sound (spec 4.9). What each
// cue does is a table in cues.ts; this file follows the settings and keeps the same cue
// from coming faster than once in 80 ms.
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useStore } from '@/state/store';
import { Cue, FeedbackSettings, resolveCue, shouldPlay } from './cues';
import { vibrate } from './haptic';
import { loadSounds, playSound, unloadSounds } from './sound';

export type { Cue } from './cues';

const settings: FeedbackSettings = { vibration: true, sounds: true, web: Platform.OS === 'web' };

/** When each cue last vibrated / sounded, ms. Kept apart, so a click doesn't silence the sound after it. */
const lastHaptic: Partial<Record<Cue, number>> = {};
const lastSound: Partial<Record<Cue, number>> = {};

const pass = (last: Partial<Record<Cue, number>>, name: Cue) => {
  const now = Date.now();
  if (!shouldPlay(name, now, last)) return false;
  last[name] = now;
  return true;
};

/** Feedback for an event. Can be called from a worklet via scheduleOnRN(cue, 'grow'). */
export function cue(name: Cue): void {
  cueHaptic(name);
  cueSound(name);
}

/** Only the vibration of a cue (the camera clicks on every habit it passes). */
export function cueHaptic(name: Cue): void {
  const { haptic } = resolveCue(name, settings);
  if (haptic.length && pass(lastHaptic, name)) vibrate(haptic);
}

/** Only the sound of a cue (the camera sounds once, when it stops). */
export function cueSound(name: Cue): void {
  const { sound, volume } = resolveCue(name, settings);
  if (sound && pass(lastSound, name)) playSound(sound, volume);
}

/** Mounted once in _layout: follows the settings, loads the sounds. */
export function FeedbackHost(): null {
  const { settings: s } = useStore();
  useEffect(() => {
    settings.vibration = s.vibration;
    settings.sounds = s.sounds;
    // Loaded once, the first time sounds are on; turning them off later just stops playing.
    if (s.sounds) loadSounds();
  }, [s.vibration, s.sounds]);
  useEffect(() => unloadSounds, []);
  return null;
}
