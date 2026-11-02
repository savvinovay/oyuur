// What the menu tells about (wave 5 spec 4.3): red numbers for what can be claimed (quests,
// achievements), calm dots for news without a number (the shop, friends). The grabber gets one
// dot when any of them is on and the menu is closed: red if something can be claimed, calm if not.
import { useStore } from '@/state/store';
import { menuQuests, QuestCaption } from '@/ui/quests/model';
import { useFriendsNews } from './friendsNews';

export interface MenuNews {
  quests: { count: number; caption: QuestCaption | null };
  /** Achievements ready to claim. */
  profile: number;
  /** Something new is affordable in the shop. */
  shop: boolean;
  /** The Friends and Leaders cards' captions and the dot on Friends (спец-друзья 10). */
  friends: ReturnType<typeof useFriendsNews>;
  /** Something can be claimed: a red number somewhere in the menu. */
  claim: boolean;
  any: boolean;
}

export function useMenuNews(): MenuNews {
  const { quests: q, today, achievements, shopNews } = useStore();
  const quests = menuQuests(q, today);
  const profile = achievements.filter((a) => a.state === 'ready').length;
  const friends = useFriendsNews();
  const claim = quests.count > 0 || profile > 0;
  return { quests, profile, shop: shopNews, friends, claim, any: claim || shopNews || friends.dot };
}
