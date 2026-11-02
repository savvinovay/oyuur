// Usage statistics (OYUUR-26): does a tester come back on day 1/2/7/14, where do they stop.
// - An install id: random, kept on the phone, not tied to the account or the @nick.
// - Events (net/events.ts) wait in a queue on the phone and go to our own server
//   (POST /api/events) in batches: on start, every 5 minutes while open, when the app goes to
//   the background. No network — they wait; each event has its own id, so a batch sent twice
//   counts once.
// - Settings → "Send statistics" off: the queue is emptied, the install id forgotten, nothing is sent.
// - Never: names of habits or trees, nicks, any text a person typed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { daysBetween, DayKey, todayKey } from '@/game/dates';
import { growthDays, Tree } from '@/game/tree';
import { readBrowser, isStandalone } from '@/ui/install/detect';
import { SERVER } from './api';
import { AnalyticsEvent, EventName, EventProps, Mode } from './events';

const STORAGE_KEY = 'oyuur/analytics';
/** One batch (the server takes up to 50). */
export const BATCH = 50;
/** The queue never grows past this: the oldest go first. */
export const QUEUE_MAX = 500;
/** While the app is open, the queue goes out this often. */
const FLUSH_EVERY = 5 * 60_000;
/** Coming back after this long in the background counts as opening the app again. */
const REOPEN_AFTER = 30 * 60_000;
const TIMEOUT = 12_000;

export interface Saved {
  off: boolean;
  /** null — no id yet (or forgotten when turned off). */
  install: string | null;
  /** The first day with statistics on: day numbers count from it. */
  firstDay: DayKey | null;
  queue: AnalyticsEvent[];
}

/** How sending went: ok — the server has it; retry — later (no network, busy); drop — it never will. */
export type SendResult = 'ok' | 'retry' | 'drop';

export interface Env {
  mode: Mode;
  version: string;
  tz: string;
}

export interface Deps {
  load(): Promise<string | null>;
  save(raw: string): Promise<void>;
  send(install: string, events: AnalyticsEvent[], leaving: boolean): Promise<SendResult>;
  now(): number;
  env(): Env;
}

const ABC = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export function randomId(length: number): string {
  const bytes = new Uint8Array(length);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => ABC[b % ABC.length]).join('');
}

/** What a day's settling did to a tree, as events: a missed day covered by a chance, or death. */
export function settleEvents(before: Tree, after: Tree): { name: 'chance_used' | 'tree_died'; props: { days: number } }[] {
  const out: { name: 'chance_used' | 'tree_died'; props: { days: number } }[] = [];
  const frozen = after.frozen.length - before.frozen.length;
  if (frozen > 0) out.push({ name: 'chance_used', props: { days: frozen } });
  if (!before.diedOn && after.diedOn) out.push({ name: 'tree_died', props: { days: growthDays(after) } });
  return out;
}

const OFF: Saved = { off: true, install: null, firstDay: null, queue: [] };

/** The stored state; anything broken in it starts over (a broken event is dropped, broken JSON — a new start). */
export function parseSaved(raw: string): Saved {
  let saved: Partial<Saved>;
  try {
    saved = JSON.parse(raw) as Partial<Saved>;
  } catch {
    return { off: false, install: null, firstDay: null, queue: [] };
  }
  if (!saved || typeof saved !== 'object') return { off: false, install: null, firstDay: null, queue: [] };
  const off = saved.off === true;
  return {
    off,
    install: !off && typeof saved.install === 'string' ? saved.install : null,
    firstDay: !off && typeof saved.firstDay === 'string' ? saved.firstDay : null,
    queue: !off && Array.isArray(saved.queue)
      ? saved.queue.filter((e) => !!e && typeof e === 'object' && typeof e.id === 'string' && typeof e.name === 'string').slice(-QUEUE_MAX)
      : [],
  };
}

export class Analytics {
  private state: Saved = { off: false, install: null, firstDay: null, queue: [] };
  /** Storage read; until then events wait in `early`. */
  private loaded = false;
  /** Storage couldn't be read: nothing is kept or sent this session. */
  private broken = false;
  private early: { name: EventName; props?: object; at: number; day: DayKey }[] = [];
  private sending = false;
  private writes: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  private lang = 'en';
  private dayOffset = 0;

  constructor(private deps: Deps) {}

  get off() {
    return this.state.off;
  }
  /** Waiting events (for tests and a look in the console). */
  get queue(): readonly AnalyticsEvent[] {
    return this.state.queue;
  }
  get install() {
    return this.state.install;
  }

  /** The language and the developer's time travel come from the store. */
  configure(p: { lang: string; dayOffset: number }) {
    this.lang = p.lang;
    this.dayOffset = p.dayOffset;
  }

  private today(at = this.deps.now()) {
    return todayKey(new Date(at), this.dayOffset);
  }

  /** Reads the storage; the very first start makes an install id. `hadData`: the phone already had trees. */
  async start(p: { hadData: boolean }) {
    if (this.loaded) return;
    let raw: string | null = null;
    try {
      raw = await this.deps.load();
    } catch {
      this.broken = true;
      this.state = { ...OFF };
    }
    if (raw) this.state = parseSaved(raw);
    this.loaded = true;
    if (!this.state.off && !this.state.install) {
      this.begin();
      this.add('first_launch', p.hadData ? { existing: true } : {}, this.deps.now(), this.today());
    }
    for (const e of this.early.splice(0)) this.add(e.name, e.props, e.at, e.day);
    this.add('app_open', {}, this.deps.now(), this.today());
    this.persist();
    this.emit();
    await this.flush();
  }

  private begin() {
    this.state = { off: false, install: randomId(22), firstDay: this.today(), queue: [] };
  }

  track<N extends EventName>(name: N, ...[props]: {} extends EventProps[N] ? [EventProps[N]?] : [EventProps[N]]) {
    const at = this.deps.now();
    if (!this.loaded) {
      this.early.push({ name, props: props ?? undefined, at, day: this.today(at) });
      return;
    }
    if (this.add(name, props, at, this.today(at))) this.persist();
  }

  private add(name: EventName, props: object | undefined, at: number, day: DayKey): boolean {
    const { install, firstDay, off } = this.state;
    if (off || this.broken || !install || !firstDay) return false;
    const env = this.deps.env();
    const event: AnalyticsEvent = {
      id: randomId(16),
      name,
      at,
      day,
      dayN: Math.max(0, daysBetween(firstDay, day)),
      tz: env.tz,
      mode: env.mode,
      v: env.version,
      lang: this.lang,
    };
    if (props && Object.keys(props).length) event.props = { ...(props as Record<string, boolean | number | string>) };
    this.state = { ...this.state, queue: [...this.state.queue, event].slice(-QUEUE_MAX) };
    return true;
  }

  /** Sends what waits, batch by batch, until the queue is empty or the server can't take more now. */
  async flush(leaving = false) {
    if (this.sending || !this.loaded) return;
    this.sending = true;
    try {
      while (!this.state.off && this.state.install && this.state.queue.length) {
        const install = this.state.install;
        const batch = this.state.queue.slice(0, BATCH);
        let result: SendResult;
        try {
          result = await this.deps.send(install, batch, leaving);
        } catch {
          result = 'retry';
        }
        if (result === 'retry') break;
        // Sent (or never sendable): off the queue — unless statistics were turned off meanwhile.
        if (this.state.install !== install) break;
        const done = new Set(batch.map((e) => e.id));
        this.state = { ...this.state, queue: this.state.queue.filter((e) => !done.has(e.id)) };
        this.persist();
      }
    } finally {
      this.sending = false;
    }
  }

  /** The switch in settings. Off: the queue is emptied and the install id forgotten. */
  setOff(off: boolean) {
    if (!this.loaded || this.broken || off === this.state.off) return;
    if (off) {
      this.state = { ...OFF };
    } else {
      this.begin();
      this.add('first_launch', { optIn: true }, this.deps.now(), this.today());
    }
    this.persist();
    this.emit();
    if (!off) this.flush();
  }

  /**
   * Another tab of the web version wrote the storage. Turned off there — off here too, so this
   * tab doesn't write the old id back; turned on there — the same id here.
   */
  outsideChange(raw: string | null) {
    if (!this.loaded || this.broken || raw === null) return;
    const other = parseSaved(raw);
    if (other.off && !this.state.off) {
      this.state = { ...OFF };
      this.emit();
    } else if (!other.off && other.install && other.install !== this.state.install) {
      this.state = { ...other, queue: [...other.queue, ...this.state.queue.filter((e) => !other.queue.some((o) => o.id === e.id))].slice(-QUEUE_MAX) };
      this.emit();
    }
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    for (const l of this.listeners) l();
  }

  /** Writes go one after another, the latest state last. */
  private persist() {
    if (this.broken) return;
    const raw = JSON.stringify(this.state);
    this.writes = this.writes.then(() => this.deps.save(raw)).catch(() => {});
  }
  /** For tests: all writes done. */
  settled() {
    return this.writes;
  }
}

// ---- The app's own instance ----

function mode(): Mode {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  const browser = readBrowser();
  return browser && isStandalone(browser) ? 'standalone' : 'browser';
}

function timeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && /^[A-Za-z0-9_+\-/]{1,40}$/.test(tz)) return tz;
  } catch {
    // An old engine without time zones.
  }
  return 'UTC';
}

async function send(install: string, events: AnalyticsEvent[], leaving: boolean): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(`${SERVER}/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ install, events }),
      signal: controller.signal,
      // The page may close right after: the browser finishes the request anyway.
      ...(leaving ? { keepalive: true } : {}),
    } as RequestInit);
    if (res.ok) return 'ok';
    // A batch the server can never take (bad or too big): no use keeping it.
    if (res.status === 400 || res.status === 413) return 'drop';
    return 'retry';
  } catch {
    return 'retry';
  } finally {
    clearTimeout(timer);
  }
}

const version = Constants.expoConfig?.version ?? '0';

export const analytics = new Analytics({
  load: () => AsyncStorage.getItem(STORAGE_KEY),
  save: (raw) => AsyncStorage.setItem(STORAGE_KEY, raw),
  send,
  now: () => Date.now(),
  env: () => ({ mode: mode(), version, tz: timeZone() }),
});

/**
 * A development build sends only to a server given on purpose (EXPO_PUBLIC_SERVER): fresh
 * browsers of tests and time travel must not spoil the real numbers.
 */
const SENDS_HERE = !__DEV__ || !!process.env.EXPO_PUBLIC_SERVER;

/** Starts the app's statistics once the store is read: sends on start, every 5 minutes and when leaving. */
export function startAnalytics(hadData: boolean): () => void {
  if (!SENDS_HERE) return () => {};
  analytics.start({ hadData });
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && analytics.outsideChange(e.newValue);
  const win = Platform.OS === 'web' && typeof window !== 'undefined' ? window : null;
  win?.addEventListener('storage', onStorage);
  let leftAt: number | null = null;
  const timer = setInterval(() => AppState.currentState === 'active' && analytics.flush(), FLUSH_EVERY);
  const sub = AppState.addEventListener('change', (s) => {
    if (s === 'active') {
      if (leftAt !== null && Date.now() - leftAt >= REOPEN_AFTER) analytics.track('app_open');
      leftAt = null;
      analytics.flush();
    } else if (leftAt === null) {
      leftAt = Date.now();
      analytics.flush(true);
    }
  });
  return () => {
    clearInterval(timer);
    sub.remove();
    win?.removeEventListener('storage', onStorage);
  };
}

/** Is sending statistics on (the switch in settings)? */
export function useStatsOn(): boolean {
  return !useSyncExternalStore(analytics.subscribe, () => analytics.off);
}
