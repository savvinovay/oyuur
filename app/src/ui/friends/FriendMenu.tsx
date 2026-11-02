// The profile's "⋯" menu (спец-друзья 6.7, frame 19): 292 wide under the button, from its upper
// right corner with the `pop` spring (no animations — fades in); a light shade; a tap outside closes.
import { ReactNode, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/state/store';
import { elevation, fonts, Glyph, Icon, IconName, motion, Txt, useColors, useMotionOn, withAlpha } from '@/ui/ds';

export function FriendMenu({ sharedOpen, onShared, onReport, onBlock, onRemove, onClose }: {
  /** There is a shared tree with this friend: "Shared tree" opens it; otherwise "Suggest a shared tree". */
  sharedOpen: boolean;
  onShared(): void;
  onReport(): void;
  onBlock(): void;
  onRemove(): void;
  onClose(): void;
}) {
  const { t, night } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const shown = useSharedValue(0);
  const scale = useSharedValue(motionOn ? 0.92 : 1);
  useEffect(() => {
    shown.set(withTiming(1, { duration: motion.fast }));
    if (motionOn) scale.set(withSpring(1, motion.spring.pop));
  }, [shown, scale, motionOn]);
  const menuStyle = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scale: scale.get() }] }));
  const shadeStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));

  const item = (picture: ReactNode, label: string, color: string, onPress: () => void, last = false) => (
    <>
      <Pressable
        onPress={onPress}
        accessibilityRole="menuitem"
        style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.divider }]}
      >
        {picture}
        <Txt numberOfLines={1} style={[styles.label, { color }]}>{label}</Txt>
      </Pressable>
      {!last && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
    </>
  );
  const icon = (name: IconName, color: string) => <Icon name={name} size={22} color={color} />;

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(night ? '#06061A' : '#241808', night ? 0.3 : 0.12) }, shadeStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('close')} accessibilityRole="button" />
      </Animated.View>
      <Animated.View
        accessibilityRole="menu"
        style={[styles.menu, elevation(3, night), { top: insets.top + 6 + 44 + 4, backgroundColor: c.card, transformOrigin: 'top right' }, menuStyle]}
      >
        <View style={styles.clip}>
          {item(<Glyph name="friends" size={22} />, t(sharedOpen ? 'frMenuSharedOpen' : 'frMenuShared'), c.text, onShared)}
          {item(icon('flag', c.text), t('frReport'), c.text, onReport)}
          {item(icon('noSign', c.text), t('frBlock'), c.text, onBlock)}
          {item(icon('userMinus', c.dangerText), t('frRemove'), c.dangerText, onRemove, true)}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 20 },
  menu: { position: 'absolute', right: 16, width: 292, maxWidth: '86%', borderRadius: 16 },
  clip: { borderRadius: 16, overflow: 'hidden' },
  row: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 },
  label: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, flexShrink: 1 },
  divider: { height: StyleSheet.hairlineWidth * 2 },
});
