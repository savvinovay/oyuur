// The quiet badge on the menu's "Settings" tile (design/oyuur-29/спец.md 7, frame 11): an amber
// circle with a crossed-out cloud when the forest hasn't reached the account for over 24 hours
// (or the session ended). Pops in once; goes as soon as the forest is saved.
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useStore } from '@/state/store';
import { useSync } from '@/state/sync';
import { colorsFor, Icon, motion } from '@/ui/ds';
import { ACCOUNT_TINT } from './look';

export function SyncBadge({ animations }: { animations: boolean }) {
  const { needsAttention } = useSync();
  if (!needsAttention) return null;
  return <Badge animations={animations} />;
}

function Badge({ animations }: { animations: boolean }) {
  const { night, t } = useStore();
  const c = colorsFor(night);
  const scale = useSharedValue(animations ? 0 : 1);
  useEffect(() => {
    if (animations) scale.set(withSpring(1, motion.spring.bounce));
    // Once, when it appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLabel={t('accSyncBadgeA11y')}
      style={[styles.badge, { backgroundColor: ACCOUNT_TINT.attention, borderColor: c.sheet }, style]}
      testID="sync-badge"
    >
      <Icon name="cloudOff" size={16} color="#FFFFFF" strokeWidth={2.4} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 26 across with its 3 px ring, at the tile's top right corner, like the red number.
  badge: { position: 'absolute', top: -7, right: -7, width: 26, height: 26, borderRadius: 13, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
});
