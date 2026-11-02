// A person's avatar on the friends screens (спец-друзья 2.3): the profile's drawing, and
// - a badge in the lower right corner, 3 px over the edge: watered all (check), not all (drop),
//   cheered (cheer) or no data today (hourglass);
// - `pageRing` — a ring of the page color with a soft shadow (the profile's 88).
import { memo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { AvatarId } from '@/game/profile';
import type { Person } from '@/game/shared';
import { useStore } from '@/state/store';
import { Avatar } from '@/ui/avatars/Avatar';
import { elevation, Glyph, Icon, useColors } from '@/ui/ds';

export type AvatarBadge = 'check' | 'drop' | 'cheer' | 'hourglass' | null;

const badgeSize = (size: number) => (size >= 80 ? 30 : size >= 56 ? 24 : 20);

export const FriendAvatar = memo(function FriendAvatar({ person, size, badge = null, pageRing = 0, style }: {
  person: Pick<Person, 'avatar' | 'color'>;
  size: number;
  badge?: AvatarBadge;
  /** Width of a page-colored ring outside the circle; 0 — none. */
  pageRing?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const { night } = useStore();
  const b = badgeSize(size);
  const pic = Math.round(b * 0.78);
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      {pageRing > 0 && (
        <View
          style={[
            styles.abs,
            elevation(1, night),
            { left: -pageRing, top: -pageRing, width: size + 2 * pageRing, height: size + 2 * pageRing, borderRadius: size / 2 + pageRing, backgroundColor: c.page },
          ]}
        />
      )}
      <Avatar id={person.avatar as AvatarId} color={person.color} size={size} />
      {badge && (
        <View style={[styles.abs, styles.badge, { width: b, height: b, borderRadius: b / 2, right: -3, bottom: -3, backgroundColor: c.card }]}>
          {badge === 'hourglass' ? <Icon name="hourglass" size={Math.round(b * 0.62)} color={c.textSoft} strokeWidth={2} /> : <Glyph name={badge} size={pic} />}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  badge: { alignItems: 'center', justifyContent: 'center' },
});
