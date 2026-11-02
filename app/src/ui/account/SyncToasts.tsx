// What the sync tells once (design/oyuur-29/спец.md 8.3, frame 04): "Forests merged: 13 trees ·
// Saved to @sasha_t", late waterings that brought a tree back, the forest erased on another
// device. A dark toast at the top for 2.5–4 s, never takes a touch. The notice is cleared as soon
// as it is shown. Mounted once over every screen (_layout.tsx). Other account news use the same toast
// (showAccountToast): "Only me" in "Who sees your trees", over the sheet and the page's title bar.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '@/state/store';
import { useSync } from '@/state/sync';
import { elevation, fonts, Icon, IconName, MAX_FONT_SCALE, Txt, useColors, useMotionOn } from '@/ui/ds';
import { daysText, treeWord } from './syncText';

interface Toast {
  id: number;
  icon: IconName;
  iconColor: string;
  title: string;
  sub: string | null;
  ms: number;
}

const listeners = new Set<(toast: Toast) => void>();

/** The same toast for other account news: a title and a smaller line under it. */
export function showAccountToast(o: { icon: IconName; iconColor: string; title: string; sub?: string; ms?: number }) {
  const toast: Toast = { id: Date.now(), icon: o.icon, iconColor: o.iconColor, title: o.title, sub: o.sub ?? null, ms: o.ms ?? 4000 };
  listeners.forEach((l) => l(toast));
}

export function SyncToasts() {
  const c = useColors();
  const { t, night } = useStore();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const { notice, clearNotice } = useSync();
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    listeners.add(setToast);
    return () => {
      listeners.delete(setToast);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const id = Date.now();
    if (notice.kind === 'merged') {
      setToast({ id, icon: 'cloudCheck', iconColor: '#8BE39B', title: t('accMerged', { n: notice.trees, trees: treeWord(t, notice.trees) }), sub: t('accMergedSub', { nick: notice.nick }), ms: 2500 });
    } else if (notice.kind === 'late') {
      setToast({ id, icon: 'dropLine', iconColor: '#9AD3FF', title: t('accLateWaterings', { days: daysText(t, notice.days) }), sub: null, ms: 4000 });
    } else {
      setToast({ id, icon: 'cloudOff', iconColor: '#FFCF4D', title: t('accWipedElsewhere'), sub: null, ms: 4000 });
    }
    clearNotice();
  }, [notice, clearNotice, t]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.ms);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {toast && (
        <Animated.View
          key={toast.id}
          entering={motionOn ? SlideInUp.springify().damping(18) : FadeIn.duration(160)}
          exiting={FadeOut.duration(200)}
          style={[styles.toast, { top: insets.top + 8, backgroundColor: c.toast }, elevation(2, night)]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <Icon name={toast.icon} size={24} color={toast.iconColor} />
          <View style={styles.text}>
            <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.title}>{toast.title}</Txt>
            {toast.sub ? <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.sub}>{toast.sub}</Txt> : null}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    alignSelf: 'center',
    maxWidth: 420,
  },
  text: { flex: 1 },
  title: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: '#FFFFFF' },
  sub: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 16, color: 'rgba(255,255,255,0.75)' },
});
