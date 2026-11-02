// A white pill with a glyph and a short line: forest totals, facts of a tree (spec 4.7).
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useStore } from '@/state/store';
import { Glyph, GlyphName } from './Glyph';
import { Icon, IconName } from './Icon';
import { Txt } from './Text';
import { elevation, fonts } from './tokens';
import { useColors } from './useTheme';

export function Pill({ label, glyph, icon, size = 'm', compact = false, style }: {
  label: string; glyph?: GlyphName; icon?: IconName;
  /** m — 32 high, s — 28 (facts). */
  size?: 'm' | 's';
  /** Narrow screens (320 px): a smaller glyph, text and padding, so a row of pills fits on one line. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const { night } = useStore();
  const h = size === 'm' ? 32 : 28;
  const pic = compact ? 16 : 18;
  return (
    <View
      style={[
        styles.pill,
        elevation(1, night),
        { height: h, borderRadius: h / 2, gap: compact ? 4 : 6, paddingHorizontal: compact ? 8 : size === 'm' ? 12 : 10, backgroundColor: c.card },
        style,
      ]}
    >
      {glyph && <Glyph name={glyph} size={pic} />}
      {icon && <Icon name={icon} size={pic} color={c.textSoft} />}
      <Txt numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: compact ? 12 : 13, lineHeight: 18, color: c.text }}>{label}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center' },
});
