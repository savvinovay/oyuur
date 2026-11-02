import { describe, expect, it, jest } from '@jest/globals';
import type { Tree } from '@/game/tree';
import { Analytics, BATCH, Deps, parseSaved, QUEUE_MAX, SendResult, settleEvents } from '../analytics';
import { AnalyticsEvent, EVENT_NAMES } from '../events';

// Jest runs in Node; the app's own types don't know Node.
declare const require: (id: 'fs') => { readFileSync(path: string, enc: 'utf8'): string };
declare const __dirname: string;
const { readFileSync } = require('fs');

jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

// 2026-10-28, noon local time.
const NOON = new Date(2026, 9, 28, 12).getTime();
const DAY = 86_400_000;

/** A phone: storage in a variable, a server that answers what the test says. */
function phone(saved: string | null = null) {
  const sent: { install: string; events: AnalyticsEvent[] }[] = [];
  const world = {
    saved,
    clock: NOON,
    answer: 'ok' as SendResult | 'throw',
    sent,
  };
  const deps: Deps = {
    load: async () => world.saved,
    save: async (raw) => {
      world.saved = raw;
    },
    send: async (install, events) => {
      if (world.answer === 'throw') throw new Error('offline');
      if (world.answer === 'ok') sent.push({ install, events });
      return world.answer;
    },
    now: () => world.clock,
    env: () => ({ mode: 'standalone', version: '1.0.0', tz: 'Asia/Yakutsk' }),
  };
  const a = new Analytics(deps);
  a.configure({ lang: 'ru', dayOffset: 0 });
  return { a, world, names: () => sent.flatMap((b) => b.events.map((e) => e.name)) };
}

const tree = (over: Partial<Tree> = {}): Tree =>
  ({
    id: 't1', lineageId: 't1', name: 'Не курить', kind: 'quit', visibility: 'private', skin: 'oak',
    plantedOn: '2026-10-01', checkins: ['2026-10-01', '2026-10-02'], frozen: [], chancesLeft: 3,
    refilledMonth: '2026-10', settledThrough: '2026-10-02', diedOn: null, completedOn: null,
    generation: 1, parentId: null, nickname: 'Тихон', namedOn: null, nameAsks: 0, nameAskedOn: null, nameLaterOn: null,
    ...over,
  }) as Tree;

describe('statistics on the phone', () => {
  it('the first start: an install id, first_launch and app_open with the common fields, sent at once', async () => {
    const { a, world, names } = phone();
    await a.start({ hadData: true });
    expect(a.install).toMatch(/^[A-Za-z0-9]{22}$/);
    expect(names()).toEqual(['first_launch', 'app_open']);
    const first = world.sent[0].events[0];
    expect(first).toMatchObject({ day: '2026-10-28', dayN: 0, tz: 'Asia/Yakutsk', mode: 'standalone', v: '1.0.0', lang: 'ru', props: { existing: true } });
    expect(first.id).not.toEqual(world.sent[0].events[1].id);
    expect(a.queue).toEqual([]);
  });

  it('day numbers count from the first launch; the install id stays', async () => {
    const p = phone();
    await p.a.start({ hadData: false });
    await p.a.settled();
    const install = p.a.install;
    // Two days later, a new start of the app.
    const later = phone(p.world.saved);
    later.world.clock = NOON + 2 * DAY;
    await later.a.start({ hadData: true });
    later.a.track('water');
    await later.a.flush();
    expect(later.a.install).toBe(install);
    expect(later.names()).toEqual(['app_open', 'water']);
    expect(later.world.sent.flatMap((b) => b.events.map((e) => e.dayN))).toEqual([2, 2]);
  });

  it('without network events wait, survive a restart and go later, each once', async () => {
    const p = phone();
    p.world.answer = 'throw';
    await p.a.start({ hadData: false });
    p.a.track('plant', { seed: false, generation: 1 });
    p.a.track('water');
    await p.a.flush();
    expect(p.a.queue.map((e) => e.name)).toEqual(['first_launch', 'app_open', 'plant', 'water']);
    await p.a.settled();
    // The app was closed; it opens with network.
    const back = phone(p.world.saved);
    await back.a.start({ hadData: true });
    expect(back.names()).toEqual(['first_launch', 'app_open', 'plant', 'water', 'app_open']);
    expect(new Set(back.world.sent.flatMap((b) => b.events.map((e) => e.id))).size).toBe(5);
    expect(back.a.queue).toEqual([]);
  });

  it('the server busy: retry later; a batch it can never take: dropped', async () => {
    const p = phone();
    p.world.answer = 'retry';
    await p.a.start({ hadData: false });
    expect(p.a.queue).toHaveLength(2);
    p.world.answer = 'drop';
    await p.a.flush();
    expect(p.a.queue).toEqual([]);
  });

  it('sends in batches of 50 and keeps at most 500 waiting', async () => {
    const p = phone();
    p.world.answer = 'retry';
    await p.a.start({ hadData: false });
    for (let i = 0; i < 600; i++) p.a.track('water');
    expect(p.a.queue).toHaveLength(QUEUE_MAX);
    p.world.answer = 'ok';
    await p.a.flush();
    expect(p.world.sent.map((b) => b.events.length)).toEqual(Array(QUEUE_MAX / BATCH).fill(BATCH));
  });

  it('events before the storage is read wait for it', async () => {
    const p = phone();
    p.a.track('install_card_shown');
    await p.a.start({ hadData: false });
    expect(p.names()).toEqual(['first_launch', 'install_card_shown', 'app_open']);
  });

  it('the switch: off empties the queue, forgets the id and sends nothing; on starts a new id', async () => {
    const p = phone();
    p.world.answer = 'throw';
    await p.a.start({ hadData: false });
    const oldId = p.a.install;
    p.a.setOff(true);
    expect([p.a.off, p.a.install, p.a.queue.length]).toEqual([true, null, 0]);
    p.a.track('water');
    expect(p.a.queue).toEqual([]);
    await p.a.settled();
    expect(JSON.parse(p.world.saved!)).toEqual({ off: true, install: null, firstDay: null, queue: [] });
    // Stays off after a restart.
    const again = phone(p.world.saved);
    await again.a.start({ hadData: true });
    expect([again.a.off, again.names()]).toEqual([true, []]);
    again.a.setOff(false);
    await again.a.flush();
    expect(again.a.install).not.toBe(oldId);
    expect(again.world.sent[0].events[0]).toMatchObject({ name: 'first_launch', props: { optIn: true }, dayN: 0 });
  });

  it('a broken storage starts over instead of stopping statistics for good', async () => {
    expect(parseSaved('{oops')).toEqual({ off: false, install: null, firstDay: null, queue: [] });
    const good = { id: 'abcdefgh', name: 'water' };
    expect(parseSaved(JSON.stringify({ install: 'x'.repeat(22), firstDay: '2026-10-28', queue: [null, 5, good] })).queue).toEqual([good]);
    const p = phone('{oops');
    await p.a.start({ hadData: true });
    expect(p.names()).toEqual(['first_launch', 'app_open']);
  });

  it('turned off in another tab: off here too, the old id is not written back', async () => {
    const p = phone();
    p.world.answer = 'throw';
    await p.a.start({ hadData: false });
    p.a.outsideChange(JSON.stringify({ off: true, install: null, firstDay: null, queue: [] }));
    p.a.track('water');
    await p.a.settled();
    expect([p.a.off, p.a.install, p.a.queue.length]).toEqual([true, null, 0]);
  });

  it('settling a day: a chance spent, a tree lost', () => {
    const before = tree();
    expect(settleEvents(before, tree({ frozen: ['2026-10-03', '2026-10-04'], chancesLeft: 1 }))).toEqual([{ name: 'chance_used', props: { days: 2 } }]);
    expect(settleEvents(before, tree({ diedOn: '2026-10-06', chancesLeft: 0 }))).toEqual([{ name: 'tree_died', props: { days: 2 } }]);
    expect(settleEvents(before, before)).toEqual([]);
  });

  it('no texts in what is sent: no habit or tree names, no nicks', async () => {
    const p = phone();
    await p.a.start({ hadData: true });
    const t = tree();
    p.a.track('plant', { seed: true, generation: 2 });
    for (const e of settleEvents(t, tree({ diedOn: '2026-10-06' }))) p.a.track(e.name, e.props);
    p.a.track('purchase', { item: 'tree:birch' });
    p.a.track('login', { recover: true });
    await p.a.flush();
    const all = JSON.stringify(p.world.sent) + p.world.saved;
    for (const word of ['Не курить', 'Тихон', '@']) expect(all).not.toContain(word);
    for (const e of p.world.sent.flatMap((b) => b.events)) {
      expect(Object.keys(e).sort()).toEqual(expect.arrayContaining(['at', 'day', 'dayN', 'id', 'lang', 'mode', 'name', 'tz', 'v']));
      expect(Object.keys(e).length).toBeLessThanOrEqual(10);
      for (const v of Object.values(e.props ?? {})) expect(typeof v === 'string' ? /^(tree|meadow):[a-z]+$/.test(v) : true).toBe(true);
    }
  });

  it('the event list is the same as the server’s', () => {
    const server = readFileSync(`${__dirname}/../../../../server/src/analytics.js`, 'utf8');
    const block = server.slice(server.indexOf('export const EVENTS = {'), server.indexOf('};', server.indexOf('export const EVENTS = {')));
    const names = [...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    expect(names).toEqual(EVENT_NAMES);
  });
});
