// Network states of the leaderboard (спец-друзья 11.2): the "offline · data from 14:05" pill
// (then a green "Updated" for 2 s), "taking a while…" after 10 s of loading, and the error
// with "Try again" whose arrows spin while retrying.
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { NetStatus } from '@/state/friends';
import { useStore } from '@/state/store';
import { cue } from '@/ui/feedback';
import { elevation, fonts, Icon, motion, Txt, useColors, useMotionOn } from '@/ui/ds';

/** "14:05"; another day — "27.10 14:05". */
export function clockText(ms: number, now = Date.now()): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  const time = `${two(d.getHours())}:${two(d.getMinutes())}`;
  return new Date(now).toDateString() === d.toDateString() ? time : `${two(d.getDate())}.${two(d.getMonth() + 1)} ${time}`;
}

/** The pill under the header: offline with the data's time, then "Updated" for 2 s. */
export function NetPill({ status, fetchedAt }: { status: NetStatus; fetchedAt: number }) {
  const c = useColors();
  const { t, night } = useStore();
  const motionOn = useMotionOn();
  const offline = status === 'offline' && fetchedAt > 0;
  const [updated, setUpdated] = useState(false);
  const wasOffline = useRef(offline);
  useEffect(() => {
    if (wasOffline.current && status === 'ok') {
      setUpdated(true);
      const timer = setTimeout(() => setUpdated(false), 2000);
      wasOffline.current = false;
      return () => clearTimeout(timer);
    }
    if (offline) wasOffline.current = true;
  }, [status, offline]);
  const show = offline || updated;
  if (!show) return null;
  return (
    <PillBody key={offline ? 'offline' : 'updated'} motionOn={motionOn} color={offline ? c.offline : c.accent} night={night}>
      <Icon name={offline ? 'wifiOff' : 'check'} size={18} color="#FFFFFF" />
      <Txt numberOfLines={1} style={styles.pillText} color="#FFFFFF">
        {offline ? t('leadersOffline', { time: clockText(fetchedAt) }) : t('leadersUpdated')}
      </Txt>
    </PillBody>
  );
}

/**
 * Comes from 8 px above with a fade (200 ms), on the UI thread. Not a layout `entering`:
 * on the web that keeps the pill out of the flow until the CSS animation ends.
 */
function PillBody({ motionOn, color, night, children }: { motionOn: boolean; color: string; night: boolean; children: ReactNode }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(1, { duration: motionOn ? 200 : motion.still, easing: motion.ease.out }));
  }, [p, motionOn]);
  const style = useAnimatedStyle(() => ({ opacity: p.get(), transform: [{ translateY: motionOn ? -8 * (1 - p.get()) : 0 }] }));
  return (
    <Animated.View
      exiting={FadeOut.duration(motion.fast)}
      style={[styles.pill, elevation(2, night), { backgroundColor: color }, style]}
      accessibilityLiveRegion="polite"
    >
      {children}
    </Animated.View>
  );
}

/** "Taking a while…" and "Try again" under the skeletons, after 10 s. */
export function LoadingLong({ onRetry }: { onRetry: () => void }) {
  const c = useColors();
  const { t } = useStore();
  const [long, setLong] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLong(true), 10_000);
    return () => clearTimeout(timer);
  }, []);
  if (!long) return null;
  return (
    <Animated.View entering={FadeIn.duration(motion.base)} style={styles.long}>
      <Txt style={[styles.longText, { color: c.textSoft }]}>{t('leadersLoadingLong')}</Txt>
      <Pressable
        onPress={() => {
          cue('select');
          onRetry();
        }}
        accessibilityRole="button"
        hitSlop={8}
      >
        <Txt style={[styles.longText, { color: c.waterInk }]}>{t('leadersRetry')}</Txt>
      </Pressable>
    </Animated.View>
  );
}

/** No data at all and the server didn't answer. */
export function LoadError({ onRetry }: { onRetry: () => Promise<void> }) {
  const c = useColors();
  const { t } = useStore();
  const motionOn = useMotionOn();
  const [busy, setBusy] = useState(false);
  const spin = useSharedValue(0);
  const press = useSharedValue(0);
  useEffect(() => {
    if (busy && motionOn) {
      spin.set(0);
      spin.set(withRepeat(withTiming(1, { duration: 800, easing: Easing.linear }), -1));
    } else {
      cancelAnimation(spin);
      spin.set(0);
    }
  }, [busy, motionOn, spin]);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${360 * spin.get()}deg` }] }));
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 3 * press.get() }] }));
  const retry = async () => {
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
    <View style={styles.error}>
      <View style={[styles.errorCircle, { backgroundColor: c.sunken }]}>
        <Icon name="wifiOff" size={52} color={c.textSoft} />
      </View>
      <Txt variant="title2" style={styles.center}>{t('leadersLoadFailed')}</Txt>
      <Txt style={[styles.errorText, { color: c.textSoft }]}>{t('leadersLoadFailedText')}</Txt>
      <Pressable
        onPress={retry}
        onPressIn={() => press.set(withTiming(1, { duration: motion.press }))}
        onPressOut={() => press.set(motionOn ? withSpring(0, motion.spring.press) : 0)}
        accessibilityRole="button"
        accessibilityState={{ busy }}
        style={styles.retry}
      >
        <View style={[styles.retryLip, { backgroundColor: c.secondaryLip }]} />
        <Animated.View style={[styles.retryFace, { backgroundColor: c.secondary }, faceStyle]}>
          <Animated.View style={spinStyle}>
            <Icon name="refresh" size={20} color={c.text} />
          </Animated.View>
          <Txt style={styles.retryText}>{t('leadersRetry')}</Txt>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    height: 34,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    marginBottom: 8,
    maxWidth: '100%',
  },
  pillText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 17, flexShrink: 1 },
  long: { alignItems: 'center', gap: 4, marginTop: 16 },
  longText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  error: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 72 },
  errorCircle: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  center: { textAlign: 'center' },
  errorText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  retry: { width: 220, height: 48, marginTop: 24 },
  retryLip: { position: 'absolute', left: 0, right: 0, top: 4, bottom: 0, borderRadius: 14 },
  retryFace: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 4, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  retryText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 20 },
});
