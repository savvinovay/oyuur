// Where the shop's links lead outside the shop. Screens of other parts of wave 5
// (the quests sheet on the main screen — developer А, the profile — developer Г)
// are not in this branch yet: their addresses are kept here, in one place.
import { Href, router } from 'expo-router';
import type { ItemId } from '@/game/economy';
import type { Skin } from '@/game/tree';

/** The shop, straight on an item's window (`?item=tree:maple`). */
export const openShopItem = (item: ItemId) => router.push({ pathname: '/shop', params: { item } } as unknown as Href);

export const openShop = () => router.push('/shop' as string as Href);

/** The new-habit screen with this kind chosen: back to it if it is open under the shop. */
export const plantKind = (skin: Skin) => router.dismissTo({ pathname: '/new', params: { skin } } as unknown as Href);

/** The main screen opens its quests sheet from this parameter. */
export const openQuests = () => router.dismissTo({ pathname: '/', params: { sheet: 'quests' } } as unknown as Href);

/** The profile page. */
export const openProfile = () => router.push('/profile' as string as Href);
