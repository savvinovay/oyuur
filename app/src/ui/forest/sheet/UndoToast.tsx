// The dark toast over the forest sheet (spec 4.6, 5.3): "The tree has a new spot · Undo"
// for 4 s after a move, or "Your plot grew: N × N" for 2.5 s. It rides 12 px above the
// sheet's top and moves with it. A new toast replaces the old one.
// OYUUR-34: "Too early: in 3 h 20 min · Change time" for 3 s after "Water" before the hour, and
// "Done: from tomorrow, water from 12:00" for 1.4 s after a new watering time (спец 4.2, 5.2).
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useStore } from '@/state/store';
import { fonts, Glyph, Icon, motion, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { ClockGlyph } from '@/ui/watering/art';

export interface ToastData {
  /** A new id is a new toast. */
  id: number;
  kind: 'moved' | 'swapped' | 'grew' | 'early' | 'hour';
  /** The plot's new side, for 'grew'. */
  n?: number;
  /** The ready line of 'early' and 'hour'. */
  text?: string;
}

const HEIGHT = 48;
const ABOVE = 12;
const LIFE = { moved: 4000, swapped: 4000, grew: 2500, early: 3000, hour: 1400 };

export function UndoToast({ toast, sheetVisible, onUndo, onChangeTime, onDone }: {
  toast: ToastData | null;
  sheetVisible: SharedValue<number>;
  onUndo(): void;
  /** 'early': "Change time" opens the watering-time sheet. */
  onChangeTime?(): void;
  /** The toast has gone (its time ran out, or after "Undo"). */
  onDone(id: number): void;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {toast && <Toast key={toast.id} toast={toast} sheetVisible={sheetVisible} onUndo={toast.kind === 'early' ? onChangeTime ?? (() => {}) : onUndo} onDone={onDone} />}
    </View>
  );
}

function Toast({ toast, sheetVisible, onUndo, onDone }: { toast: ToastData; sheetVisible: SharedValue<number>; onUndo(): void; onDone(id: number): void }) {
  const { t, night } = useStore();
  const c = useColors();
  const shown = useSharedValue(0);
  const gone = useRef(false);
  const done = () => onDone(toast.id);
  const doneRef = useRef(done);
  doneRef.current = done;

  const hide = () => {
    if (gone.current) return;
    gone.current = true;
    const finish = () => doneRef.current();
    shown.set(
      withTiming(0, { duration: motion.fast, easing: motion.ease.in }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(finish);
      }),
    );
  };
  const hideRef = useRef(hide);
  hideRef.current = hide;

  useEffect(() => {
    shown.set(withTiming(1, { duration: motion.base, easing: motion.ease.out }));
    const id = setTimeout(() => hideRef.current(), LIFE[toast.kind]);
    return () => clearTimeout(id);
  }, [shown, toast.kind]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: -(sheetVisible.get() + ABOVE) + 12 * (1 - shown.get()) }],
  }));

  const grew = toast.kind === 'grew';
  const early = toast.kind === 'early';
  const line = toast.text ?? (grew ? t('plotGrew', { n: toast.n ?? 0 }) : t(toast.kind === 'swapped' ? 'swapped' : 'moved'));
  // "Undo" after a move, "Change time" after an early tap; nothing after the rest.
  const action = early ? t('wtChangeTime') : toast.kind === 'moved' || toast.kind === 'swapped' ? t('undo') : null;
  // The watering-time pills look like the main screen's (EarlyChip): white by day, the sheet's
  // color with the outline at night; the moves keep the dark toast.
  const light = early || toast.kind === 'hour';
  const look = light
    ? { bg: night ? c.sheet : '#FFFFFF', ink: night ? c.text : '#1E1B16', act: night ? '#8BE39B' : c.accentInk }
    : { bg: c.toast, ink: '#FFFFFF', act: c.toastAction };
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.toast, { backgroundColor: look.bg }, light && night && { borderWidth: 1.5, borderColor: c.outline }, light && styles.lightShadow, style]}
    >
      {early ? <ClockGlyph size={20} /> : <Glyph name={grew ? 'plot' : 'check'} size={grew ? 22 : 20} />}
      <Txt numberOfLines={2} style={[styles.text, { color: look.ink }]}>{line}</Txt>
      {action && (
        <Pressable
          onPress={() => {
            if (gone.current) return;
            cue('select');
            onUndo();
            hide();
          }}
          accessibilityRole="button"
          accessibilityLabel={action}
          style={styles.action}
        >
          {!early && <Icon name="undo" size={16} color={look.act} />}
          <Txt numberOfLines={1} style={[styles.actionText, { color: look.act }]}>{action}</Txt>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    minHeight: HEIGHT,
    borderRadius: HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 4,
    shadowColor: '#140A00',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  lightShadow: { shadowColor: '#1E283C', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  text: { flex: 1, color: '#FFFFFF', fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, paddingVertical: 6 },
  action: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  actionText: { fontFamily: fonts.black, fontSize: 14, lineHeight: 18 },
});
