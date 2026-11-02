import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { FlightSpec, WalletEvent } from '../bus';

jest.mock('@/ui/feedback', () => ({ cue: jest.fn() }));

// A fresh bus for every test: it keeps module state.
type Bus = typeof import('../bus');
type Acorns = typeof import('@/state/acorns');
function load() {
  let bus!: Bus;
  let acorns!: Acorns;
  let cue!: jest.Mock;
  jest.isolateModules(() => {
    acorns = require('@/state/acorns');
    bus = require('../bus');
    cue = (require('@/ui/feedback') as { cue: jest.Mock }).cue;
  });
  return { bus, acorns, cue };
}

/** Lets the timers and the measuring promises run. */
async function run(ms: number) {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  jest.advanceTimersByTime(ms);
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

const WALLET = { x: 330, y: 60 };
const CROWN = { x: 187, y: 500 };

beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

describe('earning', () => {
  test('one watering (+5 and its stage +10) is one flock, and the wallet holds the number until it lands', async () => {
    const { bus, acorns, cue } = load();
    bus.addTarget(() => Promise.resolve(WALLET));
    const flights: FlightSpec[] = [];
    bus.onFlight((f) => flights.push(f));
    const delays: number[] = [];
    bus.acornFlights.provide('water', (b) => {
      delays.push(b.sources.includes('stage') ? 3400 : 2150);
      return { from: CROWN, delay: delays[0] };
    });
    acorns.acornsEarned.emit({ amount: 5, source: 'water', treeId: 't1' });
    acorns.acornsEarned.emit({ amount: 10, source: 'stage', treeId: 't1' });
    // The store already has 50 + 15: the wallet still shows 50.
    expect(bus.shownAcorns(65)).toBe(50);
    expect(bus.acornFlights.busy()).toBe(true);
    await run(0);
    expect(delays).toEqual([3400]);
    await run(3399);
    expect(flights).toHaveLength(0);
    await run(1);
    expect(flights).toHaveLength(1);
    const f = flights[0];
    expect(f.from).toEqual(CROWN);
    expect(f.to).toEqual(WALLET);
    expect(f.shares).toEqual([3, 3, 3, 3, 3]);
    f.arrive(0);
    expect(bus.shownAcorns(65)).toBe(53);
    expect(cue).toHaveBeenLastCalledWith('acornTick');
    [1, 2, 3, 4].forEach((i) => f.arrive(i));
    expect(bus.shownAcorns(65)).toBe(65);
    expect(cue).toHaveBeenLastCalledWith('acornDone');
    expect(bus.acornFlights.busy()).toBe(false);
  });

  test('a claim flies from the prepared button; the last quest splits into the button and the basket', async () => {
    const { bus, acorns } = load();
    bus.addTarget(() => Promise.resolve(WALLET));
    const flights: FlightSpec[] = [];
    bus.onFlight((f) => flights.push(f));
    bus.acornFlights.prepare('quest', [{ from: { x: 300, y: 400 }, amount: 10 }, { from: { x: 60, y: 700 }, delay: 300 }]);
    acorns.acornsEarned.emit({ amount: 25, source: 'quest' });
    await run(0);
    await run(60);
    expect(flights.map((f) => f.shares.reduce((a, b) => a + b, 0))).toEqual([10]);
    await run(240);
    expect(flights.map((f) => f.shares.reduce((a, b) => a + b, 0))).toEqual([10, 15]);
    expect(flights[1].from).toEqual({ x: 60, y: 700 });
  });

  test('no wallet on screen, no origin, or no animations: counted at once, with the quiet "+N"', async () => {
    const { bus, acorns, cue } = load();
    const events: WalletEvent[] = [];
    bus.onWallet((e) => events.push(e));
    bus.onFlight(() => {});
    // No target.
    acorns.acornsEarned.emit({ amount: 10, source: 'quest' });
    await run(0);
    expect(bus.shownAcorns(60)).toBe(60);
    expect(cue).toHaveBeenLastCalledWith('acornDone');
    // A target, but nobody said where from.
    const target = bus.addTarget(() => Promise.resolve(WALLET));
    acorns.acornsEarned.emit({ amount: 20, source: 'achievement' });
    await run(0);
    expect(bus.shownAcorns(80)).toBe(80);
    expect(events.filter((e) => e.kind === 'plus')).toEqual([
      { kind: 'plus', target: target.id, amount: 20, reduced: true },
    ]);
    // Animations off.
    bus.setFlightAnimations(false);
    bus.acornFlights.prepare('quest', { from: CROWN });
    acorns.acornsEarned.emit({ amount: 10, source: 'quest' });
    await run(0);
    expect(bus.shownAcorns(90)).toBe(90);
  });

  test('the flight waits while the screen is busy, but not longer than 3 s', async () => {
    const { bus, acorns } = load();
    bus.addTarget(() => Promise.resolve(WALLET));
    const flights: FlightSpec[] = [];
    bus.onFlight((f) => flights.push(f));
    bus.acornFlights.setGate(() => true);
    bus.acornFlights.prepare('quest', { from: CROWN });
    acorns.acornsEarned.emit({ amount: 10, source: 'quest' });
    await run(0);
    await run(60);
    await run(2000);
    expect(flights).toHaveLength(0);
    await run(1000);
    expect(flights).toHaveLength(1);
  });

  test('if the layer never reports, the acorns are counted anyway', async () => {
    const { bus, acorns } = load();
    bus.addTarget(() => Promise.resolve(WALLET));
    bus.onFlight(() => {});
    bus.acornFlights.prepare('quest', { from: CROWN });
    acorns.acornsEarned.emit({ amount: 10, source: 'quest' });
    await run(0);
    await run(60);
    expect(bus.shownAcorns(60)).toBe(50);
    await run(5000);
    expect(bus.shownAcorns(60)).toBe(60);
  });
});

describe('spending', () => {
  test('six acorns fly to the item; the number counts down; the last one starts the celebration', async () => {
    const { bus } = load();
    bus.addTarget(() => Promise.resolve(WALLET));
    const flights: FlightSpec[] = [];
    bus.onFlight((f) => flights.push(f));
    const landed = jest.fn();
    const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
    // The store already took 250 of 300: the wallet still shows 300 for 120 ms.
    bus.acornFlights.spend(250, { x: 187, y: 300 }, { onLand: landed });
    expect(bus.shownAcorns(50)).toBe(300);
    now.mockReturnValue(1120 + 300);
    const mid = bus.shownAcorns(50);
    expect(mid).toBeGreaterThan(50);
    expect(mid).toBeLessThan(300);
    await run(0);
    expect(flights).toHaveLength(1);
    expect(flights[0].kind).toBe('spend');
    expect(flights[0].from).toEqual(WALLET);
    [0, 1, 2, 3, 4].forEach((i) => flights[0].arrive(i));
    expect(landed).not.toHaveBeenCalled();
    flights[0].arrive(5);
    expect(landed).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1120 + 600);
    expect(bus.shownAcorns(50)).toBe(50);
    now.mockRestore();
  });

  test('without animations nothing flies and the celebration comes at once', async () => {
    const { bus } = load();
    bus.addTarget(() => Promise.resolve(WALLET));
    bus.onFlight(() => {});
    bus.setFlightAnimations(false);
    const landed = jest.fn();
    bus.acornFlights.spend(250, { x: 187, y: 300 }, { onLand: landed });
    expect(bus.shownAcorns(50)).toBe(50);
    await run(0);
    expect(landed).toHaveBeenCalledTimes(1);
  });
});

test('the last wallet shown is the target', () => {
  const { bus } = load();
  const home = bus.addTarget(() => Promise.resolve(WALLET));
  const shop = bus.addTarget(() => Promise.resolve(WALLET));
  expect(bus.isActiveTarget(shop.id)).toBe(true);
  shop.remove();
  expect(bus.isActiveTarget(home.id)).toBe(true);
});
