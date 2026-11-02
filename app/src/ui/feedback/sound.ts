// Sounds on the phone through expo-audio (spec 4.10). Every file is loaded once into its
// own player when FeedbackHost mounts; `tap` and `pop` get two players taking turns, so
// quick repeats don't cut each other off. The web has its own file (sound.web.ts).
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { SoundName } from './cues';
import { SOUND_FILES } from './files';

/** Players per sound: two for the ones that can come fast one after another. */
const COPIES: Partial<Record<SoundName, number>> = { tap: 2, pop: 2 };

let players: Partial<Record<SoundName, AudioPlayer[]>> | null = null;
const turn: Partial<Record<SoundName, number>> = {};

export function loadSounds(): void {
  if (players) return;
  // Quiet with the iPhone's silent switch, and mixed with the person's music, never stopping it.
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => {});
  const loaded: Partial<Record<SoundName, AudioPlayer[]>> = {};
  for (const name of Object.keys(SOUND_FILES) as SoundName[]) {
    try {
      loaded[name] = Array.from({ length: COPIES[name] ?? 1 }, () =>
        createAudioPlayer(SOUND_FILES[name], { downloadFirst: true, updateInterval: 1000 }),
      );
    } catch {
      // No sound is better than a crash.
    }
  }
  players = loaded;
}

export function playSound(name: SoundName, volume: number): void {
  const list = players?.[name];
  if (!list?.length) return;
  const i = turn[name] ?? 0;
  turn[name] = i + 1;
  const player = list[i % list.length];
  if (!player.isLoaded) return;
  try {
    player.volume = volume;
    // Back to the start first: a player that played once stands at its end.
    player.seekTo(0).then(
      () => player.play(),
      () => player.play(),
    );
  } catch {
    // The player went away (unloaded mid-call): stay quiet.
  }
}

export function unloadSounds(): void {
  if (!players) return;
  for (const list of Object.values(players)) list?.forEach((p) => p.remove());
  players = null;
}
