// One card of the shop's grid (spec 6.2, frames 15, 16, 24): a little scene with the tree
// (or the meadow with a birch), the name and a label — price, "Owned" or "Selected".
// A raised card on a lip; pressed, it sinks onto the lip like the menu's tiles.
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { ItemId } from '@/game/economy';
import { pluralForm } from '@/i18n';
import { useStore } from '@/state/store';
import { elevation, fonts, Glyph, Icon, MAX_FONT_SCALE, motion, Txt, useColors, useMotionOn, withAlpha } from '@/ui/ds';
import { shopCue } from './cues';
import { CardState, formatAcorns, meadowOfItem, priceOf, SHOWN_STAGE, skinOfItem, STAGE_SHOW_DAYS } from './model';
import { Preview } from './Preview';

const LIP = 3;
const INSET = 6;

export const ShopCard = memo(function ShopCard({ id, state, width, narrow, onPress }: {
  id: ItemId;
  state: CardState;
  width: number;
  /** 320-wide screens: a lower picture (116). */
  narrow: boolean;
  onPress(id: ItemId): void;
}) {
  const { night, t, shop } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const press = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (LIP - 1) * press.get() }] }));

  const skin = skinOfItem(id);
  const meadow = meadowOfItem(id);
  const name = skin ? t.dict.skinNames[skin] : t.dict.shopMeadowShort[meadow!];
  const price = priceOf(id);
  const previewW = width - INSET * 2;
  const previewH = narrow ? 116 : 132;
  const selected = state === 'selected';
  const label = state === 'selected' ? t('shopSelected') : t('shopOwned');
  const a11y = state === 'afford' || state === 'poor'
    ? t('shopPriceA11y', { name, n: formatAcorns(price, t.lang), word: t.dict.shopAcornWords[pluralForm(t.lang, price)] })
    : `${name}, ${label}`;

  return (
    <Pressable
      onPressIn={() => press.set(withTiming(1, { duration: motion.press }))}
      onPressOut={() => press.set(motionOn ? withSpring(0, motion.spring.press) : withTiming(0, { duration: motion.still }))}
      onPress={() => {
        shopCue('select');
        onPress(id);
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[styles.card, { width }]}
    >
      <View style={[styles.lip, { backgroundColor: c.cardLip }]} />
      <Animated.View style={[styles.face, elevation(1, night), { backgroundColor: c.card }, faceStyle]}>
        <Preview
          meadow={meadow ?? shop.meadow}
          night={night}
          width={previewW}
          height={previewH}
          radius={15}
          tree={skin ? { skin, days: STAGE_SHOW_DAYS[SHOWN_STAGE], seed: 'shop' } : { skin: 'birch', days: STAGE_SHOW_DAYS.young, seed: 'meadow' }}
          fill={0.82}
          pictureWidth={meadow ? 0.46 : undefined}
          horizon={meadow ? 0.55 : 0.66}
          feet={meadow ? 0.8 : 0.84}
          sun={!!meadow}
          weather={!!meadow}
          seed={meadow ? 11 : 5}
          style={styles.preview}
        />
        <Txt variant="bodyStrong" numberOfLines={1} style={styles.name}>{name}</Txt>
        <View style={styles.labelRow}>
          {state === 'afford' || state === 'poor' ? (
            <View style={[styles.pill, { backgroundColor: c.sunken }]}>
              <Glyph name="acorn" size={20} />
              <Txt
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={[styles.price, { color: state === 'poor' ? withAlpha(c.textSoft, 0.7) : c.text }]}
              >
                {formatAcorns(price, t.lang)}
              </Txt>
            </View>
          ) : selected ? (
            <View style={[styles.pill, { backgroundColor: c.accent }]}>
              <Glyph name="check" size={20} />
              <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.owned, { color: c.onAccent }]}>{label}</Txt>
            </View>
          ) : (
            <View style={[styles.pill, { backgroundColor: c.accentSoft }]}>
              <Icon name="check" size={18} color={c.accentInk} strokeWidth={2.8} />
              <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.owned, { color: c.accentInk }]}>{label}</Txt>
            </View>
          )}
        </View>
      </Animated.View>
      {selected && <View style={[styles.ring, { borderColor: c.accent }]} pointerEvents="none" />}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { paddingBottom: LIP },
  lip: { position: 'absolute', left: 0, right: 0, top: LIP, bottom: 0, borderRadius: 20 },
  face: { borderRadius: 20, padding: INSET, paddingBottom: 12 },
  preview: {},
  name: { fontFamily: fonts.black, fontSize: 16, lineHeight: 22, marginTop: 9, marginLeft: 6 },
  labelRow: { flexDirection: 'row', marginTop: 6, marginLeft: 4 },
  pill: { height: 28, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 6, paddingRight: 11 },
  price: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] },
  owned: { fontFamily: fonts.black, fontSize: 14, lineHeight: 20 },
  ring: { position: 'absolute', left: -3, right: -3, top: -3, bottom: 0, borderRadius: 23, borderWidth: 3 },
});
