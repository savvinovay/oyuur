// A short hint that follows a quest's tap to another screen, e.g. "Tap a tree → Move" over
// the forest (wave 5 spec 5.8): a dark pill under the top bar for 3 s. Mounted once in
// _layout; never takes a touch.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/state/store';
import { elevation, MAX_FONT_SCALE, PAGE_BAR, Txt, useColors, useMotionOn } from '@/ui/ds';

const listeners = new Set<(hint: { text: string; ms: number; id: number }) => void>();

/** Shows `text` over whatever screen is in front for `ms`. */
export function showQuestHint(text: string, ms = 3000) {
  const hint = { text, ms, id: Date.now() };
  listeners.forEach((l) => l(hint));
}

/** 8 under the page's title bar (Page, the forest's header: both 56), never over it. */
const TOP = PAGE_BAR + 8;

export function QuestHintHost() {
  const c = useColors();
  const { night } = useStore();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const [hint, setHint] = useState<{ text: string; ms: number; id: number } | null>(null);
  useEffect(() => {
    listeners.add(setHint);
    return () => {
      listeners.delete(setHint);
    };
  }, []);
  useEffect(() => {
    if (!hint) return;
    const id = setTimeout(() => setHint(null), hint.ms);
    return () => clearTimeout(id);
  }, [hint]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {hint && (
        <Animated.View
          key={hint.id}
          entering={FadeIn.duration(motionOn ? 200 : 160)}
          exiting={FadeOut.duration(200)}
          style={[styles.hint, { top: insets.top + TOP, backgroundColor: c.toast }, elevation(2, night)]}
          accessibilityLiveRegion="polite"
        >
          <Txt variant="bodyStrong" color="#FFFFFF" maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.text}>{hint.text}</Txt>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { position: 'absolute', alignSelf: 'center', maxWidth: 340, marginHorizontal: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22 },
  text: { textAlign: 'center' },
});
