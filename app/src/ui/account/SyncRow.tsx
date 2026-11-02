// The saving row in Settings → Account (design/oyuur-29/спец.md 7, 8.2; frames 10–12): is the
// forest in the account. A tap on "saved" or "offline" saves now; "error" has "Try again",
// "session" — "Sign in". The icon comes in with a fade and a 0.8 → 1 scale, the text fades; the
// arrow of "saving" floats; after "saving" the check of "saved" draws itself. Saving is silent.
// "locked" (OYUUR-31): hidden trees only on this device — the chest on a warm square and "Lock".
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { useSync } from '@/state/sync';
import type { SyncState } from '@/state/syncContract';
import { Button, fonts, Icon, IconName, motion, Txt, useColors, useMotionOn, Vault, withAlpha } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { uses24 } from '@/ui/watering/format';
import { rowStyles } from './HintRow';
import { ACCOUNT_TINT, softOnCard } from './look';
import { openLockSheet } from './LockSheet';
import { href } from './parts';
import { syncRowText, tapSaves } from './syncText';

const LOOK: Record<Exclude<SyncState, 'off' | 'locked'>, { icon: IconName; tint: string }> = {
  saved: { icon: 'cloudCheck', tint: ACCOUNT_TINT.saved },
  saving: { icon: 'cloudUp', tint: ACCOUNT_TINT.saving },
  offline: { icon: 'cloudOff', tint: ACCOUNT_TINT.offline },
  error: { icon: 'cloudOff', tint: ACCOUNT_TINT.error },
  session: { icon: 'people', tint: ACCOUNT_TINT.session },
};

const CLOUD = 'M7 18.5 H17.2 A4.3 4.3 0 0 0 17.6 9.9 A5.8 5.8 0 0 0 6.4 11.3 A3.65 3.65 0 0 0 7 18.5Z';

export function SyncRow() {
  const c = useColors();
  const { t, night } = useStore();
  const friends = useFriends();
  const sync = useSync();
  const motionOn = useMotionOn();
  // "только что" → "в 14:20": the line is read again every 30 s (spec 8.2).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setNow(Date.now()), [sync.lastOkAt]);

  const state = sync.state === 'off' ? 'saved' : sync.state;
  const look = state === 'locked' ? null : LOOK[state];
  const text = syncRowText(t, sync, now, uses24(t.lang));

  // The icon and the text come in anew on each change of state.
  const prev = useRef(state);
  const iconIn = useSharedValue(1);
  const textIn = useSharedValue(1);
  const [drawCheck, setDrawCheck] = useState(false);
  useEffect(() => {
    if (prev.current === state) return;
    const from = prev.current;
    prev.current = state;
    if (!motionOn) return;
    iconIn.set(0);
    iconIn.set(withTiming(1, { duration: motion.fast, easing: motion.ease.out }));
    textIn.set(0);
    textIn.set(withTiming(1, { duration: 120, easing: motion.ease.out }));
    setDrawCheck(from === 'saving' && state === 'saved');
  }, [state, motionOn, iconIn, textIn]);
  const iconStyle = useAnimatedStyle(() => ({ opacity: iconIn.get(), transform: [{ scale: 0.8 + 0.2 * iconIn.get() }] }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textIn.get() }));

  const onTap = () => {
    cue('select');
    sync.syncNow();
  };
  // The session is gone from useFriends() by then: the nick comes from the sync.
  const signIn = () => router.push(href('/signin', { from: 'settings', again: '1', nick: friends.account?.nick ?? sync.sessionNick ?? '' }));

  const action =
    state === 'error' ? (
      <Button title={t('accRetry')} variant="secondary" size="s" onPress={sync.syncNow} />
    ) : state === 'session' ? (
      <Button title={t('accSyncSignIn')} variant="secondary" size="s" onPress={signIn} />
    ) : state === 'locked' ? (
      <Button title={t('accSyncLock')} size="s" onPress={openLockSheet} testID="sync-lock" />
    ) : null;

  const soft = softOnCard(c, night);
  const body = (
    <>
      <Animated.View style={[rowStyles.square, look ? { backgroundColor: look.tint } : [styles.chestSquare, { backgroundColor: c.warmSoft, borderColor: c.goldEdge }], iconStyle]}>
        {!look ? (
          // The chest fills its warm square, with a gold edge: it reads at night too.
          <Vault size={28} />
        ) : state === 'saving' ? (
          <SavingIcon />
        ) : state === 'saved' && drawCheck ? (
          <DrawnCheck />
        ) : (
          <Icon name={look.icon} size={20} color="#FFFFFF" strokeWidth={2.3} />
        )}
      </Animated.View>
      <Animated.View style={[rowStyles.text, textStyle]}>
        <Txt variant="bodyStrong" color={state === 'error' ? c.dangerText : c.text} numberOfLines={state === 'locked' ? 3 : 2}>{text.title}</Txt>
        <Txt style={[rowStyles.hint, { color: soft }]} numberOfLines={state === 'saved' ? 1 : undefined}>{text.sub}</Txt>
        {text.hidden ? <Txt style={[styles.small, { color: soft }]}>{text.hidden}</Txt> : null}
      </Animated.View>
      {action}
    </>
  );

  // "Sign in again" has its own button: the row itself isn't one (a button can't hold a button).
  if (!tapSaves(state)) {
    return <View style={rowStyles.row} accessibilityLiveRegion="polite" testID="sync-row">{body}</View>;
  }
  return (
    <Pressable
      onPress={onTap}
      accessibilityRole="button"
      accessibilityLabel={[text.title, text.sub, text.hidden].filter(Boolean).join('. ')}
      accessibilityLiveRegion="polite"
      testID="sync-row"
      style={({ pressed }) => [rowStyles.row, pressed && { backgroundColor: withAlpha(c.sunken, 0.5) }]}
    >
      {body}
    </Pressable>
  );
}

/** The cloud with its arrow floating ±1.5 px (900 ms, in and out, around and around). */
function SavingIcon() {
  const motionOn = useMotionOn();
  const y = useSharedValue(0);
  useEffect(() => {
    if (!motionOn) return;
    const half = { duration: 450, easing: Easing.inOut(Easing.cubic) };
    y.set(1.5);
    y.set(withRepeat(withSequence(withTiming(-1.5, half), withTiming(1.5, half)), -1, false));
    return () => cancelAnimation(y);
  }, [y, motionOn]);
  // 20 px icon from a 24 viewBox: 1.5 units ≈ 1.25 px.
  const arrowStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() * (20 / 24) }] }));
  return (
    <View style={styles.icon}>
      <Svg width={20} height={20} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <G fill="none" stroke="#FFFFFF" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
          <Path d={CLOUD} />
        </G>
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, arrowStyle]}>
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <G fill="none" stroke="#FFFFFF" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M12 16.4 V11.6 M9.9 13.6 L12 11.5 L14.1 13.6" />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

/** "Saved" right after "saving": the check draws itself left to right in 240 ms. */
function DrawnCheck() {
  const w = useSharedValue(0);
  useEffect(() => {
    w.set(withTiming(1, { duration: motion.base, easing: motion.ease.out }));
  }, [w]);
  // The check spans x 9.3…14.9 of 24: the window opens over that part only.
  const clip = useAnimatedStyle(() => ({ width: ((9.3 + 5.6 * w.get()) / 24) * 20 + 1 }));
  return (
    <View style={styles.icon}>
      <Svg width={20} height={20} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
        <G fill="none" stroke="#FFFFFF" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
          <Path d={CLOUD} />
        </G>
      </Svg>
      <Animated.View style={[styles.clip, clip]}>
        <Svg width={20} height={20} viewBox="0 0 24 24">
          <G fill="none" stroke="#FFFFFF" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M9.3 13.9 L11.3 15.8 L14.9 12" />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  chestSquare: { borderWidth: 1.5 },
  small: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16, marginTop: 1 },
  icon: { width: 20, height: 20 },
  clip: { position: 'absolute', left: 0, top: 0, height: 20, overflow: 'hidden' },
});
