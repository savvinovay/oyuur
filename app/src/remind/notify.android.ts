// Android: the planned reminders become local notifications of the phone (expo-notifications), without a
// server or Firebase. The phone keeps them through a restart; the app plans them again after every change
// of the trees, of the settings and when it opens (ReminderHost.tsx).
// Without the "exact alarms" permission (not asked: Google Play keeps it for alarm clocks) Android may
// show a reminder late when the phone sleeps deeply (minutes, on some phones up to about an hour), so the
// texts never promise an exact time left ("You can water until 3:00", not "2 hours left").
import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';
import type { Permission, Scheduled } from './notify';

export const remindersSupported = true;

export const CHANNEL_ID = 'reminders';
/** "Send a test reminder": not part of the plan, a new plan leaves it be. */
const TEST_ID = 'test';

// While the app is open a reminder still shows on top, quietly.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** The channel "Reminders": its name follows the app's language. */
export async function ensureChannel(name: string, description: string): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name,
    description,
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#4CC764',
    showBadge: false,
  });
}

export async function getPermission(): Promise<Permission> {
  const p = await Notifications.getPermissionsAsync();
  return { granted: p.granted, canAsk: p.canAskAgain };
}

/** The system question (Android 13+; older phones allow at once). */
export async function askPermission(): Promise<Permission> {
  const p = await Notifications.requestPermissionsAsync();
  return { granted: p.granted, canAsk: p.canAskAgain };
}

export const openPhoneSettings = () => Linking.openSettings().catch(() => {});

// What this run of the app has put on the phone. Only in memory: a force-stopped app loses its alarms,
// so every start plans again (a handful of calls).
let applied: string | null = null;
let queue: Promise<void> = Promise.resolve();

/** Puts exactly these notifications on the phone (the old ones go). One at a time, the latest wins. */
export function applyPlan(items: Scheduled[]): Promise<void> {
  const sig = JSON.stringify(items.map((x) => [x.key, x.at, x.title, x.body, x.url]));
  queue = queue.then(async () => {
    if (sig === applied) return;
    try {
      for (const old of await Notifications.getAllScheduledNotificationsAsync()) {
        if (old.identifier !== TEST_ID) await Notifications.cancelScheduledNotificationAsync(old.identifier);
      }
      for (const x of items) {
        await Notifications.scheduleNotificationAsync({
          identifier: x.key,
          content: { title: x.title, body: x.body, data: { url: x.url, day: x.day, trees: x.trees }, color: '#4CC764' },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: x.at, channelId: CHANNEL_ID },
        });
      }
      applied = sig;
    } catch (error) {
      // Tried again with the next change or the next opening.
      applied = null;
      console.warn('Oyuur reminders were not planned', error);
    }
  });
  return queue;
}

/** Takes away the shown reminders that say nothing any more: every tree in them is `done` for their game day. */
export async function dismissDone(done: (treeId: string, day: string) => boolean): Promise<void> {
  try {
    for (const n of await Notifications.getPresentedNotificationsAsync()) {
      const data = n.request.content.data as { day?: unknown; trees?: unknown } | undefined;
      const trees = Array.isArray(data?.trees) ? (data.trees as string[]) : [];
      if (typeof data?.day === 'string' && trees.length && trees.every((id) => done(id, data.day as string))) {
        await Notifications.dismissNotificationAsync(n.request.identifier);
      }
    }
  } catch {
    // Nothing to do: the person can swipe it away.
  }
}

/** A tap on a reminder — also the one that started the app. Returns the unsubscribe. */
export function onReminderTap(open: (url: string) => void): () => void {
  const handle = (r: Notifications.NotificationResponse | null) => {
    const url = r?.notification.request.content.data?.url;
    if (typeof url !== 'string' || r?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    Notifications.clearLastNotificationResponse();
    open(url);
  };
  handle(Notifications.getLastNotificationResponse());
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}

/** "Send a test reminder" (Settings → Reminders): the same channel, in 5 seconds. Not part of the plan. */
export async function sendTest(title: string, body: string, url: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: TEST_ID,
    content: { title, body, data: { url }, color: '#4CC764' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL_ID },
  });
}
