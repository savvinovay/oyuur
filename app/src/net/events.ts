// Usage statistics (OYUUR-26): the one list of events and their fields. The server keeps the
// same list (server/src/analytics.js, EVENTS) and drops anything not on it.
// Never put here names of habits or trees, nicks or any text a person typed: only yes/no,
// small numbers and the shop's own item ids.
import type { DayKey } from '@/game/dates';
import type { ItemId } from '@/game/economy';

/** Each event and its own extra fields. */
export interface EventProps {
  /** The first start with statistics on. existing — the phone already had trees (an update); optIn — turned back on. */
  first_launch: { existing?: boolean; optIn?: boolean };
  /** The app started or came back after a while in the background. */
  app_open: {};
  /** A new tree. seed — from a dead tree's seed (generation 2+). */
  plant: { seed: boolean; generation: number };
  water: {};
  /** A missed day covered by a chance; days — how many such days at once. */
  chance_used: { days: number };
  /** days — how many days it grew. */
  tree_died: { days: number };
  lock_in: { days: number };
  signup: {};
  login: { recover?: boolean };
  friend_request: {};
  friend_added: {};
  shared_propose: {};
  shared_accept: {};
  purchase: { item: ItemId };
  install_card_shown: {};
  install_card_closed: {};
}

export type EventName = keyof EventProps;

/** The names, in the order of the list above (the tests compare them with the server's). */
export const EVENT_NAMES: EventName[] = [
  'first_launch', 'app_open', 'plant', 'water', 'chance_used', 'tree_died', 'lock_in', 'signup', 'login',
  'friend_request', 'friend_added', 'shared_propose', 'shared_accept', 'purchase', 'install_card_shown', 'install_card_closed',
];

/** Where the app runs: a browser tab, the web version from the iPhone Home Screen, or the app. */
export type Mode = 'browser' | 'standalone' | 'android' | 'ios';

/** One event as it is sent. */
export interface AnalyticsEvent {
  /** Random, per event: a batch sent twice is counted once. */
  id: string;
  name: EventName;
  /** The phone's time, ms. */
  at: number;
  /** The day by the phone's own calendar. */
  day: DayKey;
  /** Days since the first launch (0 — the first day). */
  dayN: number;
  /** The time zone, like "Asia/Yakutsk". */
  tz: string;
  mode: Mode;
  /** The app's version, like "1.0". */
  v: string;
  lang: string;
  props?: Record<string, boolean | number | string>;
}
