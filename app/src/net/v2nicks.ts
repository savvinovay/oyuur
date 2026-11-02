// Nicks this phone knows are on sign-in v2 (OYUUR-31): the password itself never goes to the server
// for them again. A server that answers "this is an old account" (v: 1) or "I don't know sign-in
// v2" (404) about such a nick is not believed — that would be the way to make the phone send the
// password in the open. Remembered after every sign-in, account, move or recovery done with v2.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthParams } from './api';

const KEY = 'oyuur/v2nicks';
/** More than enough for one phone; the oldest go first. */
const MAX = 50;

/** The list with the nick added (last), at most MAX. */
export function withNick(list: string[], nick: string): string[] {
  if (!nick) return list;
  return [...list.filter((n) => n !== nick), nick].slice(-MAX);
}

/**
 * The old sign-in (the password itself goes to the server) may be used: the server says the
 * account is old (or doesn't know v2), and nothing here says it is on v2.
 */
export const passwordMayGo = (params: AuthParams | null, knownV2: boolean): boolean => !knownV2 && (params === null || params.v === 1);

export async function readV2Nicks(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((n): n is string => typeof n === 'string') : [];
  } catch {
    return [];
  }
}

export async function rememberV2(nick: string): Promise<void> {
  try {
    const list = await readV2Nicks();
    if (list[list.length - 1] === nick) return;
    await AsyncStorage.setItem(KEY, JSON.stringify(withNick(list, nick)));
  } catch {
    // Best effort: the session and the key say it too.
  }
}
