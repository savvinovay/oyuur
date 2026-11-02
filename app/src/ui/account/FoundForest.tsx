// "We found a forest in your account" (design/oyuur-29/спец.md 5.1, 8.3; frames 01–05): after
// signing in, when both this phone and the account have trees. Two mini-forests with a "+"
// between them and one tap to decide: "Merge" (the main one), "Keep only the account's forest"
// (a red confirmation; the phone's forest is kept aside for 30 days) or "Not now — sign out".
// It can't be swiped away: the sync waits for the answer. Mounted once over every screen
// (_layout.tsx), under the dialogs; shows while useSync().found is there.
//
// Hidden trees are locked in the account's chest (OYUUR-31): each card says how many, "N locked";
// while merging the account's numbers click up to the merged ones.
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { pluralForm, T } from '@/i18n';
import { useStore } from '@/state/store';
import { useSync } from '@/state/sync';
import type { FoundForest, ForestSide } from '@/state/syncContract';
import { Button, confirmDialog, elevation, fonts, Grabber, Icon, MAX_FONT_SCALE, motion, SheetSurface, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { BusyButton } from './Busy';
import { softOnCard } from './look';
import { MiniForest } from './MiniForest';
import { dateText, dayWhen, LOCAL_COPY_DAYS, treesText, treeWord } from './syncText';

type Choice = 'merge' | 'keepAccount' | 'signOut';

export function FoundForestHost() {
  const sync = useSync();
  const found = sync.found;
  // The sheet stays a moment after the answer, so it can slide away (spec 8.3: 300 ms after "Merge").
  const [kept, setKept] = useState<FoundForest | null>(found);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (found) {
      setKept(found);
      setLeaving(false);
    } else {
      setLeaving(true);
    }
  }, [found]);
  if (!kept) return null;
  return <FoundSheet found={kept} leaving={leaving} resolve={sync.resolveFound} onGone={() => setKept(null)} />;
}

function FoundSheet({ found, leaving, resolve, onGone }: {
  found: FoundForest;
  leaving: boolean;
  resolve(choice: Choice): Promise<void>;
  onGone(): void;
}) {
  const c = useColors();
  const { t, night } = useStore();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const small = screenH < 600;
  const [busy, setBusy] = useState<Choice | null>(null);
  const [accountCount, setAccountCount] = useState(found.account.trees);

  const slide = useSharedValue(1);
  const shade = useSharedValue(0);
  const cards = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  /** 0 → 1: the phone's card slides under the account's (spec 8.3, 360 ms). */
  const merge = useSharedValue(0);
  const plus = useSharedValue(0);
  const dim = useSharedValue(1);

  useEffect(() => {
    if (motionOn) {
      shade.set(withTiming(1, { duration: motion.base, easing: motion.ease.out }));
      slide.set(withSpring(0, motion.spring.sheet));
      // The account's card at 80 ms, the phone's at 140, the rest at 200 (Y 12 → 0, 220 ms).
      [80, 140, 200].forEach((delay, i) => cards[i].set(withDelay(delay, withTiming(1, { duration: 220, easing: motion.ease.out }))));
    } else {
      shade.set(withTiming(1, { duration: motion.fast }));
      slide.set(0);
      cards.forEach((v) => v.set(1));
    }
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Done: wait 300 ms on the merged picture, then slide away.
  const onGoneRef = useRef(onGone);
  onGoneRef.current = onGone;
  useEffect(() => {
    if (!leaving) return;
    const out = () => {
      const time = motionOn ? 220 : motion.fast;
      shade.set(withTiming(0, { duration: time }));
      slide.set(
        withTiming(1, { duration: time, easing: Easing.in(Easing.cubic) }, (done) => {
          if (done) scheduleOnRN(onGoneRef.current);
        }),
      );
    };
    const id = setTimeout(out, busy === 'merge' ? 300 : 0);
    return () => clearTimeout(id);
    // Only when it starts leaving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  // Android "back" doesn't close it: the answer is needed.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  // "8 → 13", one number every 60 ms while merging.
  useEffect(() => {
    if (busy !== 'merge' || !motionOn) return;
    const id = setInterval(() => setAccountCount((n) => (n < found.merged ? n + 1 : n)), 60);
    return () => clearInterval(id);
  }, [busy, motionOn, found.merged]);

  const start = (choice: Choice) => {
    setBusy(choice);
    dim.set(withTiming(0.4, { duration: motion.fast }));
    if (choice !== 'merge') return;
    if (motionOn) {
      merge.set(withTiming(1, { duration: motion.slow, easing: motion.ease.inOut }));
      plus.set(withTiming(1, { duration: 200, easing: motion.ease.out }));
    } else {
      setAccountCount(found.merged);
    }
  };
  const failed = () => {
    cue('error');
    showQuestHint(t('accFoundFailed'), 3000);
    setBusy(null);
    setAccountCount(found.account.trees);
    dim.set(withTiming(1, { duration: motion.fast }));
    merge.set(withTiming(0, { duration: motion.base, easing: motion.ease.out }));
    plus.set(withTiming(0, { duration: motion.fast }));
  };
  const answer = async (choice: Choice) => {
    if (busy) return;
    start(choice);
    try {
      await resolve(choice);
      if (choice === 'merge') cue('expand');
    } catch {
      failed();
    }
  };

  const onMerge = () => {
    cue('select');
    answer('merge');
  };
  const onKeep = async () => {
    if (busy) return;
    cue('select');
    const n = found.phone.trees;
    const m = found.account.trees;
    const yes = await confirmDialog({
      title: t('accFoundDropTitle', { n, trees: treeWord(t, n) }),
      message: t('accFoundDropText', { n, m, mtrees: treeWord(t, m), date: dateText(t, Date.now() + LOCAL_COPY_DAYS * 86_400_000) }),
      confirmLabel: t('accFoundDropButton', { n, trees: treeWord(t, n) }),
      cancelLabel: t('back'),
      tone: 'danger',
      picture: <MiniForest id="drop" trees={found.phone.biggest} count={n} width={120} height={80} />,
    });
    if (!yes) return;
    cue('delete');
    answer('keepAccount');
  };
  const onNotNow = () => answer('signOut');

  const shadeStyle = useAnimatedStyle(() => ({ opacity: shade.get() }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slide.get() * (screenH * 0.9) }] }));
  const [accountShown, , restShown] = cards;
  const accountIn = useAnimatedStyle(() => ({ opacity: accountShown.get(), transform: [{ translateY: 12 * (1 - accountShown.get()) }] }));
  const restIn = useAnimatedStyle(() => ({ opacity: restShown.get(), transform: [{ translateY: 12 * (1 - restShown.get()) }] }));
  const phoneStyle = useAnimatedStyle(() => {
    const m = merge.get();
    const shown = cards[1].get();
    return {
      opacity: shown * (m === 0 ? 1 : 0.55 * (1 - m)),
      transform: [{ translateY: 12 * (1 - shown) - 58 * m }, { scale: 1 - 0.06 * m }],
    };
  });
  const plusStyle = useAnimatedStyle(() => ({ opacity: cards[1].get() * (1 - plus.get()), transform: [{ rotate: `${45 * plus.get()}deg` }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.get() }));

  const n = found.merged;
  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal aria-modal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrimDialog }, shadeStyle]} />
      <Animated.View style={[styles.sheet, { maxHeight: screenH - insets.top - 24 }, sheetStyle]} role="dialog" accessibilityLabel={t('accFoundTitle')}>
        <SheetSurface style={styles.surface}>
          <View style={styles.grab}>
            <Grabber />
          </View>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} style={styles.scroll} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 18 }]}>
            <Txt variant="title1" style={styles.title} accessibilityRole="header">{t('accFoundTitle')}</Txt>
            <Txt style={[styles.lead, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accFoundText', { nick: found.nick })}</Txt>

            <Animated.View style={[styles.first, accountIn]}>
              <SideCard
                id="account"
                side={found.account}
                count={accountCount}
                title={t('accFoundAccount', { nick: found.nick })}
                line={countLine(t, accountCount, busy === 'merge' ? found.account.hidden + found.phone.hidden : found.account.hidden)}
                extra={found.account.changedAt != null ? { icon: 'phone', text: t('accFoundFromOther', { when: dayWhen(t, found.account.changedAt, Date.now()) }), lines: found.account.hidden > 0 ? 1 : 2 } : null}
                small={small}
              />
            </Animated.View>
            <View style={styles.join} pointerEvents="none">
              <Animated.View style={[styles.plus, { backgroundColor: c.accent, borderBottomColor: c.accentLip }, plusStyle]}>
                <Icon name="plus" size={22} color="#FFFFFF" strokeWidth={3} />
              </Animated.View>
            </View>
            <Animated.View style={phoneStyle}>
              <SideCard
                id="phone"
                side={found.phone}
                count={found.phone.trees}
                title={t('accFoundPhone')}
                line={countLine(t, found.phone.trees, found.phone.hidden)}
                extra={found.phone.wateredToday ? { icon: 'dropLine', text: t('accFoundWateredToday'), water: true } : null}
                small={small}
              />
            </Animated.View>

            <Animated.View style={restIn}>
              <Animated.View style={dimStyle}>
                <View style={styles.merged}>
                  <Icon name="cloudCheck" size={20} color={c.doneInk} />
                  <Txt style={[styles.mergedText, { color: c.doneInk }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
                    {t('accFoundMergeText', { n, trees: t.dict.treeWords[pluralForm(t.lang, n)] })}
                  </Txt>
                </View>
                {small ? null : (
                  <View style={styles.twins}>
                    <Icon name="info" size={18} color={c.textSoft} />
                    <Txt style={[styles.twinsText, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accFoundTwins')}</Txt>
                  </View>
                )}
              </Animated.View>
              <BusyButton
                busy={busy === 'merge'}
                busyTitle={t('accFoundMerging')}
                title={t('accFoundMerge')}
                onPress={onMerge}
                cue={null}
                style={styles.main}
                testID="found-merge"
              />
              <Animated.View style={[styles.second, busy && busy !== 'keepAccount' ? dimStyle : null]} pointerEvents={busy ? 'none' : 'auto'}>
                <BusyButton
                  busy={busy === 'keepAccount'}
                  busyTitle={t('accFoundKeep')}
                  title={t('accFoundKeep')}
                  variant="secondary"
                  size="m"
                  onPress={onKeep}
                  cue={null}
                  testID="found-keep"
                />
              </Animated.View>
              <Animated.View style={busy && busy !== 'signOut' ? dimStyle : null} pointerEvents={busy ? 'none' : 'auto'}>
                <Pressable
                  onPress={onNotNow}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.notNow, pressed && { opacity: 0.6 }]}
                  testID="found-not-now"
                >
                  <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.notNowText, { color: c.textSoft }]}>{t('accFoundNotNow')}</Txt>
                </Pressable>
              </Animated.View>
            </Animated.View>
          </ScrollView>
        </SheetSurface>
      </Animated.View>
      {/* While waiting nothing under the sheet can be tapped. */}
      {busy ? <View style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}

/** "8 деревьев · 3 под замком" (spec 11.1); without hidden trees just the trees. */
const countLine = (t: T, trees: number, locked: number) =>
  locked > 0 ? t('accFoundCount', { trees: treesText(t, trees), n: locked }) : treesText(t, trees);

function SideCard({ id, side, count, title, line, extra, small }: {
  id: string;
  side: ForestSide;
  count: number;
  title: string;
  line: string;
  /** `lines` — the account's line is one line, so its note may take two (the card stays 96). */
  extra: { icon: 'phone' | 'dropLine'; text: string; water?: boolean; lines?: number } | null;
  small: boolean;
}) {
  const c = useColors();
  const { night } = useStore();
  const soft = softOnCard(c, night);
  return (
    <View style={[styles.card, small ? { minHeight: 84 } : { height: 96 }, elevation(1, night), { backgroundColor: c.card }]} accessible accessibilityLabel={[title, line, extra?.text].filter(Boolean).join('. ')}>
      <MiniForest id={id} trees={side.biggest} count={count} width={small ? 96 : 112} height={small ? 66 : 76} />
      <View style={styles.cardText}>
        <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[styles.cardTitle, { color: c.text }]}>{title}</Txt>
        <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={2} style={[styles.cardLine, { color: soft }]}>{line}</Txt>
        {extra ? (
          <View style={styles.extra}>
            <Icon name={extra.icon} size={15} color={extra.water ? c.waterInk : soft} />
            <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={extra.lines ?? 1} style={[styles.cardLine, styles.extraText, { color: soft }]}>{extra.text}</Txt>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  surface: { paddingTop: 8, overflow: 'hidden', borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  grab: { height: 22, justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 16 },
  title: { fontSize: 24, lineHeight: 30 },
  lead: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, marginTop: 6 },
  // The phone's card slides up under the account's.
  first: { marginTop: 16, zIndex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14 },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: fonts.black, fontSize: 16, lineHeight: 21 },
  cardLine: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  extra: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 1 },
  extraText: { flexShrink: 1 },
  join: { height: 12, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  plus: { position: 'absolute', width: 36, height: 36, borderRadius: 18, borderBottomWidth: 3, alignItems: 'center', justifyContent: 'center' },
  merged: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18 },
  mergedText: { flex: 1, fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  twins: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  twinsText: { flex: 1, fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 17 },
  main: { marginTop: 20 },
  second: { marginTop: 14 },
  notNow: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  notNowText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
});
