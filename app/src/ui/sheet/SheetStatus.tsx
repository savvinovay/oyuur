// The top lines of the bottom sheet (spec 1.1 and 6): how the tree is today and when
// its next stage comes. Two lines, 52 px, visible in every place of the sheet.
import { router } from 'expo-router';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { checkedInToday, growthDays, isCompleted, isDead, isGrowing, nextStage, seedUsed, Tree } from '@/game/tree';
import { pluralForm, stageDaysText } from '@/i18n';
import { useStore } from '@/state/store';
import { colorsFor, fonts, Glyph, GlyphName, MAX_FONT_SCALE, Txt } from '@/ui/ds';
import { treeMood } from '@/ui/live/mood';
import { waitLine } from './wait';
import { LateLine, WaitTitle } from './WaitStatus';

/** Status line height and the forecast's ring size (spec 1.1). */
const GLYPH = 20;
const RINGS = 16;

export function SheetStatus({ tree, locking, animations, onLayout }: {
  tree: Tree;
  /** The lock-in sequence is on: "Result locked in · N days · moving to your forest". */
  locking: boolean;
  animations: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const { t, today, trees, night, plantSeed, clock } = useStore();
  const c = colorsFor(night);
  const days = growthDays(tree);

  let glyph: GlyphName;
  let title: string;
  let color = c.text;
  let second;
  // Before the watering hour (OYUUR-33 5.1): the clock line instead of "water me".
  const wait = !locking && isGrowing(tree) ? waitLine(tree, today, clock, treeMood(tree, today) === 'thirsty') : null;
  let titleRow = null;
  if (locking) {
    glyph = 'plaque';
    title = t('lockedTitle');
    second = <Line>{t('lockingLine', { days: stageDaysText(t, days) })}</Line>;
  } else if (isDead(tree)) {
    glyph = 'tombstone';
    title = t('diedShort', { days: stageDaysText(t, days) });
    if (seedUsed(tree, trees)) {
      second = (
        <View style={styles.row}>
          <Glyph name="seed" size={RINGS} />
          <Line>{t('seedPlanted')}</Line>
        </View>
      );
    } else {
      const onSeed = () => {
        const id = plantSeed(tree.id);
        if (id) router.setParams({ tree: id });
      };
      second = (
        <Pressable onPress={onSeed} hitSlop={12} accessibilityRole="button" style={styles.row}>
          <Glyph name="seed" size={RINGS} />
          <Txt variant="small" color={c.accent} style={styles.strong} numberOfLines={1}>{t('plantFromSeed')}</Txt>
        </Pressable>
      );
    }
  } else if (isCompleted(tree)) {
    glyph = 'plaque';
    title = t('lockedTitle');
    second = <Line>{stageDaysText(t, days)}</Line>;
  } else {
    const done = checkedInToday(tree, today);
    glyph = done ? 'check' : 'drop';
    title = done ? t('doneToday') : t('waterMe');
    if (done) color = c.accent;
    // The top stage has no forecast: an empty line keeps the title where it always is.
    second = nextStage(tree, today) ? <Forecast tree={tree} /> : <View style={styles.emptyLine} />;
    if (wait?.kind === 'late') second = <LateLine />;
    else if (wait) titleRow = <WaitTitle treeId={tree.id} line={wait} animations={animations} />;
  }

  return (
    <View style={styles.status} onLayout={onLayout}>
      {/* A new habit's (or a new state's) lines fade in; the sheet itself stays. */}
      {/* The time coming (the clock line gives way to "water me") fades the lines in anew too. */}
      <Animated.View
        key={`${tree.id}|${locking ? 'lock' : ''}|${titleRow ? 'wait' : ''}`}
        entering={animations ? FadeIn.duration(titleRow ? 180 : 240) : undefined}
        style={styles.lines}
      >
        {titleRow ?? (
          <View style={styles.titleRow}>
            {/* The glyph stands by the first line when the title wraps. */}
            <View style={styles.titleGlyph}>
              <Glyph name={glyph} size={GLYPH} />
            </View>
            <Txt variant="bodyStrong" color={color} style={styles.title} numberOfLines={2}>{title}</Txt>
          </View>
        )}
        {second}
      </Animated.View>
    </View>
  );
}

function Line({ children }: { children: string }) {
  const { night } = useStore();
  return (
    <Txt variant="small" color={colorsFor(night).textSoft} numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.center}>
      {children}
    </Txt>
  );
}

/** "Bush in 4 days · Fri 31": when the next stage comes if the user taps every day. */
function Forecast({ tree }: { tree: Tree }) {
  const { t, today } = useStore();
  const next = nextStage(tree, today);
  if (!next) return null;
  const date = new Date(`${next.on}T12:00:00`);
  const stage = t.dict.stageNames[next.stage];
  return (
    <View style={styles.row}>
      <Glyph name="rings" size={RINGS} />
      <Line>
        {next.on === today
          ? t('nextStageToday', { stage })
          : t('nextStage', {
              stage,
              n: next.taps,
              days: t.dict.dayWords[pluralForm(t.lang, next.taps)],
              date: `${t.dict.weekdays[date.getDay()]} ${date.getDate()}`,
            })}
      </Line>
    </View>
  );
}

const styles = StyleSheet.create({
  status: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 16 },
  lines: { alignItems: 'center', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 8, maxWidth: '100%' },
  // Centered on the first line: bodyStrong is 22 tall.
  titleGlyph: { marginTop: 1 },
  // As tall as the forecast line (small, 20).
  emptyLine: { height: 20 },
  // Left-aligned next to the glyph: a wrapped title hangs under its first line, the glyph stays beside it.
  title: { textAlign: 'left', flexShrink: 1 },
  strong: { fontFamily: fonts.bold },
  center: { textAlign: 'center', flexShrink: 1 },
});
