import { describe, expect, test } from '@jest/globals';
import { bezier, clipName, finishSteps, flightAt, LOCK, LockStepName, lockSteps, perchY, plaqueK, plaqueX, skipSteps, sparkleAt } from '../timeline';

const names = (reduced: boolean) => lockSteps(reduced).map((s) => s.step);

describe('the order of the sequence (spec 3.2)', () => {
  test('steps come in time order', () => {
    for (const reduced of [false, true]) {
      const steps = lockSteps(reduced);
      for (let i = 1; i < steps.length; i++) expect(steps[i].at).toBeGreaterThanOrEqual(steps[i - 1].at);
    }
  });

  test('picture, plaque, ribbon, lock-in, flight, menu, landing', () => {
    expect(names(false)).toEqual(['peek', 'snapshot', 'cueLockIn', 'ribbon', 'ribbonOut', 'lockIn', 'nextTree', 'fly', 'menu', 'land', 'end']);
    const at = Object.fromEntries(lockSteps(false).map((s) => [s.step, s.at]));
    expect(at.snapshot).toBe(200);
    expect(at.cueLockIn).toBe(700);
    expect(at.ribbon).toBe(800);
    // The medal starts rising when it has grown; the sheet follows it up a little later.
    expect(at.fly).toBe(LOCK.foldTo);
    expect(at.menu).toBeGreaterThan(at.fly);
    expect(at.menu).toBeLessThan(LOCK.perch);
    expect(at.land).toBe(3000);
    expect(LOCK.flyTo - LOCK.flyFrom).toBe(700);
  });

  test('the store locks the tree exactly once, never before 2000 ms', () => {
    const locks = lockSteps(false).filter((s) => s.step === 'lockIn');
    expect(locks).toHaveLength(1);
    expect(locks[0].at).toBe(2000);
    expect(lockSteps(false).every((s) => s.step !== 'lockIn' || s.at >= 2000)).toBe(true);
  });

  test('with animations off it locks at 1700, once, and there is no flight', () => {
    const steps = lockSteps(true);
    const locks = steps.filter((s) => s.step === 'lockIn');
    expect(locks).toHaveLength(1);
    expect(locks[0].at).toBe(1700);
    expect(names(true)).not.toContain('fly');
    // The ribbon stands 1.5 s.
    const at = Object.fromEntries(steps.map((s) => [s.step, s.at]));
    expect(at.ribbonOut + 200 - at.ribbon).toBe(1500);
    expect(at.land).toBe(1700);
  });

  test('the sheet goes up only after the lock-in', () => {
    for (const reduced of [false, true]) {
      const at = Object.fromEntries(lockSteps(reduced).map((s) => [s.step, s.at]));
      expect(at.menu).toBeGreaterThanOrEqual(at.lockIn);
      expect(at.land).toBeGreaterThanOrEqual(at.menu);
    }
  });
});

describe('a tap on the ribbon', () => {
  const none = new Set<LockStepName>();
  const doneUpTo = (now: number) => new Set(lockSteps(false).filter((s) => s.at <= now).map((s) => s.step));

  test('jumps to the lock-in, which still happens once', () => {
    const { steps, clock } = skipSteps(lockSteps(false), doneUpTo(1000), 1000);
    expect(clock).toBe(2000);
    expect(steps.filter((s) => s.step === 'lockIn')).toEqual([{ at: 0, step: 'lockIn' }]);
    expect(steps.map((s) => s.step)).not.toContain('ribbon');
    expect(steps.map((s) => s.step)).not.toContain('ribbonOut');
    // The rest keeps its spacing from the lock-in.
    expect(steps.find((s) => s.step === 'fly')!.at).toBe(LOCK.flyFrom - LOCK.lockIn);
    expect(steps.find((s) => s.step === 'land')!.at).toBe(1000);
  });

  test('after the lock-in nothing is repeated', () => {
    const { steps } = skipSteps(lockSteps(false), doneUpTo(2100), 2100);
    expect(steps.map((s) => s.step)).toEqual(['fly', 'menu', 'land', 'end']);
  });

  test('steps whose time came but whose timer did not fire yet are not lost', () => {
    // A tap at the very moment of the lock-in, before its timer ran.
    const atLock = skipSteps(lockSteps(false), doneUpTo(1999), 2000);
    expect(atLock.steps.filter((s) => s.step === 'lockIn')).toEqual([{ at: 0, step: 'lockIn' }]);
    expect(atLock.clock).toBe(2000);
    // A little later, still before the timer: the lock-in runs at once.
    const late = skipSteps(lockSteps(false), doneUpTo(1999), 2040);
    expect(late.steps.find((s) => s.step === 'lockIn')!.at).toBe(0);
    expect(late.steps.map((s) => s.step)).toContain('nextTree');
    // A tap at the end, before the end timer: the end still comes.
    const atEnd = skipSteps(lockSteps(false), doneUpTo(2999), LOCK.end);
    expect(atEnd.steps).toEqual([
      { at: 0, step: 'land' },
      { at: 0, step: 'end' },
    ]);
    const after = skipSteps(lockSteps(false), doneUpTo(2999), LOCK.end + 30);
    expect(after.steps.map((s) => s.step)).toEqual(['land', 'end']);
    expect(after.steps.every((s) => s.at === 0)).toBe(true);
  });

  test('a step left from before the lock-in (the picture) runs at once', () => {
    const { steps } = skipSteps(lockSteps(false), new Set<LockStepName>(['peek']), 900);
    expect(steps.find((s) => s.step === 'snapshot')).toEqual({ at: 0, step: 'snapshot' });
    expect(steps.find((s) => s.step === 'cueLockIn')).toEqual({ at: 0, step: 'cueLockIn' });
  });

  test('with animations off it works the same', () => {
    const steps = lockSteps(true);
    const done = new Set(steps.filter((s) => s.at < 1700).map((s) => s.step));
    const { steps: left, clock } = skipSteps(steps, done, 1700);
    expect(clock).toBe(1700);
    expect(left.map((s) => s.step)).toEqual(['lockIn', 'nextTree', 'menu', 'land', 'end']);
    expect(skipSteps(steps, none, 0).steps.filter((s) => s.step === 'lockIn')).toHaveLength(1);
  });

  test('coming back to the app after the lock-in runs the rest at once', () => {
    const rest = finishSteps(lockSteps(false), doneUpTo(2500));
    expect(rest.map((s) => s.step)).toEqual(['land', 'end']);
    expect(rest.every((s) => s.at === 0)).toBe(true);
    // The end whose timer did not fire yet still runs.
    expect(finishSteps(lockSteps(false), doneUpTo(2999)).map((s) => s.step)).toEqual(['land', 'end']);
    expect(finishSteps(lockSteps(false), doneUpTo(3000))).toEqual([]);
  });
});

describe('geometry', () => {
  test('the plaque beside the trunk', () => {
    expect(plaqueX(187, 50)).toBe(187 + 34);
    expect(plaqueX(187, 150)).toBe(187 + 57);
    expect(plaqueX(187, 400)).toBe(187 + 90);
    expect(plaqueK(100)).toBe(0.7);
    expect(plaqueK(240)).toBe(1);
    expect(plaqueK(400)).toBe(1.2);
  });

  test('the medal rises over the empty landscape, then dives into the card', () => {
    const from = { x: 187, y: 400 };
    const to = { x: 70, y: 505 };
    const perch = perchY(from.y, 214, 47);
    // Above where the sheet's top will be (375×812: 214), with room for the medal.
    expect(perch).toBe(214 - 46);
    expect(flightAt(0, from, perch, to)).toEqual({ x: 187, y: 400, scale: 1, alpha: 1 });
    // At the perch: straight above the crown, a little smaller.
    const rise = (LOCK.perch - LOCK.flyFrom) / (LOCK.flyTo - LOCK.flyFrom);
    const top = flightAt(rise, from, perch, to);
    expect(top.x).toBe(187);
    expect(top.y).toBeCloseTo(perch);
    expect(top.scale).toBeCloseTo(0.8);
    // It only goes up while rising.
    for (let u = 0; u < rise; u += 0.05) expect(flightAt(u + 0.05, from, perch, to).y).toBeLessThanOrEqual(flightAt(u, from, perch, to).y);
    // Lands on the target, small and faded out.
    const end = flightAt(1, from, perch, to);
    expect(end.x).toBeCloseTo(70);
    expect(end.y).toBeCloseTo(505);
    expect(end.scale).toBeCloseTo(0.42);
    expect(end.alpha).toBe(0);
    expect(flightAt(0.8, from, perch, to).alpha).toBe(1);
    // It shrinks all the way.
    for (let u = 0; u < 1; u += 0.05) expect(flightAt(u + 0.05, from, perch, to).scale).toBeLessThanOrEqual(flightAt(u, from, perch, to).scale + 1e-9);
    expect(bezier(from, { x: 0, y: 0 }, to, 1)).toEqual(to);
  });

  test('the perch: over a low crown, never under the status bar', () => {
    expect(perchY(300, 600, 47)).toBe(220);
    // 320×568: the menu reaches 76 from the top; the medal stays below the status bar.
    expect(perchY(300, 76, 20)).toBe(64);
  });

  test('sparkles twinkle only between 500 and 1700 ms', () => {
    expect(sparkleAt(0, 400)).toBe(0);
    expect(sparkleAt(0, 800)).toBeCloseTo(1);
    expect(sparkleAt(3, 600)).toBe(0);
    expect(sparkleAt(0, 1800)).toBe(0);
  });
});

describe('the name in the dialog title', () => {
  test('short names stay as they are', () => {
    expect(clipName('Не есть сладкое')).toBe('Не есть сладкое');
    expect(clipName('  Бег  ')).toBe('Бег');
  });

  test('long names are cut, at a word when one ends near, with an ellipsis', () => {
    const cut = clipName('Не есть сладкое после шести вечера по будням');
    expect(cut).toBe('Не есть сладкое после…');
    expect(cut.length).toBeLessThanOrEqual(24);
    const word = clipName('Ааааааааааааааааааааааааааааааааааааааа');
    expect(word).toBe(`А${'а'.repeat(22)}…`);
    expect(clipName('Читать двадцать страниц, каждый день')).toBe('Читать двадцать страниц…');
  });
});
