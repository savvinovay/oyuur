// "Kind of tree" from the forest card's "⋯" (wave 5 spec 8.1, frame 34): every kind as this
// very tree at its stage, three in a row. A tap on an owned kind changes the tree at once
// (a puff of the new leaves) and the sheet closes 400 ms later; a kind not bought yet opens
// its window in the shop. Only growing trees get here.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CATALOG } from '@/game/economy';
import { growthDays, SKINS, Tree } from '@/game/tree';
import { useStore } from '@/state/store';
import { Txt, useColors } from '@/ui/ds';
import { shopCue } from '@/ui/shop/cues';
import { KindTile } from '@/ui/shop/KindTile';
import { openShopItem } from '@/ui/shop/links';
import { ModalSheet } from '@/ui/shop/ModalSheet';
import { treeItem } from '@/ui/shop/model';

const COLS = 3;
const GAP = 10;
/** The sheet closes this long after a change, so the puff is seen. */
const CLOSE_AFTER = 400;

export function KindSheet({ tree, onClosed }: { tree: Tree; onClosed(): void }) {
  const { t } = useStore();
  return (
    <ModalSheet onClosed={onClosed} label={t('shopTreeKind')}>
      {(close) => <KindGrid tree={tree} close={close} />}
    </ModalSheet>
  );
}

function KindGrid({ tree, close }: { tree: Tree; close(): void }) {
  const { t, skins, trees, setTreeSkin } = useStore();
  const c = useColors();
  // The tree as it is now (a change shows at once).
  const live = trees.find((x) => x.id === tree.id) ?? tree;
  const [puff, setPuff] = useState<{ skin: string; run: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const days = growthDays(live);

  const pick = (skin: Tree['skin']) => {
    if (!skins.includes(skin)) {
      shopCue('tap');
      close();
      openShopItem(treeItem(skin));
      return;
    }
    if (skin === live.skin) return;
    if (!setTreeSkin(live.id, skin)) return;
    shopCue('skinChange');
    setPuff({ skin, run: Date.now() });
    clearTimeout(timer.current);
    timer.current = setTimeout(close, CLOSE_AFTER);
  };

  const rows: Tree['skin'][][] = [];
  for (let i = 0; i < SKINS.length; i += COLS) rows.push(SKINS.slice(i, i + COLS));
  const priceOf = (skin: Tree['skin']) => (skins.includes(skin) ? 0 : CATALOG.find((x) => x.id === treeItem(skin))?.price ?? 0);
  const subtitle = live.nickname ? `${live.nickname} · ${live.name}` : live.name;
  return (
    <View style={styles.body}>
      <Txt variant="title2" accessibilityRole="header">{t('shopTreeKind')}</Txt>
      <Txt variant="small" color={c.textSoft} numberOfLines={1} style={styles.sub}>{subtitle}</Txt>
      <View style={styles.grid} role="radiogroup">
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((skin) => (
              <KindTile
                key={skin}
                skin={skin}
                days={days}
                seed={live.id}
                selected={skin === live.skin}
                price={priceOf(skin)}
                sky={80}
                fill={0.8}
                puff={puff?.skin === skin ? puff.run : 0}
                onPress={() => pick(skin)}
              />
            ))}
            {/* The last row keeps the tiles' width. */}
            {Array.from({ length: COLS - row.length }, (_, i) => <View key={`gap${i}`} style={styles.gap} />)}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 4 },
  sub: { marginTop: 2 },
  grid: { marginTop: 14, gap: GAP },
  row: { flexDirection: 'row', gap: GAP },
  gap: { flex: 1 },
});
