import { describe, expect, it } from '@jest/globals';
import { addDays } from '@/game/dates';
import { checkIn, complete, plantTree, settle } from '@/game/tree';
import { dayLook } from '../dayLook';

const D0 = '2026-10-05';
const plant = () => plantTree({ id: 't1', name: 'No sugar', kind: 'quit', visibility: 'private', today: D0 });

describe('day card look', () => {
  it('today, not watered yet: blue frame, "today", a drop', () => {
    const look = dayLook(plant(), D0, D0);
    expect(look).toMatchObject({ isToday: true, frame: 'water', mark: 'drop', face: 'card' });
  });

  it('today after watering keeps its frame and its "today" label (green, a sprout)', () => {
    const tree = checkIn(plant(), D0).tree;
    const look = dayLook(tree, D0, D0);
    expect(look.status).toBe('done');
    expect(look).toMatchObject({ isToday: true, frame: 'accent', mark: 'sprout' });
  });

  it('a watered day in the past has no frame', () => {
    const tree = checkIn(plant(), D0).tree;
    expect(dayLook(tree, D0, addDays(D0, 1))).toMatchObject({ isToday: false, frame: null, mark: 'sprout' });
  });

  it('frozen and missed days', () => {
    // Two missed days: the first uses a chance (frozen), with chances left both freeze.
    const tree = settle(checkIn(plant(), D0).tree, addDays(D0, 2));
    expect(dayLook(tree, addDays(D0, 1), addDays(D0, 2))).toMatchObject({ face: 'frozen', mark: 'snowflake' });
    expect(dayLook(plant(), addDays(D0, -1), D0).status).toBe('beforePlanting');
  });

  it('the day of the next stage gets a dashed frame, unless it is today', () => {
    const stage = addDays(D0, 3);
    expect(dayLook(plant(), stage, D0, stage)).toMatchObject({ frame: 'stage', mark: 'stageUp', future: false });
    expect(dayLook(plant(), D0, D0, D0)).toMatchObject({ frame: 'water', mark: 'stageUp' });
  });

  it('the lock-in day is gold with a plaque, today or not', () => {
    const tree = complete(checkIn(plant(), D0).tree, D0);
    expect(dayLook(tree, D0, D0)).toMatchObject({ isToday: true, frame: 'gold', mark: 'plaque' });
    expect(dayLook(tree, D0, addDays(D0, 5))).toMatchObject({ isToday: false, frame: 'gold', mark: 'plaque' });
  });

  it('future days are faded', () => {
    expect(dayLook(plant(), addDays(D0, 1), D0)).toMatchObject({ future: true, frame: null, mark: null });
  });

  it('days before planting are blank: they only fill the strip', () => {
    expect(dayLook(plant(), addDays(D0, -2), D0)).toMatchObject({ blank: true, mark: null, frame: null });
    expect(dayLook(plant(), D0, D0).blank).toBe(false);
  });

  it('a calm strip (a memory) shows missed and died days without red', () => {
    // Watered on the first day, the next one missed, died on the third.
    const tree = { ...checkIn(plant(), D0).tree, diedOn: addDays(D0, 2) };
    const later = addDays(D0, 8);
    expect(dayLook(tree, addDays(D0, 1), later)).toMatchObject({ face: 'danger', mark: 'close' });
    expect(dayLook(tree, addDays(D0, 1), later, null, true)).toMatchObject({ face: 'muted', mark: 'close' });
    expect(dayLook(tree, addDays(D0, 2), later)).toMatchObject({ face: 'danger', mark: 'tombstone' });
    expect(dayLook(tree, addDays(D0, 2), later, null, true)).toMatchObject({ face: 'muted', mark: 'tombstone' });
  });
});

describe('today before the watering hour (OYUUR-33 5.1, frame 06)', () => {
  const D1 = addDays(D0, 1);
  it('a gray frame and the clock with the hour instead of the empty drop', () => {
    const look = dayLook(plant(), D1, D1, null, false, 18);
    expect(look).toMatchObject({ isToday: true, frame: 'wait', mark: 'clock', hour: 18, face: 'card' });
  });

  it('without an hour — the usual drop; other days never wait', () => {
    expect(dayLook(plant(), D1, D1)).toMatchObject({ frame: 'water', mark: 'drop', hour: null });
    expect(dayLook(plant(), addDays(D1, 1), D1, null, false, 18)).toMatchObject({ isToday: false, mark: null, hour: null });
  });

  it('watered today: as before, whatever the hour', () => {
    const tree = checkIn(plant(), D0).tree;
    expect(dayLook(tree, D0, D0, null, false, 18)).toMatchObject({ frame: 'accent', mark: 'sprout', hour: null });
  });
});
