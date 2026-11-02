import { expect, jest, test } from '@jest/globals';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

import { acornsText, formatAcorns, makeT } from '..';

// Wave 5 spec 1.3: RU groups with a narrow no-break space, EN with a comma, no shortening.
test('acorn numbers group their thousands', () => {
  expect(formatAcorns(0, 'ru')).toBe('0');
  expect(formatAcorns(50, 'ru')).toBe('50');
  expect(formatAcorns(999, 'en')).toBe('999');
  expect(formatAcorns(1240, 'ru')).toBe('1 240');
  expect(formatAcorns(1240, 'en')).toBe('1,240');
  expect(formatAcorns(125000, 'en')).toBe('125,000');
  expect(formatAcorns(9999999, 'ru')).toBe('9 999 999');
  expect(formatAcorns(-15, 'en')).toBe('-15');
});

test('acorns with the right word', () => {
  const ru = makeT('ru');
  expect(acornsText(ru, 1)).toBe('1 жёлудь');
  expect(acornsText(ru, 3)).toBe('3 жёлудя');
  expect(acornsText(ru, 15)).toBe('15 желудей');
  expect(acornsText(ru, 21)).toBe('21 жёлудь');
  expect(acornsText(ru, 1240)).toBe('1 240 желудей');
  const en = makeT('en');
  expect(acornsText(en, 1)).toBe('1 acorn');
  expect(acornsText(en, 1240)).toBe('1,240 acorns');
});
