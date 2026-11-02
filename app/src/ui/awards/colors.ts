// The medals' paints (wave 5 spec, 11.2–11.3): "paints of the world", the same day and night.
import type { AchievementId } from '@/game/achievements';
import type { GlyphName } from '@/ui/ds/Glyph';

export type Tier = 'wood' | 'silver' | 'gold';

/** 20–50 acorns — wood, 80–100 — silver, 150–200 — gold. */
export const tierOf = (reward: number): Tier => (reward >= 150 ? 'gold' : reward >= 80 ? 'silver' : 'wood');

export const TIERS: Record<Tier, { face: string; lip: string; shine: string }> = {
  wood: { face: '#E2B274', lip: '#B07C3E', shine: '#FFE7C2' },
  silver: { face: '#DCE4EE', lip: '#98A6B8', shine: '#FFFFFF' },
  gold: { face: '#FFCF4D', lip: '#D99A1E', shine: '#FFF2C2' },
};

/** A medal not earned yet: colorless wood. */
export const LOCKED = { face: '#E9D3B0', lip: '#CDB48E', disc: '#F7E7CF', shine: '#FFF6E6', cut: '#F4E4CA', cutRing: '#E2CDAA', cutText: '#B9A07E' };

/** The tree cut inside the medals for days. */
export const CUT = { wood: '#F3CF92', ring: '#D9A867', text: '#5A3A0E' };

export const GLOW = '#FFE7A0';

/** What is inside a medal: a tree cut with a number, or a glyph on a disc of its own color. */
export type BadgeMark = { days: number } | { glyph: GlyphName; disc: string };

export const MARKS: Record<AchievementId, BadgeMark> = {
  firstWater: { glyph: 'drop', disc: '#DCEFFB' },
  days7: { days: 7 },
  days30: { days: 30 },
  days100: { days: 100 },
  days365: { days: 365 },
  trees3: { glyph: 'forest', disc: '#E3F4D3' },
  trees10: { glyph: 'forest', disc: '#CDEBB4' },
  firstName: { glyph: 'nameTag', disc: '#FFF0C2' },
  firstLockIn: { glyph: 'plaque', disc: '#FFF4D6' },
  seedTree: { glyph: 'seed', disc: '#F3E3CC' },
  noMiss30: { glyph: 'check', disc: '#DDF5DF' },
  firstBuy: { glyph: 'acorn', disc: '#FFE9C7' },
  quests7: { glyph: 'basket', disc: '#FFF0C2' },
  firstFriend: { glyph: 'friends', disc: '#DDF0FB' },
};
