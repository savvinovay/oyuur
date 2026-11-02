// The words of a reminder (OYUUR-23, design/oyuur-33/спец.md 8): «Можно полить „Не курить“», «Пора полить
// 3 дерева», «Полить можно до 3:00», «Дерево „Дубок“ погибнет в 3:00». Pure: a planned reminder and the dictionary in, the title and the text out.
import { pluralForm, T } from '@/i18n';
import { hourText } from '@/ui/watering/format';
import type { Reminder, RemindTree } from './plan';

export interface ReminderText {
  title: string;
  body: string;
}

/** How many names a notification lists before "and 2 more". */
const LISTED = 3;

export const nameOf = (tree: Pick<RemindTree, 'label'>, t: T): string => tree.label ?? t('rmMyTree');

/** "Не курить, Бег и Дубок" / "Не курить, Бег, Дубок и ещё 2". */
export function listText(trees: RemindTree[], t: T): string {
  const names = trees.map((x) => nameOf(x, t));
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= LISTED) return t('rmAnd', { list: names.slice(0, -1).join(', '), last: names[names.length - 1] });
  return t('rmAndMore', { list: names.slice(0, LISTED).join(', '), n: names.length - LISTED });
}

const treesWord = (n: number, t: T) => t.dict.treeWords[pluralForm(t.lang, n)];

/** The game day ends at 3:00: the hour the "last chance" names. */
const DAY_END = 3;

export function reminderText(r: Pick<Reminder, 'kind' | 'trees'>, t: T): ReminderText {
  const [first] = r.trees;
  const n = r.trees.length;
  if (r.kind === 'open') {
    // A tree open all day could be watered since the morning: "time to", not "can be".
    const anytime = r.trees.every((x) => x.anytime);
    if (n === 1) {
      const body = first.days > 0
        ? t('rmOpenStreak', { n: first.days, word: t.dict.dayWords[pluralForm(t.lang, first.days)], next: first.days + 1 })
        : t('rmOpenFirst');
      return { title: t(anytime ? 'rmTimeOne' : 'rmOpenOne', { name: nameOf(first, t) }), body };
    }
    return { title: t(anytime ? 'rmTimeMany' : 'rmOpenMany', { n, word: treesWord(n, t) }), body: listText(r.trees, t) };
  }
  const time = hourText(DAY_END, t.lang);
  // The trees are most urgent first: the first one dies if anyone does — the title says so (the lock screen shows titles).
  const title = !first.dies ? t('rmLastTitle', { time }) : first.label === null ? t('rmLastDiesMine', { time }) : t('rmLastDies', { name: first.label, time });
  if (n === 1) return { title, body: first.dies ? t('rmLastOneDies') : t('rmLastOne', { name: nameOf(first, t) }) };
  return { title, body: t(first.dies ? 'rmLastManyDies' : 'rmLastMany', { list: listText(r.trees, t) }) };
}
