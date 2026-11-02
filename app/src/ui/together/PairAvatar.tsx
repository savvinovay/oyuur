// Two half avatars in one circle for a shared tree (спец-друзья 2.3): mine on the left,
// the friend's on the right, each pushed 22 % outward, a seam of the card color between.
// When both watered today a green ring goes round. react-native-svg avatars, no Skia.
import { memo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { AvatarId } from '@/game/profile';
import type { Person } from '@/game/shared';
import { useStore } from '@/state/store';
import { Avatar } from '@/ui/avatars/Avatar';
import { elevation, useColors } from '@/ui/ds';

/** Each half is pushed outward by this share of the size, the seam is 2.4 px on 64. */
const SHIFT = 0.22;
const SEAM = 2.4 / 64;

export const PairAvatar = memo(function PairAvatar({ me, friend, size, both = false, ring = true, style }: {
  me: Pick<Person, 'avatar' | 'color'>;
  friend: Pick<Person, 'avatar' | 'color'> | null;
  size: number;
  /** Both watered today: an accent ring. */
  both?: boolean;
  /** A white ring with a soft shadow (as on the frames); off on tight rows. */
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { night } = useStore();
  const c = useColors();
  const half = size / 2;
  const shift = SHIFT * size;
  const rim = Math.max(2, Math.round(size / 22));
  const seam = Math.max(1.5, SEAM * size);
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      {(ring || both) && (
        <View
          style={[
            styles.abs,
            ring && elevation(1, night),
            {
              left: -rim,
              top: -rim,
              width: size + 2 * rim,
              height: size + 2 * rim,
              borderRadius: half + rim,
              backgroundColor: both ? c.accent : night ? 'rgba(255,255,255,0.22)' : '#FFFFFF',
            },
          ]}
        />
      )}
      <View style={[styles.circle, { width: size, height: size, borderRadius: half }]}>
        <View style={[styles.half, { width: half, height: size }]}>
          <Avatar id={me.avatar as AvatarId} color={me.color} size={size} style={{ marginLeft: -shift }} />
        </View>
        <View style={[styles.half, { left: half, width: half, height: size }]}>
          {friend && <Avatar id={friend.avatar as AvatarId} color={friend.color} size={size} style={{ marginLeft: -half + shift }} />}
        </View>
        <View style={[styles.abs, { left: half - seam / 2, top: 0, width: seam, height: size, backgroundColor: c.card }]} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  circle: { overflow: 'hidden' },
  half: { position: 'absolute', top: 0, left: 0, overflow: 'hidden' },
});
