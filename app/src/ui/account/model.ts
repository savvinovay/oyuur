// The account screens' small rules (wave 5 spec, section 3): what the nick line says, which
// error a server answer is, how the recovery code is written, where the screens go when done.
// Pure functions, tested in __tests__/model.test.ts.
import { nickProblem, NickProblem } from '@/game/nick';
import type { T } from '@/i18n';
import { ApiError } from '@/net/api';
import { isCryptoError } from '@/net/crypto';
import type { PasswordProblem } from '@/state/syncContract';

/** The recovery code: 12 letters and digits (server/src/app.js, newRecovery). */
export const CODE_LENGTH = 12;

/** The nick field's state (table 3.4). */
export type NickCheck =
  | { kind: 'hint' }
  | { kind: 'bad'; problem: Exclude<NickProblem, 'empty'> }
  | { kind: 'checking' }
  | { kind: 'free' }
  | { kind: 'taken'; suggestions: string[] }
  | { kind: 'offline' };

/** What can be said about a nick before the server: the hint, a broken rule, or "ask the server". */
export function localCheck(nick: string): NickCheck {
  const problem = nickProblem(nick);
  if (problem === 'empty') return { kind: 'hint' };
  if (problem) return { kind: 'bad', problem };
  return { kind: 'checking' };
}

/** The server's answer to "is it free?" as the field's state. */
export function serverCheck(answer: { valid: boolean; free: boolean; suggestions: string[] }): NickCheck {
  if (!answer.valid) return { kind: 'bad', problem: 'reserved' };
  return answer.free ? { kind: 'free' } : { kind: 'taken', suggestions: answer.suggestions.slice(0, 3) };
}

/** The line under the nick field. */
export function nickLine(t: T, nick: string, check: NickCheck): string {
  switch (check.kind) {
    case 'hint': return t('accNickHint');
    case 'checking': return t('accNickChecking');
    case 'free': return t('accNickFree', { nick });
    case 'taken': return t('accNickTaken');
    case 'offline': return t('accNickOffline');
    case 'bad':
      switch (check.problem) {
        case 'short': return t('accNickShort');
        case 'letter': return t('accNickLetter');
        case 'underscores': return t('accNickUnderscores');
        default: return t('accNickReserved');
      }
  }
}

/** What went wrong in a sign-in / create / recover / delete call, said for people. */
export function errorText(t: T, e: unknown): string {
  // The server let us in, but a box or the chest didn't open (OYUUR-31): nothing was changed.
  if (isCryptoError(e)) return t('accBoxBroken');
  if (!(e instanceof ApiError)) return t('accServerError');
  if (e.status === 0) return t('accOffline');
  switch (e.code) {
    case 'wrong_login': return t('accWrongLogin');
    case 'wrong_code': return t('accWrongCode');
    case 'wrong_password': return t('accWrongPassword');
    case 'bad_password': return t('accPasswordShort');
    case 'bad_nick': return t('accNickReserved');
    case 'too_many': return t('accTooMany');
    case 'banned': return t('accBanned');
    case 'box_broken': return t('accBoxBroken');
    default: return t('accServerError');
  }
}

/** The "free ones" the server offers with a taken nick (`nick_taken`). */
export function takenSuggestions(e: unknown): string[] | null {
  if (!(e instanceof ApiError) || e.code !== 'nick_taken') return null;
  const list = e.extra.suggestions;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, 3) : [];
}

/** As typed into the code field: letters and digits only, lower case, 12 at most. */
export const typeCode = (raw: string) => raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, CODE_LENGTH);

/** The code as shown: "abcd efgh jkmn". */
export const formatCode = (code: string) => code.match(/.{1,4}/g)?.join(' ') ?? '';

/** The code in its field (spec 8.4): groups of four, the dashes put in by themselves — "abcd-efgh-jk". */
export const dashCode = (code: string) => code.match(/.{1,4}/g)?.join('-') ?? '';

/** The line under a new password: the rule, or what is wrong with what is typed (spec 3.1, 12.3). */
export function passwordHelp(t: T, problem: PasswordProblem, typed: boolean, hint: string): { text: string; bad: boolean } {
  if (!typed || !problem) return { text: hint, bad: false };
  return { text: t(problem === 'common' ? 'accPasswordCommon' : 'accPasswordShort'), bad: true };
}

/** Where the account screens were opened from: they go back there when done. `i/<nick>` — an invite link. */
export type AccountFrom = 'first' | 'friends' | 'leaders' | 'settings' | `i/${string}`;

export function parseFrom(raw: string | string[] | undefined): AccountFrom {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v && /^i\/[a-z0-9_]{1,20}$/.test(v)) return v as AccountFrom;
  return v === 'first' || v === 'friends' || v === 'leaders' || v === 'settings' ? v : 'settings';
}

/** The screen to land on after signing in: "Friends" goes on to "Find a friend" (spec 3.5). */
export function landing(from: AccountFrom): { back: string; then: string | null } {
  switch (from) {
    case 'friends': return { back: '/friends', then: '/find' };
    case 'leaders': return { back: '/leaders', then: null };
    case 'settings': return { back: '/settings', then: null };
    case 'first': return { back: '/', then: null };
    // Back to the invite's "Add …".
    default: return { back: `/${from}`, then: null };
  }
}
