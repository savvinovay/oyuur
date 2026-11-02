// The watering reminders on the phone (OYUUR-23): plans them again after every change of the trees (a
// watering, a planting, a new watering time, a forest merged from the account), of the reminder settings
// or the language, at a new game day and whenever the app comes back; takes away a shown reminder once its
// trees are watered or its day is over; a tap on one opens its tree (oyuur://tree/<id>). Android only (notify.android.ts).
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { isGrowing } from '@/game/tree';
import { useStore } from '@/state/store';
import { applyPlan, dismissDone, ensureChannel, onReminderTap, remindersSupported } from './notify';
import { planReminders } from './plan';
import { prefsLoaded, useRemindPrefs } from './prefs';
import { routeOf, toScheduled } from './schedule';

export function ReminderHost() {
  return remindersSupported ? <Host /> : null;
}

function Host() {
  const { trees, t, today, settings } = useStore();
  const prefs = useRemindPrefs();
  // The app came back (maybe after days, or in another time zone): plan from the real clock again.
  const [wake, setWake] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setWake((n) => n + 1));
    return () => sub.remove();
  }, []);

  useEffect(() => onReminderTap((url) => {
    const route = routeOf(url);
    // The navigator mounts in the same pass as this host: the opening tap waits for it.
    if (route) setTimeout(() => router.push(route as never), 0);
  }), []);

  const { dayOffset, minuteOffset } = settings;
  const plan = useMemo(
    () => (prefsLoaded() ? planReminders({ trees, prefs, now: new Date(), dayOffset, minuteOffset }) : null),
    // `today` and `wake`: a new game day or the app coming back plans from the clock again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trees, prefs, dayOffset, minuteOffset, today, wake],
  );

  useEffect(() => {
    if (!plan) return;
    const timer = setTimeout(() => {
      ensureChannel(t('rmChannel'), t('rmChannelAbout'))
        .then(() => applyPlan(toScheduled(plan, t)))
        .catch((error) => console.warn('Oyuur reminders: no channel', error));
    }, 600);
    return () => clearTimeout(timer);
  }, [plan, t]);

  // A reminder already on the screen goes once it says nothing any more: its trees are watered (here or
  // on another phone), have died or are locked in, or its game day is over.
  useEffect(() => {
    const byId = new Map(trees.map((x) => [x.id, x]));
    void dismissDone((id, day) => {
      const tree = byId.get(id);
      return !tree || day < today || !isGrowing(tree) || tree.checkins.includes(day);
    });
  }, [trees, today, wake]);

  return null;
}
