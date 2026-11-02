// "Pull up for the menu" (spec 1.6): a dark pill above the grabber with a tail
// pointing at it. Shown on the first runs until the menu has been opened once.
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useStore } from '@/state/store';
import { elevation, fonts, Icon, motion, Txt } from '@/ui/ds';

const INK = '#1E1B16';

export function MenuHint({ visible, animations }: { visible: boolean; animations: boolean }) {
  const { t, night } = useStore();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(withTiming(visible ? 1 : 0, { duration: visible ? motion.base : motion.fast, easing: visible ? motion.ease.out : motion.ease.in }));
  }, [visible, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: animations ? 6 * (1 - shown.get()) : 0 }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, style]} accessibilityLiveRegion="polite">
      <View style={[styles.pill, elevation(2, night)]}>
        <Icon name="chevronUp" size={16} color="#FFFFFF" strokeWidth={2.6} />
        <Txt variant="small" color="#FFFFFF" style={styles.text} numberOfLines={1}>{t('menuHint')}</Txt>
        <View style={styles.tail} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: -46, alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: INK, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 14 },
  text: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
  tail: { position: 'absolute', bottom: -6, left: '50%', marginLeft: -7, width: 14, height: 14, borderRadius: 2, backgroundColor: INK, transform: [{ rotate: '45deg' }], zIndex: -1 },
});
