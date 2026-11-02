import { describe, expect, jest, test } from '@jest/globals';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

import { makeT } from '@/i18n';
import { ApiError } from '@/net/api';
import { errorText, formatCode, landing, localCheck, nickLine, parseFrom, serverCheck, takenSuggestions, typeCode } from '../model';

const ru = makeT('ru');
const en = makeT('en');

describe('the nick field (3.4)', () => {
  test('empty is a hint, broken rules are told at once, a good nick goes to the server', () => {
    expect(localCheck('')).toEqual({ kind: 'hint' });
    expect(localCheck('sa')).toEqual({ kind: 'bad', problem: 'short' });
    expect(localCheck('1sasha')).toEqual({ kind: 'bad', problem: 'letter' });
    expect(localCheck('sa__t')).toEqual({ kind: 'bad', problem: 'underscores' });
    expect(localCheck('admin')).toEqual({ kind: 'bad', problem: 'reserved' });
    expect(localCheck('sasha_t')).toEqual({ kind: 'checking' });
  });

  test('the server says free, taken with three free ones, or not allowed', () => {
    expect(serverCheck({ valid: true, free: true, suggestions: [] })).toEqual({ kind: 'free' });
    expect(serverCheck({ valid: true, free: false, suggestions: ['a_1', 'a_2', 'a_3', 'a_4'] })).toEqual({ kind: 'taken', suggestions: ['a_1', 'a_2', 'a_3'] });
    expect(serverCheck({ valid: false, free: false, suggestions: [] })).toEqual({ kind: 'bad', problem: 'reserved' });
  });

  test('the line under the field', () => {
    expect(nickLine(ru, 'sasha_t', { kind: 'free' })).toBe('@sasha_t свободен');
    expect(nickLine(en, 'sasha_t', { kind: 'free' })).toBe('@sasha_t is free');
    expect(nickLine(ru, '', { kind: 'hint' })).toBe('3–20 знаков: латиница, цифры и _');
    expect(nickLine(ru, 'sa', { kind: 'bad', problem: 'short' })).toBe('Слишком короткий — нужно от 3 знаков');
    expect(nickLine(ru, 'aisha_k', { kind: 'taken', suggestions: [] })).toBe('Этот ник занят. Свободные:');
    expect(nickLine(en, 'x', { kind: 'offline' })).toBe('We’ll check once you’re online');
  });
});

describe('server errors for people', () => {
  test('known codes, no network, anything else', () => {
    expect(errorText(ru, new ApiError(401, 'wrong_login'))).toBe('Неверный ник или пароль');
    expect(errorText(ru, new ApiError(401, 'wrong_code'))).toBe('Неверный ник или код');
    expect(errorText(en, new ApiError(401, 'wrong_password'))).toBe('Wrong password');
    expect(errorText(en, new ApiError(429, 'too_many'))).toBe('Too many tries. Try again in a few minutes');
    expect(errorText(ru, new ApiError(403, 'banned'))).toMatch(/^Аккаунт заблокирован/);
    expect(errorText(en, new ApiError(0, 'offline'))).toBe('You’re offline — try again once you’re online');
    expect(errorText(en, new ApiError(500, 'server'))).toBe('Something went wrong. Try again');
    expect(errorText(en, new Error('boom'))).toBe('Something went wrong. Try again');
  });

  test('a nick taken at the last second brings its free ones', () => {
    expect(takenSuggestions(new ApiError(409, 'nick_taken', { suggestions: ['a_1', 'a_2', 'a_3'] }))).toEqual(['a_1', 'a_2', 'a_3']);
    expect(takenSuggestions(new ApiError(409, 'nick_taken'))).toEqual([]);
    expect(takenSuggestions(new ApiError(401, 'wrong_login'))).toBeNull();
  });
});

describe('the recovery code', () => {
  test('typed: letters and digits only, lower case, 12 at most', () => {
    expect(typeCode('ABCD-efgh jkmn')).toBe('abcdefghjkmn');
    expect(typeCode('abcd efgh jkmn pq')).toBe('abcdefghjkmn');
  });
  test('shown in groups of four', () => {
    expect(formatCode('abcdefghjkmn')).toBe('abcd efgh jkmn');
    expect(formatCode('abcde')).toBe('abcd e');
    expect(formatCode('')).toBe('');
  });
});

describe('where the screens go when done', () => {
  test('from Friends on to "Find a friend", otherwise back', () => {
    expect(landing('friends')).toEqual({ back: '/friends', then: '/find' });
    expect(landing('leaders')).toEqual({ back: '/leaders', then: null });
    expect(landing('first')).toEqual({ back: '/', then: null });
    expect(parseFrom('leaders')).toBe('leaders');
    expect(parseFrom(['first'])).toBe('first');
    expect(parseFrom('nonsense')).toBe('settings');
    expect(parseFrom(undefined)).toBe('settings');
  });
  test('from an invite link back to its screen ("Add …")', () => {
    expect(parseFrom('i/sasha_t')).toBe('i/sasha_t');
    expect(landing('i/sasha_t')).toEqual({ back: '/i/sasha_t', then: null });
    // Only a nick goes after "i/": no other paths through the parameter.
    expect(parseFrom('i/../settings')).toBe('settings');
    expect(parseFrom('i/')).toBe('settings');
    expect(parseFrom('i/Sasha')).toBe('settings');
  });
});
