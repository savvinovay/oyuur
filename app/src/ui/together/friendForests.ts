// The friends' forests last opened in this session, by @nick: "View" in a friend's forest
// opens the tree big on habit.tsx, which reads it from here (the forest has just fetched it).
import type { Habit } from '@/game/tree';

const forests = new Map<string, Habit[]>();

export const rememberFriendForest = (nick: string, habits: Habit[]) => forests.set(nick, habits);
export const friendForest = (nick: string): Habit[] | null => forests.get(nick) ?? null;
/** Signed out: another account must not see this one's friends. */
export const forgetFriendForests = () => forests.clear();
