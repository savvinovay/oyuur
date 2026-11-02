// Colors of the meadow and the far landscape (spec section 4), by day and by night.
// Kept here, not in theme.ts, so the three wave-1 developers never edit one file.

export interface MeadowColors {
  mountainsTop: string;
  mountainsBottom: string;
  hillsTop: string;
  hillsBottom: string;
  forest: string;
  bushes: string;
  /** Meadow gradient: horizon, 22 %, 50 %, bottom. */
  meadow: [string, string, string, string];
  /** Haze over the horizon; also tints far neighbour trees. */
  haze: string;
  grass: [string, string];
  /** Thick foreground grass above the sheet: the dark low layer, the bright tall one. */
  frontGrass: [string, string];
  /** Petals: white, yellow, pink, lilac by day; two pale lilacs by night. */
  flowers: [string, string, string, string];
  flowerHeart: string;
  /** Bare soil under a neighbour tree. */
  soil: string;
}

export const dayColors: MeadowColors = {
  mountainsTop: '#B7DCE0',
  mountainsBottom: '#CFEAEA',
  hillsTop: '#A3D3B7',
  hillsBottom: '#B9E0C2',
  forest: '#93C9A6',
  bushes: '#8DC58F',
  meadow: ['#CBE5A1', '#DCE3A0', '#EED8A0', '#E8C68A'],
  haze: '#F2FCFF',
  grass: ['#9CCB5E', '#7DB24A'],
  frontGrass: ['#6A9F3C', '#7DB24A'],
  flowers: ['#FFFFFF', '#FFD84D', '#FF9FB8', '#B7A6FF'],
  flowerHeart: '#FFF3B0',
  soil: '#A07448',
};

export const nightColors: MeadowColors = {
  mountainsTop: '#3B3F8C',
  mountainsBottom: '#4A4F9E',
  hillsTop: '#2C3A6E',
  hillsBottom: '#34477A',
  forest: '#2A3B66',
  bushes: '#2D4766',
  meadow: ['#3D4C86', '#45507A', '#594B4A', '#4A3A2E'],
  haze: '#5357A8',
  grass: ['#3E6440', '#2F5233'],
  frontGrass: ['#24442E', '#2F5638'],
  flowers: ['#C9C2F0', '#E8E2FF', '#C9C2F0', '#E8E2FF'],
  // Night flowers are dim (α 0.55 of the pale lilac): the heart barely shows.
  flowerHeart: '#E8E2FF',
  soil: '#6B5340',
};

/** Night flowers are drawn at this opacity. */
export const NIGHT_FLOWER_ALPHA = 0.55;

export const fireflyCore = '#F4FFB8';
export const fireflyGlow = 'rgba(233, 255, 138, 0.18)';
