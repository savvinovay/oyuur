import { describe, expect, it } from '@jest/globals';
import { addDays } from '@/game/dates';
import { SharedTree } from '@/game/shared';
import { growthDays } from '@/game/tree';
import {
  canWaterShared, endedOn, forestShared, homeShared, memoryHabit, nameIn, nameOf, openWith, pairDays, proposeError, sharedHabit, sharedPhase,
  sharedRow, sharedTreeId, thirstOf, wateringChange,
} from '../model';

const D0 = '2026-10-05';
const me = { nick: 'me', name: 'Ann', avatar: 'fox', color: 0 };
const mei = { nick: 'mei', name: null, avatar: 'owl', color: 1 };

const shared = (waterings: Record<string, string[]>, extra: Partial<SharedTree> = {}): SharedTree => ({
  id: 's1',
  name: 'Walk',
  kind: 'do',
  skin: 'oak',
  status: 'active',
  plantedOn: D0,
  createdAt: 0,
  endedAt: null,
  proposer: me,
  partner: mei,
  waterings,
  ...extra,
});

describe('shared tree phase', () => {
  it('offers: mine or theirs', () => {
    expect(sharedPhase(shared({}, { status: 'proposed', plantedOn: null }), 'me', D0)).toBe('invited');
    expect(sharedPhase(shared({}, { status: 'proposed', plantedOn: null }), 'mei', D0)).toBe('invitedMe');
  });

  it('growing: who watered today', () => {
    expect(sharedPhase(shared({}), 'me', D0)).toBe('none');
    expect(sharedPhase(shared({ me: [D0] }), 'me', D0)).toBe('mine');
    expect(sharedPhase(shared({ mei: [D0] }), 'me', D0)).toBe('theirs');
    expect(sharedPhase(shared({ me: [D0], mei: [D0] }), 'me', D0)).toBe('both');
  });

  it('dead after the shared chances, ended when someone left', () => {
    expect(sharedPhase(shared({}), 'me', addDays(D0, 6))).toBe('dead');
    expect(sharedPhase(shared({}, { status: 'ended' }), 'me', D0)).toBe('ended');
    expect(sharedPhase(shared({}, { status: 'declined' }), 'me', D0)).toBe('ended');
  });
});

describe('which shared trees', () => {
  it('the open one with a friend, from either side', () => {
    const list = [shared({}, { id: 'old', status: 'ended' }), shared({}, { id: 'new', status: 'proposed', plantedOn: null })];
    expect(openWith(list, 'me', 'mei')?.id).toBe('new');
    expect(openWith(list, 'mei', 'me')?.id).toBe('new');
    expect(openWith(list, 'me', 'lucas')).toBeNull();
  });

  it('the main screen shows only planted active ones', () => {
    const list = [shared({}, { id: 'a' }), shared({}, { id: 'b', status: 'proposed', plantedOn: null }), shared({}, { id: 'c', status: 'ended' })];
    expect(homeShared(list).map((s) => s.id)).toEqual(['a']);
  });

  it('as a habit: one generation, the same id as the game tree', () => {
    const h = sharedHabit(shared({ me: [D0], mei: [D0] }), D0);
    expect(h.lineageId).toBe(sharedTreeId('s1'));
    expect(h.current.id).toBe(sharedTreeId('s1'));
    expect(h.generations).toHaveLength(1);
    expect(growthDays(h.current)).toBe(1);
  });
});

describe('days and looks', () => {
  it('thirst: 1, half, 0', () => {
    expect(thirstOf(false, false)).toBe(1);
    expect(thirstOf(true, false)).toBe(0.5);
    // OYUUR-34: before my watering hour the tree is calm.
    expect(thirstOf(false, false, true)).toBe(0);
    expect(thirstOf(false, true, true)).toBe(0);
    expect(thirstOf(false, true)).toBe(0.5);
    expect(thirstOf(true, true)).toBe(0);
  });

  it('day columns: two dots, counted, frozen, yesterday still counting', () => {
    const today = addDays(D0, 3);
    const s = shared({ me: [D0, addDays(D0, 2), today], mei: [D0, addDays(D0, 3)] });
    const days = pairDays(s, 'me', today, addDays(D0, -1), 6);
    expect(days.map((d) => d.before)).toEqual([true, false, false, false, false, false]);
    expect(days[1]).toMatchObject({ mine: true, theirs: true, counted: true });
    // D0+1: nobody — a shared chance; D0+2: only me, yesterday — still counting.
    expect(days[2]).toMatchObject({ frozen: true, counted: false, counting: false });
    expect(days[3]).toMatchObject({ mine: true, theirs: false, counting: true });
    expect(days[4]).toMatchObject({ today: true, counted: true });
    expect(days[5].future).toBe(true);
  });
});

describe('names', () => {
  it('a name, or the @nick; in Russian cases — the @nick', () => {
    expect(nameOf(me)).toBe('Ann');
    expect(nameOf(mei)).toBe('@mei');
    expect(nameIn(me, 'ru')).toBe('@me');
    expect(nameIn(me, 'en')).toBe('Ann');
  });

  it('offer errors', () => {
    expect(proposeError('offline', 0)).toBe('offline');
    expect(proposeError('shared_exists', 409)).toBe('shared_exists');
    expect(proposeError('server', 500)).toBe('other');
  });
});

describe('watering my half', () => {
  it('only signed in, growing, not watered today', () => {
    expect(canWaterShared(shared({}), 'me', D0)).toBe(true);
    expect(canWaterShared(shared({}), null, D0)).toBe(false);
    expect(canWaterShared(null, 'me', D0)).toBe(false);
    expect(canWaterShared(shared({ me: [D0] }), 'me', D0)).toBe(false);
    expect(canWaterShared(shared({}, { status: 'ended' }), 'me', D0)).toBe(false);
    expect(canWaterShared(shared({}, { status: 'proposed', plantedOn: null }), 'me', D0)).toBe(false);
    // No chances left: dead, nothing to water.
    expect(canWaterShared(shared({}), 'me', addDays(D0, 6))).toBe(false);
  });
});

describe('what the shared tree screen shows next', () => {
  const none = { mine: false, theirs: false };
  it('a new half plays; both at once too', () => {
    expect(wateringChange(none, { mine: true, theirs: false })).toEqual({ iDid: true, theyDid: false, both: false, reset: false });
    expect(wateringChange({ mine: true, theirs: false }, { mine: true, theirs: true })).toEqual({ iDid: false, theyDid: true, both: true, reset: false });
    expect(wateringChange(none, { mine: true, theirs: true })).toEqual({ iDid: true, theyDid: true, both: true, reset: false });
  });

  it('a new day (the halves are gone) is shown at once, not played', () => {
    expect(wateringChange({ mine: true, theirs: true }, none).reset).toBe(true);
    expect(wateringChange({ mine: true, theirs: false }, none).reset).toBe(true);
  });

  it('the friend watered first on a new day: plays, my old half goes with it', () => {
    expect(wateringChange({ mine: true, theirs: false }, { mine: false, theirs: true })).toEqual({ iDid: false, theyDid: true, both: false, reset: false });
  });
});

describe('shared trees in my forest', () => {
  it('planted ones: growing first, then memories, the newest ending on top', () => {
    const list = [
      shared({}, { id: 'old', status: 'ended', endedAt: 1000 }),
      shared({}, { id: 'offer', status: 'proposed', plantedOn: null }),
      shared({}, { id: 'no', status: 'declined', plantedOn: null }),
      shared({}, { id: 'grow' }),
      shared({}, { id: 'new', status: 'ended', endedAt: 5000 }),
      shared({}, { id: 'never', status: 'ended', plantedOn: null, endedAt: 9000 }),
    ];
    expect(forestShared(list).map((s) => s.id)).toEqual(['grow', 'new', 'old']);
  });

  it('a memory: stopped on the day it ended, with the days it grew', () => {
    const end = new Date(`${addDays(D0, 2)}T15:00:00`).getTime();
    const s = shared({ me: [D0, addDays(D0, 1)], mei: [D0, addDays(D0, 1)] }, { status: 'ended', endedAt: end });
    expect(endedOn(s)).toBe(addDays(D0, 2));
    const h = memoryHabit(s, addDays(D0, 20));
    expect(h.lineageId).toBe(sharedTreeId('s1'));
    expect(growthDays(h.current)).toBe(2);
    expect(h.current.completedOn).toBe(addDays(D0, 2));
    expect(h.current.diedOn).toBeNull();
  });

  it('a row: growing, dead (no chances left) or a memory, with the friend', () => {
    expect(sharedRow(shared({ me: [D0], mei: [D0] }), 'me', D0)).toMatchObject({ id: 's1', state: 'growing', friend: { nick: 'mei' } });
    expect(sharedRow(shared({}), 'mei', addDays(D0, 6))).toMatchObject({ state: 'dead', friend: { nick: 'me' } });
    const end = new Date(`${addDays(D0, 1)}T10:00:00`).getTime();
    expect(sharedRow(shared({ me: [D0], mei: [D0] }, { status: 'ended', endedAt: end, partner: null }), 'me', addDays(D0, 30))).toMatchObject({ state: 'memory', friend: null });
  });

  it('a growing one is the same as on the main screen', () => {
    const s = shared({ me: [D0], mei: [D0] });
    expect(memoryHabit(s, D0).current).toEqual(sharedHabit(s, D0).current);
    expect(endedOn(s)).toBeNull();
  });
});
