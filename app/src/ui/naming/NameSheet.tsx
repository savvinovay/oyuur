// The name sheet (wave 4 spec, section 3): one window for the offer ("Later" / "Name it"),
// renaming ("Cancel" / "Save") and removing the name. A sheet that sits right on top of the
// keyboard: the tree's picture and habit, the field, name ideas for this kind of tree
// (the heir of the last generation first) with "shuffle", and the two buttons.
// The sheet follows the keyboard on the UI thread (useAnimatedKeyboard); in a phone's
// browser it rises over the keyboard by the visual viewport; without one it stands at the bottom.
// Only "Later" turns the offer down for today: a tap on the scrim, "back" or Esc just close it.
import { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, BackHandler, Keyboard, LayoutChangeEvent, Platform, Pressable, StyleSheet, TextInput, TextStyle, useWindowDimensions, View,
} from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  Easing, interpolateColor, SharedValue, useAnimatedKeyboard, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { cleanTyping, finalName, heirName, nameIdeas } from '@/game/naming';
import type { Tree } from '@/game/tree';
import { useStore } from '@/state/store';
import { Button, elevation, fonts, Glyph, Grabber, Icon, MAX_FONT_SCALE, motion, SheetSurface, Txt, type, useColors, useMotionOn, withAlpha } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { ThumbBox } from '@/ui/forest/sheet/ThumbBox';

export interface NameSheetProps {
  /** The tree to name; null — closed. */
  tree: Tree | null;
  /** 'ask' — the offer ("Later" / "Name it"); 'rename' — "Cancel" / "Save" (or "Name it" for a tree without a name). */
  mode: 'ask' | 'rename';
  /** The previous generation's name, for the heir chip. */
  heirOf: string | null;
  /** Names other trees have: not offered. */
  taken: string[];
  /**
   * saved: the cleaned name or null (removed); null — closed without saving.
   * `later` — closed by the offer's "Later" button (not by the scrim, "back" or Esc).
   */
  onClose(result: { nickname: string | null } | null, later?: boolean): void;
}

// The browser's focus outline would cover the field's own ring; RN's types have no 'none' for it.
// The app turns text selection off (_layout.tsx); a text field needs it back.
const FIELD_WEB = Platform.OS === 'web' ? ({ outlineStyle: 'none', userSelect: 'text' } as unknown as TextStyle) : null;

// The keyboard's height on the UI thread. A browser has no such hook (it only warns there):
// a phone's browser shows how much of the page the keyboard covers by its visual viewport
// (the layout one keeps its height under the keyboard on iOS).
function useWebKeyboard(): { height: SharedValue<number> } {
  const height = useSharedValue(0);
  useEffect(() => {
    const view = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!view) return;
    const measure = () => height.set(Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop)));
    measure();
    view.addEventListener('resize', measure);
    view.addEventListener('scroll', measure);
    return () => {
      view.removeEventListener('resize', measure);
      view.removeEventListener('scroll', measure);
    };
  }, [height]);
  return { height };
}
/** The keyboard's height on the UI thread, phones and browsers alike (the lock sheet uses it too). */
export const useKeyboard = Platform.OS === 'web' ? useWebKeyboard : useAnimatedKeyboard;

/** Neutral shade under this sheet (not the screen's warm scrim): the window stands out, the scene stays itself. */
const SHADE = 'rgba(0,0,0,0.38)';
/** Taps on the shade this soon after opening are the rest of the tap that opened it (a double tap on the bubble). */
const SHADE_DEAF = 400;
/** A name wider than the field shrinks to stay whole, down to this size. */
const FIELD_MIN_FONT = 13;
/** The field's text starts this far in. */
const FIELD_PAD = 12;

/** Under 360 px wide the sheet is denser (spec 3.2): 254 instead of 280 tall. */
const COMPACT_BELOW = 360;
const SHUFFLE = 34;
const GAP = 8;
/** Chip padding: 14 + 14; the heir chip 10 + seed 16 + 6 + 14. */
const CHIP_PAD = 28;
const HEIR_PAD = 46;
/** The counter shows from this many characters. */
const COUNT_FROM = 15;
/** The "letters only" line stays this long; the field's red ring this long. */
const BAD_LINE = 2000;
const BAD_RING = 600;
/** A drag on the grabber closes the sheet past this distance or speed. */
const CLOSE_DRAG = 60;
const CLOSE_SPEED = 800;

/**
 * Stays on screen while it leaves: the parent sets `tree` to null at once (in `onClose`),
 * and the sheet goes down on its own.
 */
export function NameSheet(props: NameSheetProps) {
  // What the sheet shows is kept while it leaves: by then the parent has moved on.
  const [session, setSession] = useState<{ shown: NameSheetProps & { tree: Tree }; key: number; leaving: boolean } | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const { tree } = props;
  useEffect(() => {
    if (tree) {
      const shown = { ...latest.current, tree };
      setSession((s) => (s && s.shown.tree.id === tree.id && !s.leaving ? { ...s, shown } : { shown, key: Date.now(), leaving: false }));
    } else {
      setSession((s) => (s && !s.leaving ? { ...s, leaving: true } : s));
    }
  }, [tree]);
  const gone = useCallback((key: number) => setSession((s) => (s && s.key === key ? null : s)), []);
  if (!session) return null;
  const onClose = (result: { nickname: string | null } | null, later?: boolean) => latest.current.onClose(result, later);
  return <Sheet key={session.key} {...session.shown} onClose={onClose} leaving={session.leaving} onGone={() => gone(session.key)} />;
}

function Sheet({ tree, mode, heirOf, taken, onClose, leaving, onGone }: Omit<NameSheetProps, 'tree'> & { tree: Tree; leaving: boolean; onGone: () => void }) {
  const { t, night, settings } = useStore();
  const c = useColors();
  const reducedMotion = useReducedMotion();
  const motionOn = settings.animations && !reducedMotion;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < COMPACT_BELOW;
  const L = compact ? DENSE : NORMAL;

  const hadName = tree.nickname !== null;
  const renaming = mode === 'rename';
  const [value, setValue] = useState(() => (renaming ? tree.nickname ?? '' : ''));
  // A new object every time: a dropped character must still put the field back.
  const [, redraw] = useState(0);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  // In a browser the field is a DOM input: focusing it while the sheet is still below the
  // screen would scroll the whole page up to it.
  const focusField = () => {
    const field = input.current;
    if (Platform.OS === 'web') (field as unknown as HTMLElement | null)?.focus({ preventScroll: true });
    else field?.focus();
  };

  // ---- Coming and going ----
  const slide = useSharedValue(1);
  const shade = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(400);
  const keyboard = useKeyboard();
  const left = useRef(false);
  const openedAt = useRef(Date.now());
  useEffect(() => {
    if (motionOn) {
      shade.set(withTiming(1, { duration: motion.base, easing: motion.ease.out }));
      slide.set(withSpring(0, motion.spring.sheet));
    } else {
      shade.set(withTiming(1, { duration: motion.fast }));
      slide.set(0);
    }
    // The keyboard comes up together with the sheet. Android sometimes ignores an instant focus.
    const id = setTimeout(focusField, Platform.OS === 'android' ? 100 : 0);
    return () => clearTimeout(id);
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goAway = (saved: boolean) => {
    if (left.current) return;
    left.current = true;
    Keyboard.dismiss();
    input.current?.blur();
    const time = motionOn ? (saved ? motion.base : 200) : motion.fast;
    const easing = motionOn ? Easing.in(Easing.cubic) : Easing.linear;
    shade.set(withTiming(0, { duration: time, easing }));
    if (motionOn) {
      slide.set(withTiming(1, { duration: time, easing }, (done) => {
        if (done) scheduleOnRN(onGone);
      }));
    } else {
      setTimeout(onGone, time);
    }
  };
  const leave = (result: { nickname: string | null } | null, later = false) => {
    if (left.current) return;
    goAway(result !== null);
    onClose(result, later);
  };
  // The scrim, the grabber, "back", Esc: just closed (in the offer the bubble stays).
  const dismiss = () => {
    if (left.current) return;
    cue('select');
    leave(null);
  };
  // In a browser the tap that opened the sheet sends its own click a moment later, right onto
  // the new shade; and a double tap's second half lands there too. Neither closes it.
  const onShade = () => {
    if (Date.now() - openedAt.current < SHADE_DEAF) return;
    dismiss();
  };
  // Closed from outside (the parent dropped the tree).
  useEffect(() => {
    if (leaving) goAway(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  // In a browser the screens are boxes with hidden overflow, and typing into a field still
  // scrolls them to keep the caret in sight (the sheet starts below the screen): the whole
  // app would ride up. While the sheet is open its boxes stay put.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const field = input.current as unknown as HTMLElement | null;
    const keep = (e: Event) => {
      const box = e.target;
      if (box instanceof HTMLElement && field && box.contains(field) && box.scrollTop !== 0) box.scrollTop = 0;
    };
    document.addEventListener('scroll', keep, true);
    return () => document.removeEventListener('scroll', keep, true);
  }, []);

  // Android "back" closes the sheet; once it is on its way out, "back" goes on to the screen.
  // Esc does the same in a browser.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
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
    // Caught on the way down: the field stops its keys from bubbling up.
    document.addEventListener('keydown', onKey, true);
    return () => {
      sub.remove();
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  // Without a keyboard the sheet keeps clear of the home indicator; with one it sits on it.
  const bottom = insets.bottom + 12;
  const overKeyboard = L.bottom;
  const sheetStyle = useAnimatedStyle(() => {
    const k = keyboard.height.get();
    const lift = k > 0 ? Math.max(0, k + overKeyboard - bottom) : 0;
    return { transform: [{ translateY: -lift + slide.get() * (height.get() + 24) + drag.get() }] };
  });
  const scrimStyle = useAnimatedStyle(() => ({ opacity: shade.get() }));
  const onSheetLayout = (e: LayoutChangeEvent) => height.set(e.nativeEvent.layout.height);

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      'worklet';
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (drag.get() > CLOSE_DRAG || e.velocityY > CLOSE_SPEED) {
        scheduleOnRN(dismissRef.current);
      } else {
        drag.set(withSpring(0, motion.spring.sheet));
      }
    },
  });

  // ---- The field ----
  const [focused, setFocused] = useState(false);
  const [redRing, setRedRing] = useState(false);
  const [badLine, setBadLine] = useState(false);
  const ring = useSharedValue(0);
  const shake = useSharedValue(0);
  useEffect(() => {
    ring.set(withTiming(redRing ? 2 : focused ? 1 : 0, { duration: motion.fast }));
  }, [focused, redRing, ring]);
  const accent = c.accent;
  const danger = c.dangerText;
  const fieldStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(ring.get(), [0, 1, 2], ['rgba(0,0,0,0)', accent, danger]),
    transform: [{ translateX: shake.get() }],
  }));

  // A browser ignores selectionColor: the selected name is green there too, not system blue.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const tag = document.createElement('style');
    tag.textContent = `[data-testid="tree-name-field"]::selection{background-color:${withAlpha(accent, 0.35)}}`;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, [accent]);

  const timers = useRef<{ ring?: ReturnType<typeof setTimeout>; line?: ReturnType<typeof setTimeout>; cued: number }>({ cued: 0 });
  useEffect(() => () => {
    clearTimeout(timers.current.ring);
    clearTimeout(timers.current.line);
  }, []);
  const badChar = () => {
    const now = Date.now();
    if (now - timers.current.cued >= BAD_LINE) {
      timers.current.cued = now;
      cue('error');
    }
    setRedRing(true);
    setBadLine(true);
    clearTimeout(timers.current.ring);
    clearTimeout(timers.current.line);
    timers.current.ring = setTimeout(() => setRedRing(false), BAD_RING);
    timers.current.line = setTimeout(() => setBadLine(false), BAD_LINE);
  };
  const onChangeText = (raw: string) => {
    const r = cleanTyping(raw);
    if (r.dropped) badChar();
    setValue(r.value);
    redraw((n) => n + 1);
  };

  const name = finalName(value);
  const removing = renaming && hadName && name === null;
  const empty = name === null && !removing;
  const complain = () => {
    cue('error');
    if (motionOn) {
      const step = (x: number) => withTiming(x, { duration: 50 });
      shake.set(withSequence(step(-6), step(6), step(-4), step(4), step(0)));
    }
  };
  const save = () => {
    if (left.current) return;
    if (empty) return complain();
    // Saving the same name again changes nothing.
    if (renaming && name === tree.nickname) return leave(null);
    if (removing) cue('select');
    if (name) AccessibilityInfo.announceForAccessibility(t('namedA11y', { name }));
    leave({ nickname: name });
  };

  // A name wider than the field (20 wide letters, a narrow phone) gets smaller instead of
  // sliding off its left edge: measured at full size, scaled to the room.
  const [fieldW, setFieldW] = useState(0);
  const [textW, setTextW] = useState(0);
  const room = fieldW - FIELD_PAD - 4;
  const fieldFont = value !== '' && room > 0 && textW > room ? Math.max(FIELD_MIN_FONT, Math.floor((L.font * room) / textW)) : L.font;

  // ---- Ideas ----
  const pool = t.dict.nameIdeas[tree.skin];
  const heir = heirOf ? heirName(heirOf) : null;
  // Renaming, the tree's own name is no idea either.
  const avoid = tree.nickname !== null ? [...taken, tree.nickname] : taken;
  const [round, setRound] = useState(0);
  const [rowW, setRowW] = useState(0);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const measureNames = heir ? [heir, ...pool] : pool;
  const measured = rowW > 0 && measureNames.every((n) => widths[n] !== undefined);
  const ideasFor = (count: number) => nameIdeas(pool, { seed: tree.id, round, count, taken: avoid, heir });
  let ideas = ideasFor(2);
  if (measured) {
    // As many whole chips as fit before "shuffle"; a chip is never cut.
    const room = rowW - SHUFFLE - GAP;
    for (let k = 6; k >= 1; k--) {
      const list = ideasFor(k);
      const sum = list.reduce((s, n, i) => s + widths[n] + (heir && i === 0 && n === heir ? HEIR_PAD : CHIP_PAD), 0) + GAP * (list.length - 1);
      if (sum <= room || k === 1) {
        ideas = list;
        break;
      }
    }
  }
  const example = nameIdeas(pool, { seed: tree.id, round: 0, count: 1, taken: avoid, heir })[0] ?? '';
  const chipsAlpha = useSharedValue(1);
  const lineAlpha = useSharedValue(0);
  useEffect(() => {
    lineAlpha.set(withTiming(badLine ? 1 : 0, { duration: 120 }));
  }, [badLine, lineAlpha]);
  const chipsStyle = useAnimatedStyle(() => ({ opacity: chipsAlpha.get() * (1 - lineAlpha.get()) }));
  const lineStyle = useAnimatedStyle(() => ({ opacity: lineAlpha.get() }));
  const nextRound = useCallback(() => {
    setRound((r) => r + 1);
    chipsAlpha.set(withTiming(1, { duration: 120 }));
  }, [chipsAlpha]);
  const shuffle = () => {
    cue('select');
    if (!motionOn) return setRound((r) => r + 1);
    chipsAlpha.set(withTiming(0, { duration: 120 }, (done) => {
      if (done) scheduleOnRN(nextRound);
    }));
  };
  const pick = (idea: string) => {
    setValue(idea);
    focusField();
  };

  // ---- Words ----
  const title = renaming && hadName ? t('renameTitle') : t('nameTitle');
  const placeholder = renaming && hadName ? t('nameNoName') : t('namePlaceholder', { example });
  const primary = removing ? t('nameRemove') : renaming && hadName ? t('renameSave') : t('nameSave');
  const count = Array.from(value).length;
  const habit = { lineageId: tree.lineageId, generations: [tree], current: tree };

  return (
    // The whole layer is the modal: a screen reader stays inside it (the screens hide the rest on Android).
    <View style={StyleSheet.absoluteFill} pointerEvents={leaving ? 'none' : 'box-none'} accessibilityViewIsModal aria-modal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: SHADE }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onShade} accessibilityRole="button" accessibilityLabel={t('close')} />
      </Animated.View>

      <Animated.View style={[styles.sheet, sheetStyle]} onLayout={onSheetLayout}>
        <SheetSurface style={{ paddingTop: 8, paddingBottom: bottom }}>
          <GestureDetector gesture={pan}>
            <View style={styles.grab}>
              <Grabber />
            </View>
          </GestureDetector>
          <View style={styles.body}>
            {/* The tree of this very generation, its title and the habit. */}
            <View style={[styles.head, { minHeight: L.head }]}>
              <View style={{ width: L.head, height: L.head }}>
                <View style={compact ? styles.thumbSmall : null}>
                  <ThumbBox habit={habit} kind="list" />
                </View>
              </View>
              <View style={styles.headText}>
                <Txt variant="title3" numberOfLines={1} style={compact ? styles.titleDense : null} accessibilityRole="header">{title}</Txt>
                <Txt variant="small" color={c.textSoft} numberOfLines={1} style={compact ? styles.subDense : styles.sub}>
                  {t('nameHabitLine', { habit: tree.name })}
                </Txt>
              </View>
            </View>

            <Animated.View style={[styles.field, elevation(1, night), { height: L.field, marginTop: L.fieldTop, backgroundColor: c.card }, fieldStyle]}>
              <TextInput
                ref={input}
                value={value}
                onChangeText={onChangeText}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={placeholder}
                placeholderTextColor={c.textMuted}
                autoCapitalize="words"
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                returnKeyType="done"
                submitBehavior="submit"
                onSubmitEditing={save}
                keyboardAppearance={night ? 'dark' : 'light'}
                selectTextOnFocus={renaming && hadName}
                selectionColor={c.accent}
                cursorColor={c.accent}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={[styles.input, FIELD_WEB, { color: c.text, fontSize: fieldFont }, Platform.OS === 'web' && ({ caretColor: c.accent } as TextStyle)]}
                onLayout={(e) => setFieldW(Math.floor(e.nativeEvent.layout.width))}
                accessibilityLabel={t('nameField')}
                testID="tree-name-field"
              />
              {/* The name's width at full size, for the shrink above. */}
              <View style={styles.measureBox} pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants">
                <View style={styles.measureWide}>
                  <Txt
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_FONT_SCALE}
                    style={[styles.inputText, { fontSize: L.font }]}
                    onLayout={(e) => setTextW(Math.ceil(e.nativeEvent.layout.width))}
                  >
                    {value}
                  </Txt>
                </View>
              </View>
              {count >= COUNT_FROM && (
                <Txt variant="caption" color={count >= 20 ? c.dangerText : c.textMuted} style={styles.count}>{t('nameCount', { n: count })}</Txt>
              )}
              {value !== '' && (
                <Pressable
                  onPress={() => {
                    setValue('');
                    focusField();
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('nameClear')}
                  style={[styles.clear, { backgroundColor: c.sunken }]}
                >
                  <Icon name="close" size={12} color={c.text} strokeWidth={2.6} />
                </Pressable>
              )}
            </Animated.View>

            {/* Ideas, or for 2 s after a wrong character the line saying what is allowed. Same height: nothing jumps. */}
            <View style={styles.ideasRow} onLayout={(e) => setRowW(Math.floor(e.nativeEvent.layout.width))}>
              <Animated.View style={[styles.chips, chipsStyle]} pointerEvents={badLine ? 'none' : 'box-none'}>
                {ideas.map((idea, i) =>
                  heir && i === 0 && idea === heir ? (
                    <IdeaChip key={idea} label={idea} heir onPress={() => pick(idea)} a11y={t('nameIdea', { name: idea })} />
                  ) : (
                    <IdeaChip key={idea} label={idea} onPress={() => pick(idea)} a11y={t('nameIdea', { name: idea })} />
                  ),
                )}
                <Pressable
                  onPress={shuffle}
                  hitSlop={5}
                  accessibilityRole="button"
                  accessibilityLabel={t('nameShuffle')}
                  style={[styles.shuffle, { backgroundColor: c.sunken }]}
                >
                  <Icon name="shuffle" size={18} color={c.textSoft} />
                </Pressable>
              </Animated.View>
              <Animated.View style={[StyleSheet.absoluteFill, styles.badLine, lineStyle]} pointerEvents="none" accessibilityLiveRegion="polite">
                <Icon name="info" size={16} color={c.textSoft} />
                <Txt numberOfLines={1} style={[styles.badText, { color: c.textSoft }]}>{badLine ? t('nameBadChar') : ''}</Txt>
              </Animated.View>
              {/* Widths of every idea, measured once, so the row knows how many chips fit. */}
              <View style={styles.measure} pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants">
                {measureNames.map((n) => (
                  <Txt
                    key={n}
                    numberOfLines={1}
                    style={styles.chipText}
                    onLayout={(e) => {
                      const w = Math.ceil(e.nativeEvent.layout.width);
                      setWidths((all) => (all[n] === w ? all : { ...all, [n]: w }));
                    }}
                  >
                    {n}
                  </Txt>
                ))}
              </View>
            </View>

            <View style={[styles.buttons, { marginTop: L.buttonsTop }]}>
              {/* The way out is quiet text, so the eye goes to the main button. Only this "Later" puts the bubble away for today. */}
              <Button
                title={renaming ? t('cancel') : t('nameLater')}
                variant="text"
                size="m"
                cue="select"
                style={styles.flex}
                onPress={() => leave(null, !renaming)}
              />
              {/* An empty field keeps the main button green, only faded: it is still the one to aim for.
                  A tap on it then shakes the field (save → complain). Removing the name is a calm secondary. */}
              <View style={[styles.wide, empty && styles.faded]}>
                <Button
                  title={primary}
                  size="m"
                  variant={removing ? 'secondary' : 'primary'}
                  glyph={removing ? undefined : 'nameTag'}
                  onPress={save}
                  cue={null}
                />
              </View>
            </View>
          </View>
        </SheetSurface>
      </Animated.View>
    </View>
  );
}

/** A name idea: like the design system's Chip; the heir is green with a seed. */
function IdeaChip({ label, heir = false, onPress, a11y }: { label: string; heir?: boolean; onPress: () => void; a11y: string }) {
  const c = useColors();
  const motionOn = useMotionOn();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      onPressIn={() => scale.set(withTiming(0.96, { duration: motion.press }))}
      onPressOut={() => scale.set(motionOn ? withSpring(1, motion.spring.press) : withTiming(1, { duration: motion.still }))}
      onPress={() => {
        cue('select');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={5}
    >
      <Animated.View style={[styles.chip, heir && styles.heir, { backgroundColor: heir ? c.accentSoft : c.sunken }, style]}>
        {heir && <Glyph name="seed" size={16} />}
        <Txt numberOfLines={1} style={[styles.chipText, { color: c.text }]}>{label}</Txt>
      </Animated.View>
    </Pressable>
  );
}

/** Sizes (spec 3.2): head, field, the field's and buttons' top gaps, the text, the gap over the keyboard. */
const NORMAL = { head: 48, field: 56, fieldTop: 14, buttonsTop: 14, font: 20, bottom: 20 };
const DENSE = { head: 40, field: 52, fieldTop: 12, buttonsTop: 12, font: 18, bottom: 10 };

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  grab: { height: 24, marginTop: -4, paddingTop: 4 },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumbSmall: { transform: [{ scale: 40 / 48 }], transformOrigin: 'left top' },
  headText: { flex: 1, minWidth: 0 },
  titleDense: { fontSize: 17, lineHeight: 22 },
  sub: { fontFamily: fonts.bold },
  subDense: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  field: { borderRadius: 16, borderWidth: 2, flexDirection: 'row', alignItems: 'center', paddingRight: 8, gap: 8 },
  input: { flex: 1, minWidth: 0, height: '100%', fontFamily: fonts.bold, paddingLeft: FIELD_PAD, paddingRight: 0 },
  inputText: { fontFamily: fonts.bold },
  // A box of no size (nothing spills) holding a wide row the name is measured in.
  measureBox: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', opacity: 0 },
  measureWide: { width: 2000, alignItems: 'flex-start' },
  faded: { opacity: 0.45 },
  count: { fontFamily: fonts.bold },
  clear: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ideasRow: { height: 34, marginTop: 10 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: GAP, height: 34 },
  chip: { height: 34, borderRadius: 17, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  heir: { paddingLeft: 10 },
  chipText: { ...type.small, fontFamily: fonts.bold, fontSize: 14, lineHeight: 18 },
  shuffle: { width: SHUFFLE, height: SHUFFLE, borderRadius: SHUFFLE / 2, alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' },
  badLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0, alignItems: 'flex-start' },
  buttons: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  wide: { flex: 1.5 },
});
