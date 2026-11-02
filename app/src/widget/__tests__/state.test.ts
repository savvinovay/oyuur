import { describe, expect, it } from '@jest/globals';
import { checkIn, complete, plantTree, setOpenHour, settle, Tree } from '@/game/tree';
import { buildSnapshot, parseSnapshot, SNAPSHOT_KEY, WidgetSnapshot } from '../snapshot';
import { forestTrees, isNight, pickTree, shownName, todayPlaces, urgentOrder, viewOf, viewsOf } from '../state';

// Local wall-clock times: the rules read hours and minutes of the phone's clock.
const at = (day: string, hm: string) => {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = hm.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
};

const quit = (id: string, plantedOn: string, extra: Partial<Tree> = {}): Tree => ({
  ...plantTree({ id, name: `Habit ${id}`, kind: 'quit', visibility: 'friends', today: plantedOn }),
  ...extra,
});
const water = (t: Tree, day: string) => checkIn(t, day).tree;

const snap = (trees: Tree[], o: Partial<Parameters<typeof buildSnapshot>[0]> = {}): WidgetSnapshot =>
  buildSnapshot({ trees, lang: 'ru', theme: 'auto', h24: true, showHidden: false, dayOffset: 0, minuteOffset: 0, ...o });

const stateAt = (t: Tree, day: string, hm: string) => {
  const s = snap([t]);
  return viewOf(s.trees[0], s, at(day, hm));
};

describe('widget state by the time (спец 3, Т7)', () => {
  // Planted on the 1st, "Quit" → from 18:00 from the 2nd on; watered on the 1st.
  const t = water(quit('a', '2026-10-01'), '2026-10-01');

  it('waits until 18:00, then asks for water', () => {
    expect(stateAt(t, '2026-10-02', '17:59').state).toBe('wait');
    expect(stateAt(t, '2026-10-02', '17:59').opensAt).toBe(18);
    expect(stateAt(t, '2026-10-02', '18:00').state).toBe('water');
  });

  it('a chance is at risk from 22:00 until the day ends at 3:00', () => {
    expect(stateAt(t, '2026-10-02', '21:59').state).toBe('water');
    expect(stateAt(t, '2026-10-02', '22:00').state).toBe('burn');
    // 2:59 at night is still the 2nd.
    expect(stateAt(t, '2026-10-03', '02:59').state).toBe('burn');
  });

  it('at 3:00 the missed day spends a chance and the new day waits again', () => {
    const v = stateAt(t, '2026-10-03', '03:00');
    expect(v.state).toBe('wait');
    expect(v.hearts).toBe(2);
    expect(v.days).toBe(1);
  });

  it('the planting day is open at once, even for "Quit"', () => {
    expect(stateAt(quit('b', '2026-10-05'), '2026-10-05', '09:00').state).toBe('water');
  });

  it('watered today — done, also after midnight', () => {
    const w = water(t, '2026-10-02');
    expect(stateAt(w, '2026-10-02', '19:00').state).toBe('done');
    expect(stateAt(w, '2026-10-03', '01:30').state).toBe('done');
  });

  it('no chances left — "last chance" as soon as it can be watered, all day', () => {
    const none = { ...t, chancesLeft: 0 };
    expect(stateAt(none, '2026-10-02', '17:00').state).toBe('wait');
    expect(stateAt(none, '2026-10-02', '18:00').state).toBe('last');
    expect(stateAt(none, '2026-10-02', '23:00').state).toBe('last');
  });

  it('dies after a miss with no chances, keeps its record', () => {
    const none = { ...water(water(t, '2026-10-02'), '2026-10-03'), chancesLeft: 0 };
    const v = stateAt(none, '2026-10-05', '10:00');
    expect(v.state).toBe('dead');
    expect(v.days).toBe(3);
  });

  it('a new hour applies from tomorrow', () => {
    const doTree = water(plantTree({ id: 'c', name: 'Run', kind: 'do', visibility: 'friends', today: '2026-10-01' }), '2026-10-01');
    const moved = setOpenHour(settle(doTree, '2026-10-02'), 20, '2026-10-02');
    expect(stateAt(moved, '2026-10-02', '09:00').state).toBe('water');
    expect(stateAt(water(moved, '2026-10-02'), '2026-10-03', '19:00').state).toBe('wait');
  });

  it('locked in for good', () => {
    expect(stateAt(complete(t, '2026-10-02'), '2026-10-04', '10:00').state).toBe('locked');
  });

  it('developer time travel moves the widget like the app', () => {
    const s = snap([t], { minuteOffset: 60 });
    expect(viewOf(s.trees[0], s, at('2026-10-02', '17:30')).state).toBe('water');
  });
});

describe('most urgent (спец 5.4)', () => {
  const day = '2026-10-10';
  const base = (id: string, days: number, extra: Partial<Tree> = {}) => {
    const checkins = Array.from({ length: days }, (_, i) => `2026-10-${String(9 - i).padStart(2, '0')}`).filter((d) => d >= '2026-10-01');
    return quit(id, '2026-10-01', { checkins, settledThrough: '2026-10-09', ...extra });
  };

  it('last chance, then can water (longer streak first), then waiting (sooner first), then watered', () => {
    const trees = [
      base('done', 9, { checkins: [...base('x', 9).checkins, day].sort() }),
      base('wait21', 5, { openHours: [{ from: '2026-10-01', hour: 21 }] }),
      base('wait19', 4, { openHours: [{ from: '2026-10-01', hour: 19 }] }),
      base('water2', 2, { openHours: [{ from: '2026-10-01', hour: 0 }] }),
      base('water8', 8, { openHours: [{ from: '2026-10-01', hour: 0 }] }),
      base('last', 1, { chancesLeft: 0, openHours: [{ from: '2026-10-01', hour: 0 }] }),
    ];
    const s = snap(trees);
    const order = urgentOrder(viewsOf(s, at(day, '12:00'))).map((v) => v.tree.id);
    expect(order).toEqual(['last', 'water8', 'water2', 'wait19', 'wait21', 'done']);
  });

  it('all watered — the biggest tree', () => {
    const trees = [base('small', 3), base('big', 8)].map((t) => ({ ...t, checkins: [...t.checkins, day].sort() }));
    expect(pickTree(viewsOf(snap(trees), at(day, '12:00')), 'urgent')?.tree.id).toBe('big');
  });

  it('a chosen tree stays chosen; dead shows "dead"; locked in or gone — most urgent', () => {
    const a = base('a', 3, { openHours: [{ from: '2026-10-01', hour: 0 }] });
    const b = base('b', 8, { openHours: [{ from: '2026-10-01', hour: 0 }] });
    const views = viewsOf(snap([a, b]), at(day, '12:00'));
    expect(pickTree(views, { lineageId: 'a' })?.tree.id).toBe('a');
    expect(pickTree(views, { lineageId: 'gone' })?.tree.id).toBe('b');
    const dead = viewsOf(snap([{ ...a, diedOn: '2026-10-05' }, b]), at(day, '12:00'));
    expect(pickTree(dead, { lineageId: 'a' })?.state).toBe('dead');
    const locked = viewsOf(snap([{ ...a, completedOn: '2026-10-05' }, b]), at(day, '12:00'));
    expect(pickTree(locked, { lineageId: 'a' })?.tree.id).toBe('b');
  });

  it('nothing growing — nothing to show (plant a tree)', () => {
    expect(pickTree([], 'urgent')).toBeNull();
    const dead = viewsOf(snap([base('a', 3, { diedOn: '2026-10-05' })]), at(day, '12:00'));
    expect(pickTree(dead, 'urgent')).toBeNull();
  });

  it('"Today": more trees than places — the last place is +N', () => {
    const trees = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => base(id, i + 1));
    const p = todayPlaces(viewsOf(snap(trees), at(day, '12:00')), 4);
    expect(p.shown).toHaveLength(3);
    expect(p.more).toHaveLength(3);
    expect(todayPlaces(viewsOf(snap(trees.slice(0, 4)), at(day, '12:00')), 4).more).toHaveLength(0);
  });

  it('"My forest": growing by streak, then locked in, then dead; the days of all trees', () => {
    const trees = [base('dead', 7, { diedOn: '2026-10-05' }), base('lock', 9, { completedOn: '2026-10-05' }), base('g1', 2), base('g2', 5)];
    const f = forestTrees(viewsOf(snap(trees), at(day, '12:00')));
    expect(f.placed.map((v) => v.tree.id)).toEqual(['g2', 'g1', 'lock', 'dead']);
    expect(f.days).toBe(7 + 9 + 2 + 5);
    expect(f.total).toBe(4);
  });
});

describe('hidden trees on the home screen (спец 6, Т3)', () => {
  const hidden = { ...quit('h', '2026-10-01'), name: 'Без соцсетей', visibility: 'private' as const, nickname: 'Дубочек' };

  it('the snapshot has no habit of a hidden tree while names are off', () => {
    const raw = JSON.stringify(snap([hidden]));
    expect(raw).not.toContain('Без соцсетей');
    expect(raw).toContain('Дубочек');
    expect(JSON.stringify(snap([hidden], { showHidden: true }))).toContain('Без соцсетей');
  });

  it('shows the tree’s name, or "My tree"', () => {
    const s = snap([hidden, { ...hidden, id: 'h2', lineageId: 'h2', nickname: null }]);
    expect(shownName(s.trees[0], false, 'Моё дерево')).toBe('Дубочек');
    expect(shownName(s.trees[1], false, 'Моё дерево')).toBe('Моё дерево');
    const on = snap([hidden], { showHidden: true });
    expect(shownName(on.trees[0], true, 'Моё дерево')).toBe('Без соцсетей');
    expect(shownName(snap([{ ...hidden, visibility: 'friends' }]).trees[0], false, '-')).toBe('Без соцсетей');
  });
});

describe('snapshot', () => {
  it('one entry per habit — its newest generation', () => {
    const first = { ...quit('a', '2026-10-01'), diedOn: '2026-10-03' };
    const second = { ...quit('a2', '2026-10-04'), lineageId: 'a', generation: 2, parentId: 'a' };
    expect(snap([first, second]).trees.map((t) => t.id)).toEqual(['a2']);
  });

  it('reads back, damaged data gives nothing', () => {
    const s = snap([quit('a', '2026-10-01')]);
    expect(parseSnapshot(JSON.stringify(s))?.trees).toHaveLength(1);
    expect(parseSnapshot('{oops')).toBeNull();
    expect(parseSnapshot(JSON.stringify({ v: 2, trees: [] }))).toBeNull();
    expect(parseSnapshot(null)).toBeNull();
    expect(SNAPSHOT_KEY).not.toBe('elevate/v1');
  });

  it('night by the clock, unless the app forces a theme', () => {
    const s = snap([]);
    expect(isNight(s, at('2026-10-01', '19:59'))).toBe(false);
    expect(isNight(s, at('2026-10-01', '20:00'))).toBe(true);
    expect(isNight(s, at('2026-10-01', '05:59'))).toBe(true);
    expect(isNight({ ...s, theme: 'light' }, at('2026-10-01', '23:00'))).toBe(false);
    expect(isNight({ ...s, theme: 'dark' }, at('2026-10-01', '12:00'))).toBe(true);
  });
});
