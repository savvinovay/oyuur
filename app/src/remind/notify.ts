// The web and iPhone have no reminders yet (web push — OYUUR-24): nothing to plan. Android — notify.android.ts.

export interface Permission {
  granted: boolean;
  /** The system question can still be shown (false — only the phone's settings help). */
  canAsk: boolean;
}

/** One notification ready for the phone. */
export interface Scheduled {
  key: string;
  at: Date;
  title: string;
  body: string;
  /** oyuur://tree/<id> — what a tap opens. */
  url: string;
  day: string;
  trees: string[];
}

export const remindersSupported = false;
export const CHANNEL_ID = 'reminders';
export async function ensureChannel(_name: string, _description: string): Promise<void> {}
export async function getPermission(): Promise<Permission> {
  return { granted: false, canAsk: false };
}
export async function askPermission(): Promise<Permission> {
  return { granted: false, canAsk: false };
}
export const openPhoneSettings = () => {};
export async function applyPlan(_items: Scheduled[]): Promise<void> {}
export async function dismissDone(_done: (treeId: string, day: string) => boolean): Promise<void> {}
export function onReminderTap(_open: (url: string) => void): () => void {
  return () => {};
}
export async function sendTest(_title: string, _body: string, _url: string): Promise<void> {}
