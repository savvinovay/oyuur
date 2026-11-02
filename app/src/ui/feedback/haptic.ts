// Vibrations through expo-haptics. The settings are checked by the caller (index.ts).
import * as Haptics from 'expo-haptics';
import { HapticKind, HapticStep } from './cues';

// A phone without a vibration motor rejects: that is fine, the picture tells it all.
const quiet = (p: Promise<void>) => p.catch(() => {});

const { Light, Medium, Heavy, Soft } = Haptics.ImpactFeedbackStyle;
const { Success, Warning, Error } = Haptics.NotificationFeedbackType;

const RUN: Record<HapticKind, () => Promise<void>> = {
  light: () => Haptics.impactAsync(Light),
  medium: () => Haptics.impactAsync(Medium),
  heavy: () => Haptics.impactAsync(Heavy),
  soft: () => Haptics.impactAsync(Soft),
  selection: () => Haptics.selectionAsync(),
  success: () => Haptics.notificationAsync(Success),
  warning: () => Haptics.notificationAsync(Warning),
  error: () => Haptics.notificationAsync(Error),
};

/** Plays the steps, each at its time after now. */
export function vibrate(steps: HapticStep[]): void {
  for (const step of steps) {
    if (step.at <= 0) quiet(RUN[step.kind]());
    else setTimeout(() => quiet(RUN[step.kind]()), step.at);
  }
}
