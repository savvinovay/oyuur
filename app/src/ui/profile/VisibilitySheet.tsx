// "Who sees your trees" (wave 5 spec, 11.6): every habit's tree with a switch "visible to
// friends". Private trees (the default for "quit" habits) are off. A switch works at once.
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Habit, Visibility } from '@/game/tree';
import { useStore } from '@/state/store';
import { Button, elevation, fonts, Toggle, Txt, useColors } from '@/ui/ds';
import { ThumbBox } from '@/ui/forest/sheet/ThumbBox';
import { visibilityOf } from './model';
import { ProfileSheet } from './ProfileSheet';

export interface VisibilitySheetProps {
  open: boolean;
  onClose(): void;
  habits: Habit[];
  /** Changes the store doesn't have yet (see profile.tsx). */
  overrides: Record<string, Visibility>;
  /** Sets the visibility of a habit's current tree. */
  onChange(treeId: string, visibility: Visibility): void;
}

export function VisibilitySheet({ open, onClose, habits, overrides, onChange }: VisibilitySheetProps) {
  const { t, night } = useStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <ProfileSheet
      open={open}
      onRequestClose={onClose}
      footer={<Button title={t('meDone')} size="l" variant="secondary" onPress={onClose} />}
    >
      <View style={[styles.body, { paddingBottom: insets.bottom > 0 ? 4 : 8 }]}>
        <Txt variant="title2" accessibilityRole="header">{t('meWhoSees')}</Txt>
        <Txt variant="small" color={c.textSoft} style={styles.note}>{t('meWhoSeesNote')}</Txt>
        {/* The shadow outside, the clipping inside: on iOS a clipped view loses its shadow. */}
        <View style={[styles.card, elevation(1, night), { backgroundColor: c.card }]}>
          <View style={styles.clip}>
            {habits.map((h, i) => {
              const tree = h.current;
              const on = visibilityOf(h, overrides) === 'friends';
              const title = tree.nickname ?? tree.name;
              return (
                <View key={h.lineageId}>
                  {i > 0 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
                  <View style={styles.row}>
                    <ThumbBox habit={h} kind="list" />
                    <View style={styles.text}>
                      <Txt variant="bodyStrong" numberOfLines={1}>{title}</Txt>
                      {tree.nickname !== null && (
                        <Txt variant="caption" color={c.textSoft} numberOfLines={1} style={styles.habit}>{tree.name}</Txt>
                      )}
                    </View>
                    <Toggle
                      value={on}
                      onChange={(v) => onChange(tree.id, v ? 'friends' : 'private')}
                      accessibilityLabel={t('meVisibleA11y', { name: title })}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </ProfileSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 4 },
  note: { marginTop: 4, fontFamily: fonts.bold },
  card: { borderRadius: 20, marginTop: 16 },
  clip: { borderRadius: 20, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth * 2, marginLeft: 76 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, minHeight: 68 },
  text: { flex: 1, minWidth: 0 },
  habit: { fontFamily: fonts.bold },
});
