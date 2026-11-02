// What the Friends and Leaders menu cards say (спец-друзья 10): the captions by state and the
// calm dot on Friends — new friend requests or shared-tree offers, or a cheer today, that
// weren't seen yet. "Seen" is the newest server time of those at the moment Friends was
// opened from the menu, kept on the phone, so an unanswered request doesn't keep the dot.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import type { DayKey } from '@/game/dates';
import type { SharedTree } from '@/game/shared';
import { pluralForm, T } from '@/i18n';
import type { Account, FriendLists, Inbox } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { friendsWateredToday } from '@/ui/leaders/model';
import { useBoard } from '@/ui/leaders/useLeaders';

const SEEN_KEY = 'oyuur/friendsSeen';

let seenAt = 0;
let loaded = false;
/** Hooks to wake when the stored time is read or changes. */
const listeners = new Set<(at: number) => void>();
AsyncStorage.getItem(SEEN_KEY)
  .then((v) => {
    if (v) seenAt = Math.max(seenAt, Number(v) || 0);
  })
  .catch(() => {})
  .finally(() => {
    loaded = true;
    listeners.forEach((l) => l(seenAt));
  });

/** Server times (ms) of what the dot is about. */
export function newsTimes(p: { me: string; today: DayKey; inbox: Inbox; lists: FriendLists; shared: SharedTree[] }): number[] {
  return [
    ...p.inbox.cheers.filter((x) => x.day === p.today).map((x) => x.at),
    ...p.lists.incoming.map((x) => x.at),
    ...p.shared.filter((s) => s.status === 'proposed' && s.partner?.nick === p.me).map((s) => s.createdAt),
  ];
}

/** A card's line: short enough for a 320 phone, and the whole sentence for a screen reader. */
export interface Caption {
  text: string;
  a11y: string;
}

export function friendsCaption(t: T, p: { account: Account | null; today: DayKey; inbox: Inbox; lists: FriendLists }): Caption {
  if (!p.account) return { text: t('menuSignIn'), a11y: t('menuSignInA11y') };
  if (p.inbox.cheers.some((x) => x.day === p.today)) return { text: t('menuCheered'), a11y: t('menuCheeredA11y') };
  const requests = p.lists.incoming.length;
  if (requests > 0) {
    const form = pluralForm(t.lang, requests);
    return {
      text: t('menuNewRequests', { n: requests, word: t.dict.menuRequestWords[form] }),
      a11y: t('menuNewRequests', { n: requests, word: t.dict.menuRequestWordsA11y[form] }),
    };
  }
  const friends = p.lists.friends;
  if (friends.length === 0) return { text: t('menuInvite'), a11y: t('menuInviteA11y') };
  const counts = { a: friendsWateredToday(friends, p.today), b: friends.length };
  return { text: t('menuFriendsCap', counts), a11y: t('menuFriendsCapA11y', counts) };
}

export function useFriendsNews(): { friends: Caption | undefined; leaders: Caption | undefined; dot: boolean; markSeen(): void } {
  const { t, today } = useStore();
  const { ready, account, inbox, lists, shared } = useFriends();
  // null — not read from the phone yet: no dot until then.
  const [seen, setSeen] = useState<number | null>(loaded ? seenAt : null);
  useEffect(() => {
    listeners.add(setSeen);
    if (loaded) setSeen(seenAt);
    return () => {
      listeners.delete(setSeen);
    };
  }, []);
  const week = useBoard('week');
  const times = useMemo(
    () => (account ? newsTimes({ me: account.nick, today, inbox, lists, shared }) : []),
    [account, today, inbox, lists, shared],
  );
  if (!ready) return { friends: undefined, leaders: undefined, dot: false, markSeen: () => {} };

  let leaders: Caption;
  if (!account) leaders = { text: t('menuSignIn'), a11y: t('menuSignInA11y') };
  else if (lists.friends.length === 0) leaders = { text: t('menuInvite'), a11y: t('menuInviteA11y') };
  else {
    const mine = week?.ranked.find((r) => r.player.me);
    leaders = mine?.place
      ? { text: t('menuLeadersCap', { n: mine.place }), a11y: t('menuLeadersCapA11y', { n: mine.place }) }
      : { text: t('menuLeadersOpen'), a11y: t('menuLeadersOpenA11y') };
  }
  return {
    friends: friendsCaption(t, { account, today, inbox, lists }),
    leaders,
    dot: seen !== null && times.some((at) => at > seen),
    markSeen: () => {
      const at = Math.max(seenAt, ...times);
      if (at === seenAt) return;
      seenAt = at;
      listeners.forEach((l) => l(at));
      AsyncStorage.setItem(SEEN_KEY, String(at)).catch(() => {});
    },
  };
}
