// The wallet's pill on the shop's pages (spec 2.2, 2.6): an acorn and the number, on glass.
// The main screen's own wallet (with the flights into it) is developer А's; this one only
// shows a number. `compact` — the item window's smaller one.
// TODO(merge): the shop's header may use А's `Wallet` instead.
import { ComponentRef, forwardRef } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useStore } from '@/state/store';
import { elevation, fonts, Glyph, MAX_FONT_SCALE, Txt, useColors } from '@/ui/ds';
import { formatAcorns } from './model';

export const WalletChip = forwardRef<ComponentRef<typeof View>, { value: number; compact?: boolean; style?: StyleProp<ViewStyle> }>(function WalletChip(
  { value, compact = false, style },
  ref,
) {
  const { night, t } = useStore();
  const c = useColors();
  const text = formatAcorns(value, t.lang);
  const big = !compact && value >= 100000;
  return (
    <View
      ref={ref}
      collapsable={false}
      accessible
      accessibilityLabel={t('shopWalletA11y', { n: text })}
      style={[
        compact ? styles.compact : styles.chip,
        elevation(1, night),
        { backgroundColor: c.glass, borderColor: night ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.9)' },
        big && { paddingRight: 10 },
        style,
      ]}
    >
      <Glyph name="acorn" size={compact ? 20 : 22} />
      <Txt
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={1}
        style={{ fontFamily: fonts.black, fontSize: compact ? 15 : big ? 14 : 16, lineHeight: compact ? 20 : 22, fontVariant: ['tabular-nums'], color: c.text }}
      >
        {text}
      </Txt>
    </View>
  );
});

const styles = StyleSheet.create({
  chip: { height: 34, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 7, paddingRight: 12, minWidth: 66 },
  compact: { height: 30, borderRadius: 15, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 6, paddingRight: 10 },
});
