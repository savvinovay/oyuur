// The design system of wave 2: every token in one place (design/волна-2/спец.md, section 4).
import { Easing } from 'react-native-reanimated';
import type { TextStyle, ViewStyle } from 'react-native';
import { daySky, nightSky } from '../sky/colors';
import { dayColors as dayMeadow, nightColors as nightMeadow } from '../meadow/colors';
import { liveDay, liveNight, fx } from '../live/colors';
import { forestDay, forestNight } from '../forest/colors';

export interface Colors {
  page: string; sheet: string; card: string; sunken: string; header: string; headerButton: string;
  text: string; textSoft: string; textMuted: string; outline: string; divider: string;
  accent: string; accentLip: string; accentSoft: string; onAccent: string;
  water: string; waterSoft: string; gold: string; goldLip: string; goldInk: string;
  danger: string; dangerLip: string; dangerText: string; frozen: string; frozenInk: string;
  secondary: string; secondaryLip: string; cardLip: string; heart: string; pill: string;
  scrim: string; scrimDialog: string; tintForest: string; tintSettings: string; chip: string; skyCard: string; stack: string;
  shadow: string;
  /** Buttons and the header capsule over the forest map. */
  glass: string; toast: string; toastAction: string;
  /** Wave 5: notification numbers and dots; "Owned" text; the quest basket; circles behind menu glyphs. */
  badge: string; accentInk: string; goldSoft: string; goldEdge: string;
  tintQuests: string; tintFriends: string; tintLeaders: string; tintShop: string; tintProfile: string;
  /** Wave 5, friends (спец-друзья 2.1): readable blue and green text, the warm "cheer" button, my row, the offline pill. */
  waterInk: string; doneInk: string; warm: string; warmLip: string; warmInk: string; warmSoft: string; meRow: string; offline: string;
}

const shared = {
  accent: '#4CC764', accentLip: '#34A64D', onAccent: '#FFFFFF', water: '#3FA2DE',
  gold: '#FFCF4D', goldLip: '#D99A1E', goldInk: '#5A3A0E', danger: '#D24A43', dangerLip: '#A3332D',
  frozen: '#7FC8F0', frozenInk: '#0D2B3E', heart: '#E0485F', pill: '#58D46A',
  badge: '#E0485F',
  warm: '#FFB46B', warmLip: '#E5873A', warmInk: '#4A2308',
};

export const colorsDay: Colors = {
  ...shared,
  page: '#FFF0DA', sheet: '#FFE3BE', card: '#FFFFFF', sunken: '#F7D5A6', header: '#F4C98E', headerButton: 'rgba(255,255,255,0.55)',
  text: '#1E1B16', textSoft: '#6E6152', textMuted: '#A08E78', outline: '#3A2E22', divider: 'rgba(58,46,34,0.12)',
  accentSoft: '#DDF5DF', waterSoft: '#DCEFFB', dangerText: '#B23A3A',
  secondary: '#F5D3A0', secondaryLip: '#DDB47A', cardLip: '#E9D3B0',
  scrim: 'rgba(36,24,8,0.34)', scrimDialog: 'rgba(36,24,8,0.5)', tintForest: '#E3F4D3', tintSettings: '#F6E9D6',
  chip: 'rgba(255,255,255,0.7)', skyCard: '#DDF5FB', stack: '#D9A867', shadow: '#5A3A12',
  glass: 'rgba(255,255,255,0.92)', toast: '#1E1B16', toastAction: '#FFCF4D',
  accentInk: '#2E7D3E', goldSoft: '#FFF4D6', goldEdge: 'rgba(217,154,30,0.45)',
  tintQuests: '#FFF0C2', tintFriends: '#DDF0FB', tintLeaders: '#FFE9C7', tintShop: '#FFE1DC', tintProfile: '#ECE6FF',
  waterInk: '#2479B5', doneInk: '#2E8B45', warmSoft: '#FFE9D3', meRow: '#E6F7E4', offline: 'rgba(30,27,22,0.88)',
};

export const colorsNight: Colors = {
  ...shared,
  page: '#2E2D63', sheet: '#43427A', card: '#6467B3', sunken: '#383769', header: '#34336A', headerButton: 'rgba(255,255,255,0.14)',
  text: '#FFFFFF', textSoft: '#C9C8EE', textMuted: '#9C9BD0', outline: '#15142E', divider: 'rgba(255,255,255,0.12)',
  accentSoft: '#2E5E55', waterSoft: '#34508A', dangerText: '#FF8A80',
  secondary: '#6467B3', secondaryLip: '#4B4E96', cardLip: '#4B4E96',
  scrim: 'rgba(6,6,26,0.5)', scrimDialog: 'rgba(6,6,26,0.6)', tintForest: '#4A6F70', tintSettings: '#55569A',
  chip: 'rgba(255,255,255,0.14)', skyCard: '#4A4C9A', stack: '#2E2D5C', shadow: '#05041A',
  glass: 'rgba(67,66,122,0.92)', toast: '#15142E', toastAction: '#FFCF4D',
  accentInk: '#FFFFFF', goldSoft: '#57538F', goldEdge: 'rgba(255,207,77,0.45)',
  tintQuests: '#5B5A9A', tintFriends: '#4A5F9A', tintLeaders: '#5E5A92', tintShop: '#5F5294', tintProfile: '#55569A',
  waterInk: '#9AD3FF', doneInk: '#8BE39B', warmSoft: '#5E4B78', meRow: '#355F63', offline: 'rgba(21,20,46,0.92)',
};

export const colorsFor = (night: boolean): Colors => (night ? colorsNight : colorsDay);

/** Squares behind the white icons in settings rows. */
export const rowTint = { theme: '#F4B740', animations: '#B07CF0', sounds: '#FF7A8A', vibration: '#4FB6E8', language: '#4CC764', stats: '#8A94A6', danger: '#D24A43', reminders: '#FF9F43' };

export const fonts = { regular: 'Nunito_700Bold', bold: 'Nunito_800ExtraBold', black: 'Nunito_900Black' } as const;

const t = (fontSize: number, lineHeight: number, w: keyof typeof fonts, extra: TextStyle = {}): TextStyle =>
  ({ fontSize, lineHeight, fontFamily: fonts[w], ...extra });
export const type = {
  display: t(40, 46, 'black'),
  counter: t(46, 52, 'black', { fontVariant: ['tabular-nums'], letterSpacing: -0.5 }),
  title1: t(28, 34, 'black'),
  title2: t(22, 28, 'black'),
  title3: t(18, 24, 'black'),
  bodyStrong: t(16, 22, 'bold'),
  body: t(16, 22, 'regular'),
  small: t(14, 20, 'regular'),
  caption: t(12, 16, 'bold'),
  micro: t(10, 12, 'black', { letterSpacing: 0.6, textTransform: 'uppercase' }),
  number: t(22, 26, 'black'),
} satisfies Record<string, TextStyle>;
export type TypeVariant = keyof typeof type;
export const MAX_FONT_SCALE = 1.3;

export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s7: 32, s8: 40, s9: 48 } as const;
export const radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 28, sheet: 32, full: 999 } as const;
export const iconSize = { xs: 16, sm: 20, md: 24, lg: 32, xl: 40 } as const;
export const HIT = 44;
export const GUTTER = 16;

export function elevation(level: 1 | 2 | 3 | 'sheet', night: boolean): ViewStyle {
  const shadowColor = night ? colorsNight.shadow : colorsDay.shadow;
  switch (level) {
    case 1: return { shadowColor, shadowOpacity: night ? 0.4 : 0.14, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 };
    case 2: return { shadowColor, shadowOpacity: night ? 0.45 : 0.16, shadowRadius: 7, shadowOffset: { width: 0, height: 6 }, elevation: 5 };
    case 3: return { shadowColor, shadowOpacity: night ? 0.55 : 0.24, shadowRadius: 16, shadowOffset: { width: 0, height: 14 }, elevation: 12 };
    default: return { shadowColor, shadowOpacity: night ? 0.35 : 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: -6 }, elevation: 16 };
  }
}

export const motion = {
  fast: 160, base: 240, slow: 360, scene: 900, press: 60, still: 120,
  spring: {
    sheet: { damping: 26, stiffness: 280, mass: 1 },
    press: { damping: 15, stiffness: 400, mass: 1 },
    pop: { damping: 12, stiffness: 220, mass: 1 },
    bounce: { damping: 8, stiffness: 260, mass: 1 },
    thumb: { damping: 20, stiffness: 300, mass: 1 },
    /** A tree settles onto its cell (wave 3, 4.5). */
    drop: { damping: 18, stiffness: 260, mass: 1 },
  },
  ease: { out: Easing.out(Easing.cubic), in: Easing.in(Easing.cubic), inOut: Easing.inOut(Easing.cubic) },
} as const;

/** Colors of the living scene stay in their own files; here they are only gathered. */
export const scene = {
  sky: { day: daySky, night: nightSky },
  meadow: { day: dayMeadow, night: nightMeadow },
  live: { day: liveDay, night: liveNight, fx },
  forest: { day: forestDay, night: forestNight },
};
