// The achievement window (wave 5 spec, 11.4, frames 27–28): a dialog card with the medal
// (120) standing out of its top edge by half. By the medal's state:
// - ready: rays behind the medal, "Claim +80" (gold) and "Later". "Claim" pays at once (the
//   store tells the acorn layer, which flies them), the window closes 700 ms later;
// - locked: a progress bar "48 / 100", how much is left, the reward, "Close";
// - claimed: when, how much it gave, "Close".
// The window shows the medal as it was when opened: a claim doesn't switch it to "claimed" mid-way.
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, LayoutChangeEvent, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import type { AchievementView } from '@/game/achievements';
import { pluralForm } from '@/i18n';
import { useStore } from '@/state/store';
import { Badge } from '@/ui/awards/Badge';
import { Button, elevation, fonts, Glyph, motion, PAGE_BAR, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { awardLeftText, formatCount, formatDay, progressOf, showsProgress } from './model';

const MEDAL = 120;
const RAYS = 200;
/** A short phone (320×568): a smaller medal and rays, so they reach less of the page's head. */
const SHORT = 640;
const MEDAL_SHORT = 96;
const RAYS_SHORT = 150;
/** "Claim" → the window closes this much later (the acorns are on their way). */
const CLOSE_AFTER = 700;
/**
 * The card's top edge (the medal's middle) stays at least this far under the page bar, so the
 * medal and its rays clear the profile's head (avatar 96, name, a line or two) instead of
 * lying over "Ivan / Growing since…" (wave 5 fixes). A short phone gives way: the card fits first.
 */
const HEAD_CLEAR = 300;
/** Darker than the shared `scrimDialog`: the page behind the bright medal must step back (~55 %). */
const SCRIM = { day: 'rgba(36,24,8,0.56)', night: 'rgba(6,6,26,0.68)' };

export function AwardDialog({ view, onClose }: { view: AchievementView | null; onClose(): void }) {
  // What the window shows is kept while it leaves and after a claim.
  const [shown, setShown] = useState<AchievementView | null>(view);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (view) setShown(view);
    setLeaving(!view);
    // A new medal opens a new window; the same one keeps what it showed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.id]);
  const gone = useCallback(() => {
    setShown(null);
    setLeaving(false);
  }, []);
  if (!shown) return null;
  return <Window key={shown.id} view={shown} leaving={leaving} onClose={onClose} onGone={gone} />;
}

function Window({ view, leaving, onClose, onGone }: { view: AchievementView; leaving: boolean; onClose(): void; onGone(): void }) {
  const { t, night, today, claimAchievement } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const narrow = screenW < 360;
  const insets = useSafeAreaInsets();
  // Where the card stands: in the middle, lower if the head of the page needs it, and never off the bottom.
  const [cardH, setCardH] = useState(0);
  const onCard = (e: LayoutChangeEvent) => setCardH(Math.round(e.nativeEvent.layout.height));
  const short = screenH < SHORT;
  const lowest = screenH - cardH - insets.bottom - (short ? 12 : 24);
  const medalSize = short ? MEDAL_SHORT : MEDAL;
  const raysSize = short ? RAYS_SHORT : RAYS;
  const cardTop = Math.max(medalSize / 2 + insets.top + 8, Math.min(Math.max((screenH - cardH) / 2, insets.top + PAGE_BAR + HEAD_CLEAR), lowest));

  const shade = useSharedValue(0);
  const card = useSharedValue(0);
  const medal = useSharedValue(motionOn ? 0.6 : 1);
  const spin = useSharedValue(0);
  useEffect(() => {
    shade.set(withTiming(1, { duration: 200, easing: motion.ease.out }));
    card.set(motionOn ? withSpring(1, motion.spring.pop) : withTiming(1, { duration: motion.still }));
    if (motionOn) {
      medal.set(withDelay(80, withSpring(1, motion.spring.bounce)));
      spin.set(withRepeat(withTiming(1, { duration: 24000, easing: Easing.linear }), -1, false));
    }
  }, [shade, card, medal, spin, motionOn]);
  useEffect(() => {
    if (!leaving) return;
    shade.set(withTiming(0, { duration: motion.fast, easing: motion.ease.in }));
    card.set(withTiming(0, { duration: motion.fast, easing: motion.ease.in }));
    const id = setTimeout(onGone, motion.fast);
    return () => clearTimeout(id);
  }, [leaving, shade, card, onGone]);

  // A ref, not state: two taps before the next render must still claim once.
  const claimed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const claim = () => {
    if (claimed.current) return;
    claimed.current = true;
    // 'claim' of the spec (14.1) once it is in cues.ts: light + pop.
    cue('tap');
    claimAchievement(view.id);
    timer.current = setTimeout(onClose, CLOSE_AFTER);
  };
  const close = () => {
    if (claimed.current) return;
    cue('select');
    onClose();
  };

  // Android "back" and Esc close it.
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current();
      return true;
    });
    if (Platform.OS !== 'web') return () => sub.remove();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      sub.remove();
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: shade.get() }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, card.get() * 1.4), transform: [{ scale: 0.94 + 0.06 * card.get() }] }));
  const medalStyle = useAnimatedStyle(() => ({ transform: [{ scale: medal.get() }] }));
  const raysStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get() * 360}deg` }] }));

  const name = t.dict.awardNames[view.id];
  const ready = view.state === 'ready';
  const locked = view.state === 'locked';
  const label = ready ? t('awardNew') : locked ? t('awardInProgress') : t('awardGot', { date: formatDay(t, view.claimedOn ?? today, today) });
  const acorns = (n: number) => t('awardGotLine', { n: formatCount(n, t.lang), word: t.dict.awardAcornWords[pluralForm(t.lang, n)] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={leaving ? 'none' : 'auto'} accessibilityViewIsModal aria-modal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: night ? SCRIM.night : SCRIM.day }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={t('close')} />
      </Animated.View>
      <View style={[styles.center, narrow && { paddingHorizontal: 16 }, { paddingTop: cardTop }]} pointerEvents="box-none">
        <Animated.View
          onLayout={onCard}
          style={[styles.card, narrow && { paddingHorizontal: 16 }, short && { paddingTop: MEDAL_SHORT / 2 + 14 }, elevation(3, night), { backgroundColor: c.card, borderColor: c.outline }, cardStyle]}
          accessibilityRole="alert"
        >
          <View style={[styles.medalBox, short && { top: -MEDAL_SHORT / 2, height: MEDAL_SHORT }]} pointerEvents="none">
            {ready && (
              <Animated.View style={[styles.rays, { width: raysSize, height: raysSize, top: (medalSize - raysSize) / 2, marginLeft: -raysSize / 2 }, raysStyle]}>
                <Rays size={raysSize} />
              </Animated.View>
            )}
            <Animated.View style={medalStyle}>
              <Badge id={view.id} state={view.state} progress={progressOf(view)} size={medalSize} />
            </Animated.View>
          </View>

          <Txt variant="micro" color={ready ? c.goldLip : c.textSoft} style={styles.center1}>{label}</Txt>
          <Txt variant="title2" style={[styles.center1, styles.title]} accessibilityRole="header">{name}</Txt>
          <Txt variant="small" color={c.textSoft} style={[styles.center1, styles.desc]}>{t.dict.awardDescs[view.id]}</Txt>

          {ready && (
            <>
              <Button
                title={t('awardClaim', { n: view.reward })}
                variant="gold"
                glyph="acorn"
                size={narrow ? 'm' : 'l'}
                onPress={claim}
                cue={null}
                style={styles.main}
              />
              <Button title={t('awardLater')} variant="text" size="m" onPress={close} />
            </>
          )}

          {locked && (
            <>
              {showsProgress(view) && (
                <>
                  <View style={styles.barRow}>
                    <View style={[styles.bar, { backgroundColor: c.sunken }]}>
                      <View style={[styles.fill, { backgroundColor: c.accent, width: `${Math.round(progressOf(view) * 100)}%` }]} />
                    </View>
                    <Txt variant="caption" style={styles.barText}>{`${view.value} / ${view.goal}`}</Txt>
                  </View>
                  <Txt variant="small" color={c.textSoft} style={[styles.center1, styles.left]}>{awardLeftText(t, view)}</Txt>
                </>
              )}
              <View style={styles.reward}>
                <Txt variant="bodyStrong">{t('awardReward')}</Txt>
                <Glyph name="acorn" size={20} />
                <Txt variant="bodyStrong">{formatCount(view.reward, t.lang)}</Txt>
              </View>
              <Button title={t('close')} variant="text" size="m" onPress={close} style={styles.closeBtn} />
            </>
          )}

          {view.state === 'claimed' && (
            <>
              <Txt variant="small" style={[styles.center1, styles.got]}>{acorns(view.reward)}</Txt>
              <Button title={t('close')} variant="text" size="m" onPress={close} style={styles.closeBtn} />
            </>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

/** Soft gold rays behind a medal that can be claimed. */
function Rays({ size }: { size: number }) {
  const r = size / 2;
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const w = 0.13;
    const p = (ang: number) => `${(r + Math.cos(ang) * r).toFixed(1)} ${(r + Math.sin(ang) * r).toFixed(1)}`;
    return `M${r} ${r} L${p(a - w)} L${p(a + w)} Z`;
  }).join(' ');
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="awardRays" cx="50%" cy="50%" r="50%">
          <Stop offset="0.3" stopColor="#FFE7A0" stopOpacity={0.95} />
          <Stop offset="1" stopColor="#FFE7A0" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <G>
        <Path d={rays} fill="url(#awardRays)" />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, paddingHorizontal: 24 },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: 1.5,
    paddingHorizontal: 24,
    paddingTop: MEDAL / 2 + 16,
    paddingBottom: 12,
  },
  medalBox: { position: 'absolute', top: -MEDAL / 2, left: 0, right: 0, height: MEDAL, alignItems: 'center', justifyContent: 'center' },
  rays: { position: 'absolute', left: '50%' },
  center1: { textAlign: 'center' },
  title: { marginTop: 4 },
  desc: { marginTop: 6, fontFamily: fonts.bold },
  main: { marginTop: 20 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18 },
  bar: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  barText: { fontFamily: fonts.black, fontVariant: ['tabular-nums'] },
  left: { marginTop: 8, fontFamily: fonts.bold },
  reward: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  got: { marginTop: 14, fontFamily: fonts.bold },
  closeBtn: { marginTop: 6 },
});
