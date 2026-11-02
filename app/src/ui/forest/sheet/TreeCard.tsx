// The card of the tree tapped on the map (spec 3.2, frames 08, 09, 19, 22): its picture,
// name (the tree's own over the habit's, wave 4), state and facts, then the main button (water / view / plant from its seed),
// "Move" and "⋯". A narrow screen or a long main button puts it on its own row.
// OYUUR-34 (design/oyuur-33/спец.md 5.3, frame 09): a growing tree has the chip "Watering from
// 18:00 ›" (it opens the watering-time sheet; on a friend's tree it only tells), under it
// "tomorrow — from 12:00" when a change waits; before the hour the status is "Ждёт вечера · 24
// дня" and the main button "Water from 18:00" is muted (a tap tells how long to wait).
import { ComponentRef, useEffect, useRef } from 'react';
import { LayoutChangeEvent, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Habit, isGrowing, nextOpenHour, openHourOn, seedUsed, wateringOpensAt } from '@/game/tree';
import { useStore } from '@/state/store';
import { ButtonVariant, buttonLook, elevation, fonts, Glyph, GlyphName, HIT, Icon, IconName, MAX_FONT_SCALE, motion, Pill, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { ClockGlyph, StateMark } from '@/ui/watering/art';
import { fromText, hourText } from '@/ui/watering/format';
import { CardAction, cardMain, daysText, statusLine, totalDays } from './status';
import { ThumbBox } from './ThumbBox';

/** The card's buttons: 48 high on a 4 px lip (the design system's M size). */
const BTN = 48;
const LIP = 4;
/** The picture (ThumbBox "card"), and its size on a narrow screen. */
const THUMB = 76;
const THUMB_NARROW = 64;

export type { CardAction };

/** A friend's tree (wave 5, спец-друзья 7): "View", "Cheer" (once a day, then "Sent"), "⋯"; no "Move". */
export interface CardView {
  cheered: boolean;
  onCheer(): void;
}

/** Where the "⋯" button is, in the screen's own coordinates. */
export interface Anchor { x: number; y: number; width: number; height: number }

interface Props {
  habit: Habit;
  /** Narrower than 360: two rows of buttons, compact pills, the name on one line. */
  narrow: boolean;
  /** The tree just locked in (`?highlight`, spec 5.4): its "View" is gold. */
  golden: boolean;
  onClose(): void;
  onAction(action: CardAction): void;
  onMove(): void;
  /** `at` is the "⋯" button's rectangle in the window. */
  onMore(at: Anchor): void;
  onLayout?(e: LayoutChangeEvent): void;
  view?: CardView;
  /** The watering-time chip was tapped (my trees); without it the chip only tells (a friend's). */
  onHour?(): void;
}

export function TreeCard({ habit, narrow, golden, onClose, onAction, onMove, onMore, onLayout, view, onHour }: Props) {
  const { t, today, trees, settings, clock } = useStore();
  const c = useColors();
  const tree = habit.current;
  const { glyph, line, state } = statusLine(habit, today, t, clock);
  const more = useRef<ComponentRef<typeof View>>(null);
  // The same tree with another name (renamed from "⋯"): only the name fades, not the card.
  const shown = useRef<{ id: string; nickname: string | null } | null>(null);
  const renamed = shown.current !== null && shown.current.id === tree.id && shown.current.nickname !== tree.nickname;
  useEffect(() => {
    shown.current = { id: tree.id, nickname: tree.nickname };
  }, [tree.id, tree.nickname]);

  // The main button (cardMain: green only for today's deed) and the facts of each state (table 3.2).
  const { action, variant } = cardMain(state, { seedUsed: state === 'dead' && seedUsed(tree, trees), golden });
  const main: { title: string; variant: CardVariant; glyph?: GlyphName; icon?: IconName; action: CardAction } =
    action === 'water' && variant === 'waiting'
      ? { title: t('wtWaterFrom', { time: hourText(wateringOpensAt(tree, today), t.lang) }), variant, action }
      : action === 'water'
      ? { title: t('waterIt'), variant, glyph: 'drop', action }
      : action === 'plant'
        ? { title: t('plantFromSeed'), variant, glyph: 'seed', action }
        : { title: t('viewTree'), variant, icon: 'eye', action };
  const pills: { key: string; label: string; glyph?: GlyphName; icon?: IconName }[] = [];
  const days = daysText(t, tree.checkins.length);
  if (state === 'dead') {
    // On a narrow screen "2-я попытка" is "2-я" by the stump, so both facts fit one line.
    if (tree.generation > 1) pills.push({ key: 'try', glyph: 'stump', label: t(narrow ? 'tryShort' : 'tryN', { n: tree.generation }) });
    pills.push({ key: 'total', glyph: 'rings', label: t('daysTotal', { days: daysText(t, totalDays(habit)) }) });
  } else if (state === 'locked') {
    pills.push({ key: 'days', glyph: 'rings', label: days });
    if (tree.frozen.length > 0) pills.push({ key: 'frozen', glyph: 'snowflake', label: String(tree.frozen.length) });
  } else if (view) {
    // A friend's tree: no "Only me / Friends" mark — every tree here is open (спец-друзья 7).
    pills.push({ key: 'days', glyph: 'rings', label: days });
    pills.push({ key: 'chances', glyph: 'heart', label: String(tree.chancesLeft) });
  } else {
    pills.push({ key: 'days', glyph: 'rings', label: days });
    pills.push(
      tree.visibility === 'private'
        ? { key: 'vis', icon: 'lock', label: t('visibilityPrivate') }
        : { key: 'vis', icon: 'people', label: t('friends') },
    );
  }
  const twoRows = !view && (narrow || main.action === 'plant');
  const nextHour = nextOpenHour(tree, today);
  // The planting day is open at once, whatever hour was chosen (спец 0): the chip shows the hour
  // from tomorrow on and says under it that today is any time.
  const plantDay = tree.plantedOn === today;
  const chipHour = plantDay ? (nextHour ?? openHourOn(tree, today)) : openHourOn(tree, today);
  const chipNote = plantDay
    ? (chipHour !== 0 ? t('wtPlantDayNote') : null)
    : nextHour !== null ? t('wtTomorrow', { when: fromText(nextHour, t) }) : null;

  const openMore = () => {
    more.current?.measureInWindow((x, y, width, height) => onMore({ x, y, width, height }));
  };

  const mainButton = (
    <CardButton
      title={main.title}
      variant={main.variant}
      glyph={main.glyph}
      icon={main.icon}
      onPress={() => onAction(main.action)}
      style={styles.grow}
    />
  );
  return (
    <View onLayout={onLayout} style={styles.card}>
      {/* A new tree's facts fade in; the sheet itself stays where it is (spec 3.1). */}
      <Animated.View key={habit.lineageId + tree.id} entering={settings.animations ? FadeIn.duration(motion.still) : undefined}>
        <View style={styles.top}>
          {/* A narrow screen gives the text more room: the picture is 64 instead of 76. */}
          {narrow ? (
            <View style={styles.thumbNarrow}>
              <View style={styles.thumbScaled}>
                <ThumbBox habit={habit} kind="card" />
              </View>
            </View>
          ) : (
            <ThumbBox habit={habit} kind="card" />
          )}
          <View style={styles.text}>
            {/* A new name fades in (wave 4, section 4: "in the forest"). */}
            <Animated.View key={tree.nickname ?? ''} entering={settings.animations && renamed ? FadeIn.duration(motion.still) : undefined}>
              {tree.nickname !== null ? (
                <>
                  {/* The tree's own name first, always one line; the habit under it (wave 4, 5.2, frame 15). */}
                  <Txt variant="title3" numberOfLines={1} ellipsizeMode="tail" style={styles.clearClose}>{tree.nickname}</Txt>
                  <Txt variant="small" color={c.textSoft} numberOfLines={1} ellipsizeMode="tail" style={[styles.habit, styles.clearClose]}>{tree.name}</Txt>
                </>
              ) : (
                // On a narrow screen the name keeps to one line, so the card stays under half the screen.
                <Txt variant="title3" numberOfLines={narrow ? 1 : 2} ellipsizeMode="tail" style={styles.clearClose}>{tree.name}</Txt>
              )}
            </Animated.View>
            {/* One line: rather "…" than one word alone on the next line (the days are in a pill anyway).
                On a narrow screen it may take two lines rather than lose its end. */}
            <View style={[styles.status, styles.clearClose]}>
              <StateMark name={glyph} size={16} />
              <Txt variant="small" color={c.textSoft} numberOfLines={narrow ? 2 : 1} ellipsizeMode="tail" style={styles.statusText}>{line}</Txt>
            </View>
            <View style={styles.pills}>
              {pills.map((p) => (
                <Pill key={p.key} size="s" compact glyph={p.glyph} icon={p.icon} label={p.label} />
              ))}
              {isGrowing(tree) && <HourChip hour={chipHour} onPress={view ? undefined : onHour} />}
            </View>
            {/* The chip has the chosen hour; on the planting day it holds only from tomorrow — said under it. */}
            {isGrowing(tree) && !view && chipNote !== null && (
              <Txt variant="caption" color={c.textSoft} style={styles.tomorrow}>{chipNote}</Txt>
            )}
          </View>
        </View>
        <View style={[styles.buttons, (twoRows || (view && narrow)) && styles.buttonsTwo]}>
          {twoRows && <View style={styles.row}>{mainButton}</View>}
          {view ? (
            // A friend's tree; on a narrow screen "View" gets a row of its own, so no label is cut.
            <>
              {narrow && (
                <View style={styles.row}>
                  <CardButton title={t('viewTree')} variant="secondary" icon="eye" onPress={() => onAction('view')} style={styles.grow} />
                </View>
              )}
              <View style={styles.row}>
                {!narrow && <CardButton title={t('viewTree')} variant="secondary" icon="eye" onPress={() => onAction('view')} style={styles.grow} />}
                <CardButton
                  title={view.cheered ? t('tgCheerSent') : t('tgCheer')}
                  variant={view.cheered ? 'done' : 'warm'}
                  glyph={view.cheered ? 'check' : 'cheer'}
                  onPress={view.cheered ? () => {} : view.onCheer}
                  style={styles.grow}
                />
                <View ref={more} collapsable={false}>
                  <CardButton variant="secondary" icon="more" label={t('more')} onPress={openMore} style={styles.square} />
                </View>
              </View>
            </>
          ) : (
            <View style={styles.row}>
              {!twoRows && mainButton}
              <CardButton title={t('moveTree')} variant="secondary" icon="move" onPress={onMove} style={styles.grow} />
              <View ref={more} collapsable={false}>
                <CardButton variant="secondary" icon="more" label={t('more')} onPress={openMore} style={styles.square} />
              </View>
            </View>
          )}
        </View>
      </Animated.View>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('close')} style={styles.close} hitSlop={6}>
        <View style={[styles.closeCircle, { backgroundColor: c.sunken }]}>
          <Icon name="close" size={16} color={c.text} />
        </View>
      </Pressable>
    </View>
  );
}

/** The watering hour: "Полив с 18:00 ›" (a button on my tree), "Полив в любое время". */
function HourChip({ hour, onPress }: { hour: number; onPress?: () => void }) {
  const { t, night } = useStore();
  const c = useColors();
  const label = hour === 0 ? t('wtChipAny') : t('wtChipFrom', { time: hourText(hour, t.lang) });
  const body = (
    <>
      <ClockGlyph size={16} />
      <Txt numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.chipText, { color: c.text }]}>{label}</Txt>
      {onPress && <Icon name="chevronRight" size={14} color={c.textSoft} strokeWidth={2.8} />}
    </>
  );
  const look = [styles.chip, elevation(1, night), { backgroundColor: c.card }];
  if (!onPress) return <View style={look}>{body}</View>;
  return (
    <Pressable
      onPress={() => {
        cue('select');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8 }}
      testID="watering-chip"
      style={({ pressed }) => [look, pressed && { opacity: 0.7 }]}
    >
      {body}
    </Pressable>
  );
}

/** The card's button looks: the design system's, and the muted green of "Water from 18:00" (frame 09). */
type CardVariant = ButtonVariant | 'waiting';
function cardLook(variant: CardVariant, c: ReturnType<typeof useColors>, night: boolean): { face: string; lip: string | null; ink: string } {
  if (variant !== 'waiting') return buttonLook(variant, c);
  return { face: c.accentSoft, lip: night ? '#1F4540' : '#B5E3BD', ink: night ? c.doneInk : c.accentInk };
}

/**
 * The design system's M button (a face on a lip, the same colors and press) with the
 * mockup's tight padding: three buttons share one row at 375, and "Переставить" fits.
 * Without a title it is a 48 × 48 square with one icon ("⋯").
 */
function CardButton({ title, label, variant, glyph, icon, onPress, style }: {
  title?: string; label?: string; variant: CardVariant; glyph?: GlyphName; icon?: IconName;
  onPress(): void; style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const { night } = useStore();
  const motionOn = useMotionOn();
  const look = cardLook(variant, c, night);
  const press = useSharedValue(0);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: (LIP - 1) * press.get() }] }));
  return (
    <Pressable
      onPressIn={() => press.set(withTiming(1, { duration: motion.press }))}
      onPressOut={() => press.set(motionOn ? withSpring(0, motion.spring.press) : withTiming(0, { duration: motion.still }))}
      onPress={() => {
        // Before the hour: the soft "already" (спец 5.2), not a tap that promises watering.
        cue(variant === 'secondary' ? 'select' : variant === 'waiting' ? 'already' : 'tap');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      style={[styles.button, style]}
    >
      <View style={[styles.lip, { backgroundColor: look.lip ?? undefined }]} />
      <Animated.View style={[styles.face, { backgroundColor: look.face }, face]}>
        {glyph ? <Glyph name={glyph} size={22} /> : icon ? <Icon name={icon} size={title ? 20 : 22} color={look.ink} /> : null}
        {title ? (
          <Txt numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.buttonText, { color: look.ink }]}>{title}</Txt>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 4, paddingBottom: 18 },
  top: { flexDirection: 'row', gap: 14, paddingHorizontal: 16, minHeight: 82 },
  text: { flex: 1, minWidth: 0 },
  // The name and the status line keep clear of "×"; the pills below it have the whole width.
  clearClose: { marginRight: 36 },
  thumbNarrow: { width: THUMB_NARROW, height: THUMB_NARROW },
  thumbScaled: { transform: [{ scale: THUMB_NARROW / THUMB }], transformOrigin: 'left top' },
  habit: { fontFamily: fonts.bold },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusText: { flexShrink: 1 },
  // A pill is never cut: what doesn't fit goes to the next line.
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7, paddingBottom: 4 },
  chip: { height: 28, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 7, paddingRight: 8 },
  chipText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  tomorrow: { marginLeft: 4, marginTop: -1 },
  buttons: { paddingHorizontal: 16, marginTop: 14 - 4 },
  buttonsTwo: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  // Both share the row by their content, so neither label is cut while the other has room.
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 0 },
  close: { position: 'absolute', right: 16 - 6, top: 4 - 2 - 6, width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' },
  closeCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  button: { height: BTN + LIP },
  lip: { position: 'absolute', left: 0, right: 0, top: LIP, height: BTN, borderRadius: 14 },
  face: { height: BTN, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  buttonText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, flexShrink: 1 },
  square: { width: BTN },
});
