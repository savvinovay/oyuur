// "When to water" (OYUUR-34, design/oyuur-33/спец.md 2 and 4, frames 02–04): a bottom sheet with
// the five ready choices (any time / morning / afternoon / evening / late) and "Other time…",
// which turns the sheet into a wheel of whole hours 1..23. Each choice has an icon on the color
// of the sky at that time; "any time" has a neutral "24", not a clock (the clock means "wait").
// - 'plant': a tap on a row chooses and closes the sheet, there is no "Done". On the wheel a tap
//   on the highlighted band (the green check) chooses and closes too.
// - 'change' (a growing tree): "The new time starts tomorrow. Today — from 18:00" above the rows,
//   a "today" tag by the hour that holds today, "Done" at the bottom; the wheel's band comes back
//   to the rows with that hour chosen.
// A "Quit" habit with an hour before noon gets a plain gray hint under the rows (not a ban).
// It lives in its own Modal, so it covers the whole screen from wherever it is mounted.
import { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View, ViewStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  FadeIn, interpolate, interpolateColor, SharedValue, SlideInLeft, SlideInRight, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { titleOf } from '@/game/naming';
import { Habit, HabitKind, MAX_OPEN_HOUR, OpenHour } from '@/game/tree';
import { useStore } from '@/state/store';
import { Button, elevation, fonts, Glyph, HIT, Icon, MAX_FONT_SCALE, motion, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { ThumbBox } from '@/ui/forest/sheet/ThumbBox';
import { ModalSheet } from '@/ui/shop/ModalSheet';
import { hourLook, HourIcon } from './art';
import { fromText, hourText, PRESET_HOURS, showQuitHint } from './format';

export interface WateringTimeSheetProps {
  visible: boolean;
  mode: 'plant' | 'change';
  /** For the gray hint "For “I quit it” people usually pick the evening…" when the hour is before noon. */
  kind: HabitKind;
  /** Chosen now (plant) / the hour from tomorrow, or today's if no change waits (change). */
  hour: OpenHour;
  /** change: the hour that holds today — the "today" tag and "The new time starts tomorrow. Today — …". */
  todayHour?: OpenHour;
  /** change: the tree, for the head's picture and "Дубок · Не курить" (frame 04). Without it — the plain head. */
  habit?: Habit;
  /** plant: a tap on a row chooses and closes; change: on "Done". */
  onPick(hour: OpenHour): void;
  /** The sheet has slid away (after a choice too). */
  onClose(): void;
}

/** The wheel: 5 rows of 44, the middle one on the band. */
const ROW = 44;
const WHEEL_H = ROW * 5;
const WHEEL_PAD = ROW * 2;
const WHEEL_HOURS: OpenHour[] = Array.from({ length: MAX_OPEN_HOUR }, (_, i) => i + 1);
const OPT_H = 52;
/** A browser's ScrollView has no snapToInterval: CSS scroll snapping does it. */
const SNAP_WEB = Platform.OS === 'web' ? ({ scrollSnapType: 'y mandatory' } as unknown as ViewStyle) : null;
const SNAP_ITEM_WEB = Platform.OS === 'web' ? ({ scrollSnapAlign: 'center' } as unknown as ViewStyle) : null;

export function WateringTimeSheet(props: WateringTimeSheetProps) {
  const { t } = useStore();
  const [mounted, setMounted] = useState(props.visible);
  const closeRef = useRef<(() => void) | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  useEffect(() => {
    // Hidden from outside: it slides away first, then unmounts.
    if (props.visible) setMounted(true);
    else closeRef.current?.();
  }, [props.visible]);
  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => closeRef.current?.()}>
      {/* Gestures inside a Modal need their own root (the grabber's drag). */}
      <GestureHandlerRootView style={styles.root}>
        <ModalSheet
          label={t('wtTitle')}
          onClosed={() => {
            closeRef.current = null;
            setMounted(false);
            propsRef.current.onClose();
          }}
        >
          {(close) => {
            closeRef.current = close;
            return <Body {...props} close={close} />;
          }}
        </ModalSheet>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Body({ mode, kind, hour, todayHour, habit, onPick, close }: WateringTimeSheetProps & { close(): void }) {
  const { t, night } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const [sel, setSel] = useState<OpenHour>(hour);
  const [page, setPage] = useState<'list' | 'wheel'>('list');
  /** The list's height: the wheel takes the same, so nothing jumps (frame 03). */
  const [listH, setListH] = useState(0);
  const picked = useRef(false);

  const choose = (h: OpenHour) => {
    if (picked.current) return;
    if (h !== sel) cue('select');
    setSel(h);
    if (mode === 'plant') {
      picked.current = true;
      onPick(h);
      close();
    }
  };
  const done = () => {
    if (picked.current) return;
    picked.current = true;
    onPick(sel);
    close();
  };
  const fromWheel = (h: OpenHour) => {
    if (mode === 'plant') return choose(h);
    cue('select');
    setSel(h);
    setPage('list');
  };
  const enter = (dir: 'left' | 'right') => (motionOn ? (dir === 'right' ? SlideInRight : SlideInLeft).duration(motion.base) : FadeIn.duration(motion.still));

  const isOther = !PRESET_HOURS.includes(sel);
  // A narrow screen (320): tighter rows, and the hour without "с", so "Вечером  сегодня  18:00" fits.
  const narrow = useWindowDimensions().width < 360;
  const valueOf = (h: OpenHour) => (narrow ? hourText(h, t.lang) : t('wtFrom', { time: hourText(h, t.lang) }));
  const head = habit ? (
    <View style={styles.head}>
      <ThumbBox habit={habit} kind="list" />
      <View style={styles.flex}>
        <Txt variant="title3" numberOfLines={1} accessibilityRole="header">{t('wtTitle')}</Txt>
        <Txt variant="small" color={c.textSoft} numberOfLines={1}>
          {habit.current.nickname ? `${titleOf(habit.current)} · ${habit.current.name}` : habit.current.name}
        </Txt>
      </View>
    </View>
  ) : (
    <View>
      <Txt variant="title3" accessibilityRole="header">{t('wtTitle')}</Txt>
      <Txt variant="small" color={c.textSoft} style={styles.lead}>{t('wtLead')}</Txt>
    </View>
  );

  if (page === 'wheel') {
    return (
      <Animated.View key="wheel" entering={enter('right')} style={[styles.body, { minHeight: listH }]}>
        <View style={styles.head}>
          <Pressable
            onPress={() => {
              cue('select');
              setPage('list');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('back')}
            hitSlop={4}
            style={[styles.backBtn, { backgroundColor: c.secondary }]}
          >
            <Icon name="chevronLeft" size={18} color={c.text} />
          </Pressable>
          <View style={styles.flex}>
            <Txt variant="title3" accessibilityRole="header">{t('wtOtherTitle')}</Txt>
            <Txt variant="small" color={c.textSoft} numberOfLines={2}>{t('wtLead')}</Txt>
          </View>
        </View>
        <HourWheel initial={sel > 0 ? sel : 18} onPick={fromWheel} />
        <Txt style={[styles.wheelNote, { color: c.textSoft }]}>
          {t('wtWheelNote', { from: hourText(1, t.lang), to: hourText(MAX_OPEN_HOUR, t.lang) })}
        </Txt>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      key="list"
      entering={listH > 0 ? enter('left') : undefined}
      style={styles.body}
      onLayout={(e: LayoutChangeEvent) => {
        const h = e.nativeEvent.layout.height;
        setListH((old) => Math.max(old, h));
      }}
    >
      {head}
      {mode === 'change' && todayHour !== undefined && (
        // Plain gray text over the choices (спец 4.2): no box, nothing bold.
        <Txt style={[styles.info, { color: c.textSoft }]}>
          {`${t('wtChangeNote')} ${t('wtChangeToday', { when: fromText(todayHour, t) })}`}
        </Txt>
      )}
      <View style={[styles.card, elevation(1, night), { backgroundColor: c.card }]} role="radiogroup" accessibilityRole="radiogroup">
        {PRESET_HOURS.map((h, i) => (
          <Option
            key={h}
            hour={h}
            first={i === 0}
            label={t(OPTION_LABEL[h as keyof typeof OPTION_LABEL])}
            value={h === 0 ? null : valueOf(h)}
            narrow={narrow}
            on={sel === h}
            today={mode === 'change' && todayHour === h}
            onPress={() => choose(h)}
          />
        ))}
        {isOther ? (
          <Option
            hour={sel}
            first={false}
            label={t('wtOther')}
            value={valueOf(sel)}
            narrow={narrow}
            on
            today={mode === 'change' && todayHour === sel}
            onPress={() => {
              cue('select');
              setPage('wheel');
            }}
          />
        ) : (
          <Pressable
            onPress={() => {
              cue('select');
              setPage('wheel');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.opt, pressed && { backgroundColor: c.divider }]}
          >
            <View style={[styles.optDivider, { backgroundColor: c.divider }]} />
            <View style={styles.square} />
            <Txt numberOfLines={1} style={[styles.optLabel, styles.flex, { color: night ? c.doneInk : c.accentInk }]}>{t('wtOther')}</Txt>
            <Icon name="chevronRight" size={18} color={c.textMuted} />
          </Pressable>
        )}
      </View>
      {showQuitHint(kind, sel) && <Txt variant="small" color={c.textSoft} style={styles.hint}>{t('wtQuitHint')}</Txt>}
      {mode === 'change' && <Button title={t('wtDone')} onPress={done} cue="tap" style={styles.done} testID="watering-done" />}
    </Animated.View>
  );
}

const OPTION_LABEL = { 0: 'wtOptAny', 6: 'wtOptMorning', 12: 'wtOptDay', 18: 'wtOptEvening', 21: 'wtOptLate' } as const;

function Option({ hour, first, label, value, on, today, narrow, onPress }: {
  hour: OpenHour; first: boolean; label: string; value: string | null; on: boolean; today: boolean; narrow: boolean; onPress(): void;
}) {
  const { t } = useStore();
  const c = useColors();
  const look = hourLook(hour);
  return (
    <Pressable
      onPress={onPress}
      role="radio"
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={value ? `${label}, ${value}${today ? `, ${t('wtTodayTag')}` : ''}` : label}
      style={({ pressed }) => [styles.opt, narrow && styles.optNarrow, on && { backgroundColor: 'rgba(76,199,100,0.08)' }, pressed && { backgroundColor: c.divider }]}
    >
      {!first && <View style={[styles.optDivider, { backgroundColor: c.divider }]} />}
      <View style={[styles.square, { backgroundColor: look.tint }]}>
        <HourIcon name={look.icon} size={20} color="#FFFFFF" />
      </View>
      <View style={[styles.flex, styles.labelRow]}>
        <Txt numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.optLabel, today ? styles.keep : styles.shrink, { color: c.text }]}>{label}</Txt>
        {today && (
          <View style={[styles.tag, styles.shrink, { backgroundColor: c.divider }]}>
            <Txt numberOfLines={1} style={[styles.tagText, { color: c.textSoft }]}>{t('wtTodayTag')}</Txt>
          </View>
        )}
      </View>
      {value && <Txt numberOfLines={1} style={[styles.value, { color: c.textSoft }]}>{value}</Txt>}
      <Radio on={on} />
    </Pressable>
  );
}

function Radio({ on }: { on: boolean }) {
  const c = useColors();
  return on ? <Glyph name="check" size={24} /> : <View style={[styles.radio, { borderColor: c.textMuted }]} />;
}

/**
 * The wheel of whole hours: the hour on the white band is chosen by a tap on the band (the
 * green check); a tap on another hour rolls it onto the band. Sizes and fades follow the
 * distance from the band on the UI thread; a soft tick on every hour passed.
 */
function HourWheel({ initial, onPick }: { initial: OpenHour; onPick(hour: OpenHour): void }) {
  const { t, night } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const scroll = useRef<ComponentRef<typeof Animated.ScrollView>>(null);
  const start = Math.max(0, WHEEL_HOURS.indexOf(initial));
  const offset = useSharedValue(start * ROW);
  const centered = useRef(start);
  const onScroll = useAnimatedScrollHandler((e) => {
    offset.set(e.contentOffset.y);
  });
  const tick = useCallback((i: number) => {
    centered.current = i;
    cue('select');
  }, []);
  useAnimatedReaction(
    () => Math.max(0, Math.min(WHEEL_HOURS.length - 1, Math.round(offset.get() / ROW))),
    (i, prev) => {
      if (prev !== null && i !== prev) scheduleOnRN(tick, i);
    },
  );
  const placed = useRef(false);
  const place = () => {
    if (placed.current) return;
    placed.current = true;
    scroll.current?.scrollTo({ y: start * ROW, animated: false });
  };
  const tap = (i: number) => {
    if (i === centered.current && Math.abs(offset.get() - i * ROW) < ROW / 3) return onPick(WHEEL_HOURS[i]);
    scroll.current?.scrollTo({ y: i * ROW, animated: motionOn });
  };

  return (
    <View style={styles.wheel}>
      <View style={[styles.band, elevation(1, night), { backgroundColor: c.card }]} pointerEvents="none" />
      <Animated.ScrollView
        ref={scroll}
        onLayout={place}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Inside the sheet's own ScrollView: without this Android hands the drag to the outer one.
        nestedScrollEnabled
        snapToInterval={ROW}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.wheelContent}
        style={SNAP_WEB}
      >
        {WHEEL_HOURS.map((h, i) => (
          <WheelRow key={h} index={i} offset={offset} label={hourText(h, t.lang)} onPress={() => tap(i)} />
        ))}
      </Animated.ScrollView>
      <View style={styles.bandCheck} pointerEvents="none">
        <Glyph name="check" size={24} />
      </View>
    </View>
  );
}

function WheelRow({ index, offset, label, onPress }: {
  index: number; offset: SharedValue<number>; label: string; onPress(): void;
}) {
  const { t } = useStore();
  const c = useColors();
  const text = c.text;
  const soft = c.textSoft;
  const muted = c.textMuted;
  const row = useAnimatedStyle(() => {
    const d = Math.abs(offset.get() / ROW - index);
    return {
      opacity: interpolate(d, [0, 1, 2, 3], [1, 0.8, 0.45, 0.15], 'clamp'),
      transform: [{ scale: interpolate(d, [0, 1, 2], [1, 18 / 22, 16 / 22], 'clamp') }],
    };
  });
  const ink = useAnimatedStyle(() => {
    const d = Math.abs(offset.get() / ROW - index);
    return { color: interpolateColor(Math.min(d, 2), [0, 1, 2], [text, soft, muted]) };
  });
  const pre = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(offset.get() / ROW - index), [0, 0.5], [1, 0], 'clamp') }));
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={t('wtPickA11y', { time: label })} style={[styles.wheelRow, SNAP_ITEM_WEB]}>
      <Animated.View style={[styles.wheelInner, row]}>
        <Animated.Text style={[styles.wheelPre, { color: soft }, pre]}>{t('wtFrom', { time: '' }).trim()}</Animated.Text>
        <Animated.Text allowFontScaling={false} style={[styles.wheelHour, ink]}>{label}</Animated.Text>
        {/* Keeps the hour in the middle: as wide as "с" and its gap. */}
        <Animated.Text style={[styles.wheelPre, styles.hidden]}>{t('wtFrom', { time: '' }).trim()}</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // ModalSheet pads the safe area + 16 below; 8 more here: 24 over the home indicator.
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  flex: { flex: 1, minWidth: 0 },
  shrink: { flexShrink: 1 },
  keep: { flexShrink: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lead: { marginTop: 2 },
  info: { marginTop: 12, paddingHorizontal: 4, fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  card: { marginTop: 14, borderRadius: 20, overflow: 'hidden' },
  opt: { height: OPT_H, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  optNarrow: { gap: 10, paddingHorizontal: 12 },
  optDivider: { position: 'absolute', top: 0, left: 60, right: 0, height: 1.5 },
  square: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optLabel: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  value: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  tagText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, opacity: 0.7 },
  hint: { marginTop: 10, paddingHorizontal: 4 },
  done: { marginTop: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginVertical: (HIT - 36) / 2 },
  wheel: { height: WHEEL_H, marginTop: 28, overflow: 'hidden' },
  wheelContent: { paddingVertical: WHEEL_PAD },
  band: { position: 'absolute', left: 0, right: 0, top: WHEEL_PAD, height: ROW, borderRadius: 12 },
  bandCheck: { position: 'absolute', right: 12, top: WHEEL_PAD + (ROW - 24) / 2 },
  wheelRow: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  wheelInner: { flexDirection: 'row', alignItems: 'baseline' },
  wheelPre: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 26, marginHorizontal: 6 },
  wheelHour: { fontFamily: fonts.black, fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'] },
  hidden: { opacity: 0 },
  wheelNote: { textAlign: 'center', marginTop: 20, fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
});
