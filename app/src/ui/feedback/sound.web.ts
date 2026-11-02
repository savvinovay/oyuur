// Sounds in the browser through the Web Audio API, not expo-audio: Safari on the iPhone
// ignores the volume of <audio> elements (every cue would play at full volume), while a
// gain node works everywhere. Each file is fetched and decoded once; every play is a new
// buffer source, so quick repeats overlap instead of cutting each other off. Browsers
// let sound out only after the first touch: the context is resumed on it.
import { Asset } from 'expo-asset';
import { SoundName } from './cues';
import { SOUND_FILES } from './files';

let ctx: AudioContext | null = null;
let buffers: Partial<Record<SoundName, AudioBuffer>> = {};
/** Touched at least once: before that nothing plays (it would all burst out on the first touch). */
let touched = false;

const UNLOCK = ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown'] as const;
const unlock = () => {
  touched = true;
  if (!ctx) return;
  if (ctx.state === 'running') {
    UNLOCK.forEach((e) => window.removeEventListener(e, unlock, true));
    return;
  }
  ctx.resume().catch(() => {});
};

export function loadSounds(): void {
  if (ctx || typeof window === 'undefined') return;
  const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  ctx = new Context();
  // Safari: "ambient" mixes with the person's music and keeps quiet with the silent switch.
  const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'ambient';
  // Before anything else hears the touch (capture phase), so the cue it starts can sound.
  UNLOCK.forEach((e) => window.addEventListener(e, unlock, true));
  const context = ctx;
  for (const name of Object.keys(SOUND_FILES) as SoundName[]) {
    fetch(Asset.fromModule(SOUND_FILES[name]).uri)
      .then((r) => r.arrayBuffer())
      .then((data) => context.decodeAudioData(data))
      .then((buffer) => {
        if (ctx === context) buffers[name] = buffer;
      })
      .catch(() => {});
  }
}

export function playSound(name: SoundName, volume: number): void {
  const buffer = buffers[name];
  if (!ctx || !buffer || !touched || ctx.state === 'closed') return;
  // Safari suspends the context when the page goes to the background: wake it (a touch is on).
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(ctx.destination);
  source.start();
}

export function unloadSounds(): void {
  if (!ctx) return;
  UNLOCK.forEach((e) => window.removeEventListener(e, unlock, true));
  ctx.close().catch(() => {});
  ctx = null;
  buffers = {};
}
