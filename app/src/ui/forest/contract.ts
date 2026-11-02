// What the forest screen (app/forest.tsx) and the forest map (ForestMap.tsx) promise
// each other (wave 3 spec, section 14). Two developers build the two sides at once,
// so this file stays fixed.
import type { SharedValue } from 'react-native-reanimated';
import type { DayKey } from '@/game/dates';
import type { MeadowId } from '@/game/economy';
import type { Cell, Plot } from '@/game/plot';
import type { Habit } from '@/game/tree';

export interface MoveResult { lineageId: string; from: Cell; to: Cell; swapped: string | null }

export interface ForestMapHandle {
  flyTo(lineageId: string): void;
  fitPlot(): void;
  fitTrees(): void;
  /** "Choose a spot" mode (4.7): the tree lifts in place, free cells get "+". */
  startMove(lineageId: string): void;
  cancelMove(): void;
  /** Plays the undo flight (4.6); the screen has already called store.moveTree. */
  playUndo(move: MoveResult): void;
  /** Plays the sprout (5.2) for a tree just planted from a seed. */
  playSprout(lineageId: string): void;
}

export interface ForestMapProps {
  habits: Habit[];
  /** A habit planted a moment ago may have no place for one render: the map skips it. */
  plot: Plot;
  today: DayKey;
  night: boolean;
  animations: boolean;
  /** Top of the visible area, px from the top of the screen (bottom of the header). */
  areaTop: number;
  /** Visible height of the sheet, px; the visible area ends above it. */
  sheetVisible: SharedValue<number>;
  selected: string | null;
  /** Gold ring after a lock-in (5.4). */
  highlight: string | null;
  /** Habits to show as new (5.2). */
  fresh: string[];
  /** Plays the plot growth from this size (5.3); null — no growth. */
  grewFrom: number | null;
  /** The opening show (growth → new → highlight) is over. */
  onIntroDone(): void;
  onSelect(lineageId: string | null): void;
  /** 'drag' — lifted by a long press; 'choose' — "Move" from a screen reader action (the screen's own startMove is not reported). */
  onMoveStart(lineageId: string, kind: 'drag' | 'choose'): void;
  /** null — cancelled or dropped on its own cell. The screen saves the move (store.moveTree). */
  onMoveEnd(move: MoveResult | null): void;
  onFitChange(atFit: boolean): void;
  /** Empty forest: the dotted hole on the plot was tapped (spec 7) — the screen opens planting. */
  onPlantTap?(): void;
  /** Friends (stage 2): no moving, no menu. */
  readOnly?: boolean;
  /** A friend's forest wears their meadow (wave 5, спец-друзья 7); by default mine. */
  meadow?: MeadowId;
  /** Lineages waiting for their watering hour (OYUUR-34): no "needs water" drop over them yet. */
  waiting?: readonly string[];
}
