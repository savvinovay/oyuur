import { expect, jest, test } from '@jest/globals';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

import { makeT, stageDaysText } from '..';

test('days of growth with the right word', () => {
  const ru = makeT('ru');
  expect(stageDaysText(ru, 1)).toBe('1 день роста');
  expect(stageDaysText(ru, 3)).toBe('3 дня роста');
  expect(stageDaysText(ru, 7)).toBe('7 дней роста');
  expect(stageDaysText(ru, 11)).toBe('11 дней роста');
  expect(stageDaysText(ru, 21)).toBe('21 день роста');
  expect(stageDaysText(ru, 50)).toBe('50 дней роста');
  expect(stageDaysText(ru, 100)).toBe('100 дней роста');
  expect(stageDaysText(ru, 112)).toBe('112 дней роста');
  expect(stageDaysText(ru, 122)).toBe('122 дня роста');
  const en = makeT('en');
  expect(stageDaysText(en, 1)).toBe('1 day of growth');
  expect(stageDaysText(en, 21)).toBe('21 days of growth');
});
