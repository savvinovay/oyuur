// The player's own profile (wave 5): the name friends see and a drawn avatar. Pure functions.
// The name follows the tree name's rules (nameText.ts): letters of any script, 1–20, no emoji.
import { finalName } from './nameText';

/** Drawn avatars (ui draws them); the list is the order of the picker. */
export const AVATARS = ['fox', 'owl', 'bear', 'hedgehog', 'rabbit', 'squirrel', 'deer', 'frog', 'leaf', 'acorn', 'mushroom', 'flower'] as const;
export type AvatarId = (typeof AVATARS)[number];

/** Background colors of the avatar circle, by index (ui maps them to day and night tones). */
export const AVATAR_COLORS = 8;

export interface Profile {
  /** null — not set yet: the app shows "You". */
  name: string | null;
  avatar: AvatarId;
  color: number;
}

export const newProfile = (): Profile => ({ name: null, avatar: 'fox', color: 0 });

export function withProfile(p: Profile, patch: Partial<Profile>): Profile {
  const next = { ...p };
  if ('name' in patch) next.name = patch.name ? finalName(patch.name) : null;
  if (patch.avatar && AVATARS.includes(patch.avatar)) next.avatar = patch.avatar;
  if (typeof patch.color === 'number' && Number.isInteger(patch.color) && patch.color >= 0 && patch.color < AVATAR_COLORS) next.color = patch.color;
  return next;
}

export function migrateProfile(saved: Partial<Profile> | undefined): Profile {
  if (!saved) return newProfile();
  return withProfile(newProfile(), {
    name: typeof saved.name === 'string' ? saved.name : null,
    avatar: saved.avatar,
    color: saved.color,
  });
}
