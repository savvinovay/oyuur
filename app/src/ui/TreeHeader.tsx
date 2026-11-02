// Parts shared by the main screen and the read-only view of a locked-in habit.
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, TextStyle, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { growthDays, isCompleted, isDead, isGrowing, MAX_CHANCES, Tree } from '@/game/tree';
import { useStore } from '@/state/store';
import { cue } from './feedback';
import { elevation, fonts, Glyph, Icon, Txt, type, useColors, withAlpha } from './ds';
import { textShadow } from './kit';
import { banner, BannerShow, named, useChannel } from './live/events';
import { RingCounter } from './live/RingCounter';
import { NAME_SHOW, NameCelebration } from './naming/NameCelebration';

/** Heights of the two lines under the counter (title3 and small). */
const LINE1 = 24;
const LINE2 = 20;
/** Without animations the lines just cross-fade, then the header is plain again. */
const REDUCED_SHOW = 200;
/** Marks where the habit goes in "{habit} · generation {n} of {total}". */
const HABIT_MARK = '\u0001';
/** A long name shrinks to fit the line down to this much of its size, then ends with "…". */
const MIN_TITLE_SCALE = 0.8;
/** The tap area reaches this far past the text on each side. */
const PRESS_PAD = 8;
/** The hearts pill (wave 5 spec 2.3): 16 from the right edge, 12 below the counter's top, 28 tall. */
const HEARTS_RIGHT = 16;
const HEARTS_TOP = 12;
const HEARTS_H = 28;
const HEARTS_PAD = 7;
const HEARTS_GAP = 2;
const HEART = 15;
const HEART_SMALL = 13;
const HINT_W = 300;
const heartsWidth = (heart: number) => 2 * HEARTS_PAD + MAX_CHANCES * heart + (MAX_CHANCES - 1) * HEARTS_GAP;

/** Spaces at the ends of a piece of line 2 would be eaten where two texts meet: keep them unbreakable. */
const keepSpaces = (s: string) => s.replace(/^ +| +$/g, (m) => '\u00A0'.repeat(m.length));

/** What the two lines say. */
interface Lines {
  /** The tree's name, or the habit's when it has none. */
  title: string;
  named: boolean;
  /** Line 2: the habit (named trees) and / or which generation; '' — not there. */
  habit: string;
  gen: string;
}

type ShowKind = 'named' | 'renamed' | 'removed';
type Show = { treeId: string; kind: ShowKind; reduced: boolean; before: Lines; id: number };

/**
 * The day counter with its mark, then two lines (wave 4 spec, 5.1): the tree's name big and
 * the habit small under it; without a name the habit on top and, for several generations,
 * which generation this is. Line 2 always keeps its room, so naming a tree never moves the
 * scene. With `onNamePress` the lines are a button that opens the name sheet.
 */
export function TreeHeader({ tree, position, total, onNamePress, chancesOpen = false, onChances, line2: line2Over }: {
  tree: Tree; position: number; total: number;
  /** Line 2 drawn by the screen instead (a shared tree: "with Aisha" and the half avatars, wave 5). */
  line2?: ReactNode;
  /** Tap on the lines: name or rename the tree (main screen only; the read-only view has none). */
  onNamePress?: () => void;
  /** The chances hint under the hearts is open. */
  chancesOpen?: boolean;
  /** Tap on the hearts (main screen only): with it a growing tree shows its chances in the counter's row. */
  onChances?: () => void;
}) {
  const { t, night } = useStore();
  const c = useColors();
  const { width: screenW } = useWindowDimensions();

  // ---- The hearts: this tree's chances, right of the counter (wave 5 spec 2.3) ----
  const hearts = onChances !== undefined && isGrowing(tree);
  const [headerW, setHeaderW] = useState(0);
  const [counterRight, setCounterRight] = useState(0);
  const onHeaderLayout = (e: LayoutChangeEvent) => setHeaderW(Math.round(e.nativeEvent.layout.width));
  const onCounter = (e: LayoutChangeEvent) => setCounterRight(Math.ceil(e.nativeEvent.layout.x + e.nativeEvent.layout.width));
  // A long counter on a narrow phone would touch the pill: the hearts get smaller.
  const tight = headerW > 0 && counterRight + 8 > headerW - HEARTS_RIGHT - heartsWidth(HEART);
  const heart = tight ? HEART_SMALL : HEART;
  // Both lines step back while the "new stage" ribbon is shown under them.
  const linesAlpha = useSharedValue(1);
  useChannel(
    banner,
    useCallback((b: BannerShow | null) => linesAlpha.set(withTiming(b && b.treeId === tree.id ? 0.35 : 1, { duration: 200 })), [tree.id, linesAlpha]),
  );
  useEffect(() => linesAlpha.set(1), [tree.id, linesAlpha]);
  const linesStyle = useAnimatedStyle(() => ({ opacity: linesAlpha.get() }));

  // ---- What the lines say now ----
  const isNamed = tree.nickname !== null;
  let habit = '';
  let gen = '';
  if (isNamed && total > 1) {
    const [before, after = ''] = t('habitGenLine', { habit: HABIT_MARK, n: position, total }).split(HABIT_MARK);
    habit = keepSpaces(before + tree.name);
    gen = keepSpaces(after);
  } else if (isNamed) {
    habit = tree.name;
  } else if (total > 1) {
    gen = t('generationOf', { n: position, total });
  }
  const lines: Lines = { title: tree.nickname ?? tree.name, named: isNamed, habit, gen };
  // The lines as last drawn: the "before" of a show (the event comes before the renamed tree does).
  const drawn = useRef({ treeId: tree.id, lines });
  useEffect(() => {
    drawn.current = { treeId: tree.id, lines };
  });

  // ---- The name show (spec 4) ----
  const [show, setShow] = useState<Show | null>(null);
  useChannel(
    named,
    useCallback((e: { treeId: string; kind: ShowKind; reduced: boolean }) => {
      if (e.treeId !== drawn.current.treeId) return;
      setShow({ ...e, before: drawn.current.lines, id: Date.now() });
    }, []),
  );
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => setShow(null), show.reduced ? REDUCED_SHOW : NAME_SHOW);
    return () => clearTimeout(id);
  }, [show]);
  const playing = show && show.treeId === tree.id ? show : null;

  // ---- Pressed look ----
  const pressed = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ opacity: pressed.get() }));

  // ---- Widths: a long name shrinks to fit; only the text itself is a button ----
  // (a full-width button over the scene would catch the swipes between habits).
  const [linesW, setLinesW] = useState(0);
  const [titleW, setTitleW] = useState(0);
  const [line2W, setLine2W] = useState(0);
  const onLines = (e: LayoutChangeEvent) => setLinesW(Math.round(e.nativeEvent.layout.width));
  const onTitle = (e: LayoutChangeEvent) => setTitleW(Math.ceil(e.nativeEvent.layout.width));
  const onLine2 = (e: LayoutChangeEvent) => setLine2W(Math.ceil(e.nativeEvent.layout.width));
  // A couple of px to spare: text scaled to the exact width is cut by rounding.
  const fit = linesW > 0 && titleW > linesW ? Math.max(MIN_TITLE_SCALE, (linesW - 3) / titleW) : 1;

  let counter;
  if (isDead(tree) || isCompleted(tree)) {
    counter = (
      <View style={styles.counter}>
        <Glyph name={isDead(tree) ? 'tombstone' : 'plaque'} size={40} />
        <Txt variant="counter" style={textShadow}>{growthDays(tree)}</Txt>
      </View>
    );
  } else {
    counter = <RingCounter treeId={tree.id} value={growthDays(tree)} />;
  }

  // A name is set solid in the heaviest weight (white with a shadow at night); the habit on top as before.
  const titleStyle = (l: Lines, scale = 1): TextStyle[] => [
    type.title3,
    { color: c.text },
    l.named ? styles.nameText : styles.habitText,
    ...(l.named && night ? [textShadow] : []),
    ...(scale < 1 ? [{ fontSize: (type.title3.fontSize ?? 18) * scale }] : []),
  ];
  const title1 = (l: Lines, scale = 1) => (
    <Txt variant="title3" style={[...titleStyle(l, scale), styles.center]} numberOfLines={1} ellipsizeMode="tail">{l.title}</Txt>
  );
  const line2 = (l: Lines, measure = false) =>
    l.habit || l.gen ? (
      // The habit gives way first; the generation's tail always stays whole.
      <View style={styles.line2Row}>
        <View style={styles.line2Text} onLayout={measure ? onLine2 : undefined}>
          {l.habit !== '' && <Txt variant="small" color={c.textSoft} numberOfLines={1} ellipsizeMode="tail" style={styles.shrink}>{l.habit}</Txt>}
          {l.gen !== '' && <Txt variant="small" color={c.textSoft} numberOfLines={1} style={styles.keep}>{l.gen}</Txt>}
        </View>
      </View>
    ) : null;

  let first: ReactNode = title1(lines, fit);
  let second: ReactNode = line2Over ?? line2(lines, true);
  if (playing) {
    const b = playing.before;
    const quick = playing.reduced;
    first = (
      <>
        <Fade key={`a${playing.id}`} out duration={quick ? REDUCED_SHOW : 160} dy={quick ? 0 : 6}>{title1(b)}</Fade>
        {lines.named && !quick ? (
          <NameCelebration key={`b${playing.id}`} name={lines.title} style={titleStyle(lines, fit)} height={LINE1} night={night} />
        ) : (
          <Fade key={`b${playing.id}`} duration={200}>{title1(lines, fit)}</Fade>
        )}
      </>
    );
    if (!line2Over && (b.habit !== lines.habit || b.gen !== lines.gen)) {
      second = (
        <>
          <Fade key={`c${playing.id}`} out duration={quick ? REDUCED_SHOW : 160}>{line2(b)}</Fade>
          <Fade key={`d${playing.id}`} duration={200} delay={quick ? 0 : 80} dy={quick ? 0 : -4}>{line2(lines, true)}</Fade>
        </>
      );
    }
  }

  // The button covers the text (the wider of the two lines) and 8 px around it, never the whole width.
  // The second line's width is measured only while it shows: a line that went away must not widen the button.
  const textW = Math.max(Math.min(titleW * fit, linesW), !line2Over && (lines.habit || lines.gen) ? line2W : 0);
  const pressW = linesW > 0 && textW > 0 ? Math.min(linesW, textW + 2 * PRESS_PAD) : linesW;
  return (
    <View style={styles.header} pointerEvents="box-none" onLayout={onHeaderLayout}>
      <View pointerEvents="none" onLayout={onCounter}>{counter}</View>
      {hearts && (
        <Pressable
          onPress={() => {
            cue('select');
            onChances();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={`${t('chances')}: ${tree.chancesLeft}`}
          accessibilityState={{ expanded: chancesOpen }}
          style={[styles.hearts, { backgroundColor: c.pill }, elevation(1, night)]}
        >
          {Array.from({ length: MAX_CHANCES }, (_, i) => (
            <Glyph key={i} name={i < tree.chancesLeft ? 'heart' : 'heartEmpty'} size={heart} />
          ))}
        </Pressable>
      )}
      {hearts && chancesOpen && (
        <View style={[styles.hint, { width: Math.min(HINT_W, screenW - 2 * HEARTS_RIGHT), backgroundColor: c.card }, elevation(2, night)]}>
          <Txt variant="small" color={c.text}>{t('chancesHint')}</Txt>
        </View>
      )}
      {/* Stretched to the header's width, so a long name ends with "…" instead of running off both sides. */}
      <Animated.View style={[styles.lines, linesStyle]} pointerEvents="box-none" onLayout={onLines}>
        {/* With a button over them the lines are read out by the button's own label. */}
        <Animated.View
          style={pressStyle}
          pointerEvents="none"
          accessibilityElementsHidden={!!onNamePress}
          importantForAccessibility={onNamePress ? 'no-hide-descendants' : 'auto'}
        >
          <View style={styles.line1}>{first}</View>
          <View style={styles.line2}>{second}</View>
        </Animated.View>
        {/* The name's natural width at full size, for the shrink above. */}
        <View style={styles.measureBox} pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants">
          <View style={styles.measure}>
            <Txt variant="title3" style={titleStyle(lines)} numberOfLines={1} onLayout={onTitle}>{lines.title}</Txt>
          </View>
        </View>
        {onNamePress && (
          <Pressable
            onPress={() => {
              cue('select');
              onNamePress();
            }}
            onPressIn={() => pressed.set(withTiming(0.6, { duration: 100 }))}
            onPressOut={() => pressed.set(withTiming(1, { duration: 100 }))}
            hitSlop={{ top: PRESS_PAD, bottom: PRESS_PAD }}
            accessibilityRole="button"
            accessibilityLabel={isNamed ? t('headerNamedA11y', { name: lines.title, habit: tree.name }) : t('headerUnnamedA11y', { habit: tree.name })}
            testID="tree-name"
            style={[styles.press, { width: pressW, left: (linesW - pressW) / 2 }]}
          />
        )}
      </Animated.View>
    </View>
  );
}

/** A layer of a line that fades in (or out), sliding a little. */
function Fade({ children, out = false, duration, delay = 0, dy = 0 }: { children: ReactNode; out?: boolean; duration: number; delay?: number; dy?: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    const easing = out ? Easing.in(Easing.cubic) : Easing.out(Easing.cubic);
    p.set(withDelay(delay, withTiming(1, { duration, easing })));
  }, [p, out, duration, delay]);
  const style = useAnimatedStyle(() => {
    const v = p.get();
    return out ? { opacity: 1 - v, transform: [{ translateY: dy * v }] } : { opacity: v, transform: [{ translateY: dy * (1 - v) }] };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.fade, style]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

/** Round button beside the tree that walks through the generations of one habit (spec 4.8). */
export function GenerationArrow({ side, onPress, color }: { side: 'left' | 'right'; onPress: () => void; color?: string }) {
  const { night } = useStore();
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        cue('select');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={side}
      style={[styles.arrow, side === 'left' ? { left: 6 } : { right: 6 }]}
    >
      <View style={[styles.circle, elevation(1, night), { backgroundColor: withAlpha(c.card, 0.9) }]}>
        <Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} size={24} color={color ?? c.text} strokeWidth={2.6} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingHorizontal: 24, marginTop: 4 },
  lines: { alignSelf: 'stretch' },
  line1: { height: LINE1, justifyContent: 'center' },
  line2: { height: LINE2, justifyContent: 'center' },
  line2Row: { flexDirection: 'row', justifyContent: 'center' },
  line2Text: { flexDirection: 'row', maxWidth: '100%' },
  press: { position: 'absolute', top: 0, height: LINE1 + LINE2 },
  // A box of no size (nothing spills or scrolls) holding a wide row the name is measured in.
  measureBox: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', opacity: 0 },
  measure: { width: 2000, alignItems: 'flex-start' },
  shrink: { flexShrink: 1 },
  keep: { flexShrink: 0 },
  center: { textAlign: 'center' },
  fade: { justifyContent: 'center' },
  habitText: { fontFamily: fonts.bold, opacity: 0.85 },
  nameText: { fontFamily: fonts.black, opacity: 1 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hearts: {
    position: 'absolute',
    right: HEARTS_RIGHT,
    top: HEARTS_TOP,
    height: HEARTS_H,
    borderRadius: HEARTS_H / 2,
    paddingHorizontal: HEARTS_PAD,
    gap: HEARTS_GAP,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hint: { position: 'absolute', right: HEARTS_RIGHT, top: HEARTS_TOP + HEARTS_H + 8, padding: 12, borderRadius: 14, zIndex: 10 },
  arrow: { position: 'absolute', top: '40%', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
