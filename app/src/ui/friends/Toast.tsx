// The friends screens' toast (спец-друзья 4.5, 5.2, 6.7): a dark pill near the bottom for 3 s.
// `friendsToast(text)` can be called before leaving a screen: the screen underneath (the list
// after "Remove") has its own <FriendsToast /> and shows it. A new toast replaces the old one.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, Glyph, GlyphName, motion, Txt, useColors } from '@/ui/ds';

interface ToastData {
  id: number;
  text: string;
  glyph: GlyphName | null;
}

const LIFE = 3000;
let current: ToastData | null = null;
let nextId = 1;
const listeners = new Set<(t: ToastData | null) => void>();

export function friendsToast(text: string, glyph: GlyphName | null = 'check') {
  current = { id: nextId++, text, glyph };
  listeners.forEach((l) => l(current));
  const id = current.id;
  setTimeout(() => {
    if (current?.id === id) current = null;
  }, LIFE);
}

/** `lift` — how far above the bottom inset (over a sticky button). */
export function FriendsToast({ lift = 24 }: { lift?: number }) {
  const [toast, setToast] = useState<ToastData | null>(current);
  useEffect(() => {
    listeners.add(setToast);
    return () => {
      listeners.delete(setToast);
    };
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {toast && <Pill key={toast.id} toast={toast} lift={lift} />}
    </View>
  );
}

function Pill({ toast, lift }: { toast: ToastData; lift: number }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.set(
      withTiming(1, { duration: motion.base, easing: motion.ease.out }, () => {
        'worklet';
        shown.set(withDelay(LIFE - motion.base - motion.fast, withTiming(0, { duration: motion.fast, easing: motion.ease.in })));
      }),
    );
  }, [shown]);
  const style = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: 12 * (1 - shown.get()) }] }));
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.toast, { bottom: insets.bottom + lift, backgroundColor: c.toast }, style]}
    >
      {toast.glyph && <Glyph name={toast.glyph} size={20} />}
      <Txt numberOfLines={2} style={styles.text}>{toast.text}</Txt>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  text: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: '#FFFFFF', flexShrink: 1 },
});
