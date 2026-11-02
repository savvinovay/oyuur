// Sky colors by day and by night (wave 1 spec, section 4). They live here and
// not in theme.ts so that the three scene developers never edit one file.

export interface SkyColors {
  /** Gradient: top, 60 % down, at the horizon. */
  top: string;
  mid: string;
  horizon: string;
  cloudTop: string;
  cloudBottom: string;
  cloudLight: string;
  cloudShadow: string;
}

export const daySky: SkyColors = {
  top: '#9FE1F5',
  mid: '#C9F0FA',
  horizon: '#EAFBFF',
  cloudTop: '#FFFFFF',
  cloudBottom: '#DDF1FA',
  cloudLight: '#FFFFFF',
  cloudShadow: '#8CCBE0',
};

export const nightSky: SkyColors = {
  top: '#191E5E',
  mid: '#2B2F7A',
  horizon: '#5357A8',
  // Night clouds are darker than the sky and lit by the moon from above.
  cloudTop: '#5A5EB0',
  cloudBottom: '#2F3378',
  cloudLight: '#8E91E0',
  cloudShadow: '#151845',
};

export const sun = {
  core: ['#FFF6BE', '#FBD84E', '#F4BE34'],
  ray: '#F9D548',
  glow: ['rgba(255,246,194,0.85)', 'rgba(255,241,168,0.35)', 'rgba(255,241,168,0)'],
};

export const moon = {
  disc: '#EEEDFB',
  crater: '#D4D1EE',
  glow: ['rgba(201,199,255,0.55)', 'rgba(201,199,255,0)'],
};

export const star = { dot: '#FFFFFF', sparkle: '#FFE39A' };

/** Distant birds: grey-blue, not black. */
export const bird = '#4E5F70';
