// Settings-style groups (spec 4.7, frame 20): a white card of rows with a caption
// above. Rows have a colored square with a white icon, a label and a control.
import { Children, Fragment, isValidElement, ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useStore } from '@/state/store';
import { withAlpha } from './color';
import { Icon, IconName } from './Icon';
import { Txt } from './Text';
import { elevation, fonts } from './tokens';
import { useColors } from './useTheme';

export function Group({ title, children, style }: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const { night } = useStore();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={style}>
      {title ? (
        <Txt variant="caption" style={[styles.title, { color: c.textSoft }]} accessibilityRole="header">
          {title}
        </Txt>
      ) : null}
      {/* The shadow sits outside, the clipping inside: on iOS a clipped view loses its shadow. */}
      <View style={[styles.card, elevation(1, night), { backgroundColor: c.card }]}>
        <View style={styles.clip}>
          {rows.map((row, i) => (
            <Fragment key={row.key ?? i}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
              {row}
            </Fragment>
          ))}
        </View>
      </View>
    </View>
  );
}

export function Row({ label, icon, tint, right, below, onPress, labelColor, accessibilityLabel }: {
  label: string;
  /** White icon on a colored square (`tint`, see rowTint in tokens). */
  icon?: IconName; tint?: string;
  /** A control on the right: Toggle, a value… */
  right?: ReactNode;
  /** A control under the label, the full width of the row (theme and language segments). */
  below?: ReactNode;
  onPress?: () => void; labelColor?: string; accessibilityLabel?: string;
}) {
  const c = useColors();
  const body = (
    <>
      <View style={styles.line}>
        {icon && (
          <View style={[styles.square, { backgroundColor: tint ?? c.accent }]}>
            <Icon name={icon} size={20} color="#FFFFFF" strokeWidth={2.3} />
          </View>
        )}
        <Txt variant="bodyStrong" style={{ flex: 1, color: labelColor ?? c.text }} numberOfLines={2}>{label}</Txt>
        {right}
      </View>
      {below && <View style={styles.below}>{below}</View>}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: withAlpha(c.sunken, 0.5) }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.black, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 8, marginLeft: 6 },
  card: { borderRadius: 20 },
  clip: { borderRadius: 20, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth * 2, marginLeft: 60 },
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 },
  square: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  below: { marginTop: 12 },
});
