import { describe, expect, it } from '@jest/globals';
import { MEADOWS } from '@/game/economy';
import { forestDay, forestNight, themes } from '../../forest/colors';
import { daySky, nightSky } from '../../sky/colors';
import { treeDay, treeNight } from '../../trees/colors';
import { dayColors, nightColors } from '../colors';
import { groundOf, meadowPreview, meadowTheme, MEADOW_THEMES } from '../themes';
import { butterflyAt, particleAt, weatherCount, WeatherBox } from '../weather';

const HEX = /^#[0-9A-F]{6}$/;

describe('meadow themes', () => {
  it('the summer meadow is exactly the scene as it was', () => {
    const s = meadowTheme('summer');
    expect(s.sky).toEqual({ day: daySky, night: nightSky });
    expect(s.meadow).toEqual({ day: dayColors, night: nightColors });
    expect(s.ground.day).toEqual({ ground: treeDay.ground, groundShade: treeDay.groundShade });
    expect(s.ground.night).toEqual({ ground: treeNight.ground, groundShade: treeNight.groundShade });
    expect(s.weather).toBeNull();
    expect(s.flowers).toBe(1);
    expect(themes.summer.day).toEqual(forestDay);
    expect(themes.summer.night).toEqual(forestNight);
  });

  it('every meadow has a full set of colors by day and by night', () => {
    for (const id of MEADOWS) {
      const t = MEADOW_THEMES[id];
      expect(t.id).toBe(id);
      for (const when of ['day', 'night'] as const) {
        for (const c of Object.values(t.sky[when])) expect(c).toMatch(HEX);
        for (const v of Object.values(t.meadow[when])) for (const c of [v].flat()) expect(c).toMatch(HEX);
        expect(t.ground[when].ground).toMatch(HEX);
        expect(t.ground[when].groundShade).toMatch(HEX);
      }
    }
  });

  it('a paid meadow changes the earth under the trees (theme.ts paletteFor)', () => {
    expect(groundOf('winter', false)).toEqual({ ground: '#F4F8FB', groundShade: '#D5E3EE' });
    expect(groundOf('autumn', true).ground).toBe('#5E4230');
    expect(groundOf('bloom', false)).toEqual(groundOf('summer', false));
  });

  it('the forest plot takes the meadow overrides over the summer colors', () => {
    expect(themes.winter.day.meadow).toBe('#EEF4F9');
    expect(themes.winter.day.post).toBe(forestDay.post);
    expect(themes.bloom.night.bush).toBe('#5E4880');
    expect(themes.bloom.night.meadow).toBe(forestNight.meadow);
  });

  it('the shop preview has what a small picture needs', () => {
    const w = meadowPreview('winter', false);
    expect(w.sky.horizon).toBe('#EEF6FB');
    expect(w.weather).toBe('snow');
    expect(w.weatherColors).toEqual(['#FFFFFF']);
    expect(w.snowCaps).toBe(true);
    expect(meadowPreview('winter', true).snowCaps).toBe(false);
    expect(meadowPreview('bloom', false).butterflies).toHaveLength(2);
    expect(meadowPreview('bloom', true).butterflies).toHaveLength(0);
    expect(meadowPreview('summer', false).weatherColors).toEqual([]);
  });
});

describe('weather', () => {
  const box: WeatherBox = { width: 375, top: 0, grassY: 560, bottom: 588, horizonY: 388 };

  it('keeps to the particle budget (26 at most, half on a weak phone)', () => {
    for (const kind of ['leaves', 'snow', 'petals'] as const) {
      for (const night of [false, true]) {
        expect(weatherCount(kind, night, false)).toBeLessThanOrEqual(26);
        expect(weatherCount(kind, night, true)).toBe(Math.ceil(weatherCount(kind, night, false) / 2));
      }
    }
    expect(weatherCount('snow', false, false)).toBe(26);
    expect(weatherCount('leaves', true, false)).toBe(4);
  });

  it('every particle stays in the scene at any time', () => {
    for (const kind of ['leaves', 'snow', 'petals'] as const) {
      for (let i = 0; i < 26; i++) {
        for (let t = 0; t < 120; t += 0.37) {
          const p = particleAt(kind, i, t, box, 4);
          expect(p.y).toBeGreaterThanOrEqual(box.top - 6);
          expect(p.y).toBeLessThanOrEqual(kind === 'snow' ? box.bottom : box.grassY + 6);
          expect(p.x).toBeGreaterThanOrEqual(-12);
          expect(p.x).toBeLessThanOrEqual(box.width + 12);
          expect(p.alpha).toBeGreaterThanOrEqual(0);
          expect(p.alpha).toBeLessThanOrEqual(1);
          expect(p.color).toBeGreaterThanOrEqual(0);
          expect(p.color).toBeLessThan(4);
        }
      }
    }
  });

  it('a leaf fades out at the grass instead of popping', () => {
    for (let i = 0; i < 6; i++) {
      for (let t = 0; t < 60; t += 0.05) {
        const p = particleAt('leaves', i, t, box, 4);
        if (p.y > box.grassY - 2) expect(p.alpha).toBeLessThan(0.3);
      }
    }
  });

  it('weather stands still when the clock stands (animations off)', () => {
    expect(particleAt('snow', 3, 0, box, 1)).toEqual(particleAt('snow', 3, 0, box, 1));
    const b = butterflyAt(0, 0, box);
    expect(b.y).toBeGreaterThan(box.horizonY);
  });

  it('a butterfly loops within 60 × 30 px and beats its wings', () => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minOpen = 1;
    for (let t = 0; t < 9; t += 0.01) {
      const b = butterflyAt(1, t, box);
      minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
      minOpen = Math.min(minOpen, b.open);
    }
    expect(maxX - minX).toBeLessThanOrEqual(60.01);
    expect(maxY - minY).toBeLessThanOrEqual(30.01);
    expect(minOpen).toBeLessThan(0.35);
  });
});
