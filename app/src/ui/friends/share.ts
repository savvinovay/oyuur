// "Invite a friend" (спец-друзья 5.4): the system share sheet with the invite text and link.
// In a browser: navigator.share where there is one, otherwise the text is copied and a toast says so.
import { Platform, Share } from 'react-native';
import type { T } from '@/i18n';
import { inviteLink } from '@/net/api';
import { friendsToast } from './Toast';

export const inviteText = (t: T, nick: string) => `${t('frInviteMessage', { nick })}\n${inviteLink(nick)}`;

export async function shareInvite(t: T, nick: string): Promise<void> {
  const message = inviteText(t, nick);
  if (Platform.OS !== 'web') {
    await Share.share({ message }).catch(() => {});
    return;
  }
  const nav = typeof navigator === 'undefined' ? null : navigator;
  if (nav?.share) {
    try {
      await nav.share({ text: message });
      return;
    } catch (e) {
      // The person closed the sheet: nothing to do.
      if (e instanceof Error && e.name === 'AbortError') return;
    }
  }
  try {
    await nav?.clipboard?.writeText(message);
    friendsToast(t('frCopied'));
  } catch {
    friendsToast(t('frSendFailed'), null);
  }
}
