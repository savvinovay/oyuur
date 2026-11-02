// A new recovery code kept before it is sent (OYUUR-31): whether the account has it is told by its salt.
import { describe, expect, it, jest } from '@jest/globals';
import type { AuthParams } from '../api';
import { parsePending, PendingCode, pendingFor, pendingState } from '../pendingCode';
import { passwordMayGo, withNick } from '../v2nicks';

jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('expo-secure-store', () => ({}));

const kdf = (salt: string) => ({ alg: 'scrypt' as const, N: 2 ** 15, r: 8 as const, p: 1 as const, salt });
const p: PendingCode = { nick: 'sasha', userId: 'u1', code: 'abcd2345efgh', recSalt: 'NEW', at: 1 };
const v2 = (salt: string): AuthParams => ({ v: 2, kdf: kdf('P'), recKdf: kdf(salt) });

describe('a code kept before it is sent', () => {
  it('the account has it when its code parameters are the ones made with it', () => {
    expect(pendingState(p, v2('NEW'))).toBe('yes');
    // The answer was lost before the server took it: the old code's salt is still there.
    expect(pendingState(p, v2('OLD'))).toBe('no');
    // An old account (the move never went), or an older server.
    expect(pendingState(p, { v: 1, kdf: null, recKdf: null })).toBe('no');
    expect(pendingState(p, null)).toBe('no');
  });

  it('belongs to its nick or its account', () => {
    expect(pendingFor(p, 'sasha')).toBe(true);
    expect(pendingFor(p, 'renamed', 'u1')).toBe(true);
    expect(pendingFor(p, 'masha', 'u2')).toBe(false);
    expect(pendingFor(null, 'sasha')).toBe(false);
  });

  it('a damaged entry is none', () => {
    expect(parsePending(JSON.stringify(p))).toEqual(p);
    expect(parsePending('{"nick":"sasha"}')).toBeNull();
    expect(parsePending('not json')).toBeNull();
    expect(parsePending(null)).toBeNull();
  });
});

describe('the password never goes for an account known to be on v2', () => {
  it('only an old account (or an older server) the phone knows nothing of', () => {
    expect(passwordMayGo({ v: 1, kdf: null, recKdf: null }, false)).toBe(true);
    expect(passwordMayGo(null, false)).toBe(true);
    // A server that says "old account" about a nick known on v2 is not believed.
    expect(passwordMayGo({ v: 1, kdf: null, recKdf: null }, true)).toBe(false);
    expect(passwordMayGo(null, true)).toBe(false);
    expect(passwordMayGo(v2('X'), false)).toBe(false);
  });

  it('the nicks list: no repeats, the latest last, a limit', () => {
    expect(withNick(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(withNick([], '')).toEqual([]);
    const many = Array.from({ length: 60 }, (_, i) => `n${i}`).reduce(withNick, [] as string[]);
    expect(many.length).toBe(50);
    expect(many[49]).toBe('n59');
  });
});
