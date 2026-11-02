import { Palette } from '../theme';
import { Look } from './layout';

/** What every kind of tree gets to draw itself. */
export interface SkinProps {
  look: Look;
  /** How far (0..1) the tree is through its current stage. */
  progress: number;
  p: Palette;
  /** Stable per tree, so each tree has its own leaf pattern. */
  seed: number;
  /** 0..1: not watered today. Leaves of small plants hang, crowns sag a little. */
  thirst?: number;
  /** Draw the soft shadow on the ground (default). Off on the live tree: its soil is drawn apart. */
  ground?: boolean;
}
