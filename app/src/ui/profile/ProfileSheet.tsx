// A modal sheet of the profile (wave 5 spec, 11.5–11.6): rises from the bottom over a dark
// scrim; `full` — its top stands under the page bar (insets.top + 56), otherwise it is as tall
// as its content (up to that). The content scrolls; `footer` sticks to the bottom with a short
// fade into the sheet above it.
// The scrim, a drag down on the grabber, Android "back" and Esc only *ask* to close
// (`onRequestClose`): the edit sheet asks "Discard changes?" first. The parent closes it by
// setting `open` to false; the sheet then goes down on its own and unmounts.
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { useStore } from '@/state/store';
import { Grabber, motion, PAGE_BAR, SheetSurface, useColors, useMotionOn } from '@/ui/ds';

/** A drag on the grabber asks to close past this distance or speed. */
const CLOSE_DRAG = 60;
const CLOSE_SPEED = 800;
/** Height of the fade over the footer. */
const FADE = 34;
/** Taps on the scrim this soon after opening are the rest of the tap that opened it (web). */
const SCRIM_DEAF = 400;

export interface ProfileSheetProps {
  open: boolean;
  onRequestClose(): void;
  full?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

export function ProfileSheet(props: ProfileSheetProps) {
  const [mounted, setMounted] = useState(props.open);
  useEffect(() => {
    if (props.open) setMounted(true);
  }, [props.open]);
  const gone = useCallback(() => setMounted(false), []);
  if (!mounted) return null;
  return <Body {...props} onGone={gone} />;
}

function Body({ open, onRequestClose, full = false, footer, children, onGone }: ProfileSheetProps & { onGone: () => void }) {
  const c = useColors();
  const { t } = useStore();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const top = insets.top + PAGE_BAR;

  const slide = useSharedValue(1);
  const shade = useSharedValue(0);
  const drag = useSharedValue(0);
  const openedAt = useRef(Date.now());
  useEffect(() => {
    if (open) {
      shade.set(withTiming(1, { duration: motion.base, easing: motion.ease.out }));
      slide.set(motionOn ? withSpring(0, motion.spring.sheet) : withTiming(0, { duration: motion.fast }));
      drag.set(0);
      return;
    }
    const time = motionOn ? 220 : motion.fast;
    shade.set(withTiming(0, { duration: time, easing: Easing.in(Easing.cubic) }));
    slide.set(withTiming(1, { duration: time, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) scheduleOnRN(onGone);
    }));
  }, [open, motionOn, shade, slide, drag, onGone]);

  // The scrim, "back" and Esc ask; on its way out the sheet lets "back" go on to the screen.
  const ask = useRef(onRequestClose);
  ask.current = onRequestClose;
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!openRef.current) return false;
      ask.current();
      return true;
    });
    if (Platform.OS !== 'web') return () => sub.remove();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !openRef.current) return;
      e.preventDefault();
      ask.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      sub.remove();
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);
  const askClose = useCallback(() => ask.current(), []);
  const onScrim = () => {
    if (Date.now() - openedAt.current < SCRIM_DEAF) return;
    askClose();
  };

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      'worklet';
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      const far = drag.get() > CLOSE_DRAG || e.velocityY > CLOSE_SPEED;
      // Back to its place either way: closing is the parent's call.
      drag.set(withSpring(0, motion.spring.sheet));
      if (far) scheduleOnRN(askClose);
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slide.get() * screenH + drag.get() }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: shade.get() }));

  return (
    // Over the page bar's wallet too (it stays bright only for the achievement window's acorns).
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents={open ? 'box-none' : 'none'} accessibilityViewIsModal aria-modal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrimDialog }, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onScrim} accessibilityRole="button" accessibilityLabel={t('close')} />
      </Animated.View>
      <Animated.View style={[styles.sheet, full ? { top } : { maxHeight: screenH - top }, sheetStyle]}>
        <SheetSurface style={[styles.surface, { paddingBottom: footer ? 0 : insets.bottom + 12 }]}>
          <GestureDetector gesture={pan}>
            <View style={styles.grab}>
              <Grabber />
            </View>
          </GestureDetector>
          <ScrollView style={[styles.scroll, full && styles.grow]} contentContainerStyle={{ paddingBottom: footer ? FADE : 0 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? (
            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
              <Svg style={styles.fade} width="100%" height={FADE} pointerEvents="none">
                <Defs>
                  <LinearGradient id="profileSheetFade" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={c.sheet} stopOpacity={0} />
                    <Stop offset="1" stopColor={c.sheet} stopOpacity={1} />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height={FADE} fill="url(#profileSheetFade)" />
              </Svg>
              {footer}
            </View>
          ) : null}
        </SheetSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 5 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  surface: { flexShrink: 1, flexGrow: 1, paddingTop: 8 },
  grab: { height: 24, marginTop: -4, paddingTop: 4 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  grow: { flexGrow: 1 },
  footer: { paddingHorizontal: 16, paddingTop: 0 },
  fade: { position: 'absolute', left: 0, right: 0, top: -FADE },
});
