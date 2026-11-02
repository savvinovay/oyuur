import { describe, expect, it } from '@jest/globals';
import { dictionaries } from '@/i18n';
import { addDays } from '../dates';
import {
  cleanTyping,
  finalName,
  heirName,
  MAX_NAME_ASKS,
  matchesQuery,
  NAME_MAX,
  nameAskOpen,
  nameIdeas,
  shouldAskName,
  titleOf,
  withAsk,
  withLater,
  withName,
} from '../naming';
import { checkIn, complete, migrateTrees, plantFromSeed, plantTree, SKINS, Tree } from '../tree';

const D0 = '2026-10-05';
const plant = (id = 't1', name = 'No sugar') => plantTree({ id, name, kind: 'quit', visibility: 'private', today: D0 });

/** A tree watered on days D0 .. D0+(n-1): n days of growth, the last watering today. */
function grown(n: number, id = 't1'): { tree: Tree; today: string } {
  let tree = plant(id);
  for (let i = 0; i < n; i++) tree = checkIn(tree, addDays(D0, i)).tree;
  return { tree, today: addDays(D0, n - 1) };
}

/** Waters `tree` on each day from the day after `from` up to `to`. */
function waterUntil(tree: Tree, from: string, to: string): Tree {
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) tree = checkIn(tree, d).tree;
  return tree;
}

describe('shouldAskName (table 1.1)', () => {
  it('1: not a dead tree', () => {
    const { tree, today } = grown(3);
    expect(shouldAskName({ ...tree, diedOn: today }, today, [])).toBe(false);
  });

  it('2: not a locked-in tree', () => {
    const { tree, today } = grown(3);
    expect(shouldAskName(complete(tree, today), today, [])).toBe(false);
  });

  it('3: not a tree with a name', () => {
    const { tree, today } = grown(3);
    expect(shouldAskName(withName(tree, 'Дубок', today), today, [])).toBe(false);
  });

  it('4: not before today\'s watering', () => {
    const { tree, today } = grown(3);
    expect(shouldAskName(tree, addDays(today, 1), [])).toBe(false);
  });

  it('5: not before the 3rd day of growth', () => {
    const { tree, today } = grown(2);
    expect(shouldAskName(tree, today, [])).toBe(false);
  });

  it('6: never after 3 offers', () => {
    const { tree, today } = grown(21);
    expect(shouldAskName({ ...tree, nameAsks: MAX_NAME_ASKS, nameAskedOn: addDays(today, -14) }, today, [])).toBe(false);
  });

  it('7: not twice a day for the same tree', () => {
    const { tree, today } = grown(3);
    expect(shouldAskName(withAsk(tree, today), today, [])).toBe(false);
  });

  it('8: one offer a day for the whole app', () => {
    const { tree, today } = grown(3);
    const other = withAsk(grown(5, 't2').tree, today);
    expect(shouldAskName(tree, today, [tree, other])).toBe(false);
  });

  it('9: yes on the 3rd day, and for an old tree at its first watering', () => {
    const three = grown(3);
    expect(shouldAskName(three.tree, three.today, [three.tree])).toBe(true);
    const old = grown(120);
    expect(shouldAskName(old.tree, old.today, [old.tree])).toBe(true);
  });

  it('10: asked before, no new stage now — no', () => {
    const { tree, today } = grown(5);
    expect(shouldAskName({ ...tree, nameAsks: 1, nameAskedOn: addDays(today, -2) }, today, [])).toBe(false);
  });

  it('11: asked before, a new stage, but less than 3 days ago — no', () => {
    // Asked on day 3 offset into a 7th-day stage that came only 2 days later.
    const { tree, today } = grown(7);
    expect(shouldAskName({ ...tree, nameAsks: 1, nameAskedOn: addDays(today, -2) }, today, [])).toBe(false);
  });

  it('12: asked before, a new stage, 3+ days later — yes', () => {
    const start = grown(3);
    let tree = withLater(withAsk(start.tree, start.today), start.today);
    const day7 = addDays(start.today, 4);
    tree = waterUntil(tree, start.today, day7);
    expect(shouldAskName(tree, day7, [tree])).toBe(true);
  });

  it('after "Later" on the last stage: never again', () => {
    const { tree, today } = grown(100);
    const asked = withLater(withAsk(tree, today), today);
    const later = addDays(today, 10);
    expect(shouldAskName(waterUntil(asked, today, later), later, [])).toBe(false);
  });

  it('another tree asked today: tomorrow it is this one\'s turn', () => {
    const { tree, today } = grown(3);
    const other = withAsk(grown(5, 't2').tree, today);
    const tomorrow = addDays(today, 1);
    const watered = checkIn(tree, tomorrow).tree;
    expect(shouldAskName(watered, tomorrow, [watered, other])).toBe(true);
  });

  it('a new generation is asked again', () => {
    const { tree, today } = grown(3);
    const named = withName(withAsk(tree, today), 'Тихон', today);
    const dead = { ...named, diedOn: addDays(today, 3) };
    let next = plantFromSeed(dead, 't9', addDays(today, 4));
    expect(next.nickname).toBeNull();
    expect(next.nameAsks).toBe(0);
    for (let i = 4; i < 7; i++) next = checkIn(next, addDays(today, i)).tree;
    expect(shouldAskName(next, addDays(today, 6), [dead, next])).toBe(true);
  });
});

describe('nameAskOpen (1.2)', () => {
  const { tree, today } = grown(3);
  const asked = withAsk(tree, today);
  it('is up the day it was asked', () => expect(nameAskOpen(asked, today)).toBe(true));
  it('goes on "Later"', () => expect(nameAskOpen(withLater(asked, today), today)).toBe(false));
  it('is gone the next day', () => expect(nameAskOpen(asked, addDays(today, 1))).toBe(false));
  it('is gone once named', () => expect(nameAskOpen(withName(asked, 'Дубок', today), today)).toBe(false));
  it('is gone when the tree died', () => expect(nameAskOpen({ ...asked, diedOn: today }, today)).toBe(false));
});

describe('cleanTyping and finalName (3.5)', () => {
  it('drops emoji and says so', () => {
    expect(cleanTyping('Дубок🌳')).toEqual({ value: 'Дубок', dropped: true });
    expect(cleanTyping('Сердце❤️')).toEqual({ value: 'Сердце', dropped: true });
    expect(cleanTyping('Дубок')).toEqual({ value: 'Дубок', dropped: false });
  });

  it('no leading space, no double spaces', () => {
    expect(cleanTyping('  Дубок').value).toBe('Дубок');
    expect(cleanTyping('Дуб  ок').value).toBe('Дуб ок');
  });

  it('keeps 20 characters at most', () => {
    expect(Array.from(cleanTyping('а'.repeat(25)).value)).toHaveLength(NAME_MAX);
  });

  it('takes letters of any script, hyphens, apostrophes, dots and numbers', () => {
    expect(cleanTyping('Анна-Мария').value).toBe('Анна-Мария');
    expect(cleanTyping('O’Neil').value).toBe('O’Neil');
    expect(cleanTyping('St. Oak').value).toBe('St. Oak');
    expect(cleanTyping('樱花').value).toBe('樱花');
    expect(cleanTyping('شجرة').value).toBe('شجرة');
    expect(cleanTyping('Дуб №1')).toEqual({ value: 'Дуб 1', dropped: true });
  });

  it('keeps accents typed as separate marks', () => {
    expect(cleanTyping('José').value).toBe('José');
  });

  it('an accent on a letter cut by the length is no error', () => {
    expect(cleanTyping('а'.repeat(20) + 'é')).toEqual({ value: 'а'.repeat(20), dropped: false });
  });

  it('refuses link characters', () => {
    expect(cleanTyping('a/b:c@d')).toEqual({ value: 'abcd', dropped: true });
  });

  it('finalName trims and turns empty into null', () => {
    expect(finalName('  Дубок  ')).toBe('Дубок');
    expect(finalName('   ')).toBeNull();
    expect(finalName('')).toBeNull();
  });
});

describe('heirName (7)', () => {
  it('counts on in Roman numbers', () => {
    expect(heirName('Тихон')).toBe('Тихон II');
    expect(heirName('Тихон II')).toBe('Тихон III');
    expect(heirName('Тихон XIX')).toBe('Тихон XX');
    expect(heirName('Тихон XX')).toBe('Тихон II');
  });

  it('fits 20 characters, cutting the base by a word when it can', () => {
    expect(heirName('Великий Дуб Добрыня')).toBe('Великий Дуб II');
    const long = heirName('Абвгдеёжзийклмнопрст');
    expect(Array.from(long).length).toBeLessThanOrEqual(NAME_MAX);
    expect(long.endsWith(' II')).toBe(true);
  });
});

describe('nameIdeas (3.3)', () => {
  const pool = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  it('puts the heir first and skips taken names in any case', () => {
    const ideas = nameIdeas(pool, { seed: 't1', round: 0, count: 3, taken: ['b', 'C'], heir: 'Тихон II' });
    expect(ideas[0]).toBe('Тихон II');
    expect(ideas).toHaveLength(3);
    expect(ideas).not.toContain('B');
    expect(ideas).not.toContain('C');
  });

  it('is the same for the same seed and round', () => {
    const o = { seed: 't1', round: 2, count: 3, taken: [] };
    expect(nameIdeas(pool, o)).toEqual(nameIdeas(pool, o));
  });

  it('a new round gives new names until the list runs out, then goes round', () => {
    const o = (round: number) => nameIdeas(pool, { seed: 't1', round, count: 4, taken: [] });
    expect(new Set([...o(0), ...o(1)]).size).toBe(8);
    expect(o(2)).toEqual(o(0));
  });

  it('every kind of tree has 8+ ideas in both languages', () => {
    for (const lang of ['ru', 'en'] as const) {
      for (const skin of SKINS) {
        const names = dictionaries[lang].nameIdeas[skin];
        expect(names.length).toBeGreaterThanOrEqual(8);
        for (const n of names) expect(cleanTyping(n)).toEqual({ value: n, dropped: false });
      }
    }
  });
});

describe('titles and search', () => {
  const { tree, today } = grown(3);
  const named = withName(tree, 'Ёлочка', today);

  it('shows the name first, else the habit', () => {
    expect(titleOf(tree)).toBe('No sugar');
    expect(titleOf(named)).toBe('Ёлочка');
  });

  it('finds by name or habit, any case, ё = е', () => {
    expect(matchesQuery(named, 'елоч')).toBe(true);
    expect(matchesQuery(named, 'ЁЛ')).toBe(true);
    expect(matchesQuery(named, 'sugar')).toBe(true);
    expect(matchesQuery(named, 'дуб')).toBe(false);
    expect(matchesQuery(withName(tree, 'Дубок', today), 'дуб')).toBe(true);
  });
});

describe('tree updates', () => {
  const { tree, today } = grown(3);

  it('withName sets namedOn once; null removes the name, namedOn stays', () => {
    const a = withName(tree, 'Дубок', today);
    expect(a.namedOn).toBe(today);
    const b = withName(a, 'Тихон', addDays(today, 5));
    expect(b).toMatchObject({ nickname: 'Тихон', namedOn: today });
    const c = withName(b, null, addDays(today, 6));
    expect(c).toMatchObject({ nickname: null, namedOn: today });
  });

  it('removing the name keeps the bubble away for the rest of the day', () => {
    const asked = withAsk(tree, today);
    const removed = withName(withName(asked, 'Дубок', today), null, today);
    expect(nameAskOpen(removed, today)).toBe(false);
  });

  it('withAsk counts the offers', () => {
    const a = withAsk(withAsk(tree, today), addDays(today, 4));
    expect(a).toMatchObject({ nameAsks: 2, nameAskedOn: addDays(today, 4) });
  });

  it('old saved trees get the name fields', () => {
    const { nickname, namedOn, nameAsks, nameAskedOn, nameLaterOn, ...old } = plant();
    void [nickname, namedOn, nameAsks, nameAskedOn, nameLaterOn];
    const [migrated] = migrateTrees([old]);
    expect(migrated).toMatchObject({ nickname: null, namedOn: null, nameAsks: 0, nameAskedOn: null, nameLaterOn: null });
  });

  it('a damaged saved name is cleaned or dropped', () => {
    const [a, b] = migrateTrees([{ ...plant('a'), nickname: '  Дубок🌳 ' }, { ...plant('b'), nickname: 42 as unknown as string }]);
    expect(a.nickname).toBe('Дубок');
    expect(b.nickname).toBeNull();
  });
});
