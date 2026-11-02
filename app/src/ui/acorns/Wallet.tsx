// The acorn wallet (wave 5 spec, section 2): a glass pill with the acorn and the balance.
// It shows its own number, not the store's: the acorns still in flight are held back
// and counted in as each one lands (the number rolls up, the acorn bumps, "+N" beside
// it at the end); a purchase counts down smoothly. A tap opens the shop.
import { useIsFocused } from 'expo-router';
import { ComponentRef, RefObject, useEffect, useReducer, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { formatAcorns } from '@/i18n';
import { useStore } from '@/state/store';
import { elevation, fonts, Glyph, MAX_FONT_SCALE, motion, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { addTarget, countingDown, isActiveTarget, onAcornsChange, onWallet, shownAcorns } from './bus';
import { Pt } from './flight';

/** Measures the middle of a view in the window. */
export function measureCenter(ref: RefObject<ComponentRef<typeof View> | null>): Promise<Pt | null> {
  return new Promise((resolve) => {
    const view = ref.current;
    if (!view) return resolve(null);
    view.measureInWindow((x, y, w, h) => resolve(w > 0 || h > 0 ? { x: x + w / 2, y: y + h / 2 } : null));
  });
}

/**
 * Makes this wallet's glyph the place acorns fly to while `active` (the screen is in front).
 * The last wallet shown wins. Returns the target's id while it is registered.
 */
export function useWalletTarget(ref: RefObject<ComponentRef<typeof View> | null>, active = true): number | null {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const target = addTarget(() => measureCenter(ref));
    setId(target.id);
    return () => {
      target.remove();
      setId(null);
    };
  }, [active, ref]);
  return id;
}

/** The number the wallets show now; re-renders as acorns land and while a purchase counts down. */
export function useShownAcorns(): number {
  const { wallet } = useStore();
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      tick();
      frame = countingDown() ? requestAnimationFrame(loop) : 0;
    };
    const off = onAcornsChange(() => {
      tick();
      if (!frame && countingDown()) frame = requestAnimationFrame(loop);
    });
    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  }, []);
  return shownAcorns(wallet.acorns);
}

/** The glyph bumps no further than this. */
const BUMP = 1.18;
/** "+N": how long it stays (animated / reduced), how fast it goes. */
const PLUS_HOLD = 900;
const PLUS_HOLD_REDUCED = 1200;
const PLUS_OUT = 250;

export function Wallet({ compact = false, onPress, active, style, onWidth }: {
  /** The smaller pill of the item window (spec 2.6): 30 tall. */
  compact?: boolean;
  /** Default: open the shop. null — not a button (the shop itself). */
  onPress?: (() => void) | null;
  /** Acorns fly here while true; default: while the screen is in front. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
  /** The pill's width, for whatever stands beside it. */
  onWidth?: (w: number) => void;
}) {
  const { t, night } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const focused = useIsFocused();
  const glyph = useRef<ComponentRef<typeof View>>(null);
  const target = useWalletTarget(glyph, active ?? focused);
  const shown = useShownAcorns();
  const text = formatAcorns(shown, t.lang);
  const long = shown >= 100000;
  const size = compact ? COMPACT : NORMAL;

  // ---- Landing: the glyph bumps, the new number comes up from below ----
  const bump = useSharedValue(1);
  const roll = useSharedValue(1);
  const fade = useSharedValue(1);
  const [plus, setPlus] = useState<{ amount: number; id: number; reduced: boolean } | null>(null);
  const motionRef = useRef(motionOn);
  motionRef.current = motionOn;
  useEffect(
    () =>
      onWallet((e) => {
        if (e.kind === 'fade') {
          fade.set(0);
          fade.set(withTiming(1, { duration: 200 }));
          return;
        }
        if (target === null || e.target !== target) return;
        if (e.kind === 'arrive') {
          bump.set(withSequence(withTiming(BUMP, { duration: 90, easing: motion.ease.out }), withSpring(1, motion.spring.bounce)));
          roll.set(0);
          roll.set(withTiming(1, { duration: 220, easing: motion.ease.out }));
        } else {
          // Several flocks landing close together add up in one "+N".
          setPlus((p) => ({ amount: (p ? p.amount : 0) + e.amount, id: Date.now(), reduced: e.reduced || !motionRef.current }));
        }
      }),
    [target, bump, roll, fade],
  );

  const glyphStyle = useAnimatedStyle(() => ({ transform: [{ scale: bump.get() }] }));
  const numberStyle = useAnimatedStyle(() => ({
    opacity: fade.get() * (0.35 + 0.65 * roll.get()),
    transform: [{ translateY: 10 * (1 - roll.get()) }],
  }));

  // ---- Press ----
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.get() }] }));
  const tappable = onPress !== null;
  const open = () => {
    cue('tap');
    if (onPress) onPress();
    else router.push('/shop');
  };

  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const width = Math.round(e.nativeEvent.layout.width);
    setW(width);
    onWidth?.(width);
  };

  const pill = (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.pill,
        {
          height: size.h,
          borderRadius: size.h / 2,
          paddingLeft: size.padL,
          paddingRight: long && !compact ? 10 : size.padR,
          gap: size.gap,
          backgroundColor: c.glass,
          borderColor: night ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.9)',
        },
        elevation(1, night),
        pressStyle,
      ]}
    >
      <Animated.View ref={glyph} style={glyphStyle}>
        <Glyph name="acorn" size={size.glyph} />
      </Animated.View>
      <Animated.Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        numberOfLines={1}
        style={[styles.number, { color: c.text, fontSize: long && !compact ? 14 : size.font, lineHeight: size.font + 6 }, numberStyle]}
      >
        {text}
      </Animated.Text>
    </Animated.View>
  );

  return (
    <View style={style} pointerEvents="box-none">
      {tappable ? (
        <Pressable
          onPress={open}
          onPressIn={() => press.set(withTiming(0.95, { duration: motion.press, easing: Easing.linear }))}
          onPressOut={() => press.set(motionOn ? withSpring(1, motion.spring.press) : withTiming(1, { duration: motion.still }))}
          hitSlop={{ top: 5, bottom: 5, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityLabel={t('walletA11y', { n: text })}
        >
          {pill}
        </Pressable>
      ) : (
        <View accessible accessibilityLabel={`${t('acorns')}: ${text}`}>{pill}</View>
      )}
      {plus && w > 0 && <PlusPill key={plus.id} amount={plus.amount} reduced={plus.reduced} right={w + 6} height={size.h} onGone={() => setPlus(null)} />}
    </View>
  );
}

/** The green "+15" left of the wallet: pops in, stays, rises away (spec 3.4, 3.6). */
function PlusPill({ amount, reduced, right, height, onGone }: { amount: number; reduced: boolean; right: number; height: number; onGone: () => void }) {
  const c = useColors();
  const { t } = useStore();
  const scale = useSharedValue(reduced ? 1 : 0.4);
  const alpha = useSharedValue(0);
  const rise = useSharedValue(0);
  useEffect(() => {
    const hold = reduced ? PLUS_HOLD_REDUCED : PLUS_HOLD;
    const inMs = reduced ? 160 : 120;
    const outMs = reduced ? 200 : PLUS_OUT;
    if (!reduced) scale.set(withSpring(1, motion.spring.pop));
    alpha.set(withSequence(withTiming(1, { duration: inMs }), withDelay(hold, withTiming(0, { duration: outMs, easing: Easing.in(Easing.cubic) }))));
    if (!reduced) rise.set(withDelay(inMs + hold, withTiming(-8, { duration: outMs, easing: Easing.in(Easing.cubic) })));
    const id = setTimeout(onGone, inMs + hold + outMs + 30);
    return () => clearTimeout(id);
    // Once per pill (a new amount is a new pill: its key changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: alpha.get(), transform: [{ translateY: rise.get() }, { scale: scale.get() }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.plus, { right, top: (height - PLUS_H) / 2, backgroundColor: c.accent }, style]}>
      <Animated.Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.plusText}>+{formatAcorns(amount, t.lang)}</Animated.Text>
    </Animated.View>
  );
}

const NORMAL = { h: 34, glyph: 22, font: 16, padL: 7, padR: 12, gap: 5 };
const COMPACT = { h: 30, glyph: 20, font: 15, padL: 6, padR: 10, gap: 4 };
const PLUS_H = 22;

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, alignSelf: 'flex-start' },
  number: { fontFamily: fonts.black, fontVariant: ['tabular-nums'] },
  plus: {
    position: 'absolute',
    height: PLUS_H,
    borderRadius: PLUS_H / 2,
    paddingHorizontal: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
  },
  plusText: { fontFamily: fonts.black, fontSize: 13, lineHeight: 16, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
});
