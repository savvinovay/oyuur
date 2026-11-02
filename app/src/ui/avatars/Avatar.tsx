// An avatar (wave 5 spec, 12.1): a drawing on a circle of its color, the drawing filling the
// whole circle (what goes past the edge is cut by the circle). Shared by the profile and the
// friends' screens. react-native-svg, no Skia: a list of friends may show dozens at once.
// `ring` — a white ring outside the circle (dimmed at night) with a soft shadow, as on the
// profile; it doesn't take room, the box stays `size`.
import { memo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg from 'react-native-svg';
import { AVATARS, AvatarId } from '@/game/profile';
import { useStore } from '@/state/store';
import { elevation } from '@/ui/ds/tokens';
import { AVATAR_ART } from './avatars';
import { avatarColor } from './colors';

export interface AvatarProps {
  id: AvatarId;
  /** Index of the circle's color, 0..AVATAR_COLORS-1 (colors.ts). */
  color: number;
  size: number;
  ring?: boolean;
  /** The theme; by default the app's. */
  night?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** The ring's width: 4 on the profile's 96 and 88, thinner on small avatars. */
export const ringWidth = (size: number) => Math.max(2, Math.round(size / 24));

export const Avatar = memo(function Avatar({ id, color, size, ring = false, night, style }: AvatarProps) {
  const store = useStore();
  const dark = night ?? store.night;
  const art = AVATAR_ART[AVATARS.includes(id) ? id : 'fox'];
  const r = ringWidth(size);
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      {ring && (
        <View
          style={[
            styles.ring,
            elevation(2, dark),
            { left: -r, top: -r, width: size + 2 * r, height: size + 2 * r, borderRadius: size / 2 + r, backgroundColor: dark ? 'rgba(255,255,255,0.22)' : '#FFFFFF' },
          ]}
        />
      )}
      <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(color, dark) }]}>
        <Svg width={size} height={size} viewBox="0 0 48 48">
          {art}
        </Svg>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  ring: { position: 'absolute' },
  circle: { overflow: 'hidden' },
});
