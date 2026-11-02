import { describe, expect, it } from '@jest/globals';
import {
  birdPose,
  CLOUD_LAYERS,
  CLOUD_MARGIN,
  CLOUD_TOP,
  cloudLayout,
  cloudX,
  cursorAt,
  cursorStart,
  eventStart,
  FLOCKS,
  flockOf,
  GUST_BASE,
  GUST_FALL,
  GUST_HOLD,
  GUST_RISE,
  gustAt,
  gustEnvelope,
  gustSpeed,
  GUSTS,
  hash01,
  meteorOf,
  meteorPose,
  METEOR_TIME,
  METEOR_TRAIL,
  METEORS,
  starLayout,
  twinkle,
} from '../schedule';

const SEED = 42;
// The 375×812 phone of the spec: scene height 545, header bottom 180, horizon 360.
const W = 375;
const H = 545;
const HEADER = 180;
const HORIZON = 360;

describe('random numbers', () => {
  it('are repeatable and in [0, 1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = hash01(SEED, i);
      expect(v).toBe(hash01(SEED, i));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hash01(1, 5)).not.toBe(hash01(2, 5));
  });
});

describe('event series', () => {
  it('gusts come every 6–12 s', () => {
    for (let k = 0; k < 50; k++) {
      const gap = eventStart(GUSTS, SEED, k + 1) - eventStart(GUSTS, SEED, k);
      expect(gap).toBeGreaterThanOrEqual(6);
      expect(gap).toBeLessThanOrEqual(12);
    }
    expect(eventStart(GUSTS, SEED, 0)).toBeGreaterThanOrEqual(6);
  });

  it('the first flock comes after 4 s, then every 18–40 s', () => {
    expect(eventStart(FLOCKS, SEED, 0)).toBe(4);
    for (let k = 0; k < 30; k++) {
      const gap = eventStart(FLOCKS, SEED, k + 1) - eventStart(FLOCKS, SEED, k);
      expect(gap).toBeGreaterThanOrEqual(18);
      expect(gap).toBeLessThanOrEqual(40);
    }
  });

  it('a star falls within the first minute, then every 30–60 s', () => {
    expect(eventStart(METEORS, SEED, 0)).toBeLessThanOrEqual(60);
    for (let k = 0; k < 30; k++) {
      const gap = eventStart(METEORS, SEED, k + 1) - eventStart(METEORS, SEED, k);
      expect(gap).toBeGreaterThanOrEqual(30);
      expect(gap).toBeLessThanOrEqual(60);
    }
  });

  it('a cursor moved frame by frame agrees with counting from scratch', () => {
    let c = cursorStart(FLOCKS, SEED);
    for (let t = 0; t < 300; t += 1 / 60) c = cursorAt(FLOCKS, SEED, c, t);
    const fresh = cursorAt(FLOCKS, SEED, cursorStart(FLOCKS, SEED), 300);
    expect(c[0]).toBe(fresh[0]);
    expect(c[1]).toBeCloseTo(eventStart(FLOCKS, SEED, c[0]));
    expect(c[2]).toBeCloseTo(eventStart(FLOCKS, SEED, c[0] + 1));
    expect(c[1]).toBeLessThanOrEqual(300);
    expect(c[2]).toBeGreaterThan(300);
  });

  it('nothing has happened before the first event', () => {
    expect(cursorAt(FLOCKS, SEED, cursorStart(FLOCKS, SEED), 3.9)[0]).toBe(-1);
    expect(cursorAt(FLOCKS, SEED, cursorStart(FLOCKS, SEED), 4)[0]).toBe(0);
  });

  it('a cursor restarts when the clock goes back to 0', () => {
    const late = cursorAt(GUSTS, SEED, cursorStart(GUSTS, SEED), 500);
    expect(cursorAt(GUSTS, SEED, late, 0)[0]).toBe(-1);
  });
});

describe('wind', () => {
  it('is calm between gusts', () => {
    expect(gustAt(SEED, 0)).toBe(GUST_BASE);
    expect(gustAt(SEED, eventStart(GUSTS, SEED, 0) - 0.01)).toBe(GUST_BASE);
  });

  it('a gust rises in 0.8 s, holds 0.5 s and dies down in 1.8 s', () => {
    const peak = 0.8;
    expect(gustEnvelope(0, peak)).toBeCloseTo(GUST_BASE);
    expect(gustEnvelope(GUST_RISE / 2, peak)).toBeCloseTo((GUST_BASE + peak) / 2);
    expect(gustEnvelope(GUST_RISE, peak)).toBe(peak);
    expect(gustEnvelope(GUST_RISE + GUST_HOLD - 0.01, peak)).toBe(peak);
    expect(gustEnvelope(GUST_RISE + GUST_HOLD + GUST_FALL / 2, peak)).toBeCloseTo((GUST_BASE + peak) / 2);
    expect(gustEnvelope(GUST_RISE + GUST_HOLD + GUST_FALL, peak)).toBe(GUST_BASE);
  });

  it('every gust peaks at 0.6–1.0 and wind never leaves 0.25–1.0', () => {
    for (let k = 0; k < 20; k++) {
      const top = gustAt(SEED, eventStart(GUSTS, SEED, k) + GUST_RISE + 0.1);
      expect(top).toBeGreaterThanOrEqual(0.6);
      expect(top).toBeLessThanOrEqual(1);
    }
    for (let t = 0; t < 200; t += 0.05) {
      const g = gustAt(SEED, t);
      expect(g).toBeGreaterThanOrEqual(GUST_BASE - 1e-9);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  it('gusts speed clouds up by at most 30 %', () => {
    expect(gustSpeed(GUST_BASE)).toBe(1);
    expect(gustSpeed(0)).toBe(1);
    expect(gustSpeed(1)).toBeCloseTo(1.3);
  });
});

describe('clouds', () => {
  const spots = cloudLayout(SEED, W, H, HEADER);

  it('4 far, 3 middle and 2 near clouds', () => {
    expect(spots.map((s) => s.layer)).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2]);
  });

  it('stay in their bands, at their scales, never above the header', () => {
    for (const s of spots) {
      const l = CLOUD_LAYERS[s.layer];
      expect(s.scale).toBeGreaterThanOrEqual(l.scale[0]);
      expect(s.scale).toBeLessThanOrEqual(l.scale[1]);
      expect(s.y - CLOUD_TOP * s.scale).toBeGreaterThanOrEqual(HEADER + 8);
      expect(s.y).toBeLessThanOrEqual(Math.max(l.band[1] * H, HEADER + 8 + CLOUD_TOP * s.scale));
      expect(s.y).toBeLessThan(HORIZON);
    }
  });

  it('are the same for the same seed', () => {
    expect(cloudLayout(SEED, W, H, HEADER)).toEqual(spots);
  });

  it('drift right at their layer speed and wrap around the field', () => {
    const x0 = 100;
    expect(cloudX(x0, 0, 0, 0, W)).toBe(x0 - CLOUD_MARGIN);
    expect(cloudX(x0, 0, 10, 0, W) - cloudX(x0, 0, 0, 0, W)).toBeCloseTo(40);
    expect(cloudX(x0, 2, 10, 0, W) - cloudX(x0, 2, 0, 0, W)).toBeCloseTo(110);
    const field = W + 2 * CLOUD_MARGIN;
    expect(cloudX(x0, 1, field / 7, 0, W)).toBeCloseTo(cloudX(x0, 1, 0, 0, W));
    for (let d = 0; d < 1000; d += 3.7) {
      const x = cloudX(x0, 1, d, 0, W);
      expect(x).toBeGreaterThanOrEqual(-CLOUD_MARGIN);
      expect(x).toBeLessThan(W + CLOUD_MARGIN);
    }
  });

  it('near clouds shift more than far ones when the camera moves one habit', () => {
    const shift = (layer: number) => cloudX(200, layer, 0, 0, W) - cloudX(200, layer, 0, 1, W);
    expect(shift(0)).toBeCloseTo(0.03 * W);
    expect(shift(1)).toBeCloseTo(0.07 * W);
    expect(shift(2)).toBeCloseTo(0.1 * W);
  });
});

describe('stars', () => {
  const moon = { x: 44, y: 77 };
  const { dots, sparkles } = starLayout(SEED, W, HORIZON, moon);

  it('46 dots and 14 sparkles in the band above the horizon, off the moon', () => {
    expect(dots).toHaveLength(46);
    expect(sparkles).toHaveLength(14);
    for (const s of [...dots, ...sparkles]) {
      expect(s.y).toBeGreaterThanOrEqual(30);
      expect(s.y).toBeLessThanOrEqual(HORIZON - 40);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(W);
      expect(Math.hypot(s.x - moon.x, s.y - moon.y)).toBeGreaterThan(30);
    }
    for (const d of dots) {
      expect(d.r).toBeGreaterThanOrEqual(0.7);
      expect(d.r).toBeLessThanOrEqual(1.7);
      expect(d.alpha).toBeGreaterThanOrEqual(0.35);
      expect(d.alpha).toBeLessThanOrEqual(0.95);
    }
    for (const s of sparkles) {
      expect(s.r).toBeGreaterThanOrEqual(2.4);
      expect(s.r).toBeLessThanOrEqual(5.6);
    }
  });

  it('twinkle in three groups with their own periods', () => {
    expect(new Set(dots.map((d) => d.group))).toEqual(new Set([0, 1, 2]));
    expect(twinkle(0, 3.1)).toBeCloseTo(twinkle(0, 0));
    expect(twinkle(1, 4.3)).toBeCloseTo(twinkle(1, 0));
    expect(twinkle(2, 5.7)).toBeCloseTo(twinkle(2, 0));
    for (let t = 0; t < 20; t += 0.1) {
      expect(twinkle(t % 3 | 0, t)).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(twinkle(t % 3 | 0, t)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('still stars (animations off) keep a fairly bright, steady look', () => {
    for (const g of [0, 1, 2]) expect(twinkle(g, 0)).toBeGreaterThan(0.75);
  });
});

describe('birds', () => {
  it('3–5 birds, 10–14 px wings, 7–9 s flight, below the header', () => {
    for (let k = 0; k < 40; k++) {
      const f = flockOf(SEED, k, H, HEADER);
      expect(f.birds.length).toBeGreaterThanOrEqual(3);
      expect(f.birds.length).toBeLessThanOrEqual(5);
      expect(f.duration).toBeGreaterThanOrEqual(7);
      expect(f.duration).toBeLessThanOrEqual(9);
      expect(f.y0).toBeGreaterThanOrEqual(HEADER + 16);
      expect(f.y0).toBeLessThanOrEqual(0.42 * H + 20);
      for (const b of f.birds) {
        expect(b.span).toBeGreaterThanOrEqual(10);
        expect(b.span).toBeLessThanOrEqual(14);
        expect(Math.abs(b.dy)).toBeLessThanOrEqual(16);
        expect(b.beat).toBeGreaterThanOrEqual(0.32);
        expect(b.beat).toBeLessThanOrEqual(0.4);
      }
    }
  });

  it('cross the whole screen from one edge to the other', () => {
    const f = flockOf(SEED, 0, H, HEADER);
    for (let i = 0; i < f.birds.length; i++) {
      const start = birdPose(f, i, 0, W);
      const end = birdPose(f, i, f.duration, W);
      expect(start.visible).toBe(false);
      expect(end.visible).toBe(false);
      expect(Math.sign(end.x - start.x)).toBe(f.dir);
      expect(Math.abs(end.x - start.x)).toBeGreaterThan(W);
    }
    expect(birdPose(f, 0, f.duration / 2, W).visible).toBe(true);
    expect(birdPose(f, 0, f.duration + 0.1, W).visible).toBe(false);
  });

  it('flap their wings, but hold them still while gliding', () => {
    let f = flockOf(SEED, 0, H, HEADER);
    for (let k = 1; !f.birds.some((b) => b.glide >= 0); k++) f = flockOf(SEED, k, H, HEADER);
    const i = f.birds.findIndex((b) => b.glide >= 0);
    const g = f.birds[i].glide;
    const mid = [0.2, 0.3, 0.4, 0.5, 0.6].map((dt) => birdPose(f, i, g + dt, W).wing);
    expect(new Set(mid.map((w) => w.toFixed(4))).size).toBe(1);
    const flapping = [0, 0.1, 0.2].map((dt) => birdPose(f, i, 0.5 + dt, W).wing);
    expect(Math.max(...flapping) - Math.min(...flapping)).toBeGreaterThan(0.1);
  });
});

describe('shooting stars', () => {
  it('fall down and to the left, 20–30° below the horizon', () => {
    for (let k = 0; k < 30; k++) {
      const m = meteorOf(SEED, k, W, HORIZON);
      expect(m.dx).toBeLessThan(0);
      expect(m.dy).toBeGreaterThan(0);
      const deg = (Math.atan2(m.dy, -m.dx) * 180) / Math.PI;
      expect(deg).toBeGreaterThanOrEqual(20);
      expect(deg).toBeLessThanOrEqual(30);
      expect(m.y).toBeLessThan(HORIZON - 40);
    }
  });

  it('last 0.65 s, speed up, and keep a trail of at most 90 px', () => {
    const m = meteorOf(SEED, 0, W, HORIZON);
    expect(meteorPose(m, -0.01).alpha).toBe(0);
    expect(meteorPose(m, METEOR_TIME + 0.01).alpha).toBe(0);
    const at = (dt: number) => meteorPose(m, dt);
    const step1 = Math.hypot(at(0.2).headX - at(0.1).headX, at(0.2).headY - at(0.1).headY);
    const step2 = Math.hypot(at(0.6).headX - at(0.5).headX, at(0.6).headY - at(0.5).headY);
    expect(step2).toBeGreaterThan(step1 * 2);
    for (let dt = 0; dt <= METEOR_TIME; dt += 0.02) {
      const p = at(dt);
      expect(Math.hypot(p.headX - p.tailX, p.headY - p.tailY)).toBeLessThanOrEqual(METEOR_TRAIL + 1e-9);
      expect(p.alpha).toBeGreaterThanOrEqual(0);
      expect(p.alpha).toBeLessThanOrEqual(1);
    }
    expect(at(METEOR_TIME / 2).alpha).toBe(1);
  });
});
