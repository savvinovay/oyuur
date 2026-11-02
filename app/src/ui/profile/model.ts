// What the profile page shows, as pure functions (wave 5 spec, 11.1–11.4, 11.6): the order of
// the medals, their progress, the words under them, dates and big numbers.
import type { AchievementId, AchievementView } from '@/game/achievements';
import type { DayKey } from '@/game/dates';
import type { Habit, Tree, Visibility } from '@/game/tree';
import { Lang, pluralForm, T } from '@/i18n';

/** 0..1: how far a medal not earned yet has come (a claimed or ready one is whole). */
export const progressOf = (v: AchievementView) => (v.state === 'locked' ? Math.min(1, v.value / v.goal) : 1);

const STATE_RANK = { ready: 0, claimed: 1, locked: 2 } as const;

/**
 * The grid's order (11.2): ready to claim → claimed (by the day, earliest first) → with
 * progress (the bigger share first) → not started; ties keep the ACHIEVEMENTS order.
 */
export function awardOrder(views: AchievementView[]): AchievementView[] {
  const at = new Map(views.map((v, i) => [v.id, i]));
  return [...views].sort((a, b) => {
    const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
    if (rank !== 0) return rank;
    if (a.state === 'claimed') {
      const day = (a.claimedOn ?? '').localeCompare(b.claimedOn ?? '');
      if (day !== 0) return day;
    }
    if (a.state === 'locked') {
      const share = progressOf(b) - progressOf(a);
      if (share !== 0) return share;
    }
    return (at.get(a.id) ?? 0) - (at.get(b.id) ?? 0);
  });
}

/** Shows "48/100" under a medal and a progress ring: only goals bigger than one, once started. */
export const showsProgress = (v: AchievementView) => v.state === 'locked' && v.goal > 1 && v.value > 0;

/** What the progress counts, for "52 more days to go". */
export const awardUnit = (id: AchievementId): 'days' | 'habits' => (id === 'trees3' || id === 'trees10' ? 'habits' : 'days');

export function awardLeftText(t: T, v: AchievementView): string {
  const n = Math.max(0, v.goal - v.value);
  return t('awardLeft', { n, word: t.dict.awardUnits[awardUnit(v.id)][pluralForm(t.lang, n)] });
}

/** "1 240" / "1,240". */
export function formatCount(n: number, lang: Lang): string {
  const sep = lang === 'ru' ? ' ' : ',';
  const digits = String(Math.max(0, Math.round(n)));
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** "12 октября" / "Oct 12"; the year only when it isn't this one. */
export function formatDay(t: T, day: DayKey, today: DayKey): string {
  const [y, m, d] = day.split('-').map(Number);
  const vars = { d, m: t.dict.meMonths[m - 1], y };
  return y === Number(today.slice(0, 4)) ? t('meDate', vars) : t('meDateYear', vars);
}

/** The day the first tree was planted; null — no trees. */
export function firstPlanted(trees: Tree[]): DayKey | null {
  return trees.reduce<DayKey | null>((first, x) => (first === null || x.plantedOn < first ? x.plantedOn : first), null);
}

/** A habit's visibility is its current tree's; `overrides` — changes not yet in the trees. */
export const visibilityOf = (h: Habit, overrides: Record<string, Visibility> = {}): Visibility =>
  overrides[h.current.id] ?? h.current.visibility;

/** "Friends see 3 of 5 trees". */
export function friendsSeeText(t: T, habits: Habit[], overrides: Record<string, Visibility> = {}): string {
  const m = habits.length;
  const n = habits.filter((h) => visibilityOf(h, overrides) === 'friends').length;
  return t('meFriendsSee', { n, m, word: t.dict.meOfTreeWords[pluralForm(t.lang, m)] });
}
