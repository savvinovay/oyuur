// The leaderboard's data from the store and the friends' cache, for the screen and the menu card.
import { useMemo } from 'react';
import { Platform, Share } from 'react-native';
import type { Board } from '@/game/leaders';
import type { T } from '@/i18n';
import { inviteLink } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { buildBoard, BoardView, Player, playersOf } from './model';

/** Me and my friends as players; null without an account. */
export function usePlayers(): Player[] | null {
  const { trees, profile, t } = useStore();
  const { account, lists, shared } = useFriends();
  const you = t('leadersYou');
  return useMemo(
    () =>
      account
        ? playersOf({
            me: { nick: account.nick, name: profile.name, avatar: profile.avatar, color: profile.color },
            youName: you,
            myTrees: trees,
            friends: lists.friends,
            shared,
          })
        : null,
    [account, profile.name, profile.avatar, profile.color, you, trees, lists.friends, shared],
  );
}

export function useBoard(board: Board): BoardView | null {
  const players = usePlayers();
  const { today } = useStore();
  return useMemo(() => (players ? buildBoard(players, board, today) : null), [players, board, today]);
}

/** The system "Share" with the invite text and link; in a browser without it — the clipboard. */
export async function inviteFriend(t: T, nick: string): Promise<void> {
  const message = `${t('leadersInviteMessage', { nick })}\n${inviteLink(nick)}`;
  try {
    await Share.share({ message });
  } catch {
    if (Platform.OS === 'web') {
      const nav = (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator;
      await nav?.clipboard?.writeText(message).catch(() => {});
    }
  }
}
