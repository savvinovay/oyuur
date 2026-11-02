// Colors of the forest plot (wave 3 spec, table 1.4), by day and by night.
// "Paints of the world", like meadow/colors.ts: tokens.ts only gathers them (`scene.forest`).
// Other meadows only override some of them (meadow/themes.ts).
import { MeadowId, MEADOWS } from '@/game/economy';
import { MEADOW_THEMES } from '../meadow/themes';

export interface ForestColors {
  /** The wild meadow around the plot. */
  meadow: string;
  tuftA: string;
  tuftB: string;
  /** Petals; by night two pale lilacs drawn at `flowerAlpha`. */
  flowers: string[];
  flowerAlpha: number;
  bush: string;
  bushTop: string;
  bushShadow: string;
  stone: string;
  stoneSide: string;
  /** The lawn, in stripes by column: even columns, odd columns. */
  lawnA: string;
  lawnB: string;
  lawnTuft: string;
  /** Light edge along the two front sides of the lawn. */
  lip: string;
  /** The earth bank under the front sides: left face, right face, bottom line. */
  bankL: string;
  bankR: string;
  bankLine: string;
  post: string;
  postSide: string;
  rail: string;
  cap: string;
  /** Tree shadows. */
  shadow: string;
  /** The hole at the foot of a tree. */
  lunka: string;
  plotShadow: string;
  /** Cloud shadows drifting over the map; none at night. */
  cloud: string | null;
  vignette: string;
  /** Haze under the status bar. */
  topFade: string;
  stumpBody: string;
  stumpTop: string;
  stumpLine: string;
  dust: string;
  /** A free cell while moving: stroke and fill. */
  cellFree: { stroke: string; fill: string };
  /** Where the tree will stand. */
  cellTarget: { color: string; fillAlpha: number; width: number };
  /** The two trees will swap. */
  cellSwap: { color: string; fillAlpha: number; width: number };
  /** Ring under the selected tree. */
  ringSel: { stroke: string; fill: string; width: number };
  /** Ring after a lock-in. */
  ringGold: { stroke: string; fill: string; glow: string; glowAlpha: number; width: number };
  /** Moonlight on the lawn at night: color and alpha; null by day. */
  moon: { color: string; alpha: number } | null;
  /** Fireflies at night. */
  firefly: { core: string; halo: string } | null;
}

const marks = {
  cellTarget: { color: '#4CC764', fillAlpha: 0.3, width: 2.5 },
  cellSwap: { color: '#3FA2DE', fillAlpha: 0.3, width: 2.5 },
  ringSel: { stroke: 'rgba(255,255,255,0.95)', fill: 'rgba(255,255,255,0.28)', width: 2.5 },
  ringGold: { stroke: '#FFCF4D', fill: 'rgba(255,207,77,0.25)', glow: '#FFE7A0', glowAlpha: 0.75, width: 3 },
};

export const forestDay: ForestColors = {
  ...marks,
  meadow: '#CDE7A4',
  tuftA: '#8EBF55',
  tuftB: '#A7D068',
  flowers: ['#FFFFFF', '#FFD84D', '#FF9FB8', '#B7A6FF'],
  flowerAlpha: 1,
  bush: '#8DC58F',
  bushTop: '#A9D7A2',
  bushShadow: 'rgba(60,90,30,0.18)',
  stone: '#E2DACB',
  stoneSide: '#C4B9A4',
  lawnA: '#ACD96C',
  lawnB: '#9FD05E',
  lawnTuft: '#8FC350',
  lip: '#D6EEA9',
  bankL: '#C08F58',
  bankR: '#A4733F',
  bankLine: '#8A5E33',
  post: '#D7A86A',
  postSide: '#A57A45',
  rail: '#C79A60',
  cap: '#ECC88E',
  shadow: 'rgba(52,78,22,0.22)',
  lunka: 'rgba(160,116,72,0.55)',
  plotShadow: 'rgba(70,90,30,0.28)',
  // Soft: a round gradient of this at its middle, clear at its edge.
  cloud: 'rgba(40,70,20,0.06)',
  vignette: 'rgba(80,90,30,0.16)',
  topFade: 'rgba(255,248,232,0.70)',
  stumpBody: '#A87644',
  stumpTop: '#E9C48A',
  stumpLine: '#6B4320',
  dust: '#D9B27A',
  cellFree: { stroke: 'rgba(255,255,255,0.85)', fill: 'rgba(255,255,255,0.16)' },
  moon: null,
  firefly: null,
};

export const forestNight: ForestColors = {
  ...marks,
  meadow: '#36477C',
  tuftA: '#4A6890',
  tuftB: '#41608A',
  flowers: ['#C9C2F0', '#E8E2FF'],
  flowerAlpha: 0.55,
  bush: '#3B5A80',
  bushTop: '#4A6A90',
  bushShadow: 'rgba(5,5,25,0.3)',
  stone: '#55598E',
  stoneSide: '#43467A',
  lawnA: '#47775A',
  lawnB: '#416F53',
  lawnTuft: '#4C7E5A',
  lip: '#5C9470',
  bankL: '#6B5340',
  bankR: '#55402F',
  bankLine: '#3E2E22',
  post: '#86694F',
  postSide: '#5E4836',
  rail: '#76604A',
  cap: '#9C8166',
  shadow: 'rgba(8,8,34,0.38)',
  lunka: 'rgba(40,28,20,0.6)',
  plotShadow: 'rgba(5,5,30,0.45)',
  cloud: null,
  vignette: 'rgba(6,6,30,0.28)',
  topFade: 'rgba(30,32,80,0.70)',
  stumpBody: '#7A5A3E',
  stumpTop: '#B89870',
  stumpLine: '#3E2E22',
  dust: '#8A6E52',
  cellFree: { stroke: 'rgba(255,255,255,0.55)', fill: 'rgba(255,255,255,0.08)' },
  moon: { color: '#C9C7FF', alpha: 0.22 },
  firefly: { core: '#F4FFB8', halo: 'rgba(233,255,138,0.5)' },
};

/** A look of the plot. A new background is one more theme, the map code stays the same. */
export interface PlotTheme {
  day: ForestColors;
  night: ForestColors;
  fence: 'wood';
}

/** The plot on each meadow (wave 5 spec, 10.4): the meadow's overrides over the summer colors. */
export const themes: Record<MeadowId, PlotTheme> = Object.fromEntries(
  MEADOWS.map((id) => {
    const { forest } = MEADOW_THEMES[id];
    return [id, { day: { ...forestDay, ...forest.day }, night: { ...forestNight, ...forest.night }, fence: 'wood' }];
  }),
) as Record<MeadowId, PlotTheme>;
