// The golden "New stage" ribbon under the header (spec 8.6). The live tree tells it
// what to show through events.ts; a tap on it skips the rest of the celebration.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { stageDaysText } from '@/i18n';
import { useStore } from '@/state/store';
import { AppText, Rings } from '../kit';
import { fx } from './colors';
import { banner, BannerShow, skipCelebration, useChannel } from './events';

/** Ribbon height; its gold band is H − 18 tall, starting 4 px down. */
const H = 74;
const BAND = H - 18;
const OUT = 280;

export function StageBanner({ top }: { top: number }) {
  const { t, night } = useStore();
  const [show, setShow] = useState<BannerShow | null>(null);
  const ribbon = useSharedValue(0);
  const alpha = useSharedValue(0);
  const caption = useSharedValue(0);
  const line = useSharedValue(0);
  const away = useSharedValue(0);
  // Unmounts the ribbon once it has left, so an invisible ribbon never catches taps.
  const gone = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useChannel(
    banner,
    useCallback(
      (b: BannerShow | null) => {
        clearTimeout(gone.current);
        if (b) {
          setShow(b);
          away.set(0);
          if (b.reduced) {
            ribbon.set(1);
            caption.set(1);
            line.set(1);
            alpha.set(0);
            alpha.set(withTiming(1, { duration: 200 }));
          } else {
            ribbon.set(0);
            ribbon.set(withSpring(1, { damping: 12, stiffness: 200 }));
            alpha.set(0);
            alpha.set(withTiming(1, { duration: 150 }));
            caption.set(0);
            caption.set(withDelay(100, withTiming(1, { duration: 180 })));
            line.set(0);
            line.set(withDelay(250, withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) })));
          }
        } else {
          alpha.set(withTiming(0, { duration: OUT, easing: Easing.in(Easing.cubic) }));
          away.set(withTiming(1, { duration: OUT, easing: Easing.in(Easing.cubic) }));
          gone.current = setTimeout(() => setShow(null), OUT + 20);
        }
      },
      [ribbon, alpha, caption, line, away],
    ),
  );

  useEffect(() => () => clearTimeout(gone.current), []);

  const wrapStyle = useAnimatedStyle(() => ({ opacity: alpha.get(), transform: [{ translateY: -16 * away.get() }] }));
  const ribbonStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.6 + 0.4 * ribbon.get() }] }));
  const captionStyle = useAnimatedStyle(() => ({ opacity: caption.get() }));
  const lineStyle = useAnimatedStyle(() => ({ opacity: line.get(), transform: [{ translateY: 6 * (1 - line.get()) }] }));

  if (!show) return null;
  const name = t.dict.stageNames[show.stage];
  const long = name.length > 10;
  const fontSize = long ? 25 : 28;
  const width = Math.min(330, Math.max(210, name.length * fontSize * 0.62 + 80));
  const grand = show.stage === 'grand';

  return (
    <Animated.View style={[styles.wrap, { top }, wrapStyle]} pointerEvents="box-none">
      <Pressable onPress={() => skipCelebration.emit()} accessibilityRole="button" accessibilityLabel={`${t('newStage')}: ${name}`}>
        <Animated.View style={[{ width, height: H }, ribbonStyle]}>
          <Ribbon width={width} />
          {/* "NEW STAGE" in small caps on the gold itself: readable over any sky. */}
          <View style={styles.label}>
            <Animated.View style={captionStyle}>
              <AppText weight="black" style={styles.caption}>{t('newStage').toUpperCase()}</AppText>
            </Animated.View>
            <View style={styles.name}>
              {grand && <Star size={22} />}
              <AppText weight="black" style={{ fontSize, lineHeight: fontSize + 4, color: fx.ribbonText }} numberOfLines={1}>{name}</AppText>
            </View>
          </View>
        </Animated.View>
      </Pressable>
      <Animated.View style={[styles.line, lineStyle]} pointerEvents="none">
        <Rings size={18} />
        <AppText weight="black" style={[styles.days, show.reduced && !night && styles.onSky]}>{stageDaysText(t, show.days)}</AppText>
      </Animated.View>
    </Animated.View>
  );
}

/** The last stage's star: a pale gold star with a dark gold edge, in the style of the glyphs. */
function Star({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="star" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fx.ribbonCaption} />
          <Stop offset="1" stopColor={fx.ribbonTop} />
        </LinearGradient>
      </Defs>
      <Path
        d="M12 2.7 L14.76 9.1 L21.7 9.75 L16.47 14.35 L18 21.15 L12 17.6 L6 21.15 L7.53 14.35 L2.3 9.75 L9.24 9.1Z"
        fill="url(#star)"
        stroke={fx.ribbonFold}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path d="M10.2 8.6 L11.6 5.6" stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" opacity={0.8} />
    </Svg>
  );
}

/** Gold ribbon with swallowtail ends folding behind it. */
function Ribbon({ width }: { width: number }) {
  const w = width;
  const end = 34;
  return (
    <Svg width={w} height={H} style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fx.ribbonTop} />
          <Stop offset="1" stopColor={fx.ribbonBottom} />
        </LinearGradient>
      </Defs>
      <Path d={`M0 18 H${end} V${H - 6} H0 L10 ${(H + 12) / 2} Z`} fill={fx.ribbonEnds} />
      <Path d={`M${w} 18 H${w - end} V${H - 6} H${w} L${w - 10} ${(H + 12) / 2} Z`} fill={fx.ribbonEnds} />
      <Path d={`M${end - 12} ${4 + BAND} L${end} ${H - 6} L${end} ${4 + BAND} Z`} fill={fx.ribbonFold} />
      <Path d={`M${w - end + 12} ${4 + BAND} L${w - end} ${H - 6} L${w - end} ${4 + BAND} Z`} fill={fx.ribbonFold} />
      <Rect x={end - 12} y={4} width={w - (end - 12) * 2} height={BAND} rx={10} fill="url(#gold)" stroke={fx.ribbonEdge} strokeWidth={2} />
      <Rect x={end - 4} y={9} width={w - (end - 4) * 2} height={5} rx={2.5} fill="#FFFFFF" opacity={0.35} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  caption: { fontSize: 10, lineHeight: 12, letterSpacing: 1.8, color: fx.ribbonFold, marginTop: 2 },
  label: { position: 'absolute', left: 0, right: 0, top: 4, height: BAND, alignItems: 'center', justifyContent: 'center' },
  name: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  // Without the darkened scene the light text would melt into the sky.
  onSky: { color: fx.ribbonText, textShadowColor: 'rgba(255,255,255,0.6)' },
  days: { fontSize: 15, color: '#FFFFFF', textShadowColor: 'rgba(40,30,10,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
});
