// Row of day cards under the tree: what happened on each recent day (frame 24).
// A growing tree's strip keeps "today" in the middle (frame 15), a finished one ends
// at the right edge with its last day (frame 21). The strip always reaches both edges:
// a young tree's days before planting are blank faded cards, so it is never pressed
// to the left, and "today" never jumps when the strip grows after watering.
import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';
import { addDays, DayKey } from '@/game/dates';
import { nextStage, Tree, wateringOpensAt } from '@/game/tree';
import { useStore } from '@/state/store';
import { Colors, elevation, fonts, Glyph, Icon, Txt, useColors } from './ds';
import { treeWaits } from './sheet/wait';
import { hourText } from './watering/format';
import { DayFace, DayFrame, DayLook, dayLook } from './dayLook';

const PAST_DAYS = 13;
const FUTURE_DAYS = 2;
/** The next-stage day gets its own card if it is at most this far ahead. */
const FORECAST_DAYS = 10;

const faceColors = (face: DayFace, c: Colors): { bg: string; fg: string } => {
  switch (face) {
    case 'frozen': return { bg: c.frozen, fg: c.frozenInk };
    case 'danger': return { bg: c.danger, fg: '#FFFFFF' };
    case 'muted': return { bg: c.sunken, fg: c.textMuted };
    default: return { bg: c.card, fg: c.text };
  }
};

const frameStyle = (frame: DayFrame, c: Colors) => {
  switch (frame) {
    case 'water': return { borderColor: c.water, borderWidth: 3 };
    case 'accent': return { borderColor: c.accent, borderWidth: 3 };
    case 'gold': return { borderColor: c.gold, borderWidth: 2 };
    case 'stage': return { borderColor: c.accent, borderWidth: 2, borderStyle: 'dashed' as const };
    case 'wait': return { borderColor: c.textMuted, borderWidth: 3 };
    default: return null;
  }
};

function Mark({ look, ink, soft, lang }: { look: DayLook; ink: string; soft: string; lang: 'en' | 'ru' }) {
  switch (look.mark) {
    // Today before the watering hour (OYUUR-33, frame 06): the clock and "18:00".
    case 'clock': return (
      <View style={styles.wait}>
        <Icon name="clock" size={12} color={soft} strokeWidth={2.6} />
        <Txt numberOfLines={1} style={[styles.waitText, { color: soft }]}>{look.hour !== null ? hourText(look.hour, lang) : ''}</Txt>
      </View>
    );
    case 'sprout': return <Glyph name="sprout" size={18} />;
    case 'drop': return <Glyph name="drop" size={16} />;
    case 'snowflake': return <Glyph name="snowflake" size={16} />;
    case 'tombstone': return <Glyph name="tombstone" size={16} muted={look.face === 'muted'} />;
    case 'stageUp': return <Glyph name="stageUp" size={18} />;
    case 'plaque': return <Glyph name="plaque" size={18} />;
    case 'close': return <Icon name="close" size={14} color={ink} strokeWidth={2.6} />;
    default: return null;
  }
}

/**
 * `full` shows the whole life of the tree from planting, not only the last two weeks.
 * `calm` — a look back (a locked-in or dead tree): missed days without red.
 */
export function DayStrip({ tree, full = false, calm = false }: { tree: Tree; full?: boolean; calm?: boolean }) {
  const { today, night, t, clock } = useStore();
  const c = useColors();
  const list = useRef<FlatList<DayKey>>(null);
  const screen = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  // Until the strip has measured itself it is as wide as the app's column.
  const width = measured || Math.min(screen.width, 460);
  const next = nextStage(tree, today);
  const waitHour = treeWaits(tree, today, clock) ? wateringOpensAt(tree, today) : null;
  const showNext = next && next.on <= addDays(today, FORECAST_DAYS) ? next : null;

  // A dead or locked-in tree's strip ends at its last day; a growing one runs a little
  // past today, or up to the day it reaches its next stage.
  const soon = addDays(today, FUTURE_DAYS);
  const lastDay = tree.diedOn ?? tree.completedOn;
  let end = lastDay ?? (showNext && showNext.on > soon ? showNext.on : soon);
  // Two weeks of history before the focus day: today, or the last day of a finished tree.
  const focus = lastDay ?? today;
  let start = full ? tree.plantedOn : [addDays(focus, -PAST_DAYS), tree.plantedOn].sort().pop()!;
  const { card, gap, step } = cardSize(width);
  const size = { width: card, marginRight: gap };
  // Cards from the middle of the strip to its edge, and across all of it.
  const half = Math.ceil((width / 2 + card / 2 + gap) / step);
  const across = Math.ceil(width / step) + 1;
  if (lastDay) {
    start = [start, addDays(lastDay, 1 - across)].sort()[0];
  } else {
    start = [start, addDays(focus, -half)].sort()[0];
    end = [end, addDays(focus, half)].sort().pop()!;
  }
  const days: DayKey[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  // A growing tree: today in the middle. A finished one: its last day at the right edge.
  const focusIndex = days.indexOf(focus);
  const offset = lastDay
    ? PAD + days.length * step - gap + (PAD - gap) - width
    : PAD + focusIndex * step + card / 2 - width / 2;
  const scrollToFocus = () => list.current?.scrollToOffset({ offset: Math.max(0, offset), animated: false });
  useEffect(() => {
    const id = setTimeout(scrollToFocus, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.id, today, offset]);

  const renderDay = ({ item: day }: { item: DayKey }) => {
    const look = dayLook(tree, day, today, showNext?.on ?? null, calm, waitHour);
    if (look.blank) {
      return <View style={[styles.card, size, { backgroundColor: c.card, opacity: 0.4 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
    }
    const { bg, fg } = faceColors(look.face, c);
    const isStageDay = look.mark === 'stageUp';
    const weekday = t.dict.weekdays[new Date(`${day}T12:00:00`).getDay()];
    // The icon already tells frozen and died days apart; the label stays a short weekday.
    // "Today" follows the date, so it stays after the tree is watered.
    const label = look.isToday ? t('dayToday') : weekday;
    return (
      <View
        accessibilityLabel={`${look.isToday ? t('dayToday') : day} ${look.status}${isStageDay && showNext ? ` ${t.dict.stageNames[showNext.stage]}` : ''}`}
        style={[styles.card, size, elevation(1, night), { backgroundColor: bg, opacity: look.future ? 0.55 : 1 }, frameStyle(look.frame, c)]}
      >
        <Txt variant="caption" style={{ color: fg, fontSize: card < CARD_WIDTH ? 12 : 13 }} numberOfLines={1}>{label}</Txt>
        <Txt variant="number" style={{ color: fg }}>{Number(day.slice(8))}</Txt>
        <View style={styles.mark}>
          <Mark look={look} ink={look.face === 'muted' ? c.textMuted : '#FFFFFF'} soft={c.textSoft} lang={t.lang} />
        </View>
      </View>
    );
  };

  // A list, not a plain row: a tree locked in after a year has hundreds of days,
  // and only the cards on screen get drawn.
  return (
    <FlatList
      ref={list}
      horizontal
      data={days}
      keyExtractor={(day) => day}
      renderItem={renderDay}
      getItemLayout={(_, index) => ({ length: step, offset: PAD + index * step, index })}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { paddingRight: PAD - gap }]}
      onContentSizeChange={scrollToFocus}
      onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}
    />
  );
}

const CARD_WIDTH = 64;
const GAP = 10;
const PAD = 16;
/** Narrow phones: a smaller gap, and five whole cards with at least this much room at each edge. */
const NARROW_GAP = 8;
const EDGE = 7.5;
const MIN_CARD = 48;

/**
 * Card width from the strip's width: 64 wherever five cards fit (375 and wider, frame 15);
 * narrower, the cards shrink so the five around today stay whole (320 → 54).
 */
export function cardSize(width: number): { card: number; gap: number; step: number } {
  if (width - 2 * EDGE - 4 * GAP >= 5 * CARD_WIDTH) return { card: CARD_WIDTH, gap: GAP, step: CARD_WIDTH + GAP };
  const card = Math.max(MIN_CARD, Math.floor((width - 2 * EDGE - 4 * NARROW_GAP) / 5));
  return { card, gap: NARROW_GAP, step: card + NARROW_GAP };
}

const styles = StyleSheet.create({
  row: { paddingLeft: PAD, paddingVertical: 8 },
  card: {
    height: 80,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
  },
  mark: { height: 20, justifyContent: 'center' },
  wait: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  waitText: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, fontVariant: ['tabular-nums'] },
});
