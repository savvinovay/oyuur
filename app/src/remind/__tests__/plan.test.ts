import { describe, expect, it } from '@jest/globals';
import { addDays, toDayKey } from '@/game/dates';
import { checkIn, plantTree, Tree } from '@/game/tree';
import { makeT } from '@/i18n';
import { DEFAULT_PREFS, planReminders, RemindPrefs, tapTarget } from '../plan';
import { reminderText } from '../text';

const prefs = (p: Partial<RemindPrefs> = {}): RemindPrefs => ({ ...DEFAULT_PREFS, ...p });
// 29 October 2026 (Thursday), local time.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);
const TODAY = '2026-10-29';

function tree(over: Partial<Tree> & { kind?: 'do' | 'quit'; planted?: string; hour?: number } = {}): Tree {
  const planted = over.planted ?? '2026-10-20';
  const t = plantTree({ id: over.id ?? 'a', name: over.name ?? 'Не курить', kind: over.kind ?? 'quit', visibility: over.visibility ?? 'friends', today: planted, openHour: over.hour });
  return { ...t, settledThrough: addDays(TODAY, -1), ...over } as Tree;
}

const plan = (trees: Tree[], now: Date, p: Partial<RemindPrefs> = {}, extra: { dayOffset?: number; minuteOffset?: number } = {}) =>
  planReminders({ trees, prefs: prefs(p), now, ...extra });

const when = (d: Date) => `${toDayKey(d)} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
const brief = (trees: Tree[], now: Date, p: Partial<RemindPrefs> = {}) =>
  plan(trees, now, p).map((r) => `${r.kind} ${when(r.at)} ${r.trees.map((x) => x.id).join(',')}`);

describe('the first reminder: at the watering time', () => {
  it('"Quit" — at 18:00, then "last chance" at 1:00, for 7 game days', () => {
    const r = brief([tree()], at(29, 10));
    expect(r.slice(0, 4)).toEqual(['open 2026-10-29 18:00 a', 'last 2026-10-30 1:00 a', 'open 2026-10-30 18:00 a', 'last 2026-10-31 1:00 a']);
    // 3 chances (29, 30, 31 October), +1 on 1 November, then the miss of 2 November kills: 5 days, then nothing.
    expect(r.length).toBe(10);
    expect(r[r.length - 1]).toBe('last 2026-11-03 1:00 a');
  });

  it('17:59 — today’s 18:00 is still ahead; 18:00 — already gone', () => {
    expect(brief([tree()], at(29, 17, 59))[0]).toBe('open 2026-10-29 18:00 a');
    expect(brief([tree()], at(29, 18, 0))[0]).toBe('last 2026-10-30 1:00 a');
  });

  it('"Do" (any time) — at the hour from the settings, 20:00 by default', () => {
    expect(brief([tree({ kind: 'do' })], at(29, 10))[0]).toBe('open 2026-10-29 20:00 a');
    expect(brief([tree({ kind: 'do' })], at(29, 10), { doHour: 9 })).toContain('open 2026-10-30 9:00 a');
  });

  it('an old "Quit" tree open all day is reminded at the "Do" hour', () => {
    expect(brief([tree({ hour: 0 })], at(29, 10))[0]).toBe('open 2026-10-29 20:00 a');
  });

  it('a new hour starts tomorrow, and so does its reminder', () => {
    const t = tree({ openHours: [{ from: '2026-10-20', hour: 18 }, { from: '2026-10-30', hour: 12 }] });
    const r = brief([t], at(29, 10));
    expect(r[0]).toBe('open 2026-10-29 18:00 a');
    expect(r).toContain('open 2026-10-30 12:00 a');
  });
});

describe('nothing to remind', () => {
  it('watered today — nothing today, tomorrow as usual', () => {
    const watered = checkIn(tree(), TODAY, { hour: 18, minute: 30 }).tree;
    expect(brief([watered], at(29, 18, 31))[0]).toBe('open 2026-10-30 18:00 a');
  });

  it('reminders off — nothing at all', () => {
    expect(plan([tree()], at(29, 10), { on: false })).toEqual([]);
  });

  it('"last chance" off — only the first ones', () => {
    expect(plan([tree()], at(29, 10), { lastChance: false }).every((r) => r.kind === 'open')).toBe(true);
  });

  it('dead, locked-in trees and older generations — never', () => {
    const dead = tree({ id: 'd', diedOn: '2026-10-25' });
    const done = tree({ id: 'l', completedOn: '2026-10-25' });
    expect(plan([dead, done], at(29, 10))).toEqual([]);
    const heir = { ...tree({ id: 'b', planted: TODAY }), lineageId: 'd', generation: 2, parentId: 'd' };
    expect(plan([dead, heir], at(29, 10)).flatMap((r) => r.trees.map((x) => x.id))).not.toContain('d');
  });

  it('a tree planted later (time travel) — from its planting day', () => {
    expect(brief([tree({ planted: '2026-10-31' })], at(29, 10))[0]).toBe('open 2026-10-31 18:00 a');
  });
});

describe('the planting day', () => {
  it('is reminded, but has no "last chance": its miss never counts', () => {
    const r = brief([tree({ planted: TODAY, settledThrough: TODAY })], at(29, 10));
    expect(r.slice(0, 3)).toEqual(['open 2026-10-29 18:00 a', 'open 2026-10-30 18:00 a', 'last 2026-10-31 1:00 a']);
    expect(plan([tree({ planted: TODAY, settledThrough: TODAY })], at(29, 10)).filter((x) => x.day === TODAY && x.kind === 'last')).toEqual([]);
  });
});

describe('"last chance"', () => {
  it('0:59 — the night’s 1:00 is still ahead (the game day is yesterday until 3:00); 1:00 — gone', () => {
    const t = tree({ settledThrough: '2026-10-28' });
    expect(brief([t], at(30, 0, 59))[0]).toBe('last 2026-10-30 1:00 a');
    expect(brief([t], at(30, 1, 0))[0]).toBe('open 2026-10-30 18:00 a');
  });

  it('2:59 — still yesterday; 3:00 — a new game day', () => {
    const t = tree({ settledThrough: '2026-10-28' });
    expect(plan([t], at(30, 2, 59))[0].day).toBe('2026-10-30');
    expect(plan([t], at(30, 2, 59))).toHaveLength(plan([t], at(30, 3, 0)).length + 0);
    expect(plan([t], at(30, 3, 0))[0].day).toBe('2026-10-30');
  });

  it('knows when a miss would kill: the last chance, then nothing (the tree has died)', () => {
    const t = tree({ chancesLeft: 1 });
    const r = plan([t], at(29, 10)).filter((x) => x.kind === 'last');
    expect(r.map((x) => [x.day, x.trees[0].dies])).toEqual([[TODAY, false], ['2026-10-30', true]]);
  });

  it('the chance of the 1st of the month is counted', () => {
    const t = tree({ chancesLeft: 0, refilledMonth: '2026-10' });
    const r = plan([t], at(29, 10)).filter((x) => x.kind === 'last');
    // 29th: dies if missed. If the person doesn't water, the tree is dead: nothing after.
    expect(r.map((x) => [x.day, x.trees[0].dies])).toEqual([[TODAY, true]]);
    const late = tree({ chancesLeft: 0, refilledMonth: '2026-10', settledThrough: '2026-10-30' });
    const r2 = plan([late], at(31, 10)).filter((x) => x.kind === 'last');
    // The 31st kills; with a fresh chance on 1 November it would not — but nothing lives past the 31st.
    expect(r2.map((x) => x.day)).toEqual(['2026-10-31']);
  });
});

describe('several trees', () => {
  it('one time — one notification, the most urgent first', () => {
    const trees = [tree({ id: 'a' }), tree({ id: 'b', chancesLeft: 0 }), tree({ id: 'c', checkins: ['2026-10-27', '2026-10-28'] })];
    const [first] = plan(trees, at(29, 10));
    expect(first.trees.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(tapTarget(first)).toBe('b');
  });

  it('no more than 2 a day: with "last chance" an earlier time joins the later one', () => {
    const trees = [tree({ id: 'q' }), tree({ id: 'd', kind: 'do' })];
    const day = plan(trees, at(29, 10)).filter((x) => x.day === TODAY);
    expect(day.map((x) => `${x.kind} ${x.hour} ${x.trees.map((y) => y.id).sort().join(',')}`)).toEqual(['open 20 d,q', 'last 1 d,q']);
  });

  it('without "last chance" — two times stay apart, a third joins the next', () => {
    const trees = [tree({ id: 'm', hour: 9 }), tree({ id: 'q' }), tree({ id: 'd', kind: 'do' })];
    const day = plan(trees, at(29, 8), { lastChance: false }).filter((x) => x.day === TODAY);
    expect(day.map((x) => `${x.hour} ${x.trees.map((y) => y.id).sort().join(',')}`)).toEqual(['18 m,q', '20 d']);
  });
});

describe('the night', () => {
  it('22:59/23:00: a tree opening at 22:00 is reminded, at 23:00 — only "last chance"', () => {
    expect(brief([tree({ hour: 22 })], at(29, 10))[0]).toBe('open 2026-10-29 22:00 a');
    expect(brief([tree({ hour: 23 })], at(29, 10))[0]).toBe('last 2026-10-30 1:00 a');
  });

  it('a morning hour in the quiet time comes at 8:00', () => {
    expect(brief([tree({ hour: 6 })], at(29, 5))[0]).toBe('open 2026-10-29 8:00 a');
  });

  it('the "Do" hour stays between 8:00 and 22:00', () => {
    expect(plan([tree({ kind: 'do' })], at(29, 1), { doHour: 23 })[0].hour).toBe(22);
    expect(plan([tree({ kind: 'do' })], at(29, 1), { doHour: 3 }).find((x) => x.kind === 'open')!.hour).toBe(8);
  });
});

describe('hidden trees', () => {
  it('are named by their own name, never the habit', () => {
    const r = plan([tree({ visibility: 'private', nickname: 'Дубок' }), tree({ id: 'b', visibility: 'private' })], at(29, 10))[0];
    expect(r.trees.map((x) => x.label)).toEqual(['Дубок', null]);
    const text = reminderText(r, makeT('ru'));
    expect(text.body).toBe('Дубок и Моё дерево');
    expect(JSON.stringify(text)).not.toContain('Не курить');
  });
});

// The suite runs in the computer's own zone; `npm test` was also run with TZ=Europe/Berlin, America/New_York
// and Asia/Yakutsk (Jest can't switch the zone inside a run). Every check here holds in any zone.
describe('the clock', () => {
  it('times are the local wall clock: 18:00 and 1:00 in whatever zone the phone is', () => {
    const r = plan([tree()], at(29, 10));
    expect(r.filter((x) => x.kind === 'open').every((x) => x.at.getHours() === 18 && x.at.getMinutes() === 0)).toBe(true);
    expect(r.filter((x) => x.kind === 'last').every((x) => x.at.getHours() === 1)).toBe(true);
  });

  it('a daylight-saving night (25 October in Europe, 1 November in America) keeps 18:00 and 1:00', () => {
    const r = plan([tree({ settledThrough: '2026-10-23' })], new Date(2026, 9, 24, 10));
    expect(r.slice(0, 4).map((x) => when(x.at))).toEqual(['2026-10-24 18:00', '2026-10-25 1:00', '2026-10-25 18:00', '2026-10-26 1:00']);
    const us = plan([tree({ settledThrough: '2026-10-30', chancesLeft: 3 })], new Date(2026, 9, 31, 10));
    expect(us.slice(0, 4).map((x) => when(x.at))).toEqual(['2026-10-31 18:00', '2026-11-01 1:00', '2026-11-01 18:00', '2026-11-02 1:00']);
  });

  it('the developer time travel: planned on the app’s clock, shown on the real one', () => {
    const r = plan([tree()], at(29, 10), {}, { minuteOffset: 60 })[0];
    expect([r.hour, when(r.at)]).toEqual([18, '2026-10-29 17:00']);
    const d = plan([tree()], at(29, 10), {}, { dayOffset: 2 })[0];
    expect([d.day, when(d.at)]).toEqual(['2026-10-31', '2026-10-29 18:00']);
  });
});

describe('the words', () => {
  const ru = makeT('ru');
  const en = makeT('en');
  const one = (label: string | null, days: number, dies = false, anytime = false) => ({ id: 'a', label, days, dies, anytime });
  it('one tree: "can be watered" at its hour, "time to water" for a tree open all day', () => {
    expect(reminderText({ kind: 'open', trees: [one('Не курить', 12)] }, ru)).toEqual({ title: 'Можно полить «Не курить»', body: 'Серия 12 дней. Полей — будет 13.' });
    expect(reminderText({ kind: 'open', trees: [one('Бег', 1, false, true)] }, ru)).toEqual({ title: 'Пора полить «Бег»', body: 'Серия 1 день. Полей — будет 2.' });
    expect(reminderText({ kind: 'open', trees: [one('Run', 0, false, true)] }, en)).toEqual({ title: 'Time to water “Run”', body: 'Water it today and it starts to grow.' });
  });

  it('"last chance": the deadline, and a dying tree in the title (the lock screen shows titles)', () => {
    expect(reminderText({ kind: 'last', trees: [one('Не курить', 3)] }, ru)).toEqual({ title: 'Полить можно до 3:00', body: 'Полей «Не курить», иначе сгорит шанс.' });
    expect(reminderText({ kind: 'last', trees: [one('Дубок', 3, true)] }, ru)).toEqual({ title: 'Дерево «Дубок» погибнет в 3:00', body: 'Шансов не осталось. Полей — и спасёшь его.' });
    expect(reminderText({ kind: 'last', trees: [one(null, 3, true)] }, ru).title).toBe('Моё дерево погибнет в 3:00');
    expect(reminderText({ kind: 'last', trees: [one('Run', 3)] }, en).body).toBe('Water “Run”, or a chance burns.');
  });

  it('several trees', () => {
    const four = ['Бег', 'Чтение', 'Не курить', 'Вода'].map((label, i) => ({ id: String(i), label, days: 3, dies: false }));
    expect(reminderText({ kind: 'open', trees: four.slice(0, 3) }, ru)).toEqual({ title: 'Можно полить 3 дерева', body: 'Бег, Чтение и Не курить' });
    expect(reminderText({ kind: 'open', trees: four }, ru).body).toBe('Бег, Чтение, Не курить и ещё 1');
    expect(reminderText({ kind: 'open', trees: four.slice(0, 2).map((x) => ({ ...x, anytime: true })) }, ru).title).toBe('Пора полить 2 дерева');
    expect(reminderText({ kind: 'open', trees: four.slice(0, 2) }, en).title).toBe('2 trees can be watered');
    expect(reminderText({ kind: 'last', trees: four.slice(0, 2) }, ru).body).toBe('Ещё не политы: Бег и Чтение. Иначе сгорят шансы.');
    expect(reminderText({ kind: 'last', trees: [{ ...four[0], dies: true }, four[1]] }, ru)).toEqual({ title: 'Дерево «Бег» погибнет в 3:00', body: 'Шансов не осталось. Ещё не политы: Бег и Чтение.' });
  });
});
