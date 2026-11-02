import { describe, expect, it } from '@jest/globals';
import { Dropped, makeThumbQueue } from '../thumbQueue';

/** A queue whose frames the test turns by hand; each picture takes 5 ms of a fake clock. */
function setup({ budget = 8, deliverGap = 0 } = {}) {
  let clock = 0;
  const drawn: string[] = [];
  const frames: (() => void)[] = [];
  const queue = makeThumbQueue<string>({
    draw: async (name) => {
      clock += 5;
      drawn.push(name);
      return `uri:${name}`;
    },
    nextFrame: () => new Promise<void>((resolve) => frames.push(resolve)),
    now: () => clock,
    budget,
    deliverGap,
  });
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  /** Lets the queue draw one frame's worth, then moves the clock past the frame. */
  const frame = async () => {
    await settle();
    clock += 16;
    frames.splice(0).forEach((f) => f());
    await settle();
  };
  return { queue, drawn, frame, settle, tick: (ms: number) => (clock += ms) };
}

describe('tree picture queue', () => {
  it('draws a picture once and hands the same one to every thumb', async () => {
    const { queue, drawn, settle } = setup();
    const a = queue.request('oak', 'oak');
    const b = queue.request('oak', 'oak');
    await expect(a.promise).resolves.toBe('uri:oak');
    await expect(b.promise).resolves.toBe('uri:oak');
    await settle();
    expect(drawn).toEqual(['oak']);
    expect(queue.ready.get('oak')).toBe('uri:oak');
  });

  it('a picture whose thumb left the screen is dropped quietly, not drawn', async () => {
    const { queue, drawn, frame } = setup({ budget: 1 });
    const first = queue.request('a', 'a');
    const gone = queue.request('b', 'b');
    gone.release();
    await expect(gone.promise).rejects.toBeInstanceOf(Dropped);
    for (let i = 0; i < 4; i++) await frame();
    await expect(first.promise).resolves.toBe('uri:a');
    expect(drawn).not.toContain('b');
    expect(queue.waiting()).toBe(0);
  });

  it('a picture still wanted by another thumb or by a warm-up is kept', async () => {
    const { queue, drawn, frame } = setup({ budget: 1 });
    queue.request('busy', 'busy');
    const a = queue.request('shared', 'shared');
    const b = queue.request('shared', 'shared');
    a.release();
    const warm = queue.warm('warm', 'warm');
    const c = queue.request('warm', 'warm');
    c.release();
    for (let i = 0; i < 6; i++) await frame();
    await expect(b.promise).resolves.toBe('uri:shared');
    await expect(warm).resolves.toBe('uri:warm');
    expect(drawn.sort()).toEqual(['busy', 'shared', 'warm']);
  });

  it('the newest picture on screen goes first, before older ones and every warm-up', async () => {
    const { queue, drawn, frame } = setup({ budget: 1 });
    queue.request('busy', 'busy');
    for (const name of ['w1', 'w2', 'w3']) queue.warm(name, name);
    for (const name of ['s1', 's2', 's3']) queue.request(name, name);
    // A warm-up the screen now shows jumps the queue too.
    queue.request('w3', 'w3');
    const lockIn = queue.request('lock', 'lock');
    for (let i = 0; i < 10; i++) await frame();
    await lockIn.promise;
    expect(drawn).toEqual(['busy', 'lock', 'w3', 's3', 's2', 's1', 'w1', 'w2']);
  });

  it('hands finished pictures out in batches, not frame after frame', async () => {
    const { queue, frame } = setup({ budget: 1, deliverGap: 100 });
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    let got = 0;
    for (const n of names) queue.request(n, n).promise.then(() => got++);
    // One picture is drawn a frame; after each frame: how many have arrived.
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) {
      await frame();
      seen.push(got);
    }
    expect(got).toBe(names.length);
    // The first at once, then a few batches: not eight separate re-renders.
    expect(seen[0]).toBe(1);
    const batches = seen.filter((n, i) => n !== (i === 0 ? 0 : seen[i - 1])).length;
    expect(batches).toBeLessThanOrEqual(3);
  });
});
