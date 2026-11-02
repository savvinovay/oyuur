// A settings row with a soft second line under the label (Row of ui/ds has none): "Sign out ·
// Your forest comes back when you sign in", "New recovery code · If you lost the old one".
import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useStore } from '@/state/store';
import { fonts, Icon, IconName, MAX_FONT_SCALE, Txt, useColors, withAlpha } from '@/ui/ds';
import { softOnCard } from './look';

export function HintRow({ icon, tint, label, hint, labelColor, onPress, right, chevron, testID }: {
  icon: IconName; tint: string; label: string; hint?: string; labelColor?: string; onPress(): void; right?: ReactNode;
  /** A ">" on the right: the row opens a screen. */
  chevron?: boolean;
  testID?: string;
}) {
  const c = useColors();
  const { night } = useStore();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      testID={testID}
      style={({ pressed }) => [rowStyles.row, pressed && { backgroundColor: withAlpha(c.sunken, 0.5) }]}
    >
      <View style={[rowStyles.square, { backgroundColor: tint }]}>
        <Icon name={icon} size={20} color="#FFFFFF" strokeWidth={2.3} />
      </View>
      <View style={rowStyles.text}>
        <Txt variant="bodyStrong" color={labelColor ?? c.text} numberOfLines={2}>{label}</Txt>
        {hint ? <Txt style={[rowStyles.hint, { color: softOnCard(c, night) }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{hint}</Txt> : null}
      </View>
      {right}
      {chevron ? <Icon name="chevronRight" size={20} color={c.textSoft} /> : null}
    </Pressable>
  );
}

export const rowStyles = StyleSheet.create({
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  square: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0 },
  hint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginTop: 1 },
});
