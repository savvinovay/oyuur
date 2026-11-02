// The sound files (app/assets/sounds, made by app/tools/sounds/make.py).
import { SoundName } from './cues';

export const SOUND_FILES: Record<SoundName, number> = {
  tap: require('../../../assets/sounds/tap.mp3'),
  pop: require('../../../assets/sounds/pop.mp3'),
  'menu-open': require('../../../assets/sounds/menu-open.mp3'),
  'menu-close': require('../../../assets/sounds/menu-close.mp3'),
  switch: require('../../../assets/sounds/switch.mp3'),
  water: require('../../../assets/sounds/water.mp3'),
  grow: require('../../../assets/sounds/grow.mp3'),
  stage: require('../../../assets/sounds/stage.mp3'),
  lock: require('../../../assets/sounds/lock.mp3'),
  whoosh: require('../../../assets/sounds/whoosh.mp3'),
  plant: require('../../../assets/sounds/plant.mp3'),
  rustle: require('../../../assets/sounds/rustle.mp3'),
  acorn: require('../../../assets/sounds/acorn.mp3'),
  spend: require('../../../assets/sounds/spend.mp3'),
  unlock: require('../../../assets/sounds/unlock.mp3'),
  cheer: require('../../../assets/sounds/cheer.mp3'),
};
