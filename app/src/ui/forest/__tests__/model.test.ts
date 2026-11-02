import { describe, expect, jest, test } from '@jest/globals';
import { emptyPlot } from '@/game/plot';
import { groupHabits, plantTree, Tree } from '@/game/tree';
import { makeT } from '@/i18n';
import { mapItems, treeLabel } from '../model';

// The map's shared values are not needed here (and Reanimated has no native side in tests).
jest.mock('react-native-reanimated', () => ({ makeMutable: (value: unknown) => ({ value }) }));
// Only the map picture's size, not the Skia drawings behind it.
jest.mock('../thumbs', () => ({ MAP_THUMB: 120, MAP_FILL: 0.26 }));

const today = '2026-10-27';
const make = (id: string, name: string, patch: Partial<Tree> = {}): Tree => ({
  ...plantTree({ id, name, kind: 'do', visibility: 'private', today: '2026-10-20' }),
  checkins: ['2026-10-25', '2026-10-26', today],
  ...patch,
});

function label(tree: Tree, lang: 'ru' | 'en') {
  const plot = { ...emptyPlot(), places: { [tree.lineageId]: { c: 1, r: 0 } } };
  const [item] = mapItems(groupHabits([tree]), plot, today);
  return { item, text: treeLabel(item, makeT(lang), today) };
}

describe('the tree on the map (wave 4, 5.2)', () => {
  test('without a name: the habit, as before', () => {
    const { item, text } = label(make('a', 'Не курить'), 'ru');
    expect(item.name).toBe('Не курить');
    expect(text).toBe('Не курить, Сегодня полито · 3 дня. Ряд 1, место 2');
  });

  test('with a name: the name, the habit, the state', () => {
    const { item, text } = label(make('a', 'Не курить', { nickname: 'Дубок' }), 'ru');
    expect(item.name).toBe('Дубок');
    expect(text).toBe('Дубок, Не курить, Сегодня полито · 3 дня. Ряд 1, место 2');
    expect(label(make('a', 'No sugar', { nickname: 'Acorn' }), 'en').text.startsWith('Acorn, No sugar, ')).toBe(true);
  });
});

describe('waiting for the watering hour (OYUUR-34)', () => {
  test('no drop and "Ждёт вечера" until the hour', () => {
    const tree = make('a', 'Не курить', { kind: 'quit', checkins: ['2026-10-25', '2026-10-26'], openHours: [{ from: '2026-10-20', hour: 18 }] });
    const plot = { ...emptyPlot(), places: { [tree.lineageId]: { c: 1, r: 0 } } };
    const [waiting] = mapItems(groupHabits([tree]), plot, today, ['a']);
    expect(waiting.thirsty).toBe(false);
    expect(treeLabel(waiting, makeT('ru'), today)).toBe('Не курить, Ждёт вечера · 2 дня. Ряд 1, место 2');
    const [due] = mapItems(groupHabits([tree]), plot, today);
    expect(due.thirsty).toBe(true);
  });
});
