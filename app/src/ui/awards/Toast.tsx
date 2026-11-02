// "New achievement" (wave 5 spec 11.7): a card that slides down 8 px under the main screen's
// header (the streak and the habit's name stay in sight) when an achievement can be claimed
// and nobody has told about it yet. It waits until the watering, the acorns, the menu and the
// sheets are done (+400 ms), stays 4 s, goes up; a swipe up takes it away, a tap opens the
// achievement in the profile. Told once: the ids are saved (`markAnnounced`), so a restart
// doesn't repeat it.
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { AchievementId, AchievementView } from '@/game/achievements';
import type { T } from '@/i18n';
import { useStore } from '@/state/store';
import { acornFlights } from '@/ui/acorns';
import { onAcornsChange } from '@/ui/acorns/bus';
import { elevation, fonts, Icon, MAX_FONT_SCALE, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { Badge } from './Badge';

/** Quiet time before it shows, how long it stays. */
const WAIT = 400;
const STAY = 4000;
const IN = 300;
const OUT = 200;
/** It comes down this far and goes up as far, fading: it starts under the header, not over it. */
const DROP = 24;
/** A swipe up past this takes it away. */
const SWIPE = 20;
/** The medal (spec 11.7). */
const MEDAL = 44;

/** Gold of the "NEW ACHIEVEMENT" line (spec 11.7). */
const NEW_INK = '#D99A1E';

/**
 * The achievement's name, from the profile's texts when they have it (`awardNames`, wave 5
 * part Г); without it the toast says just "claim +30".
 */
function awardName(t: T, id: AchievementId): string | null {
  const names = (t.dict as unknown as { awardNames?: Partial<Record<AchievementId, string>> }).awardNames;
  return names?.[id] ?? null;
}

export function AwardToast({ allowed, top, onShowing }: {
  /** Only on the main screen with nothing else going on: no watering, menu, sheet or dialog. */
  allowed: boolean;
  /** Where the card's top stands, px from the screen's top: 8 under the screen's header. */
  top: number;
  /** The card came or went (the account offer waits for it). */
  onShowing?: (on: boolean) => void;
}) {
  const { achievements, announced, markAnnounced } = useStore();
  const [busy, setBusy] = useState(() => acornFlights.busy());
  useEffect(() => onAcornsChange(() => setBusy(acornFlights.busy())), []);
  const fresh = achievements.filter((a) => a.state === 'ready' && !announced.includes(a.id));
  const freshKey = fresh.map((a) => a.id).join(',');
  const [shown, setShown] = useState<{ list: AchievementView[]; id: number } | null>(null);
  const can = allowed && !busy && fresh.length > 0 && shown === null;
  const freshRef = useRef(fresh);
  freshRef.current = fresh;
  useEffect(() => {
    if (!can) return;
    const id = setTimeout(() => {
      const list = freshRef.current;
      if (list.length === 0) return;
      setShown({ list, id: Date.now() });
      markAnnounced(list.map((a) => a.id));
      cue('award');
    }, WAIT);
    return () => clearTimeout(id);
  }, [can, freshKey, markAnnounced]);
  const on = shown !== null;
  useEffect(() => {
    onShowing?.(on);
  }, [on, onShowing]);
  if (!shown) return null;
  return <Card key={shown.id} list={shown.list} top={top} onGone={() => setShown(null)} />;
}

function Card({ list, top, onGone }: { list: AchievementView[]; top: number; onGone: () => void }) {
  const { t, night } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const y = useSharedValue(motionOn ? -DROP : 0);
  const alpha = useSharedValue(0);
  const left = useRef(false);
  useEffect(() => {
    if (motionOn) {
      y.set(withTiming(0, { duration: IN, easing: Easing.out(Easing.cubic) }));
      alpha.set(withTiming(1, { duration: IN, easing: Easing.out(Easing.cubic) }));
    } else alpha.set(withTiming(1, { duration: 160 }));
    const id = setTimeout(() => goRef.current(), STAY);
    return () => clearTimeout(id);
    // Once, when it comes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const go = () => {
    if (left.current) return;
    left.current = true;
    const done = (finished?: boolean) => {
      'worklet';
      if (finished) scheduleOnRN(onGone);
    };
    if (motionOn) y.set(withTiming(y.get() - DROP, { duration: OUT, easing: Easing.in(Easing.cubic) }));
    alpha.set(withTiming(0, { duration: OUT, easing: Easing.in(Easing.cubic) }, done));
  };
  const goRef = useRef(go);
  goRef.current = go;
  const away = () => goRef.current();
  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      'worklet';
      y.set(Math.min(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.translationY < -SWIPE || e.velocityY < -500) scheduleOnRN(away);
      else y.set(withTiming(0, { duration: 160 }));
    },
  });
  // A card pulled up fades as it goes: it never covers the header for long.
  const style = useAnimatedStyle(() => ({
    opacity: alpha.get() * Math.max(0, 1 + y.get() / (3 * DROP)),
    transform: [{ translateY: y.get() }],
  }));

  const one = list.length === 1 ? list[0] : null;
  const name = one ? awardName(t, one.id) : null;
  const line = one
    ? name
      ? t('toastAward', { name, n: one.reward })
      : t('toastAwardAnon', { n: one.reward })
    : t('toastAwardMany', { n: list.length });
  const open = () => {
    cue('tap');
    away();
    router.push(one ? { pathname: '/profile', params: { award: one.id } } : '/profile');
  };

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.wrap, { top }, style]}>
        <Pressable
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${t('toastAwardNew')}. ${line}`}
          accessibilityLiveRegion="polite"
          style={[styles.card, { backgroundColor: c.card }, elevation(3, night)]}
        >
          <Badge id={list[0].id} state="claimed" size={MEDAL} />
          <View style={styles.text}>
            <Txt variant="micro" color={NEW_INK} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('toastAwardNew')}</Txt>
            {one && name ? (
              // The name gives way; "· claim +30" is never cut.
              <View style={styles.row}>
                <Txt variant="bodyStrong" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.line, styles.name]}>{name}</Txt>
                <Txt variant="bodyStrong" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.line, styles.claim]}>
                  {t('toastAwardClaim', { n: one.reward })}
                </Txt>
              </View>
            ) : (
              <Txt variant="bodyStrong" numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.line}>{line}</Txt>
            )}
          </View>
          <Icon name="chevronRight" size={20} color={c.textSoft} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16 },
  card: { height: 64, borderRadius: 20, flexDirection: 'row', alignItems: 'center', paddingLeft: 10, paddingRight: 12, gap: 10 },
  text: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  line: { fontFamily: fonts.black },
  name: { flexShrink: 1, minWidth: 0 },
  // The gap of a space, as a margin: a browser drops a space at the start of a box.
  claim: { flexShrink: 0, marginLeft: 5 },
});
