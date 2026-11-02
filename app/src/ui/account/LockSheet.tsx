// "Lock your hidden trees in your account" (design/oyuur-29/спец.md 5.2, 8.6, 8.7; frames 14, 15,
// 17, 19): this device has hidden trees but not the account's key for its chest (a tester after
// the update). The open chest, the hidden trees with open padlocks, the password for @nick.
// "Lock" — the button stays green with its ring ("Locking…"), the field fades, the lid sinks to
// 0.45 and the chest breathes while the phone works the password out (UI thread: it doesn't stop
// while JS counts); then the lid snaps shut, the padlocks close one by one, "Locked", and the new
// recovery code if there is one. A wrong password: the lid springs back, the field shakes.
// Mounted once over every screen (_layout.tsx): opens by itself once (useSync().lockPromptDue),
// only on the home screen (never over "New habit" or a form), and from "Lock" in the saving row or
// the sign-out sheet (openLockSheet()). "Later" — or any other way out: a tap on the shade, Esc,
// Android "back" — answers the prompt: it doesn't open by itself again. It closes at once when
// the account goes or changes. The same host shows a recovery code made earlier whose screen never
// showed (useFriends().pendingCode, net/pendingCode.ts).
// Never logs anything: hidden habits' names stay on the screen only.
import { router, usePathname } from 'expo-router';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { pluralForm } from '@/i18n';
import { growthDays, Habit, stageOf } from '@/game/tree';
import { ApiError } from '@/net/api';
import { newCodeOf, useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { useSync } from '@/state/sync';
import { Button, elevation, fonts, Glyph, Grabber, Icon, MAX_FONT_SCALE, motion, SheetSurface, Txt, useColors, useMotionOn, Vault } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { ThumbBox } from '@/ui/forest/sheet/ThumbBox';
import { useKeyboard } from '@/ui/naming/NameSheet';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { BusyButton } from './Busy';
import { Field, FieldHandle } from './Field';
import { handCode } from './handoff';
import { softOnCard } from './look';
import { errorText } from './model';
import { href } from './parts';

const listeners = new Set<() => void>();
/** "Lock" in the saving row or the sign-out sheet: the sheet opens whatever the prompt says. */
export function openLockSheet() {
  listeners.forEach((l) => l());
}

/** The sheet waits this long after the prompt is due: not over the app's first frame. */
const PROMPT_AFTER = 1200;
/** Taps on the shade this soon after opening are the rest of the tap that opened it. */
const SHADE_DEAF = 400;
/** More hidden trees than this: the first two and "and N more" (spec 8.6). */
const LIST_MAX = 3;
/** The highest the sheet reaches, under the clock (spec 8.7: top 52 on an iPhone). */
const TOP_GAP = 8;
/** "Locked" stays this long before the new code (spec 8.6). */
const LOCKED_HOLD = 500;
/** The padlocks of the rows close one after another this far apart. */
const ROW_STEP = 60;

type Outcome = 'later' | 'locked' | 'forgot';

export function LockSheetHost() {
  const sync = useSync();
  const friends = useFriends();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const prompted = useRef(false);
  // Another account, or none: a sheet left open for the last one goes, and the prompt is new.
  const accountId = friends.account ? (friends.account.id ?? friends.account.nick) : null;
  useEffect(() => {
    setOpen(false);
    prompted.current = false;
  }, [accountId]);
  // A code made earlier that never got its screen: shown once, over whatever is open.
  const { pendingCode } = friends;
  const taken = useRef(friends.pendingCodeTaken);
  taken.current = friends.pendingCodeTaken;
  useEffect(() => {
    if (!pendingCode || !accountId) return;
    const id = setTimeout(() => {
      taken.current();
      handCode(pendingCode, 'pending');
      router.push(href('/new-code', { handed: '1' }));
    }, PROMPT_AFTER);
    return () => clearTimeout(id);
  }, [pendingCode, accountId]);
  useEffect(() => {
    const show = () => setOpen(true);
    listeners.add(show);
    return () => {
      listeners.delete(show);
    };
  }, []);
  // By itself once, only on the home screen, and never over "We found a forest in your account".
  const due = sync.lockPromptDue && !sync.found && !!friends.account && pathname === '/' && !pendingCode;
  useEffect(() => {
    if (!due || prompted.current) return;
    const id = setTimeout(() => {
      prompted.current = true;
      setOpen(true);
    }, PROMPT_AFTER);
    return () => clearTimeout(id);
  }, [due]);
  const account = friends.account;
  if (!open || !account) return null;
  const closed = (how: Outcome) => {
    // Any way out but "Lock" answers the prompt ("Later"); "Forgot password" goes on elsewhere.
    if (how === 'later') sync.lockLater();
    setOpen(false);
  };
  return <LockSheet nick={account.nick} onClosed={closed} />;
}

function LockSheet({ nick, onClosed }: { nick: string; onClosed(how: Outcome): void }) {
  const c = useColors();
  const { t, night, habits } = useStore();
  const friends = useFriends();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const kb = useKeyboard();

  // The list is taken once: it doesn't jump while locking.
  const [hidden] = useState(() => habits.filter((h) => h.current.visibility !== 'friends'));
  const n = hidden.length;
  const rows = n > LIST_MAX ? hidden.slice(0, LIST_MAX - 1) : hidden;
  const more = n - rows.length;

  const [password, setPassword] = useState('');
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState<{ text: string; wrong: boolean } | null>(null);
  /** Rows whose padlock has closed (one by one after "click"). */
  const [shut, setShut] = useState(0);
  const field = useRef<FieldHandle>(null);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  // ---- Coming and going ----
  const slide = useSharedValue(1);
  const shade = useSharedValue(0);
  const openedAt = useRef(Date.now());
  const left = useRef(false);
  useEffect(() => {
    if (motionOn) {
      shade.set(withTiming(1, { duration: motion.base, easing: motion.ease.out }));
      slide.set(withSpring(0, motion.spring.sheet));
    } else {
      shade.set(withTiming(1, { duration: motion.fast }));
      slide.set(0);
    }
    // The field is in focus at once (spec 8.6), once the sheet is up.
    later(() => field.current?.focus(), motionOn ? 380 : 60);
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const close = (how: Outcome) => {
    if (left.current) return;
    left.current = true;
    Keyboard.dismiss();
    const time = motionOn ? 220 : motion.fast;
    const gone = () => onClosedRef.current(how);
    shade.set(withTiming(0, { duration: time }));
    slide.set(
      withTiming(1, { duration: time, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) scheduleOnRN(gone);
      }),
    );
  };
  const busy = phase !== 'idle';
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const dismiss = () => {
    if (busyRef.current) return;
    cue('select');
    close('later');
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  // Android "back" and Esc are "Later"; while locking nothing closes it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (left.current) return false;
      dismissRef.current();
      return true;
    });
    if (Platform.OS !== 'web') return () => sub.remove();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || left.current) return;
      e.preventDefault();
      dismissRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      sub.remove();
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  // ---- Locking (spec 8.6) ----
  const lid = useSharedValue(1);
  const breath = useSharedValue(0);
  const dim = useSharedValue(1);
  const wait = useSharedValue(0);
  const twinkle = useSharedValue(0);
  const burst = useSharedValue(0);
  /** "Locked": the room for "Later" under the button closes. */
  const ended = useSharedValue(0);

  const startLocking = () => {
    dim.set(withTiming(0.4, { duration: motion.fast }));
    wait.set(withTiming(1, { duration: motion.fast }));
    if (!motionOn) {
      lid.set(0.45);
      return;
    }
    lid.set(withTiming(0.45, { duration: 600, easing: motion.ease.inOut }));
    const half = { duration: 600, easing: motion.ease.inOut };
    breath.set(withRepeat(withSequence(withTiming(1, half), withTiming(0, half)), -1, false));
    twinkle.set(withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1, false));
  };
  const stopBreathing = () => {
    cancelAnimation(breath);
    cancelAnimation(twinkle);
    breath.set(withTiming(0, { duration: motion.fast }));
    twinkle.set(0);
  };

  const locked = (newCode: string | null) => {
    stopBreathing();
    setPhase('done');
    // The field keeps its dots until the sheet is gone (frame 17): nothing jumps under "Locked".
    cue('lockIn');
    lid.set(motionOn ? withSpring(0, { stiffness: 600, damping: 18, mass: 1 }) : 0);
    wait.set(withTiming(0, { duration: motion.fast }));
    ended.set(1);
    if (motionOn) burst.set(withTiming(1, { duration: 400, easing: motion.ease.out }));
    rows.forEach((_, i) => later(() => setShut(i + 1), motionOn ? i * ROW_STEP : 0));
    later(() => {
      if (newCode) {
        // The old code is dead now: the new one is shown once, like after signing in (spec 5.2).
        handCode(newCode);
        router.push(href('/new-code', { handed: '1' }));
      } else {
        showQuestHint(t('accMoveDone'), 2500);
      }
      close('locked');
    }, LOCKED_HOLD);
  };

  const failed = (e: unknown) => {
    stopBreathing();
    setPhase('idle');
    cue('error');
    lid.set(motionOn ? withSpring(1, motion.spring.pop) : 1);
    dim.set(withTiming(1, { duration: motion.fast }));
    wait.set(withTiming(0, { duration: motion.fast }));
    const kept = newCodeOf(e);
    if (kept) {
      // The code changed before something else failed: it must not be lost.
      showQuestHint(errorText(t, e), 3000);
      handCode(kept);
      router.push(href('/new-code', { handed: '1' }));
      close('later');
      return;
    }
    const wrong = e instanceof ApiError && (e.code === 'wrong_password' || e.code === 'wrong_login');
    setError({ text: wrong ? t('accWrongPassword') : errorText(t, e), wrong });
    if (wrong) field.current?.shake();
  };

  const submit = async () => {
    if (busy) return;
    if (!password) {
      cue('error');
      field.current?.shake();
      return;
    }
    Keyboard.dismiss();
    setError(null);
    setPhase('busy');
    startLocking();
    try {
      const { newCode } = await friends.lockHidden(password);
      locked(newCode);
    } catch (e) {
      failed(e);
    }
  };

  const forgot = () => {
    if (busy) return;
    cue('select');
    router.push(href('/password', { forgot: '1' }));
    close('forgot');
  };

  // ---- Styles ----
  const shadeStyle = useAnimatedStyle(() => ({ opacity: shade.get() }));
  const top = Math.max(insets.top, 20) + TOP_GAP;
  const sheetStyle = useAnimatedStyle(() => ({
    bottom: kb.height.get(),
    maxHeight: screenH - kb.height.get() - top,
    transform: [{ translateY: slide.get() * screenH }],
  }));
  // With the keyboard up the button sits right on it and "Later" goes under it (spec 8.7).
  const footStyle = useAnimatedStyle(() => ({ paddingBottom: kb.height.get() > 0 ? 9 : insets.bottom + 12 }));
  const tailStyle = useAnimatedStyle(() => ({ height: withTiming(kb.height.get() > 0 || ended.get() > 0 ? 0 : 50, { duration: motion.still }) }));
  const breathStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.03 * breath.get() }] }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dim.get() }));
  const laterStyle = useAnimatedStyle(() => ({ opacity: 1 - wait.get() }));
  const waitStyle = useAnimatedStyle(() => ({ opacity: wait.get() }));

  const text = n === 1 ? t('accMoveTextOne') : t('accMoveText', { n, trees: t.dict.treeWords[pluralForm(t.lang, n)] });
  const soft = softOnCard(c, night);

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} accessibilityViewIsModal aria-modal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrimDialog }, shadeStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => Date.now() - openedAt.current > SHADE_DEAF && dismiss()}
          accessibilityRole="button"
          accessibilityLabel={t('accMoveLater')}
        />
      </Animated.View>
      <Animated.View style={[styles.sheet, sheetStyle]} role="dialog" accessibilityLabel={t('accMoveTitle')}>
        <SheetSurface style={styles.surface}>
          <View style={styles.grab}>
            <Grabber />
          </View>
          <ScrollView
            ref={scroll}
            bounces={false}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            style={styles.scroll}
            contentContainerStyle={styles.body}
          >
            <View style={styles.chest}>
              <Animated.View style={breathStyle}>
                <Vault size={80} open={lid} />
              </Animated.View>
              <Sparks twinkle={twinkle} burst={burst} />
            </View>
            <Txt style={[styles.title, { color: c.text }]} accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accMoveTitle')}</Txt>
            <Txt style={[styles.text, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{text}</Txt>

            <View style={[styles.list, elevation(night ? 2 : 1, night), { backgroundColor: c.card }]}>
              {rows.map((h, i) => (
                <View key={h.lineageId}>
                  {i > 0 ? <View style={[styles.divider, { backgroundColor: c.divider }]} /> : null}
                  <HiddenRow habit={h} locked={shut > i} soft={soft} />
                </View>
              ))}
              {more > 0 ? (
                <>
                  <View style={[styles.divider, { backgroundColor: c.divider }]} />
                  <View style={styles.moreRow}>
                    <Txt style={[styles.more, { color: soft }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>{t('accMoveMore', { n: more })}</Txt>
                  </View>
                </>
              ) : null}
            </View>

            <Animated.View style={dimStyle} pointerEvents={busy ? 'none' : 'auto'}>
              <Field
                ref={field}
                label={t('accMovePassword')}
                labelTail={`@${nick}`}
                top={14}
                secret
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setError(null);
                }}
                onFocus={() => later(() => scroll.current?.scrollToEnd({ animated: true }), 300)}
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={submit}
                accessibilityLabel={`${t('accMovePassword')} @${nick}`}
                testID="lock-password"
                sunken
                error={!!error?.wrong}
                help={error?.text}
                helpColor={c.dangerText}
                helpIcon
              />
              <Pressable
                onPress={forgot}
                accessibilityRole="button"
                hitSlop={6}
                style={({ pressed }) => [styles.forgot, pressed && { opacity: 0.6 }]}
                testID="lock-forgot"
              >
                <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.forgotText, { color: c.textSoft }]}>{t('accForgot')}</Txt>
              </Pressable>
            </Animated.View>
          </ScrollView>

          <Animated.View style={[styles.foot, { backgroundColor: c.sheet }, footStyle]}>
            {phase === 'done' ? (
              <Button title={t('accMoveLocked')} icon="lock" cue={null} onPress={() => {}} testID="lock-go" />
            ) : (
              <BusyButton
                busy={phase === 'busy'}
                busyTitle={t('accMoveLocking')}
                title={t('accMoveGo')}
                icon="lockOpen"
                onPress={submit}
                cue={null}
                testID="lock-go"
              />
            )}
            <Animated.View style={[styles.tail, tailStyle]}>
              {/* "Locked" has nothing under it (frame 17). */}
              {phase === 'done' ? null : (
                <Animated.View style={[StyleSheet.absoluteFill, laterStyle]} pointerEvents={busy ? 'none' : 'auto'}>
                  <Pressable onPress={dismiss} accessibilityRole="button" style={({ pressed }) => [styles.later, pressed && { opacity: 0.6 }]} testID="lock-later">
                    <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[styles.laterText, { color: c.textSoft }]}>{t('accMoveLater')}</Txt>
                  </Pressable>
                </Animated.View>
              )}
              <Animated.View style={[StyleSheet.absoluteFill, waitStyle]} pointerEvents="none">
                <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.wait, { color: c.textSoft }]} accessibilityLiveRegion="polite">
                  {phase === 'busy' ? t('accMoveWait') : ''}
                </Txt>
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </SheetSurface>
      </Animated.View>
    </View>
  );
}

/** One hidden tree: a 40 picture, the habit, its stage and days, and its padlock. */
function HiddenRow({ habit, locked, soft }: { habit: Habit; locked: boolean; soft: string }) {
  const c = useColors();
  const { t } = useStore();
  const motionOn = useMotionOn();
  const tree = habit.current;
  const days = growthDays(tree);
  const line = `${t.dict.stageNames[stageOf(days).stage]} · ${t('frDaysShort', { n: days })}`;
  // The padlock pops when it closes: 1.25 → 1 (spec 8.6).
  const pop = useSharedValue(1);
  useEffect(() => {
    if (!locked || !motionOn) return;
    pop.set(1.25);
    pop.set(withSpring(1, motion.spring.pop));
  }, [locked, motionOn, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  return (
    <View style={styles.row} accessible accessibilityLabel={`${tree.name}. ${line}`}>
      <View style={styles.thumb}>
        <View style={styles.thumbScale}>
          <ThumbBox habit={habit} kind="list" />
        </View>
      </View>
      <View style={styles.rowText}>
        <Txt numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.rowTitle, { color: c.text }]}>{tree.name}</Txt>
        <Txt numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.rowLine, { color: soft }]}>{line}</Txt>
      </View>
      <Animated.View style={popStyle}>
        <Icon name={locked ? 'lock' : 'lockOpen'} size={20} color={locked ? c.doneInk : soft} />
      </Animated.View>
    </View>
  );
}

/**
 * Sparks around the chest: two take turns twinkling while locking (0 → 0.9 → 0, 900 ms each), three
 * fly out from the padlock on "click" (400 ms). Places are the frames' (15, 17), from the chest's middle.
 */
function Sparks({ twinkle, burst }: { twinkle: SharedValue<number>; burst: SharedValue<number> }) {
  const a = useAnimatedStyle(() => {
    const k = twinkle.get();
    return { opacity: k < 0.5 ? 0.9 * Math.sin(k * 2 * Math.PI) : 0 };
  });
  const b = useAnimatedStyle(() => {
    const k = twinkle.get();
    return { opacity: k >= 0.5 ? 0.6 * Math.sin((k - 0.5) * 2 * Math.PI) : 0 };
  });
  const fly = (dx: number, dy: number, top: number) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useAnimatedStyle(() => {
      const k = burst.get();
      return {
        opacity: k === 0 ? 0 : Math.min(1, k * 3) * top,
        transform: [{ translateX: dx * k }, { translateY: dy * k }, { scale: 0.4 + 0.6 * k }],
      };
    });
  const f1 = fly(38, -30, 1);
  const f2 = fly(-44, -14, 0.8);
  const f3 = fly(50, 20, 0.7);
  return (
    <View style={styles.sparks} pointerEvents="none">
      <Animated.View style={[styles.spark, { left: 106 - 7, top: 22 - 7 }, a]}>
        <Glyph name="sparkle" size={14} />
      </Animated.View>
      <Animated.View style={[styles.spark, { left: 42 - 5, top: 60 - 5 }, b]}>
        <Glyph name="sparkle" size={10} />
      </Animated.View>
      {/* From the padlock (the chest's middle, y 46) outward. */}
      <Animated.View style={[styles.spark, { left: 80 - 9, top: 46 - 9 }, f1]}>
        <Glyph name="sparkle" size={18} />
      </Animated.View>
      <Animated.View style={[styles.spark, { left: 80 - 6, top: 46 - 6 }, f2]}>
        <Glyph name="sparkle" size={12} />
      </Animated.View>
      <Animated.View style={[styles.spark, { left: 80 - 5, top: 46 - 5 }, f3]}>
        <Glyph name="sparkle" size={10} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Over the page's title bar too, like the other sheets.
  layer: { zIndex: 10 },
  sheet: { position: 'absolute', left: 0, right: 0 },
  surface: { paddingTop: 8, overflow: 'hidden', flexShrink: 1, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  grab: { height: 22, justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: 16, paddingTop: 2 },
  chest: { height: 84, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  sparks: { position: 'absolute', top: 0, width: 160, height: 84, left: '50%', marginLeft: -80 },
  spark: { position: 'absolute' },
  title: { fontFamily: fonts.black, fontSize: 22, lineHeight: 28, textAlign: 'center', marginTop: 8 },
  text: { fontFamily: fonts.bold, fontSize: 14.5, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  list: { borderRadius: 20, marginTop: 14 },
  divider: { height: StyleSheet.hairlineWidth * 2, marginLeft: 60 },
  row: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 8, paddingRight: 14 },
  thumb: { width: 40, height: 40, borderRadius: 10, overflow: 'hidden' },
  // The list's 48 picture drawn at 40: the one `warmForest` has ready.
  thumbScale: { width: 48, height: 48, margin: -4, transform: [{ scale: 40 / 48 }] },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20 },
  rowLine: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 16 },
  moreRow: { height: 44, justifyContent: 'center', paddingLeft: 60 },
  more: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  forgot: { alignSelf: 'flex-end', height: 44, justifyContent: 'center', paddingHorizontal: 4 },
  forgotText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
  foot: { paddingHorizontal: 16, paddingTop: 6 },
  tail: { overflow: 'hidden' },
  later: { height: 44, marginTop: 6, alignItems: 'center', justifyContent: 'center' },
  laterText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  wait: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 17, textAlign: 'center', paddingTop: 12 },
});
