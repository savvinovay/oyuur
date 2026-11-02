// The @nick friends find you by (wave 5, design/волна-5/спец-друзья.md, 3.4). Pure functions.
// a–z, 0–9 and _, 3–20, starts with a letter, no "__", doesn't end with "_", not reserved.
// The server checks the same (server/src/app.js, validNick) and has the final word.

export const NICK_MIN = 3;
export const NICK_MAX = 20;

/** Names nobody can take (the server has the same list). */
export const RESERVED_NICKS = [
  'admin', 'administrator', 'root', 'oyuur', 'ojuur', 'support', 'help', 'api', 'system', 'moderator', 'official',
  'null', 'undefined', 'me', 'elevate', 'tree', 'derevo', 'mas', 'team', 'staff', 'security',
];

/** As typed: capitals to lower case, "@" at the start dropped, a space becomes "_", other characters don't go in. */
export function typeNick(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/ /g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, NICK_MAX);
}

export type NickProblem = 'empty' | 'short' | 'letter' | 'underscores' | 'reserved';

/** What is wrong with a nick, before asking the server; null — fine. */
export function nickProblem(nick: string): NickProblem | null {
  if (nick.length === 0) return 'empty';
  if (!/^[a-z]/.test(nick)) return 'letter';
  if (nick.length < NICK_MIN) return 'short';
  if (nick.includes('__') || nick.endsWith('_')) return 'underscores';
  if (RESERVED_NICKS.includes(nick)) return 'reserved';
  return null;
}

/** A nick as shown: "@mei". */
export const atNick = (nick: string) => `@${nick}`;
