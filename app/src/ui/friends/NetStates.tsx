// Network states of the friends screens (спец-друзья 11.2, frames 12–14):
// - skeleton rows while the first answer is awaited (only opacity breathes: cheap on Android),
//   with "Taking a while… Try again" after 10 s;
// - the "no internet · data from 14:05" pill over cached data, then a green "Updated" for 2 s;
// - "Couldn't load" with a retry when there is no cache and no answer.
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import type { NetStatus } from '@/state/friends';
import { useStore } from '@/state/store';
import { Button, buttonLook, elevation, fonts, Icon, motion, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { clock } from './model';

const LONG_WAIT = 10_000;

/** What the pill says: offline over cached data, or "Updated" for 2 s after coming back. */
export function useNetPill(status: NetStatus, fetchedAt: number): 'offline' | 'updated' | null {
  const [updated, setUpdated] = useState(false);
  const wasOffline = useRef(false);
  useEffect(() => {
    if (status === 'offline') {
      wasOffline.current = true;
      setUpdated(false);
      return;
    }
    if (status === 'ok' && wasOffline.current) {
      wasOffline.current = false;
      setUpdated(true);
      const id = setTimeout(() => setUpdated(false), 2000);
      return () => clearTimeout(id);
    }
  }, [status]);
  if (status === 'offline' && fetchedAt > 0) return 'offline';
  return updated ? 'updated' : null;
}

/** The pill under the bar; in the flow, so the content below moves down by 42. */
export function NetPill({ kind, fetchedAt }: { kind: 'offline' | 'updated'; fetchedAt: number }) {
  const { t, night } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  return (
    <Animated.View
      entering={motionOn ? FadeIn.duration(200) : undefined}
      exiting={motionOn ? FadeOut.duration(motion.fast) : undefined}
      style={styles.pillRow}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.pill, elevation(2, night), { backgroundColor: kind === 'offline' ? c.offline : c.accent }]}>
        <Icon name={kind === 'offline' ? 'wifiOff' : 'check'} size={18} color="#FFFFFF" />
        <Txt numberOfLines={1} style={styles.pillText}>
          {kind === 'offline' ? t('frOfflineData', { time: clock(fetchedAt) }) : t('frUpdated')}
        </Txt>
      </View>
    </Animated.View>
  );
}

/** Opacity 0.5 ↔ 1, 1200 ms each way, forever (still without animations). */
function useBreath() {
  const motionOn = useMotionOn();
  const v = useSharedValue(1);
  useEffect(() => {
    if (!motionOn) return;
    v.set(withRepeat(withTiming(0.5, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true));
    return () => cancelAnimation(v);
  }, [v, motionOn]);
  return useAnimatedStyle(() => ({ opacity: v.get() }));
}

/** A friend row's stand-in: card 84, circle 64, three bars. */
export function SkeletonRows({ count = 4, compact = false }: { count?: number; compact?: boolean }) {
  const c = useColors();
  const { night } = useStore();
  const breath = useBreath();
  const av = compact ? 40 : 64;
  return (
    <Animated.View style={[styles.skeletons, breath]} accessibilityLabel="…">
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[styles.skRow, elevation(1, night), { height: compact ? 72 : 84, backgroundColor: c.card, opacity: [1, 0.8, 0.6, 0.4][i] ?? 0.4 }]}
        >
          <View style={{ width: av, height: av, borderRadius: av / 2, backgroundColor: c.sunken }} />
          <View style={styles.skBars}>
            <View style={[styles.bar, { width: 110, height: 14, backgroundColor: c.sunken }]} />
            <View style={[styles.bar, { width: 170, height: 10, backgroundColor: c.sunken }]} />
            <View style={[styles.bar, { width: 130, height: 10, backgroundColor: c.sunken }]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

/** "Taking a while…" and a retry, once the first answer is 10 s late. */
export function LongWait({ onRetry }: { onRetry: () => void }) {
  const { t } = useStore();
  const c = useColors();
  const [long, setLong] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setLong(true), LONG_WAIT);
    return () => clearTimeout(id);
  }, []);
  if (!long) return null;
  return (
    <View style={styles.long}>
      <Txt variant="small" color={c.textSoft}>{t('frLoadingLong')}</Txt>
      <Button title={t('frRetry')} variant="text" size="s" cue="select" onPress={onRetry} />
    </View>
  );
}

/** Nothing cached and no answer (frame 14). */
export function ErrorState({ onRetry }: { onRetry: () => Promise<void> }) {
  const { t } = useStore();
  const c = useColors();
  return (
    <View style={styles.error}>
      <View style={[styles.errorCircle, { backgroundColor: c.sunken }]}>
        <Icon name="wifiOff" size={52} color={c.textSoft} />
      </View>
      <Txt variant="title2" style={styles.center}>{t('frLoadFailed')}</Txt>
      <Txt style={[styles.errorText, { color: c.textSoft }]}>{t('frLoadFailedText')}</Txt>
      <RetryButton onRetry={onRetry} />
    </View>
  );
}

/** M secondary "Try again", 220 wide; its arrow turns while retrying (800 ms a turn). */
function RetryButton({ onRetry }: { onRetry: () => Promise<void> }) {
  const { t } = useStore();
  const c = useColors();
  const look = buttonLook('secondary', c);
  const [busy, setBusy] = useState(false);
  const turn = useSharedValue(0);
  useEffect(() => {
    if (busy) turn.set(withRepeat(withTiming(1, { duration: 800, easing: Easing.linear }), -1, false));
    else {
      cancelAnimation(turn);
      turn.set(0);
    }
  }, [busy, turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 360}deg` }] }));
  const press = async () => {
    if (busy) return;
    cue('select');
    setBusy(true);
    try {
      await onRetry();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={t('frRetry')} accessibilityState={{ busy }} style={styles.retry}>
      <View style={[styles.retryLip, { backgroundColor: look.lip ?? look.face }]} />
      <View style={[styles.retryFace, { backgroundColor: look.face }]}>
        <Animated.View style={spin}>
          <Icon name="refresh" size={20} color={look.ink} />
        </Animated.View>
        <Txt style={[styles.retryText, { color: look.ink }]}>{t('frRetry')}</Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pillRow: { alignItems: 'center', marginTop: 8, height: 34 },
  pill: { height: 34, borderRadius: 17, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  pillText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, color: '#FFFFFF', flexShrink: 1 },
  skeletons: { gap: 10 },
  skRow: { borderRadius: 20, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  skBars: { gap: 8 },
  bar: { borderRadius: 7 },
  long: { alignItems: 'center', marginTop: 16, gap: 4 },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 },
  errorCircle: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  center: { textAlign: 'center' },
  errorText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  retry: { width: 220, height: 52, marginTop: 24 },
  retryLip: { position: 'absolute', left: 0, right: 0, top: 4, height: 48, borderRadius: 14 },
  retryFace: { height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  retryText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
});
