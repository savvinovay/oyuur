// A modal bottom sheet for the shop's windows (spec 7.1, 8.1): a shade over the screen,
// the sheet springs up from the bottom with its grabber, its body scrolls when it is taller
// than the screen allows. It closes on a tap on the shade, a drag of the grabber, Android's
// "back" and Esc, always sliding down first; then `onClosed` lets the parent drop it.
// `children` gets `close` to leave the same way from a button.
import { ComponentRef, ReactNode, useCallback, useEffect, useRef } from 'react';
import { BackHandler, LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { useStore } from '@/state/store';
import { Grabber, motion, SheetSurface, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';

/** A tap on the shade this soon after opening is the rest of the tap that opened the sheet. */
const SHADE_DEAF = 400;
/** A drag on the grabber closes the sheet past this distance or speed. */
const CLOSE_DRAG = 60;
const CLOSE_SPEED = 800;
/** The highest a sheet reaches: under the status bar and the page's title bar (spec 7.1). */
const TOP_GAP = 56;

export function ModalSheet({ children, onClosed, label, scrollRef }: {
  children: (close: () => void) => ReactNode;
  /** The sheet has slid away: the parent unmounts it. */
  onClosed: () => void;
  /** For screen readers: what this window is. */
  label?: string;
  scrollRef?: (scroll: ComponentRef<typeof ScrollView> | null) => void;
}) {
  const { t } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const maxH = screenH - insets.top - TOP_GAP;

  const slide = useSharedValue(1);
  const shade = useSharedValue(0);
  const drag = useSharedValue(0);
  const height = useSharedValue(screenH);
  const left = useRef(false);
  const openedAt = useRef(Date.now());
  useEffect(() => {
    if (motionOn) {
      shade.set(withTiming(1, { duration: motion.base, easing: motion.ease.out }));
      slide.set(withSpring(0, motion.spring.sheet));
    } else {
      shade.set(withTiming(1, { duration: motion.fast }));
      slide.set(0);
    }
    // Once, on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;
  const gone = useCallback(() => onClosedRef.current(), []);
  const close = useCallback(() => {
    if (left.current) return;
    left.current = true;
    const time = motionOn ? 220 : motion.fast;
    const easing = motionOn ? Easing.in(Easing.cubic) : Easing.linear;
    shade.set(withTiming(0, { duration: time, easing }));
    if (motionOn) {
      slide.set(withTiming(1, { duration: time, easing }, (done) => {
        if (done) scheduleOnRN(gone);
      }));
    } else {
      setTimeout(gone, time);
    }
  }, [motionOn, shade, slide, gone]);
  const dismiss = useCallback(() => {
    if (left.current) return;
    cue('select');
    close();
  }, [close]);
  const onShade = () => {
    if (Date.now() - openedAt.current < SHADE_DEAF) return;
    dismiss();
  };

  // Android "back" and Esc close the sheet.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (left.current) return false;
      dismissRef.current();
      return true;
    });
    if (Platform.OS !== 'web') return () => sub.remove();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || left.current) return;
      e.preventDefault();
      dismissRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      sub.remove();
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (e) => {
      'worklet';
      drag.set(Math.max(0, e.translationY));
    },
    onDeactivate: (e) => {
      'worklet';
      if (drag.get() > CLOSE_DRAG || e.velocityY > CLOSE_SPEED) {
        scheduleOnRN(dismissRef.current);
      } else {
        drag.set(withSpring(0, motion.spring.sheet));
      }
    },
  });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slide.get() * (height.get() + 24) + drag.get() }] }));
  const shadeStyle = useAnimatedStyle(() => ({ opacity: shade.get() }));
  const onLayout = (e: LayoutChangeEvent) => height.set(e.nativeEvent.layout.height);

  return (
    // Over the page's title bar too (it is raised with zIndex 2).
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents="box-none" accessibilityViewIsModal aria-modal>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrimDialog }, shadeStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onShade} accessibilityRole="button" accessibilityLabel={t('close')} />
      </Animated.View>
      <Animated.View style={[styles.sheet, { maxHeight: maxH }, sheetStyle]} onLayout={onLayout} accessibilityLabel={label} role="dialog">
        <SheetSurface style={[styles.surface, { maxHeight: maxH }]}>
          <GestureDetector gesture={pan}>
            <View style={styles.grab}>
              <Grabber />
            </View>
          </GestureDetector>
          <ScrollView
            ref={scrollRef}
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            style={styles.scroll}
          >
            {children(close)}
          </ScrollView>
        </SheetSurface>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 10 },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  surface: { paddingTop: 8, overflow: 'hidden' },
  grab: { height: 28, justifyContent: 'center' },
  scroll: { flexGrow: 0, flexShrink: 1 },
});
