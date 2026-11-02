// Our own yes/no dialog (spec 4.7) instead of the system alert: the same look on
// phones and in the browser. Dialogs wait in a queue and show one at a time.
import { ReactNode, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useStore } from '@/state/store';
import { Button } from './Button';
import { Glyph, GlyphName } from './Glyph';
import { Txt } from './Text';
import { elevation, motion } from './tokens';
import { useColors, useMotionOn } from './useTheme';

export interface ConfirmOptions {
  title: string; message?: string; confirmLabel: string; cancelLabel: string;
  tone?: 'primary' | 'gold' | 'danger'; glyph?: GlyphName; picture?: ReactNode;
  /** Under the message, before the buttons: a plate like "these trees won't be lost" (OYUUR-31, frame 09). */
  note?: ReactNode;
}

interface Pending {
  id: number;
  options: ConfirmOptions;
  resolve: (yes: boolean) => void;
}

const queue: Pending[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
let nextId = 1;

/** Asks a yes/no question; resolves true on the main button, false on cancel, back or a tap outside. */
export function confirmDialog(o: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ id: nextId++, options: o, resolve });
    notify();
  });
}

/** Mounted once in _layout; shows the dialogs one at a time. */
export function DialogHost() {
  const [current, setCurrent] = useState<Pending | null>(null);
  useEffect(() => {
    const update = () => setCurrent((cur) => cur ?? queue[0] ?? null);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  if (!current) return null;
  // Removes this very dialog (not just the first one), so a late second call can't drop the next.
  const done = () => {
    const at = queue.findIndex((p) => p.id === current.id);
    if (at >= 0) queue.splice(at, 1);
    setCurrent(queue[0] ?? null);
  };
  return <DialogView key={current.id} pending={current} onGone={done} />;
}

function DialogView({ pending, onGone }: { pending: Pending; onGone: () => void }) {
  const c = useColors();
  const { night } = useStore();
  const motionOn = useMotionOn();
  const o = pending.options;
  // On a 320 px phone the card gets narrower margins and a smaller main button, so
  // "Lock in for good" and a three-line title fit without "…".
  const narrow = useWindowDimensions().width < 360;
  const shown = useSharedValue(0);
  const card = useSharedValue(0);
  // A ref, not state: two taps before the next render must still give one answer.
  const answered = useRef(false);

  useEffect(() => {
    shown.set(withTiming(1, { duration: 200, easing: motion.ease.out }));
    card.set(motionOn ? withSpring(1, motion.spring.pop) : withTiming(1, { duration: motion.still }));
  }, [shown, card, motionOn]);

  const answer = (yes: boolean) => {
    if (answered.current) return;
    answered.current = true;
    pending.resolve(yes);
    // Leaving is faster than coming (spec 4.6).
    shown.set(withTiming(0, { duration: motion.fast, easing: motion.ease.in }));
    card.set(withTiming(0, { duration: motion.fast, easing: motion.ease.in }));
    setTimeout(onGone, motion.fast);
  };

  // Android "back" is "Cancel".
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      answer(false);
      return true;
    });
    return () => sub.remove();
  });

  const scrimStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, card.get() * 1.4),
    transform: [{ scale: 0.94 + 0.06 * card.get() }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrimDialog }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => answer(false)} accessibilityLabel={o.cancelLabel} accessibilityRole="button" />
      </Animated.View>
      <View style={[styles.center, narrow && { paddingHorizontal: 16 }]} pointerEvents="box-none">
        <Animated.View
          style={[styles.card, narrow && { paddingHorizontal: 16 }, elevation(3, night), { backgroundColor: c.card, borderColor: c.outline }, cardStyle]}
          accessibilityRole="alert"
        >
          <View style={[styles.shine, { backgroundColor: night ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)' }]} />
          {o.picture ? <View style={styles.picture}>{o.picture}</View> : o.glyph ? <Glyph name={o.glyph} size={48} style={styles.glyph} /> : null}
          {o.title ? <Txt variant="title2" numberOfLines={3} style={styles.title}>{o.title}</Txt> : null}
          {o.message ? (
            <Txt style={[styles.message, { color: c.textSoft }]}>{o.message}</Txt>
          ) : null}
          {o.note ? <View style={styles.note}>{o.note}</View> : null}
          <Button
            title={o.confirmLabel}
            variant={o.tone ?? 'primary'}
            glyph={o.tone === 'gold' ? o.glyph : undefined}
            // A gold or danger answer has its own feedback (lockConfirm, delete): the caller gives it.
            cue={o.tone === 'gold' || o.tone === 'danger' ? null : 'tap'}
            onPress={() => answer(true)}
            size={narrow ? 'm' : 'l'}
            style={styles.main}
          />
          <Button title={o.cancelLabel} variant="text" size="m" onPress={() => answer(false)} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 24 },
  card: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  // A light line along the top edge, inset by the corner radius.
  shine: { position: 'absolute', top: 1, left: 28, right: 28, height: 1 },
  picture: { alignSelf: 'center', marginBottom: 14 },
  glyph: { alignSelf: 'center', marginBottom: 12 },
  title: { textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  note: { marginTop: 14 },
  main: { marginTop: 20 },
});
