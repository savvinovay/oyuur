// Acorns earned, for the parts of the screen that show it (the pill counts up, acorns fly).
// Plain listeners, no React state: a few events a day.

export type EarnSource = 'water' | 'stage' | 'quest' | 'achievement';

export interface Earned {
  amount: number;
  source: EarnSource;
  /** The watered tree, for 'water' and 'stage'. */
  treeId?: string;
}

const listeners = new Set<(e: Earned) => void>();

export const acornsEarned = {
  emit(e: Earned) {
    listeners.forEach((l) => l(e));
  },
  on(listener: (e: Earned) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
