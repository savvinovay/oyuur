import { describe, expect, jest, test } from '@jest/globals';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

import { makeT } from '@/i18n';
import { dashCode, passwordHelp } from '../model';
import { passwordProblem } from '@/game/password';
import { changesText, dateText, daysText, dayWhen, hiddenOnlyHere, lockedCountText, savedWhen, syncRowText, timeText, treesText, unsaved } from '../syncText';

const ru = makeT('ru');
const en = makeT('en');
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const NOW = at(2026, 10, 29, 14, 30);

describe('counts with their words', () => {
  test('trees and changes', () => {
    expect([1, 2, 5, 21, 13].map((n) => treesText(ru, n))).toEqual(['1 дерево', '2 дерева', '5 деревьев', '21 дерево', '13 деревьев']);
    expect(treesText(en, 1)).toBe('1 tree');
    expect(changesText(ru, 3)).toBe('3 изменения');
    expect(changesText(en, 1)).toBe('1 change');
  });
});

describe('when the forest was saved (spec 8.2)', () => {
  test('just now, today, yesterday, an older day', () => {
    expect(savedWhen(ru, NOW - 20_000, NOW, true)).toBe('только что');
    expect(savedWhen(ru, at(2026, 10, 29, 14, 20), NOW, true)).toBe('в 14:20');
    expect(savedWhen(ru, at(2026, 10, 28, 21, 5), NOW, true)).toBe('вчера в 21:05');
    expect(savedWhen(ru, at(2026, 10, 28, 9, 10) - 86_400_000, NOW, true)).toBe('27 окт в 9:10');
    expect(savedWhen(en, at(2026, 10, 28, 21, 5), NOW, false)).toBe('yesterday at 9:05 PM');
  });
  test('the clock as the phone shows it', () => {
    expect(timeText(new Date(at(2026, 1, 1, 0, 7)), false)).toBe('12:07 AM');
    expect(timeText(new Date(at(2026, 1, 1, 9, 7)), true)).toBe('9:07');
  });
  test('days and dates', () => {
    expect(dayWhen(ru, at(2026, 10, 28), NOW)).toBe('вчера');
    expect(dayWhen(en, NOW, NOW)).toBe('today');
    expect(dateText(ru, at(2026, 11, 28))).toBe('28 ноября');
    expect(dateText(en, at(2026, 11, 28))).toBe('Nov 28');
    expect(daysText(ru, ['2026-10-27', '2026-10-28'])).toBe('27 окт, 28 окт');
  });
});

describe('the saving row (spec 7)', () => {
  const base = { state: 'saved' as const, pending: 0, lastOkAt: NOW - 5_000, trees: 13, locked: 0 };
  test('saved: trees, how many are locked, and when', () => {
    expect(syncRowText(ru, base, NOW, true)).toEqual({ title: 'Лес сохранён в аккаунте', sub: '13 деревьев · только что', hidden: null });
    expect(syncRowText(ru, { ...base, locked: 5 }, NOW, true).sub).toBe('13 деревьев, 5 под замком · только что');
    expect(syncRowText(en, { ...base, trees: 1, locked: 1 }, NOW, true).sub).toBe('1 tree, 1 locked · just now');
    expect(syncRowText(ru, { ...base, locked: 5, lastOkAt: null }, NOW, true).sub).toBe('13 деревьев, 5 под замком');
    expect(lockedCountText(ru, 0, 0)).toBe('Лес пока пуст');
    expect(lockedCountText(en, 2, 0)).toBe('2 trees');
    // An empty forest has its own words, not "0 trees".
    expect(syncRowText(ru, { ...base, trees: 0 }, NOW, true).sub).toBe('Лес пока пуст · только что');
    expect(syncRowText(en, { ...base, trees: 0, lastOkAt: null }, NOW, true).sub).toBe('No trees yet');
  });
  test('offline, saving, error, session', () => {
    expect(syncRowText(ru, { ...base, state: 'offline', pending: 3 }, NOW, true).sub).toBe('3 изменения отправим, когда будет сеть');
    expect(syncRowText(ru, { ...base, state: 'saving', pending: 2 }, NOW, true)).toEqual({ title: 'Сохраняем…', sub: '2 изменения', hidden: null });
    expect(syncRowText(en, { ...base, state: 'error' }, NOW, true).title).toBe('Couldn’t save');
    expect(syncRowText(ru, { ...base, state: 'error', errorWhy: 'server' }, NOW, true).sub).toBe('Сервер не отвечает. На телефоне всё цело');
    // The chest in the account won't open: said honestly, and that nothing here is lost.
    expect(syncRowText(ru, { ...base, state: 'error', errorWhy: 'vault' }, NOW, true)).toEqual({
      title: 'Не открываются скрытые деревья',
      sub: 'На телефоне всё цело. Попробуй ещё раз позже',
      hidden: null,
    });
    expect(syncRowText(en, { ...base, state: 'session' }, NOW, true).title).toBe('Sign in again to keep saving');
    expect(syncRowText(ru, { ...base, state: 'session', sessionWhy: 'password' }, NOW, true)).toEqual({
      title: 'Пароль изменён на другом телефоне',
      sub: 'Войди новым паролем. Пока всё только здесь',
      hidden: null,
    });
    expect(syncRowText(ru, { ...base, state: 'session', sessionWhy: 'expired' }, NOW, true).title).toBe('Войди снова, чтобы сохранять');
    // Saving before anything is decided: no made-up "1 change".
    expect(syncRowText(ru, { ...base, state: 'saving', pending: 0 }, NOW, true).sub).toBe('13 деревьев');
  });
  test('locked: hidden trees only on this device (OYUUR-31)', () => {
    expect(syncRowText(ru, { ...base, state: 'locked' }, NOW, true)).toEqual({
      title: 'Скрытые деревья — только здесь',
      sub: 'Введи пароль, чтобы запереть',
      hidden: null,
    });
    expect(syncRowText(en, { ...base, state: 'locked' }, NOW, true).title).toBe('Hidden trees — only on this device');
    expect(hiddenOnlyHere({ state: 'locked' })).toBe(true);
    expect(hiddenOnlyHere({ state: 'saved' })).toBe(false);
  });
  test('signing out could leave changes only here', () => {
    expect(unsaved({ state: 'saved', pending: 0 })).toBe(false);
    expect(unsaved({ state: 'saved', pending: 1 })).toBe(true);
    expect(unsaved({ state: 'offline', pending: 0 })).toBe(true);
    expect(unsaved({ state: 'error', pending: 0 })).toBe(true);
  });
});

describe('passwords and the code', () => {
  test('new passwords: 8 characters, not a common one', () => {
    expect(passwordProblem('1234567')).toBe('short');
    expect(passwordProblem('password')).toBe('common');
    expect(passwordProblem('берёзка-у-реки')).toBeNull();
    expect(passwordHelp(ru, 'short', false, 'hint')).toEqual({ text: 'hint', bad: false });
    expect(passwordHelp(ru, 'short', true, 'hint')).toEqual({ text: 'Нужно не меньше 8 знаков', bad: true });
    expect(passwordHelp(en, null, true, 'hint')).toEqual({ text: 'hint', bad: false });
  });
  test('the code is typed in groups with dashes', () => {
    expect(dashCode('abcd')).toBe('abcd');
    expect(dashCode('abcde')).toBe('abcd-e');
    expect(dashCode('abcdefghjkmn')).toBe('abcd-efgh-jkmn');
  });
});
