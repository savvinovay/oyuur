// The queue that draws tree pictures (TreeThumb) one after another, a few per frame, never
// hundreds at once: a big forest would freeze the screen. Pictures a thumb on screen waits
// for go before warm-ups, the newest request first (a lock-in picture never waits behind
// a forest). A picture nobody waits for any more (its thumb left the screen) is dropped.
// Finished pictures are handed out in batches at most every `deliverGap` ms: hundreds of
// pictures arriving frame after frame kept React re-rendering without a pause, and in a
// browser every new image sets its own state in an effect, so React counted an endless
// chain of nested updates ("Maximum update depth exceeded") on a busy machine.

export interface QueueOptions<P> {
  draw: (props: P) => Promise<string>;
  /** Resolves after the next paint. */
  nextFrame: () => Promise<void>;
  now: () => number;
  /** Drawing time per frame, ms: the rest of the frame is the screen's. */
  budget: number;
  /** Finished pictures are handed out at most this often, ms. */
  deliverGap: number;
}

/** What a waiting thumb holds: the picture to come, and a way to say it is no longer needed. */
export interface Ticket {
  promise: Promise<string>;
  release(): void;
}

/** The rejection of a picture nobody waits for: not an error, nothing to report. */
export class Dropped extends Error {
  constructor() {
    super('The picture is no longer needed');
  }
}

interface Job<P> {
  key: string;
  props: P;
  /** Thumbs waiting for it. */
  subs: number;
  /** A warm-up asked for it too: it is drawn even with no thumb waiting. */
  warm: boolean;
  drawing: boolean;
  promise: Promise<string>;
  resolve: (uri: string) => void;
  reject: (error: unknown) => void;
}

export function makeThumbQueue<P>(o: QueueOptions<P>) {
  const ready = new Map<string, string>();
  const jobs = new Map<string, Job<P>>();
  const onScreen: Job<P>[] = [];
  const ahead: Job<P>[] = [];
  let pumping = false;
  let lastDelivery = -Infinity;

  const take = (list: Job<P>[], job: Job<P>) => {
    const i = list.indexOf(job);
    if (i >= 0) list.splice(i, 1);
  };

  const make = (key: string, props: P): Job<P> => {
    let resolve!: (uri: string) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<string>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    // Nobody may be listening (a dropped picture, a warm-up that is not awaited).
    promise.catch(() => {});
    const job: Job<P> = { key, props, subs: 0, warm: false, drawing: false, promise, resolve, reject };
    jobs.set(key, job);
    return job;
  };

  async function pump() {
    if (pumping) return;
    pumping = true;
    let done: (() => void)[] = [];
    try {
      while (onScreen.length + ahead.length > 0 || done.length > 0) {
        const start = o.now();
        while (onScreen.length + ahead.length > 0 && o.now() - start < o.budget) {
          const job = (onScreen.shift() ?? ahead.shift())!;
          job.drawing = true;
          try {
            const uri = await o.draw(job.props);
            ready.set(job.key, uri);
            done.push(() => job.resolve(uri));
          } catch (error) {
            done.push(() => job.reject(error));
          } finally {
            jobs.delete(job.key);
          }
        }
        const idle = onScreen.length + ahead.length === 0;
        if (done.length > 0 && (idle || o.now() - lastDelivery >= o.deliverGap)) {
          lastDelivery = o.now();
          // Everything finished since the last batch arrives together: one re-render.
          const batch = done;
          done = [];
          for (const fn of batch) fn();
        }
        if (onScreen.length + ahead.length + done.length > 0) await o.nextFrame();
      }
    } finally {
      pumping = false;
    }
  }

  /** A thumb on screen waits for this picture: it goes to the front of the queue. */
  function request(key: string, props: P): Ticket {
    const have = ready.get(key);
    if (have) return { promise: Promise.resolve(have), release: () => {} };
    const job = jobs.get(key) ?? make(key, props);
    job.subs++;
    if (!job.drawing) {
      take(ahead, job);
      take(onScreen, job);
      onScreen.unshift(job);
    }
    pump();
    let released = false;
    return {
      promise: job.promise,
      release: () => {
        if (released) return;
        released = true;
        job.subs--;
        if (job.subs > 0 || job.drawing || jobs.get(key) !== job) return;
        take(onScreen, job);
        if (job.warm) {
          // Still wanted ahead of time, but no longer before the pictures on screen.
          ahead.unshift(job);
          return;
        }
        jobs.delete(key);
        job.reject(new Dropped());
      },
    };
  }

  /** Draws a picture ahead of time, after the ones on screen. */
  function warm(key: string, props: P): Promise<string> {
    const have = ready.get(key);
    if (have) return Promise.resolve(have);
    let job = jobs.get(key);
    if (!job) {
      job = make(key, props);
      ahead.push(job);
    }
    job.warm = true;
    pump();
    return job.promise;
  }

  return { ready, request, warm, waiting: () => onScreen.length + ahead.length };
}
