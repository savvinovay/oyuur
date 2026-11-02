// The list of all trees in the forest sheet (spec 6, frame 16): search from 12 trees on,
// filter chips, sections growing / together (shared trees, wave 5) / locked in / memory. A tap
// on a row flies the camera to that tree (a shared one opens its own screen). Virtualized;
// search and filters change it without animation.
import { ComponentRef, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, ScrollView, SectionList, StyleSheet, TextInput, TextStyle, View } from 'react-native';
import type { DayKey } from '@/game/dates';
import { growthDays, Habit } from '@/game/tree';
import { useStore } from '@/state/store';
import { Button, fonts, Glyph, Icon, MAX_FONT_SCALE, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { nameIn, SharedRow } from '@/ui/together/model';
import { PairAvatar } from '@/ui/together/PairAvatar';
import { daysText, matchName, Section, sortSections, statusLine } from './status';
import { StateMark } from '@/ui/watering/art';
import { ThumbBox } from './ThumbBox';

const NONE: SharedRow[] = [];

/** From this many trees on the list has a search field. */
export const SEARCH_FROM = 12;
const ROW = 64;
/** The name tag before a tree's own name, and the gap after it. */
const TAG_GAP = 4;
const TAG_W = 14 + TAG_GAP;
/** After a name the habit shows only if this many of its letters fit (or all of a shorter one). */
const HABIT_MIN = 8;
/** Shared trees (wave 5) have a section of their own, after the growing ones. */
type ListSection = Section | 'together';
const SECTIONS: ListSection[] = ['growing', 'together', 'locked', 'memory'];
const TITLE = { growing: 'forestGrowing', together: 'tgForestSection', locked: 'forestLocked', memory: 'forestMemory' } as const;

// The browser's focus outline would cover the field; selection is on again for typing.
const FIELD_WEB = Platform.OS === 'web' ? ({ outlineStyle: 'none', userSelect: 'text' } as unknown as TextStyle) : null;

export type Filter = 'all' | ListSection;
type Item = Habit | SharedRow;
const isShared = (item: Item): item is SharedRow => 'habit' in item;

export function TreeList({ habits, shared = NONE, ask, today, open, bottomPad, wrapHeader, canPress, onPick, onShared }: {
  habits: Habit[];
  /**
   * My shared trees (wave 5, спец-друзья 8.4, 8.7): growing ones and the memories of stopped
   * ones, in a "Together" section; a tap opens the shared tree's screen.
   */
  shared?: SharedRow[];
  /** Show this chip's trees: asked from outside (the folded sheet's "together" pill); `n` tells asks apart. */
  ask?: { filter: Filter; n: number } | null;
  onShared?(id: string): void;
  /** The list is the sheet's place now: on opening the chosen chip is brought into view. */
  open: boolean;
  today: DayKey;
  /** Room under the last row (the bottom inset). */
  bottomPad: number;
  /** The header (title, search, chips) pulls the sheet: the sheet wraps it in its gesture. */
  wrapHeader(header: ReactNode): ReactNode;
  /** False right after the header pulled the sheet: that touch is not a tap on a chip. */
  canPress(): boolean;
  onPick(lineageId: string): void;
}) {
  const { t, clock } = useStore();
  const c = useColors();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const total = habits.length + shared.length;
  const searchable = total >= SEARCH_FROM;
  const reset = () => {
    setQuery('');
    setFilter('all');
  };
  useEffect(() => {
    if (!ask) return;
    setQuery('');
    setFilter(ask.filter);
  }, [ask]);

  // The clock as a number, so the sections are sorted again only when the minute changes.
  const minute = clock.hour * 60 + clock.minute;
  const sorted = useMemo(
    (): Record<ListSection, Item[]> => ({ ...sortSections(habits, today, { hour: Math.floor(minute / 60), minute: minute % 60 }), together: shared }),
    [habits, shared, today, minute],
  );
  // A chip with nothing in it is not shown; a filter that lost its trees falls back to all.
  const chips: { key: Filter; label: string; n: number }[] = [
    { key: 'all' as Filter, label: t('filterAll'), n: total },
    ...SECTIONS.map((s) => ({ key: s as Filter, label: t(TITLE[s]), n: sorted[s].length })),
  ].filter((chip) => chip.n > 0);
  const active = chips.some((chip) => chip.key === filter) ? filter : 'all';
  const found = useMemo(() => {
    const q = searchable ? query : '';
    const all = [...habits, ...shared.map((r) => r.habit)];
    const hits = new Set(matchName(all, q).map((h) => h.lineageId));
    const idOf = (item: Item) => (isShared(item) ? item.habit.lineageId : item.lineageId);
    return SECTIONS.filter((s) => active === 'all' || active === s)
      .map((s) => {
        const data = sorted[s].filter((item) => hits.has(idOf(item)));
        return { key: s, title: `${t(TITLE[s])} · ${data.length}`, data };
      })
      .filter((s) => s.data.length > 0);
  }, [habits, shared, sorted, query, active, searchable, t]);

  // The chosen chip is in view whenever it is chosen or the list opens: the strip scrolls
  // to it (a chosen chip past the edge was lost, review frame 52a).
  const strip = useRef<ComponentRef<typeof ScrollView>>(null);
  const chipBox = useRef<Partial<Record<Filter, { x: number; w: number }>>>({});
  const stripW = useRef(0);
  const stripContent = useRef(0);
  useEffect(() => {
    const box = chipBox.current[active];
    const view = stripW.current;
    if (!open || !box || !view) return;
    const x = Math.max(0, Math.min(box.x + box.w / 2 - view / 2, stripContent.current - view));
    strip.current?.scrollTo({ x, animated: false });
  }, [active, open]);

  const header = (
    <View>
      <View style={styles.titleRow}>
        <Txt variant="title2" numberOfLines={1} style={styles.title} accessibilityRole="header">{t('allTrees')}</Txt>
        <Txt variant="small" color={c.textSoft} style={styles.count}>{total}</Txt>
      </View>
      {searchable && (
        <View style={[styles.search, { backgroundColor: c.sunken }]}>
          <Icon name="search" size={20} color={c.textSoft} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('findTree')}
            placeholderTextColor={c.textSoft}
            accessibilityLabel={t('findTree')}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            returnKeyType="search"
            autoCorrect={false}
            style={[styles.field, { color: c.text }, FIELD_WEB]}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('close')}>
              <Icon name="close" size={16} color={c.textSoft} />
            </Pressable>
          )}
        </View>
      )}
      <ScrollView
        ref={strip}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => (stripW.current = e.nativeEvent.layout.width)}
        onContentSizeChange={(w) => (stripContent.current = w)}
      >
        {chips.map((chip) => {
          const on = chip.key === active;
          return (
            <Pressable
              key={chip.key}
              onLayout={(e: LayoutChangeEvent) => {
                const { x, width } = e.nativeEvent.layout;
                chipBox.current[chip.key] = { x, w: width };
              }}
              onPress={() => {
                if (on || !canPress()) return;
                cue('select');
                setFilter(chip.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, { backgroundColor: on ? c.accent : c.sunken }]}
            >
              <Txt numberOfLines={1} style={[styles.chipText, { color: on ? c.onAccent : c.text }]}>
                {chip.label} <Txt style={[styles.chipText, styles.chipCount, { color: on ? c.onAccent : c.text }]}>{chip.n}</Txt>
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.wrap}>
      {wrapHeader(header)}
      <SectionList
        sections={found}
        keyExtractor={(item) => (isShared(item) ? item.habit.lineageId : item.lineageId)}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: bottomPad + 16 }}
        renderSectionHeader={({ section }) => (
          <Txt style={[styles.section, { color: c.textSoft }]} accessibilityRole="header">{section.title}</Txt>
        )}
        ItemSeparatorComponent={() => <View style={[styles.divider, { backgroundColor: c.divider }]} />}
        ListEmptyComponent={<NothingFound onReset={reset} />}
        renderItem={({ item }) => (isShared(item) ? <SharedRowView row={item} onPress={onShared} /> : <Row habit={item} today={today} onPick={onPick} />)}
      />
    </View>
  );
}

/**
 * A shared tree (wave 5): its picture with the two half avatars in the corner, the habit, and
 * "Growing together · 5 days", "Together 12 days · with @mei" (a memory) or "died · record";
 * a tap opens its screen (a memory there: nothing to water).
 */
function SharedRowView({ row, onPress }: { row: SharedRow; onPress?: (id: string) => void }) {
  const { t, profile } = useStore();
  const c = useColors();
  const tree = row.habit.current;
  const days = daysText(t, growthDays(tree));
  // A memory's picture is the tree as it was, without the lock-in plaque (nobody locked it in).
  const picture = useMemo(() => {
    const plain = { ...row.habit.current, completedOn: null };
    return { ...row.habit, current: plain, generations: [plain] };
  }, [row.habit]);
  const name = nameIn(row.friend, t.lang);
  const line =
    row.state === 'dead' ? t('tgDeadShort', { days })
    : row.state === 'growing' ? t('tgGrowingLine', { days })
    : name ? t('tgMemoryLine', { days, name })
    : t('tgTogetherDays', { days });
  return (
    <Pressable
      onPress={() => {
        cue('select');
        onPress?.(row.id);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${tree.name}, ${line}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.divider }]}
    >
      <View>
        <ThumbBox habit={picture} kind="list" />
        <PairAvatar me={profile} friend={row.friend} size={20} style={styles.pair} />
      </View>
      <View style={styles.rowText}>
        <Txt variant="bodyStrong" numberOfLines={1}>{tree.name}</Txt>
        <View style={styles.rowStatus}>
          <Glyph name={row.state === 'dead' ? 'tombstone' : 'friends'} size={14} />
          <Txt numberOfLines={1} style={[styles.rowLine, { color: c.textSoft }]}>{line}</Txt>
        </View>
      </View>
      <Icon name="chevronRight" size={22} color={c.textSoft} />
    </Pressable>
  );
}

/** Nothing matches: say so and offer the way back to every tree. */
function NothingFound({ onReset }: { onReset(): void }) {
  const { t } = useStore();
  const c = useColors();
  return (
    <View style={styles.empty}>
      <Icon name="search" size={40} color={c.textMuted} />
      <Txt variant="title3" color={c.textSoft} style={styles.emptyTitle}>{t('nothingFound')}</Txt>
      <Button title={t('resetSearch')} variant="text" size="m" cue="select" onPress={onReset} style={styles.reset} />
    </View>
  );
}

function Row({ habit, today, onPick }: { habit: Habit; today: DayKey; onPick(lineageId: string): void }) {
  const { t, clock } = useStore();
  const c = useColors();
  const { glyph, line } = statusLine(habit, today, t, clock);
  const { name, nickname } = habit.current;
  const title = nickname !== null ? t('treeNameA11y', { name: nickname, habit: name }) : name;
  // A named tree: the tag, the name whole, then " · habit" only if 8 of its letters (or all of it) still fit.
  const [lineW, setLineW] = useState(0);
  const [nameW, setNameW] = useState(0);
  const [habitW, setHabitW] = useState(0);
  const habitHead = `·\u00A0${Array.from(name).slice(0, HABIT_MIN).join('')}`;
  const measured = lineW > 0 && nameW > 0 && habitW > 0;
  const withHabit = !measured || lineW - TAG_W - nameW >= habitW;
  return (
    <Pressable
      onPress={() => {
        cue('select');
        onPick(habit.lineageId);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${line}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.divider }]}
    >
      <ThumbBox habit={habit} kind="list" />
      <View style={styles.rowText}>
        {/* "Name · habit" on one line, the habit softer; the row stays 64 high (wave 4, 5.2, frame 19). */}
        {nickname !== null ? (
          <View style={styles.rowTitle} onLayout={(e) => setLineW(Math.floor(e.nativeEvent.layout.width))}>
            <Glyph name="nameTag" size={14} />
            <Txt variant="bodyStrong" numberOfLines={1} style={withHabit ? styles.keep : styles.shrink}>{nickname}</Txt>
            {withHabit && (
              <Txt numberOfLines={1} style={[styles.rowHabit, styles.shrink, { color: c.textSoft }]}>{`·\u00A0${name}`}</Txt>
            )}
            {/* The name's and the habit's first letters at full width, for the choice above. */}
            <View style={styles.measureBox} pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants">
              <View style={styles.measureWide}>
                <Txt variant="bodyStrong" numberOfLines={1} onLayout={(e) => setNameW(Math.ceil(e.nativeEvent.layout.width))}>{nickname}</Txt>
                <Txt numberOfLines={1} style={styles.rowHabit} onLayout={(e) => setHabitW(Math.ceil(e.nativeEvent.layout.width))}>{habitHead}</Txt>
              </View>
            </View>
          </View>
        ) : (
          <Txt variant="bodyStrong" numberOfLines={1}>{name}</Txt>
        )}
        <View style={styles.rowStatus}>
          <StateMark name={glyph} size={14} />
          <Txt numberOfLines={1} style={[styles.rowLine, { color: c.textSoft }]}>{line}</Txt>
        </View>
      </View>
      <Icon name="locate" size={22} color={c.textSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 2 },
  title: { flex: 1 },
  count: { fontFamily: fonts.bold },
  search: { marginTop: 12, marginHorizontal: 16, height: 44, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14 },
  field: { flex: 1, height: 44, fontFamily: fonts.regular, fontSize: 15, padding: 0 },
  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  chip: { height: 34, borderRadius: 17, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18 },
  chipCount: { opacity: 0.7 },
  section: { fontFamily: fonts.black, fontSize: 12, lineHeight: 16, letterSpacing: 0.8, textTransform: 'uppercase', paddingTop: 18, paddingBottom: 6, paddingHorizontal: 22 },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: TAG_GAP },
  keep: { flexShrink: 0, maxWidth: '100%' },
  shrink: { flexShrink: 1, minWidth: 0 },
  rowHabit: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  // A box of no size (nothing spills) holding a wide row the texts are measured in.
  measureBox: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'hidden', opacity: 0 },
  measureWide: { width: 2000, alignItems: 'flex-start' },
  rowStatus: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowLine: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  divider: { height: 1, marginLeft: 76, marginRight: 16 },
  pair: { position: 'absolute', right: -5, bottom: -4 },
  empty: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 16 },
  emptyTitle: { marginTop: 10, textAlign: 'center' },
  reset: { marginTop: 2 },
});
