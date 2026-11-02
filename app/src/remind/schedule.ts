// The plan, ready for the phone (OYUUR-23): words, what a tap opens. Pure.
import type { T } from '@/i18n';
import type { Scheduled } from './notify';
import { Reminder, tapTarget } from './plan';
import { reminderText } from './text';

export const treeUrl = (id: string) => `oyuur://tree/${id}`;

/** oyuur://tree/<id> → the app's own route. */
export function routeOf(url: string): string | null {
  const m = /^oyuur:\/\/tree\/([^/?#]+)$/.exec(url);
  return m ? `/tree/${m[1]}` : null;
}

export function toScheduled(plan: Reminder[], t: T): Scheduled[] {
  return plan.map((r) => ({ key: r.key, at: r.at, ...reminderText(r, t), url: treeUrl(tapTarget(r) ?? ''), day: r.day, trees: r.trees.map((x) => x.id) }));
}
