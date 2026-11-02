// The gold ribbon "RESULT LOCKED IN · 20 days of growth" under the header (spec 3.2).
// The same look as the "new stage" ribbon (ui/live/StageBanner.tsx, colors fx.ribbon*),
// which has no prop for its own text; a tap skips to the lock-in moment.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { fonts, MAX_FONT_SCALE } from '@/ui/ds';
import { fx } from '@/ui/live/colors';

const W = 268;
const H = 66;

export function LockRibbon({ top, title, line, shown, away, onPress }: {
  top: number;
  title: string;
  line: string;
  /** 0..1: the ribbon unfolds (scale) and fades in. */
  shown: SharedValue<number>;
  /** 0..1: it leaves upward by 16 px. */
  away: SharedValue<number>;
  onPress: () => void;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: shown.get() * (1 - away.get()),
    transform: [{ translateY: -16 * away.get() }, { scale: 0.6 + 0.4 * Math.min(shown.get(), 1.2) }],
  }));
  return (
    <Animated.View style={[styles.wrap, { top }, style]} pointerEvents="box-none">
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}: ${line}`}>
        <View style={{ width: W, height: H }}>
          <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="lockGold" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={fx.ribbonTop} />
                <Stop offset="1" stopColor={fx.ribbonBottom} />
              </LinearGradient>
            </Defs>
            <Path d="M0 14 H30 V56 H0 L10 35Z" fill={fx.ribbonEnds} />
            <Path d={`M${W} 14 H${W - 30} V56 H${W} L${W - 10} 35Z`} fill={fx.ribbonEnds} />
            <Path d="M22 52 L30 56 V48Z" fill={fx.ribbonFold} />
            <Path d={`M${W - 22} 52 L${W - 30} 56 V48Z`} fill={fx.ribbonFold} />
            <Rect x={22} y={4} width={W - 44} height={48} rx={10} fill="url(#lockGold)" stroke={fx.ribbonEdge} strokeWidth={1.5} />
            <Rect x={30} y={8} width={W - 60} height={4} rx={2} fill="#FFFFFF" opacity={0.35} />
          </Svg>
          <View style={styles.label}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.title} numberOfLines={1}>{title.toUpperCase()}</Text>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.line} numberOfLines={1}>{line}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  label: { position: 'absolute', left: 30, right: 30, top: 4, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.black, fontSize: 11.5, lineHeight: 14, letterSpacing: 1.8, color: fx.ribbonCaption },
  line: { fontFamily: fonts.black, fontSize: 19, lineHeight: 23, color: fx.ribbonText },
});
