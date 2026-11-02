import { describe, expect, it } from '@jest/globals';
import {
  burstAt, busyTime, DONE, DROP_FALL, dropAt, frameAt, landingTime, moteAt, REDUCED, shakenLeafAt, spring, sprayAt,
  restFrame, STAGE, WATER, wiggleAt,
} from '../timeline';

const times = (to: number, step = 10) => Array.from({ length: Math.floor(to / step) + 1 }, (_, i) => i * step);

describe('watering', () => {
  it('before the tap the tree is thirsty: faded, sagging, dry soil', () => {
    const f = frameAt(-1, false, false);
    expect(f).toMatchObject({ thirst: 1, pose: 0, wet: 0, cracks: 1, fallen: 1, canAlpha: 0, tokenAlpha: 0 });
  });

  it('nothing is left on the screen 2.5 s after the tap: no can, no +1', () => {
    for (const ms of times(5000).filter((m) => m >= 2500)) {
      const f = frameAt(ms, false, false);
      expect(f.canAlpha).toBe(0);
      expect(f.tokenAlpha).toBe(0);
    }
    expect(WATER.end).toBeLessThanOrEqual(2050);
    expect(landingTime(false, false)).toBe(WATER.end);
    expect(busyTime(false, false)).toBeLessThan(2500);
  });

  it('the color comes back steadily and is fresh by 1.4 s', () => {
    let last = 1;
    for (const ms of times(3000)) {
      const { thirst } = frameAt(ms, false, false);
      expect(thirst).toBeLessThanOrEqual(last + 1e-9);
      last = thirst;
    }
    expect(frameAt(WATER.reviveTo, false, false).thirst).toBeCloseTo(0);
  });

  it('the tree straightens a little above normal and settles', () => {
    const poses = times(2500).map((ms) => frameAt(ms, false, false).pose);
    expect(Math.max(...poses)).toBeGreaterThan(1);
    expect(Math.max(...poses)).toBeLessThan(1.35);
    expect(frameAt(DONE, false, false).pose).toBeCloseTo(1);
  });

  it('the can is in the air only while pouring', () => {
    expect(frameAt(150, false, false).canAlpha).toBeGreaterThan(0);
    expect(frameAt(600, false, false).canTilt).toBeCloseTo(WATER.tilt);
    expect(frameAt(WATER.canOutTo, false, false).canAlpha).toBe(0);
  });

  it('the token flies only between 1.2 s and 2.05 s and arrives', () => {
    expect(frameAt(1100, false, false).tokenAlpha).toBe(0);
    expect(frameAt(1500, false, false).tokenAlpha).toBe(1);
    expect(frameAt(2040, false, false).tokenT).toBeGreaterThan(0.99);
    expect(frameAt(2050, false, false).tokenAlpha).toBe(0);
  });

  it('the tree grows to today’s size by 1.7 s', () => {
    expect(frameAt(1000, false, false).grow).toBe(0);
    expect(frameAt(WATER.growTo, false, false).grow).toBeCloseTo(1);
  });

  it('every drop lands and its splash is over before the end', () => {
    const last = WATER.dropsFrom + (WATER.drops - 1) * WATER.dropEvery;
    expect(last + DROP_FALL * 1000 + WATER.splashLife).toBeLessThan(WATER.end);
    const d = dropAt(0, WATER.dropsFrom + 100)!;
    expect(d.landed).toBe(-1);
    expect(d.y).toBeGreaterThan(-96);
    expect(dropAt(0, WATER.dropsFrom + 400)!.landed).toBeGreaterThan(0);
    expect(dropAt(3, WATER.dropsFrom)).toBeNull();
    expect(sprayAt(0, 1, 0.5)).toBeNull();
  });

  it('the calm watered look after the end', () => {
    expect(frameAt(DONE, false, false)).toMatchObject({ thirst: 0, wet: 1, cracks: 0, fallen: 0, grow: 1, canAlpha: 0 });
  });
});

describe('new stage', () => {
  const at = (c: number) => frameAt(STAGE.origin + c, true, false);

  it('waters first, without the token and without growing', () => {
    expect(frameAt(1000, true, false).tokenAlpha).toBe(0);
    expect(frameAt(1000, true, false).grow).toBe(1);
    expect(frameAt(1000, true, false).newAlpha).toBe(0);
  });

  it('gathers, flashes, turns into the new stage', () => {
    expect(at(250).dim).toBeGreaterThan(0.5);
    expect(at(250).moteAlpha).toBe(1);
    expect(at(450).flashAlpha).toBe(0);
    expect(at(510).flashAlpha).toBeGreaterThan(0.8);
    expect(at(STAGE.flash + STAGE.oldOut).oldAlpha).toBe(0);
    expect(at(600).newAlpha).toBe(1);
    expect(at(STAGE.flash + STAGE.white).white).toBeCloseTo(0);
  });

  it('the +1 comes out of the flash and reaches the counter before the flash is over', () => {
    expect(at(STAGE.flash - 10).tokenAlpha).toBe(0);
    expect(at(STAGE.flash + 100).tokenAlpha).toBe(1);
    const landed = landingTime(true, false) - STAGE.origin;
    expect(landed).toBeGreaterThan(STAGE.flash);
    expect(landed).toBeLessThanOrEqual(STAGE.flash + STAGE.flashLife);
  });

  it('the token is gone before the ribbon’s "21 days" line comes in, and never back', () => {
    for (let c = STAGE.bannerFrom + 250; c < STAGE.end + 100; c += 10) expect(at(c).tokenAlpha).toBe(0);
  });

  it('every leaf is gone by the end of its life, no more than 60 particles at once', () => {
    expect(burstAt(0, STAGE.leafLife / 1000 + 0.01)).toBeNull();
    expect(burstAt(5, 0.1)!.alpha).toBe(1);
    expect(STAGE.leaves + STAGE.motes + 12).toBeLessThanOrEqual(60);
    expect(WATER.drops * 4).toBeLessThanOrEqual(60);
  });

  it('motes spiral into the tree', () => {
    const start = moteAt(3, 0);
    const end = moteAt(3, 1);
    expect(Math.hypot(start.x, start.y)).toBeGreaterThanOrEqual(150);
    expect(Math.hypot(end.x, end.y)).toBeCloseTo(10);
  });

  it('calms down: no dim, rays or token after the end', () => {
    const f = at(STAGE.end + 10);
    expect(f.dim).toBe(0);
    expect(f.raysAlpha).toBe(0);
    expect(f.tokenAlpha).toBe(0);
    expect(f.newScale).toBeCloseTo(1, 2);
    expect(busyTime(true, false)).toBe(STAGE.origin + STAGE.end);
  });
});

describe('animations off', () => {
  it('only fades, 200 ms, no can and no token', () => {
    for (const ms of times(400)) {
      const f = frameAt(ms, false, true);
      expect(f.canAlpha).toBe(0);
      expect(f.tokenAlpha).toBe(0);
      expect(f.dim).toBe(0);
    }
    expect(frameAt(REDUCED.fade, false, true).thirst).toBe(0);
    expect(frameAt(REDUCED.fade, true, true).newAlpha).toBe(1);
    expect(landingTime(true, true)).toBe(0);
  });
});

describe('small motions', () => {
  it('springs settle at 1', () => {
    expect(spring(0, 10, 300)).toBe(0);
    expect(spring(3000, 10, 300)).toBeCloseTo(1, 3);
    expect(spring(3000, 30, 100)).toBeCloseTo(1, 3);
  });

  it('the repeated-tap sway ends upright, the shaken leaves fade', () => {
    expect(wiggleAt(90)).toBeCloseTo(2.2);
    expect(Math.abs(wiggleAt(2000))).toBeLessThan(0.01);
    expect(shakenLeafAt(0, 950)).toBeNull();
  });
});

describe('the watering hour came (OYUUR-33, frames 10a–c)', () => {
  it('goes from the watered look to the thirsty one in one drawing', () => {
    const look = ({ thirst, pose, wet, cracks, fallen, canAlpha, grow }: ReturnType<typeof restFrame>) => ({ thirst, pose, wet, cracks, fallen, canAlpha, grow });
    expect(look(restFrame(0))).toEqual(look(frameAt(DONE, false, false)));
    expect(restFrame(1)).toEqual(frameAt(-1, false, false));
    const mid = restFrame(0.5);
    expect(mid.thirst).toBe(0.5);
    expect(mid.pose).toBe(0.5);
    expect(mid.wet).toBe(0.5);
    expect(mid.canAlpha).toBe(0);
    expect(mid.tokenAlpha).toBe(0);
  });
});
