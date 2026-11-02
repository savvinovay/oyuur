import { describe, expect, jest, test } from '@jest/globals';
import { Cue, CUES, MIN_GAP, resolveCue, shouldPlay, SoundName } from '../cues';

// Every cue of the wave 2 table 4.9, the wave 3 table (section 12), wave 4 and wave 5 (14.1).
// Wave 5 took 'soon' away with the "soon" tiles.
const ALL: Cue[] = ['tap', 'select', 'detent', 'menuOpen', 'menuClose', 'water', 'revive', 'grow', 'already',
  'stageGather', 'stageFlash', 'swipe', 'theme', 'lockConfirm', 'lockIn', 'fly', 'land', 'plant', 'longPress', 'delete', 'error',
  'pickUp', 'hover', 'place', 'swap', 'expand', 'reveal', 'nameAsk', 'named',
  'acornTick', 'acornDone', 'claim', 'buy', 'unlock', 'poor', 'skinChange', 'award', 'cheer', 'incoming', 'friendAdded'];

// The files of table 4.10, wave 5 (14.2) and friends (спец-друзья 13).
const FILES: SoundName[] = ['tap', 'pop', 'menu-open', 'menu-close', 'switch', 'water', 'grow', 'stage', 'lock', 'whoosh', 'plant', 'rustle',
  'acorn', 'spend', 'unlock', 'cheer'];

describe('the cue table', () => {
  test('every cue has an entry, and nothing else does', () => {
    expect(Object.keys(CUES).sort()).toEqual([...ALL].sort());
  });

  test('every cue does something; volumes are 0..1 and come with a sound', () => {
    for (const name of ALL) {
      const spec = CUES[name];
      expect(spec.haptic.length > 0 || spec.sound !== undefined).toBe(true);
      if (spec.volume !== undefined) {
        expect(spec.sound).toBeDefined();
        expect(spec.volume).toBeGreaterThan(0);
        expect(spec.volume).toBeLessThanOrEqual(1);
      }
      spec.haptic.forEach((h) => expect(h.at).toBeGreaterThanOrEqual(0));
    }
  });

  test('every sound file is used by some cue', () => {
    const used = new Set(ALL.map((n) => CUES[n].sound).filter(Boolean));
    expect([...used].sort()).toEqual([...FILES].sort());
  });

  test('the celebration and the landing vibrate in steps, as in the spec', () => {
    expect(CUES.stageGather.haptic).toEqual([{ kind: 'light', at: 0 }, { kind: 'light', at: 150 }, { kind: 'medium', at: 300 }]);
    expect(CUES.stageFlash.haptic).toEqual([{ kind: 'heavy', at: 0 }, { kind: 'success', at: 150 }]);
    expect(CUES.land.haptic).toEqual([{ kind: 'selection', at: 0 }, { kind: 'light', at: 80 }]);
    expect(CUES.fly.haptic).toEqual([]);
  });

  test('wave 5: acorns tick quietly, the last one also taps the hand (14.1)', () => {
    expect(CUES.acornTick).toEqual({ haptic: [], sound: 'acorn', volume: 0.25 });
    expect(CUES.acornDone).toEqual({ haptic: [{ kind: 'selection', at: 0 }, { kind: 'light', at: 60 }], sound: 'acorn', volume: 0.35 });
    expect(CUES.claim).toEqual({ haptic: [{ kind: 'light', at: 0 }], sound: 'pop', volume: 0.25 });
    expect(CUES.buy).toEqual({ haptic: [{ kind: 'medium', at: 0 }], sound: 'spend', volume: 0.35 });
    expect(CUES.unlock).toEqual({ haptic: [{ kind: 'success', at: 0 }], sound: 'unlock', volume: 0.5 });
    expect(CUES.poor).toEqual({ haptic: [{ kind: 'soft', at: 0 }], sound: 'rustle', volume: 0.2 });
    expect(CUES.skinChange).toEqual({ haptic: [{ kind: 'light', at: 0 }], sound: 'rustle', volume: 0.3 });
    expect(CUES.award).toEqual({ haptic: [{ kind: 'success', at: 0 }], sound: 'lock', volume: 0.35 });
  });
});

describe('shouldPlay', () => {
  test('the first time always plays', () => {
    expect(shouldPlay('tap', 0, {})).toBe(true);
  });

  test('the same cue does not repeat faster than 80 ms', () => {
    expect(MIN_GAP).toBe(80);
    expect(shouldPlay('tap', 1079, { tap: 1000 })).toBe(false);
    expect(shouldPlay('tap', 1000, { tap: 1000 })).toBe(false);
    expect(shouldPlay('tap', 1080, { tap: 1000 })).toBe(true);
  });

  test('other cues do not hold it back', () => {
    expect(shouldPlay('select', 1010, { tap: 1000 })).toBe(true);
  });
});

describe('resolveCue', () => {
  const on = { vibration: true, sounds: true, web: false };

  test('with everything on, the cue plays its row', () => {
    expect(resolveCue('water', on)).toEqual({ haptic: CUES.water.haptic, sound: 'water', volume: 0.55 });
  });

  test('vibration off is silent for the hand, sound off is silent for the ear', () => {
    for (const name of ALL) {
      expect(resolveCue(name, { ...on, vibration: false }).haptic).toEqual([]);
      expect(resolveCue(name, { ...on, sounds: false }).sound).toBeNull();
      const off = resolveCue(name, { vibration: false, sounds: false, web: false });
      expect(off.haptic).toEqual([]);
      expect(off.sound).toBeNull();
    }
  });

  test('a browser never vibrates, but plays sounds', () => {
    const web = resolveCue('grow', { ...on, web: true });
    expect(web.haptic).toEqual([]);
    expect(web.sound).toBe('grow');
  });
});

// The real cue(): vibration and sound go out through mocks; the settings come from FeedbackHost.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('../sound', () => ({ loadSounds: jest.fn(), playSound: jest.fn(), unloadSounds: jest.fn() }));
jest.mock('@/state/store', () => ({ useStore: jest.fn() }));

describe('cue', () => {
  test('plays the haptic and the sound once per 80 ms', () => {
    jest.isolateModules(() => {
      const Haptics = require('expo-haptics') as { impactAsync: jest.Mock };
      const sound = require('../sound') as { playSound: jest.Mock };
      const { cue } = require('../index') as typeof import('../index');
      const now = jest.spyOn(Date, 'now').mockReturnValue(10_000);
      cue('water');
      cue('water');
      expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
      expect(sound.playSound).toHaveBeenCalledTimes(1);
      expect(sound.playSound).toHaveBeenCalledWith('water', 0.55);
      now.mockReturnValue(10_080);
      cue('water');
      expect(sound.playSound).toHaveBeenCalledTimes(2);
      now.mockRestore();
    });
  });
});
