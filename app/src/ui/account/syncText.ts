// The forest in the account in words (OYUUR-30, 31; design/oyuur-29/спец.md 7, 8.2, 11): what the
// saving row says, "until 28 November", "yesterday at 21:05", counts with their word forms.
// Pure functions, tested in __tests__/syncText.test.ts.
import { pluralForm, T } from '@/i18n';
import type { Sync, SyncState } from '@/state/syncContract';

const DAY = 24 * 60 * 60 * 1000;
/** "Keep only the account's forest" keeps the phone's forest this long (spec 5.1). */
export const LOCAL_COPY_DAYS = 30;

/** "13 деревьев" / "13 trees". */
export const treesText = (t: T, n: number) => `${n} ${t.dict.treeWords[pluralForm(t.lang, n)]}`;
/** The tree word alone, for texts with the number elsewhere ("Убрать {n} {trees}"). */
export const treeWord = (t: T, n: number) => t.dict.treeWords[pluralForm(t.lang, n)];
/** "3 изменения" / "3 changes". */
export const changesText = (t: T, n: number) => t('accSyncChanges', { n, changes: t.dict.accChangeWords[pluralForm(t.lang, n)] });

/** "14:20" or "2:20 PM". */
export function timeText(d: Date, h24: boolean): string {
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, '0');
  return h24 ? `${h}:${mm}` : `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Midnight of the day `ms` falls on, in the phone's time zone. */
const dayStart = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
/** 0 — the same day as now, 1 — yesterday, … (calendar days, not 24-hour spans). */
const daysAgo = (at: number, now: number) => Math.round((dayStart(now) - dayStart(at)) / DAY);

/** A date in full: "28 ноября" / "Nov 28". */
export function dateText(t: T, ms: number): string {
  const d = new Date(ms);
  const m = t.dict.meMonths[d.getMonth()];
  return t.lang === 'ru' ? `${d.getDate()} ${m}` : `${m} ${d.getDate()}`;
}

/** A short date: "28 окт" / "Oct 28". */
function shortDate(t: T, ms: number): string {
  const d = new Date(ms);
  const m = t.dict.months[d.getMonth()];
  return t.lang === 'ru' ? `${d.getDate()} ${m}` : `${m} ${d.getDate()}`;
}

/** When the forest was saved (spec 8.2): "только что", "в 14:20", "вчера в 21:05", "28 окт в 9:10". */
export function savedWhen(t: T, at: number, now: number, h24: boolean): string {
  if (now - at < 60_000) return t('accSyncJustNow');
  const time = timeText(new Date(at), h24);
  const ago = daysAgo(at, now);
  if (ago <= 0) return t('accSyncAt', { time });
  if (ago === 1) return t('accSyncYesterdayAt', { time });
  return t('accSyncDayAt', { date: shortDate(t, at), time });
}

/** The day only, for "from another device · yesterday": "сегодня", "вчера", "28 окт". */
export function dayWhen(t: T, at: number, now: number): string {
  const ago = daysAgo(at, now);
  if (ago <= 0) return t('accFoundToday');
  if (ago === 1) return t('accFoundYesterday');
  return shortDate(t, at);
}

/** Watering days for the "late waterings" toast: "28 окт, 29 окт" (DayKey "2026-10-28"). */
export function daysText(t: T, days: string[]): string {
  return days
    .map((key) => {
      const [y, m, d] = key.split('-').map(Number);
      return shortDate(t, new Date(y, m - 1, d).getTime());
    })
    .join(', ');
}

export interface SyncRowText {
  title: string;
  sub: string;
  /** A small third line: why the session ended ("the password was changed on another device"). */
  hidden: string | null;
}

/** "13 деревьев, 5 под замком" / "13 trees, 5 locked"; without locked ones just the trees. */
export function lockedCountText(t: T, trees: number, locked: number): string {
  const all = trees === 0 ? t('accSyncEmpty') : treesText(t, trees);
  return locked > 0 && trees > 0 ? t('accSyncLockedCount', { trees: all, n: locked }) : all;
}

/** The saving row's two lines (table of spec 7). */
export function syncRowText(
  t: T,
  s: Pick<Sync, 'state' | 'pending' | 'lastOkAt' | 'trees' | 'locked'> & Partial<Pick<Sync, 'sessionWhy' | 'errorWhy'>>,
  now: number,
  h24: boolean,
): SyncRowText {
  switch (s.state) {
    case 'saving':
      // Before the first round is decided nothing waits as a change yet: the trees, then.
      return { title: t('accSyncSaving'), sub: s.pending > 0 ? changesText(t, s.pending) : s.trees === 0 ? t('accSyncEmpty') : treesText(t, s.trees), hidden: null };
    case 'offline':
      return {
        title: t('accSyncOffline'),
        sub: s.pending > 0 ? t('accSyncOfflineSub', { n: s.pending, changes: t.dict.accChangeWords[pluralForm(t.lang, s.pending)] }) : t('accSyncOfflineNothing'),
        hidden: null,
      };
    case 'error':
      // The chest in the account won't open: honest, and nothing here is lost (spec Т4.4). "Try
      // again" really looks at it afresh (state/vault.ts readFrom).
      if (s.errorWhy === 'vault') return { title: t('accSyncErrorVaultTitle'), sub: t('accSyncErrorVault'), hidden: null };
      return { title: t('accSyncError'), sub: t('accSyncErrorSub'), hidden: null };
    case 'session':
      // The password changed on another device: said first, and what to do.
      if (s.sessionWhy === 'password') return { title: t('accSyncSessionPwTitle'), sub: t('accSyncSessionPwSub'), hidden: null };
      return { title: t('accSyncSession'), sub: t('accSyncSessionSub'), hidden: null };
    case 'locked':
      // OYUUR-31: hidden trees not in the account's chest yet — "Lock" opens the sheet (spec 5.2).
      return { title: t('accSyncLocked'), sub: t('accSyncLockedSub'), hidden: null };
    default: {
      const trees = lockedCountText(t, s.trees, s.locked);
      const sub = s.lastOkAt == null ? trees : t('accSyncSavedSub', { trees, when: savedWhen(t, s.lastOkAt, now, h24) });
      return { title: t('accSyncSaved'), sub, hidden: null };
    }
  }
}

/** The forest isn't all in the account yet (spec 5.3): "remove the forest" waits — for the network, or for the lock. */
export const unsaved = (s: Pick<Sync, 'state' | 'pending'>) => s.pending > 0 || s.state === 'offline' || s.state === 'error';

/** Hidden trees are only on this device (OYUUR-31): removing the forest from it would lose them. */
export const hiddenOnlyHere = (s: Pick<Sync, 'state'>) => s.state === 'locked';

/** Rows of the saving row that a tap saves now (spec 7): "saved" and "offline". */
export const tapSaves = (state: SyncState) => state === 'saved' || state === 'offline';
