import { describe, expect, it, jest } from '@jest/globals';
import { makeT } from '@/i18n';
import { plantTree } from '@/game/tree';
import { DEFAULT_PREFS, planReminders } from '../plan';

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parsePrefs } = require('../prefs') as typeof import('../prefs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { routeOf, toScheduled, treeUrl } = require('../schedule') as typeof import('../schedule');

describe('saved settings', () => {
  it('missing or damaged — the default (on, last chance on, 20:00, not asked)', () => {
    expect(parsePrefs(null)).toEqual({ ...DEFAULT_PREFS, asked: false });
    expect(parsePrefs('{oops')).toEqual({ ...DEFAULT_PREFS, asked: false });
    expect(parsePrefs(JSON.stringify({ on: 'yes', doHour: 2 }))).toEqual({ on: true, lastChance: true, doHour: 8, asked: false });
    expect(parsePrefs(JSON.stringify({ on: false, lastChance: false, doHour: 9, asked: true }))).toEqual({ on: false, lastChance: false, doHour: 9, asked: true });
  });
});

describe('a tap opens the tree', () => {
  it('oyuur://tree/<id> → /tree/<id>; anything else — nothing', () => {
    expect(routeOf(treeUrl('abc-1'))).toBe('/tree/abc-1');
    expect(routeOf('https://example.com/tree/x')).toBeNull();
    expect(routeOf('oyuur://tree/')).toBeNull();
  });

  it('every planned reminder is ready for the phone: words, the most urgent tree, its day', () => {
    const tree = { ...plantTree({ id: 't1', name: 'Бег', kind: 'do', visibility: 'friends', today: '2026-10-20' }), settledThrough: '2026-10-28' };
    const items = toScheduled(planReminders({ trees: [tree], prefs: DEFAULT_PREFS, now: new Date(2026, 9, 29, 10) }), makeT('ru'));
    expect(items[0]).toMatchObject({ key: 'open:2026-10-29:20', title: 'Пора полить «Бег»', url: 'oyuur://tree/t1', day: '2026-10-29', trees: ['t1'] });
    expect(items[1]).toMatchObject({ title: 'Полить можно до 3:00', body: 'Полей «Бег», иначе сгорит шанс.' });
  });
});
