// Meadows (wave 5 spec, section 10): each one is a set of colors for the sky, the meadow,
// the earth under the trees and the forest plot, by day and by night, plus its weather.
// The scene is not redrawn per meadow: it reads its colors from here. The summer meadow
// is made of the colors the scene always had, so nothing changes for it.
import type { MeadowId } from '@/game/economy';
import type { ForestColors } from '../forest/colors';
import { daySky, nightSky, SkyColors } from '../sky/colors';
import { treeDay, treeNight } from '../trees/colors';
import { dayColors, MeadowColors, nightColors } from './colors';

export type Weather = 'leaves' | 'snow' | 'petals';

export interface GroundColors {
  ground: string;
  groundShade: string;
}

export interface MeadowTheme {
  id: MeadowId;
  sky: { day: SkyColors; night: SkyColors };
  meadow: { day: MeadowColors; night: MeadowColors };
  /** Earth under the live tree and in the tree drawings (TreePaint.ground / groundShade). */
  ground: { day: GroundColors; night: GroundColors };
  /** Overrides of the forest plot over forestDay / forestNight. */
  forest: { day: Partial<ForestColors>; night: Partial<ForestColors> };
  weather: Weather | null;
  /** Multiplier of the number of flowers on the meadow. */
  flowers: number;
  /** White caps on the mountains by day (winter). */
  snowCaps: boolean;
  /** Flowers have a yellow heart (not in winter: sparks of snow and rowan berries). */
  hearts: boolean;
  /** Share of the flowers that lie on the meadow as fallen maple leaves (autumn). */
  leafFlowers: number;
  /** Birds fly by day (not in winter: the snow takes their place). */
  birds: boolean;
}

/** Night clouds are lit by the moon the same way on every meadow; by day the light is the cloud's top. */
const sky = (top: string, mid: string, horizon: string, cloudTop: string, cloudBottom: string, cloudShadow: string, night: boolean): SkyColors => ({
  top, mid, horizon, cloudTop, cloudBottom, cloudShadow, cloudLight: night ? nightSky.cloudLight : cloudTop,
});

/** A meadow table in the order of the spec (10.3). */
const meadow = (c: string[]): MeadowColors => ({
  mountainsTop: c[0],
  mountainsBottom: c[1],
  hillsTop: c[2],
  hillsBottom: c[3],
  forest: c[4],
  bushes: c[5],
  meadow: [c[6], c[7], c[8], c[9]],
  haze: c[10],
  grass: [c[11], c[12]],
  frontGrass: [c[13], c[14]],
  flowers: [c[15], c[16], c[17], c[18]],
  flowerHeart: c[19],
  soil: c[20],
});

const summerGround = {
  day: { ground: treeDay.ground, groundShade: treeDay.groundShade },
  night: { ground: treeNight.ground, groundShade: treeNight.groundShade },
};

export const MEADOW_THEMES: Record<MeadowId, MeadowTheme> = {
  summer: {
    id: 'summer',
    sky: { day: daySky, night: nightSky },
    meadow: { day: dayColors, night: nightColors },
    ground: summerGround,
    forest: { day: {}, night: {} },
    weather: null,
    flowers: 1,
    snowCaps: false,
    hearts: true,
    leafFlowers: 0,
    birds: true,
  },
  autumn: {
    id: 'autumn',
    sky: {
      day: sky('#A8D4EC', '#D3E8EE', '#FBEBD3', '#FFFFFF', '#F3E2CF', '#C9AE95', false),
      night: sky('#1D1B52', '#33296F', '#6A4F8E', '#6A5AAE', '#352C76', '#181540', true),
    },
    meadow: {
      day: meadow([
        '#C9D3D6', '#E3DCCF', '#E2A866', '#EDBE7E', '#D9823F', '#C9733A', '#E8D592', '#EDCB86', '#E9B977', '#DDA466', '#FFF4E2',
        '#C9B45A', '#A99848', '#8E8A3A', '#A8A04A', '#FFFFFF', '#FFB347', '#E8643C', '#C98A3E', '#FFF0B0', '#9A6A3E',
      ]),
      night: meadow([
        '#3E3A86', '#4C4796', '#4A3A6E', '#56447A', '#4A3460', '#553A5E', '#4A4680', '#55497A', '#5E4A4A', '#4E3A2E', '#6A5AA0',
        '#5E5A3A', '#4C4830', '#3A3626', '#4A4630', '#E8C9A0', '#F0D8B8', '#E8C9A0', '#F0D8B8', '#F0D8B8', '#6B4E38',
      ]),
    },
    ground: { day: { ground: '#E9B97A', groundShade: '#D49A5C' }, night: { ground: '#5E4230', groundShade: '#4A3222' } },
    forest: {
      day: {
        meadow: '#EAD08E', tuftA: '#C2A24E', tuftB: '#D6B65C', flowers: ['#E8643C', '#F2A33A', '#FFFFFF', '#D9822B'],
        bush: '#D9873F', bushTop: '#EBA55A', lawnA: '#C9C76A', lawnB: '#BDBB5E', lawnTuft: '#AEAB50', lip: '#E6E2A0',
      },
      night: {
        meadow: '#4A4276', tuftA: '#5E5A80', tuftB: '#544E78', bush: '#5A4470', bushTop: '#6A5280',
        lawnA: '#566A4E', lawnB: '#4E6248', lawnTuft: '#5E7252', lip: '#7A8A68',
      },
    },
    weather: 'leaves',
    flowers: 0.6,
    snowCaps: false,
    hearts: true,
    leafFlowers: 0.6,
    birds: true,
  },
  winter: {
    id: 'winter',
    sky: {
      day: sky('#8FC8EE', '#C4E3F5', '#EEF6FB', '#FFFFFF', '#DCE9F3', '#9DB8CF', false),
      night: sky('#141A4E', '#22306E', '#4A5AA0', '#5662A8', '#2A3270', '#121640', true),
    },
    meadow: {
      day: meadow([
        '#D6E6F2', '#EAF2F8', '#E8F1F8', '#F4F8FB', '#6E9A9A', '#B8CFDA', '#F2F7FB', '#EAF2F8', '#E3EDF5', '#D9E6F0', '#FFFFFF',
        '#C7D9E6', '#AFC6D6', '#9FB8C9', '#B9CEDC', '#FFFFFF', '#D7ECFF', '#E8434F', '#FFFFFF', '#FFFFFF', '#8A6A50',
      ]),
      night: meadow([
        '#4A5BA0', '#5868AE', '#6070B4', '#6C7CBC', '#2E3E6E', '#5A6AAA', '#6F7EC0', '#6878B8', '#6070AE', '#5666A2', '#7A88C8',
        '#5A6AA8', '#4E5E9C', '#3E4C88', '#4C5A96', '#E8EEFF', '#C9D4FF', '#E8EEFF', '#C9D4FF', '#E8EEFF', '#5A4A48',
      ]),
    },
    // Snow under the tree; the watering hole keeps its soil color (live/colors.ts).
    ground: { day: { ground: '#F4F8FB', groundShade: '#D5E3EE' }, night: { ground: '#7C8AC6', groundShade: '#6474B0' } },
    forest: {
      day: {
        meadow: '#EEF4F9', tuftA: '#C9D9E6', tuftB: '#DCE8F1', flowers: ['#FFFFFF', '#E8434F'], bush: '#C3D5E1', bushTop: '#E4EEF5',
        stone: '#DDE3EA', lawnA: '#E6EFF6', lawnB: '#DCE7F1', lawnTuft: '#C9D9E6', lip: '#FFFFFF', cloud: 'rgba(40,60,90,0.05)',
      },
      night: {
        meadow: '#5E6DAE', tuftA: '#7381C0', tuftB: '#6A78B8', bush: '#6A7AB8', bushTop: '#8290CC',
        lawnA: '#7684C2', lawnB: '#6E7CBA', lawnTuft: '#8492CC', lip: '#9AA6DA',
      },
    },
    weather: 'snow',
    flowers: 0.5,
    snowCaps: true,
    hearts: false,
    leafFlowers: 0,
    birds: false,
  },
  bloom: {
    id: 'bloom',
    sky: {
      day: sky('#9ED8F5', '#D2EEFA', '#FFF1F4', '#FFFFFF', '#F7E3EE', '#D9AFC6', false),
      night: sky('#22195A', '#3A2A7C', '#7A5AA8', '#7A62B8', '#3E2F80', '#1A1448', true),
    },
    meadow: {
      day: meadow([
        '#C7DCEA', '#DCEBF0', '#9ED39A', '#B6E2A8', '#F2B3CF', '#E89BC0', '#C8EBA0', '#D5EEA2', '#E6EBA6', '#DDE29A', '#FFF6FA',
        '#8ACB5A', '#6FB548', '#5E9F3A', '#78BC4A', '#FF8FB1', '#FFD84D', '#B7A6FF', '#FFFFFF', '#FFF3B0', '#A07448',
      ]),
      night: meadow([
        '#463F92', '#544CA0', '#2F4A72', '#38557E', '#5A3F7E', '#62447E', '#3E4E88', '#46547E', '#4E4E66', '#463E44', '#6A58AE',
        '#3E6648', '#33583C', '#264630', '#305A3C', '#E6B3D9', '#E8E2FF', '#C9C2F0', '#F2C9E6', '#F2E6FF', '#6B5340',
      ]),
    },
    ground: summerGround,
    forest: {
      day: {
        meadow: '#D3EDA6', tuftA: '#86C25A', tuftB: '#9FD168', flowers: ['#FF8FB1', '#FFD84D', '#B7A6FF', '#FFFFFF'],
        bush: '#E9A6C8', bushTop: '#F6C6DC', lawnA: '#A8DC6E', lawnB: '#9CD262', lip: '#DDF3B0',
      },
      night: { bush: '#5E4880', bushTop: '#6E5890' },
    },
    weather: 'petals',
    flowers: 2.2,
    snowCaps: false,
    hearts: true,
    leafFlowers: 0,
    birds: true,
  },
};

export const meadowTheme = (id: MeadowId): MeadowTheme => MEADOW_THEMES[id] ?? MEADOW_THEMES.summer;

/** Colors of the falling weather (10.5), by day and by night. */
export const WEATHER_COLORS: Record<Weather, { day: string[]; night: string[] }> = {
  leaves: { day: ['#E8643C', '#F2A33A', '#D9822B', '#B5552E'], night: ['#9A5A4E', '#A87A52', '#8E6A48', '#7A4A44'] },
  snow: { day: ['#FFFFFF'], night: ['#E8EEFF'] },
  petals: { day: ['#FFB3CB', '#FFD6E2', '#FFFFFF'], night: ['#D9B0D0', '#C9B6E6'] },
};

/** Butterflies over the blossom meadow by day. */
export const BUTTERFLY_COLORS = ['#FFD84D', '#B7A6FF'];

/** Earth under the trees on this meadow. */
export const groundOf = (id: MeadowId, night: boolean): GroundColors => meadowTheme(id).ground[night ? 'night' : 'day'];

export interface MeadowPreview {
  sky: SkyColors;
  meadow: MeadowColors;
  ground: GroundColors;
  weather: Weather | null;
  /** Colors of the weather particles; empty without weather. */
  weatherColors: string[];
  /** Butterflies (blossom meadow by day); empty otherwise. */
  butterflies: string[];
  flowers: number;
  snowCaps: boolean;
  hearts: boolean;
  leafFlowers: number;
}

/**
 * Everything a small picture of a meadow needs (the shop's cards and its item window):
 * the colors of one meadow at one time of day.
 */
export function meadowPreview(id: MeadowId, night: boolean): MeadowPreview {
  const t = meadowTheme(id);
  const when = night ? 'night' : 'day';
  return {
    sky: t.sky[when],
    meadow: t.meadow[when],
    ground: t.ground[when],
    weather: t.weather,
    weatherColors: t.weather ? WEATHER_COLORS[t.weather][when] : [],
    butterflies: t.weather === 'petals' && !night ? BUTTERFLY_COLORS : [],
    flowers: t.flowers,
    snowCaps: t.snowCaps && !night,
    hearts: t.hearts,
    leafFlowers: night ? 0 : t.leafFlowers,
  };
}
