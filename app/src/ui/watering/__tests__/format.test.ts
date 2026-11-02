import { describe, expect, jest, test } from '@jest/globals';

// The phone says nothing about its clock here: the language decides.
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'ru' }], getCalendars: () => [{ uses24hourClock: null }] }));

import { makeT } from '@/i18n';
import { formatHour, fromText, hourText, openHourLabel, PRESET_HOURS, showQuitHint, untilText, uses24, waitWord } from '../format';

const ru = makeT('ru');
/** The texts keep numbers to their units with no-break spaces; compared here with plain ones. */
const plain = (s: string) => s.replace(/ /g, ' ');
const en = makeT('en');

describe('the hour as the phone shows time (спец 2)', () => {
  test('24-hour and 12-hour', () => {
    expect(plain(formatHour(18, true))).toBe('18:00');
    expect(plain(formatHour(6, true))).toBe('6:00');
    expect(plain(formatHour(18, false))).toBe('6 PM');
    expect(plain(formatHour(12, false))).toBe('12 PM');
    expect(plain(formatHour(0, false))).toBe('12 AM');
    expect(plain(formatHour(9, false))).toBe('9 AM');
  });

  test('hours 24..26 of the game day are the night after midnight', () => {
    expect(plain(formatHour(25, true))).toBe('1:00');
    expect(plain(formatHour(24, false))).toBe('12 AM');
  });

  test('the phone setting wins; unknown — by the language', () => {
    expect(uses24('en', true)).toBe(true);
    expect(uses24('ru', false)).toBe(false);
    expect(uses24('ru', null)).toBe(true);
    expect(uses24('en', null)).toBe(false);
    expect(plain(hourText(18, 'ru'))).toBe('18:00');
    expect(plain(hourText(18, 'en'))).toBe('6 PM');
  });
});

describe('the wait in words', () => {
  test('minutes, hours, both', () => {
    expect(plain(untilText(42, ru))).toBe('42 мин');
    expect(plain(untilText(200, ru))).toBe('3 ч 20 мин');
    expect(plain(untilText(180, ru))).toBe('3 ч');
    expect(plain(untilText(200, en))).toBe('3 h 20 min');
    expect(plain(untilText(42, en))).toBe('42 min');
  });

  test('a number never parts from its unit (no-break spaces)', () => {
    expect(untilText(200, ru)).toBe('3 ч 20 мин');
    expect(fromText(18, ru)).toBe('с 18:00');
    expect(formatHour(18, false)).toBe('6 PM');
  });

  test('never "0 min"', () => {
    expect(plain(untilText(0, ru))).toBe('1 мин');
    expect(plain(untilText(0.4, ru))).toBe('1 мин');
  });
});

describe('the choice in words (спец 1.3, 2)', () => {
  test('the ready choices name their part of the day', () => {
    expect(PRESET_HOURS).toEqual([0, 6, 12, 18, 21]);
    expect(plain(openHourLabel(0, ru))).toBe('в любое время');
    expect(plain(openHourLabel(6, ru))).toBe('утром, с 6:00');
    expect(plain(openHourLabel(12, ru))).toBe('днём, с 12:00');
    expect(plain(openHourLabel(18, ru))).toBe('вечером, с 18:00');
    expect(plain(openHourLabel(21, ru))).toBe('поздно, с 21:00');
    expect(plain(openHourLabel(15, ru))).toBe('с 15:00');
    expect(plain(openHourLabel(18, en))).toBe('in the evening, from 6 PM');
  });

  test('"с 12:00" or "в любое время"', () => {
    expect(plain(fromText(12, ru))).toBe('с 12:00');
    expect(plain(fromText(0, ru))).toBe('в любое время');
    expect(plain(fromText(0, en))).toBe('any time');
  });

  test('what the tree waits for', () => {
    expect(waitWord(6, ru)).toBe('Ждёт утра');
    expect(waitWord(12, ru)).toBe('Ждёт обеда');
    expect(waitWord(18, ru)).toBe('Ждёт вечера');
    expect(waitWord(21, ru)).toBe('Ждёт ночи');
    expect(waitWord(15, ru)).toBe('Ждёт 15:00');
    expect(plain(waitWord(15, en))).toBe('Waits for 3 PM');
  });

  test('the gray hint: only "Quit" before noon', () => {
    expect(showQuitHint('quit', 6)).toBe(true);
    expect(showQuitHint('quit', 0)).toBe(true);
    expect(showQuitHint('quit', 12)).toBe(false);
    expect(showQuitHint('quit', 18)).toBe(false);
    expect(showQuitHint('do', 6)).toBe(false);
  });
});
