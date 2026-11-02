// The live tree's old vibration names (wave 1), kept for anyone still calling them. They
// now go through ui/feedback, which reads the vibration and sound settings itself, so
// `enabled` is ignored. New code calls cue() directly.
import { cue } from '../feedback';

export const haptics = {
  /** The tree is touched, watering starts. */
  light: (_enabled?: boolean) => cue('water'),
  /** A firm confirmation. */
  medium: (_enabled?: boolean) => cue('lockConfirm'),
  /** The celebration's flash. */
  heavy: (_enabled?: boolean) => cue('stageFlash'),
  /** Already watered today, or the day is closed. */
  soft: (_enabled?: boolean) => cue('already'),
  /** The tree came back to life. */
  success: (_enabled?: boolean) => cue('revive'),
  /** The +1 landed and the counter clicked. */
  tick: (_enabled?: boolean) => cue('grow'),
};
