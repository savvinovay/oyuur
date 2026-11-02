// A tile of one kind of tree (spec 8.1, 8.2): the tree on a square of sky with a strip of
// meadow, its name under it. The chosen one has a green ring and a check; one not bought yet
// is pale and has a lock and its price on a pill over the sky — the name stays (wave 5 fixes:
// a price alone didn't say what the tree is). A tap on an owned kind may play a
// puff of the kind's leaves over the picture (`puff` — a new number each time).
import { memo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import { pluralForm } from '@/i18n';
import type { Skin } from '@/game/tree';
import { useStore } from '@/state/store';
import { elevation, fonts, Glyph, Icon, MAX_FONT_SCALE, scene, Txt, useColors } from '@/ui/ds';
import { TreeThumb } from '@/ui/TreeArt';
import { Burst, KIND_LEAVES } from './Burst';
import { formatAcorns } from './model';

const PAD = 4;
const BORDER = 3;

export const KindTile = memo(function KindTile({ skin, days, seed, selected, price, sky, fill = 0, big = false, puff = 0, onPress }: {
  skin: Skin;
  days: number;
  seed: string;
  selected: boolean;
  /** Not bought: the price shows with a lock. 0 — owned. */
  price: number;
  /** Height of the sky square. */
  sky: number;
  /** Picture fill for small trees (TreeArt `fill`). */
  fill?: number;
  /** The planting screen's look: the name in bold, a bigger check. */
  big?: boolean;
  puff?: number;
  onPress(): void;
}) {
  const { palette, night, t } = useStore();
  const c = useColors();
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const width = Math.round(e.nativeEvent.layout.width);
    if (width !== w) setW(width);
  };
  const locked = price > 0;
  const name = t.dict.skinNames[skin];
  const priceText = formatAcorns(price, t.lang);
  const a11y = locked
    ? t('shopLockedA11y', { name, n: priceText, word: t.dict.shopAcornWords[pluralForm(t.lang, price)] })
    : name;
  // The picture is 300 × 320 with the feet at 312: it fills the sky but never its width.
  const inner = Math.max(0, w - (PAD + BORDER) * 2);
  const size = Math.round(Math.min(inner - 4, ((sky - 6) * 300) / 320));
  return (
    <Pressable
      onPress={onPress}
      role="radio"
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      aria-checked={selected}
      aria-selected={selected}
      accessibilityLabel={a11y}
      style={[styles.tile, elevation(1, night), { backgroundColor: c.card, borderColor: selected ? c.accent : 'transparent' }]}
      onLayout={onLayout}
    >
      <View style={[styles.sky, { height: sky, backgroundColor: c.skyCard }]}>
        <View style={[styles.ground, { backgroundColor: (night ? scene.meadow.night : scene.meadow.day).meadow[2] }]} />
        <View style={[styles.tree, locked && styles.pale]}>
          {size > 0 && <TreeThumb days={days} palette={palette} night={night} size={size} skin={skin} seed={seed} fill={fill} placeholder />}
        </View>
        {locked && (
          // Clear of the check when the kind is chosen (a tree planted before the kind became paid).
          <View style={[styles.price, selected && styles.priceLeft, { backgroundColor: c.glass }]}>
            <Icon name="lock" size={12} color={c.textSoft} />
            <Glyph name="acorn" size={13} />
            <Txt variant="caption" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.priceText}>{priceText}</Txt>
          </View>
        )}
        {w > 0 && <Burst run={puff} x={inner / 2} y={sky * 0.45} colors={KIND_LEAVES[skin]} count={10} spread={[20, 30]} out={400} fallTime={300} leaf={9} />}
      </View>
      <Txt
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[styles.name, big ? styles.nameBig : styles.nameSmall, { color: locked ? c.textSoft : c.text }]}
      >
        {name}
      </Txt>
      {selected && <Glyph name="check" size={big ? 24 : 22} style={big ? styles.checkBig : styles.check} />}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: { flex: 1, borderRadius: 20, borderWidth: BORDER, padding: PAD, paddingBottom: 0, minWidth: 0 },
  sky: { borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' },
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 12 },
  tree: { marginBottom: 2 },
  pale: { opacity: 0.55 },
  name: { textAlign: 'center' },
  nameSmall: { fontFamily: fonts.bold, fontSize: 12, lineHeight: 16, paddingVertical: 8 },
  nameBig: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, paddingVertical: 5 },
  price: { position: 'absolute', top: 5, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 2, height: 22, borderRadius: 11, paddingLeft: 6, paddingRight: 7 },
  priceLeft: { alignSelf: 'flex-start', left: 5 },
  priceText: { fontFamily: fonts.black, fontSize: 12, lineHeight: 15, fontVariant: ['tabular-nums'] },
  check: { position: 'absolute', top: 6, right: 6 },
  checkBig: { position: 'absolute', top: -10, right: -10 },
});
