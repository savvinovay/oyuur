// Traffic control of the acorn flights (wave 5 spec, section 3). The store says acorns were
// earned (state/acorns.ts); this decides where they fly from, when, and into which wallet,
// and holds the wallets' number back until they land. Plain module state and listeners,
// no React: a few events a day. The layer that draws the flights is AcornLayer.tsx, the
// wallets are Wallet.tsx.
//
// How screens take part:
// - A wallet on screen registers its glyph (`useWalletTarget`); the last one shown is the target.
// - Where acorns come from: `acornFlights.prepare(source, from)` right before the store call
//   that pays (a "Claim" button), or a standing `acornFlights.provide(source, fn)` (the main
//   screen for watering). With neither, the number just changes.
// - Buying: `acornFlights.spend(price, to)` in the same handler as `store.buyItem`.
import { acornsEarned, EarnSource, Earned } from '@/state/acorns';
import { cue } from '@/ui/feedback';
import { earnTotal, flockSize, Pt, shares, SPEND, spendTotal } from './flight';

/** Where a flock starts: a point in the window, or a function that measures it when the flock starts. */
export type From = Pt | (() => Promise<Pt | null>);

export interface Part {
  from: From;
  /** ms after the acorns were earned (spec 3.2); default 60. */
  delay?: number;
  /** This part's acorns; the last part takes whatever is left. */
  amount?: number;
}

/** Acorns earned together: one watering (its +5 and its new stage), or one claim. */
export interface Batch {
  amount: number;
  sources: EarnSource[];
  treeId?: string;
}

export type Provider = (batch: Batch) => Part | Part[] | null;

/** A flock for the layer, in window coordinates. */
export interface FlightSpec {
  id: number;
  kind: 'earn' | 'spend';
  from: Pt;
  to: Pt;
  shares: number[];
  /** The i-th acorn reached the target. */
  arrive(i: number): void;
}

export type WalletEvent =
  /** An acorn landed in the target wallet: bump and roll. */
  | { kind: 'arrive'; target: number }
  /** The "+N" beside the wallet; `reduced` — just fade it in and out. */
  | { kind: 'plus'; target: number; amount: number; reduced: boolean }
  /** The number changed without a flight: cross-fade it. */
  | { kind: 'fade' };

/** Two events of one watering closer than this are one flock (spec 3.1). */
const MERGE_MS = 50;
/** A prepared origin is good for this long. */
const PREPARED_MS = 1000;
/** A flight waits for the name show, the camera and the like at most this long (spec 3.2). */
const GATE_MAX = 3000;
const GATE_POLL = 100;
/** If the layer never reports, the acorns are counted anyway this long after they were due. */
const SAFETY_MS = 1500;
const DEFAULT_DELAY = 60;

// ---- State ----
let animations = true;
let nextId = 1;
const targets: { id: number; measure: () => Promise<Pt | null> }[] = [];
const providers = new Map<EarnSource, Provider>();
const prepared = new Map<EarnSource, { parts: Part[]; until: number }>();
let gate: (() => boolean) | null = null;
/** Earned, not landed yet: the wallets don't show these. */
let incoming = 0;
/** Spent, still counting down in the wallets. */
const spends: { amount: number; at: number }[] = [];
let flying = 0;
let open: { batch: Batch; at: number } | null = null;

const changeListeners = new Set<() => void>();
const flightListeners = new Set<(f: FlightSpec) => void>();
const walletListeners = new Set<(e: WalletEvent) => void>();
const landedListeners = new Set<(amount: number) => void>();
const changed = () => changeListeners.forEach((l) => l());
const toWallets = (e: WalletEvent) => walletListeners.forEach((l) => l(e));
const activeTarget = () => targets[targets.length - 1] ?? null;
const listen = <T>(set: Set<T>, l: T) => {
  set.add(l);
  return () => {
    set.delete(l);
  };
};

const outCubic = (x: number) => 1 - (1 - x) ** 3;

/** What is still counting down from purchases, now. */
function outgoing(now: number): number {
  let sum = 0;
  for (let i = spends.length - 1; i >= 0; i--) {
    const s = spends[i];
    const p = Math.min(1, Math.max(0, (now - s.at) / SPEND.tween));
    if (p >= 1) spends.splice(i, 1);
    else sum += s.amount * (1 - outCubic(p));
  }
  return Math.round(sum);
}

/** The acorns landed (or were counted without a flight). */
function landed(amount: number, reduced: boolean) {
  const target = activeTarget();
  if (target) toWallets({ kind: 'plus', target: target.id, amount, reduced });
  landedListeners.forEach((l) => l(amount));
}

/** Counted at once, no flight: the number cross-fades, "+N" fades in and out (spec 3.6). */
function instant(amount: number) {
  incoming = Math.max(0, incoming - amount);
  toWallets({ kind: 'fade' });
  changed();
  cue('acornDone');
  landed(amount, true);
}

const resolve = (from: From): Promise<Pt | null> => (typeof from === 'function' ? from().catch(() => null) : Promise.resolve(from));

/** Waits until nothing on screen holds the flight back, at most 3 s. */
function whenFree(go: () => void, waited = 0) {
  if (!gate || !gate() || waited >= GATE_MAX) return go();
  setTimeout(() => whenFree(go, waited + GATE_POLL), GATE_POLL);
}

function flyPart(from: From, amount: number) {
  whenFree(async () => {
    const target = activeTarget();
    const [start, end] = await Promise.all([resolve(from), target ? target.measure() : Promise.resolve(null)]);
    if (!start || !end || !animations || flightListeners.size === 0) return instant(amount);
    const n = flockSize(amount);
    const each = shares(amount, n);
    let left = n;
    const safety = setTimeout(() => {
      while (left > 0) arrive(n - left);
    }, earnTotal(n) + SAFETY_MS);
    const arrive = (i: number) => {
      if (left <= 0 || i !== n - left) return;
      left -= 1;
      incoming = Math.max(0, incoming - each[i]);
      const now = activeTarget();
      if (now) toWallets({ kind: 'arrive', target: now.id });
      cue(left > 0 ? 'acornTick' : 'acornDone');
      if (left === 0) {
        clearTimeout(safety);
        flying -= 1;
        landed(amount, false);
      }
      changed();
    };
    flying += 1;
    changed();
    const spec: FlightSpec = { id: nextId++, kind: 'earn', from: start, to: end, shares: each, arrive };
    flightListeners.forEach((l) => l(spec));
  });
}

function settle(batch: Batch) {
  const ready = prepared.get(batch.sources[0]);
  prepared.delete(batch.sources[0]);
  const fresh = ready && ready.until >= Date.now() ? ready.parts : null;
  const given = fresh ?? providers.get(batch.sources[0])?.(batch) ?? null;
  const parts = given === null ? [] : Array.isArray(given) ? given : [given];
  if (!animations || !activeTarget() || parts.length === 0) return instant(batch.amount);
  let left = batch.amount;
  parts.forEach((part, i) => {
    const last = i === parts.length - 1;
    const amount = last ? left : Math.min(left, Math.max(0, part.amount ?? 0));
    left -= amount;
    if (amount > 0) setTimeout(() => flyPart(part.from, amount), part.delay ?? DEFAULT_DELAY);
  });
}

acornsEarned.on((e: Earned) => {
  const now = Date.now();
  incoming += e.amount;
  if (open && e.treeId !== undefined && open.batch.treeId === e.treeId && now - open.at < MERGE_MS) {
    open.batch.amount += e.amount;
    open.batch.sources.push(e.source);
    changed();
    return;
  }
  const batch: Batch = { amount: e.amount, sources: [e.source], treeId: e.treeId };
  open = { batch, at: now };
  changed();
  // The second event of the same watering comes right after the first: settle after both.
  setTimeout(() => {
    if (open?.batch === batch) open = null;
    settle(batch);
  }, 0);
});

// ---- For screens ----

export const acornFlights = {
  /**
   * Where the next acorns of `source` fly from (a "Claim" button): call right before the
   * store call that pays. Several parts split the amount (a quest's +10 from its button,
   * then the basket's +15 from the basket).
   */
  prepare(source: EarnSource, parts: Part | Part[]) {
    prepared.set(source, { parts: Array.isArray(parts) ? parts : [parts], until: Date.now() + PREPARED_MS });
  },
  /** A standing answer to "where from" (the main screen's watering). Returns the remover. */
  provide(source: EarnSource, provider: Provider) {
    providers.set(source, provider);
    return () => {
      if (providers.get(source) === provider) providers.delete(source);
    };
  },
  /** While this says true, flights wait (the name show, the camera riding). Returns the remover. */
  setGate(fn: () => boolean) {
    gate = fn;
    return () => {
      if (gate === fn) gate = null;
    };
  },
  /**
   * A purchase (spec 3.5): six acorns fly from the wallet's glyph to `to` (window point), the
   * number counts down over 600 ms. Call in the same handler as `store.buyItem`. `onArrive`
   * — each acorn reaching the item; `onLand` — the last one (the celebration starts there;
   * without a flight it comes at once).
   */
  spend(amount: number, to: Pt | null, opts: { from?: Pt; onArrive?: (i: number) => void; onLand?: () => void } = {}) {
    const target = activeTarget();
    if (!animations || !target || !to || flightListeners.size === 0) {
      toWallets({ kind: 'fade' });
      changed();
      if (opts.onLand) setTimeout(opts.onLand, 0);
      return;
    }
    spends.push({ amount, at: Date.now() + SPEND.from });
    changed();
    const n = SPEND.count;
    let left = n;
    let over = false;
    const done = () => {
      if (over) return;
      over = true;
      clearTimeout(safety);
      flying -= 1;
      changed();
      opts.onLand?.();
    };
    const safety = setTimeout(done, spendTotal(n) + SAFETY_MS);
    flying += 1;
    (opts.from ? Promise.resolve(opts.from) : target.measure()).then((from) => {
      if (!from) {
        clearTimeout(safety);
        setTimeout(done, SPEND.from + SPEND.tween);
        return;
      }
      const spec: FlightSpec = {
        id: nextId++,
        kind: 'spend',
        from,
        to,
        shares: shares(amount, n),
        arrive: (i) => {
          if (over || i !== n - left) return;
          left -= 1;
          opts.onArrive?.(i);
          if (i === 0 || i === n - 1) cue('acornTick');
          if (left === 0) done();
        },
      };
      flightListeners.forEach((l) => l(spec));
    });
  },
  /** Acorns are on their way (or counting down): the "new achievement" toast waits. */
  busy: () => incoming > 0 || flying > 0 || outgoing(Date.now()) > 0,
};

// ---- For the wallets and the layer ----

/** The number a wallet shows for this real balance. */
export function shownAcorns(real: number, now = Date.now()): number {
  return Math.max(0, real - incoming + outgoing(now));
}
export const countingDown = (now = Date.now()) => outgoing(now) > 0;

export function addTarget(measure: () => Promise<Pt | null>) {
  const id = nextId++;
  targets.push({ id, measure });
  changed();
  return {
    id,
    remove() {
      const at = targets.findIndex((x) => x.id === id);
      if (at >= 0) targets.splice(at, 1);
      changed();
    },
  };
}
export const isActiveTarget = (id: number) => activeTarget()?.id === id;

export const onAcornsChange = (l: () => void) => listen(changeListeners, l);
export const onFlight = (l: (f: FlightSpec) => void) => listen(flightListeners, l);
export const onWallet = (l: (e: WalletEvent) => void) => listen(walletListeners, l);
export const onLanded = (l: (amount: number) => void) => listen(landedListeners, l);
export function setFlightAnimations(on: boolean) {
  animations = on;
}

