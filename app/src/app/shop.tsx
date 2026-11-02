// The shop (wave 5 spec, section 6, frames 15, 16, 24): "Trees | Meadows", a grid of cards
// two in a row and "How to earn" under it. A card opens the item window (ui/shop/ItemSheet),
// which is also where buying happens. `?tab=meadows` opens the meadows, `?item=tree:maple`
// an item's window at once. Opening the shop tells the store what is affordable now is seen
// (the shop's dot on the main screen goes).
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ItemId } from '@/game/economy';
import { useStore } from '@/state/store';
import { Page, Segmented } from '@/ui/ds';
import { EarnCard } from '@/ui/shop/EarnCard';
import { ItemSheet } from '@/ui/shop/ItemSheet';
import { cardState, parseItem, SHOP_MEADOWS, SHOP_TREES, ShopTab } from '@/ui/shop/model';
import { ShopCard } from '@/ui/shop/ShopCard';
import { WalletChip } from '@/ui/shop/WalletChip';

/** The tab is remembered while the app runs (spec 6.1). */
let lastTab: ShopTab = 'trees';
const GAP = 12;
const SIDE = 16;

export default function Shop() {
  const params = useLocalSearchParams<{ tab?: string; item?: string }>();
  const { t, wallet, shop, shopSeen } = useStore();
  const insets = useSafeAreaInsets();
  const { width: windowW } = useWindowDimensions();
  // The grid's own width (a desktop browser shows the app as a column, with a scroll bar).
  const [gridW, setGridW] = useState(() => Math.min(windowW, 460) - SIDE * 2);
  const narrow = gridW + SIDE * 2 < 360;
  const cardW = Math.floor((gridW - GAP) / 2);

  const fromLink = parseItem(params.item);
  const [tab, setTabState] = useState<ShopTab>(() =>
    params.tab === 'meadows' || fromLink?.startsWith('meadow:') ? 'meadows' : params.tab === 'trees' || fromLink ? 'trees' : lastTab,
  );
  const setTab = (next: ShopTab) => {
    lastTab = next;
    setTabState(next);
  };
  const [open, setOpen] = useState<ItemId | null>(fromLink);
  // A new link while the shop is open (from the forest's "Kind of tree", say).
  useEffect(() => {
    if (!fromLink) return;
    setOpen(fromLink);
    setTab(fromLink.startsWith('meadow:') ? 'meadows' : 'trees');
    router.setParams({ item: undefined });
  }, [fromLink]);

  // Seen on every visit: the dot is about news, and these are no longer news.
  useFocusEffect(useCallback(() => shopSeen(), [shopSeen]));

  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const earnAt = useRef(0);
  const toEarn = () => setTimeout(() => scroll.current?.scrollTo({ y: earnAt.current - 12, animated: true }), 250);

  const ids = tab === 'trees' ? SHOP_TREES : SHOP_MEADOWS;
  return (
    <Page title={t('shopTitle')} right={<WalletChip value={wallet.acorns} />}>
      <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}>
        <Segmented
          value={tab}
          onChange={setTab}
          height={44}
          options={[
            { value: 'trees', label: t('shopTabTrees'), glyph: 'forest' },
            { value: 'meadows', label: t('shopTabMeadows'), glyph: 'plot' },
          ]}
        />
        <View style={styles.grid} onLayout={(e) => setGridW(Math.floor(e.nativeEvent.layout.width))}>
          {ids.map((id) => (
            <ShopCard key={id} id={id} state={cardState(shop, wallet, id)} width={cardW} narrow={narrow} onPress={setOpen} />
          ))}
        </View>
        <View onLayout={(e) => (earnAt.current = e.nativeEvent.layout.y)} style={styles.earn}>
          <EarnCard />
        </View>
      </ScrollView>
      {open && <ItemSheet key={open} id={open} onClosed={() => setOpen(null)} onEarn={toEarn} />}
    </Page>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: SIDE, paddingTop: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 16 },
  earn: { marginTop: 20 },
});
