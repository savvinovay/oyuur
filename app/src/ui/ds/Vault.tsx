// The vault glyph (design/oyuur-29/спец.md 8.1; `vaultSvg(size, open)` of design/oyuur-29/макет.html,
// the paths unchanged): a little wooden chest with a gold padlock — "hidden trees are locked in".
// `open` 0 — shut, 1 — the lid up by 30° around its left hinge (3.2, 10.4) and the shackle up by 2.2.
// The lid and the shackle are layers of their own, so `open` can be a shared value and the
// "locking" animation runs on the UI thread (8.6). The colors are the glyph's own, like Glyph's.
import { memo, ReactNode, useEffect } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

/** The lid turns around its left hinge: (3.2, 10.4) of the 24 viewBox. */
const HINGE = `${(3.2 / 24) * 100}% ${(10.4 / 24) * 100}%`;

export const Vault = memo(function Vault({ size = 24, open = 0, style }: {
  size?: number;
  /** 0 — shut, 1 — open; a shared value animates it. */
  open?: number | SharedValue<number>;
  style?: StyleProp<ViewStyle>;
}) {
  const fixed = typeof open === 'number' ? open : 0;
  const own = useSharedValue(fixed);
  useEffect(() => {
    own.set(fixed);
  }, [own, fixed]);
  const value = typeof open === 'number' ? own : open;
  const unit = size / 24;

  const lidStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-30 * value.get()}deg` }] }));
  const shackleStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -2.2 * value.get() * unit }] }));
  // An open shackle has its right leg out of the lock (shorter by 1.6): the two shapes swap.
  const shutLeg = useAnimatedStyle(() => ({ opacity: value.get() > 0.04 ? 0 : 1 }));
  const openLeg = useAnimatedStyle(() => ({ opacity: value.get() > 0.04 ? 1 : 0 }));

  const layer = (children: ReactNode) => (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={styles.over}>
      {children}
    </Svg>
  );

  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      {layer(
        <>
          <Ellipse cx={12} cy={21.4} rx={8.6} ry={1.5} fill="#C99A60" opacity={0.55} />
          <Rect x={3.2} y={10.2} width={17.6} height={10.4} rx={2.2} fill="#C68A58" stroke="#7A4E26" strokeWidth={1.3} />
          <Path d="M7.4 10.6 V20.4 M16.6 10.6 V20.4" stroke="#8A5A2E" strokeWidth={1.4} />
          <Path d="M4.6 18.6 H19.4" stroke="#A8703F" strokeWidth={0.9} opacity={0.7} />
        </>,
      )}
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: HINGE }, lidStyle]}>
        {layer(
          <>
            <Path d="M3.2 10.6 V8.6 C3.2 5.7 6 4 12 4 C18 4 20.8 5.7 20.8 8.6 V10.6Z" fill="#B07A4E" stroke="#7A4E26" strokeWidth={1.3} strokeLinejoin="round" />
            <Path d="M7.4 4.7 V10.4 M16.6 4.7 V10.4" stroke="#8A5A2E" strokeWidth={1.4} />
            <Path d="M5.3 8.3 C6 6.8 7.6 6.1 9.4 5.9" stroke="#E3B98C" strokeWidth={1.1} fill="none" strokeLinecap="round" />
          </>,
        )}
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, shackleStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, shutLeg]}>
          {layer(<Shackle leg={11.4} />)}
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, openLeg]}>
          {layer(<Shackle leg={9.8} />)}
        </Animated.View>
      </Animated.View>
      {layer(
        <G>
          <Rect x={8.8} y={11} width={6.4} height={5.6} rx={1.4} fill="#FFCF4D" stroke="#B9801E" strokeWidth={1.1} />
          <Path d="M9.9 12.2 H11.2" stroke="#FFFFFF" strokeWidth={0.9} strokeLinecap="round" opacity={0.8} />
          <Circle cx={12} cy={13.4} r={0.95} fill="#5A3A0E" />
          <Path d="M12 13.8 V15.3" stroke="#5A3A0E" strokeWidth={1} strokeLinecap="round" />
        </G>,
      )}
    </View>
  );
});

function Shackle({ leg }: { leg: number }) {
  return <Path d={`M10 11.4 V9.9 A2 2 0 0 1 14 9.9 V${leg}`} fill="none" stroke="#B9801E" strokeWidth={1.5} strokeLinecap="round" />;
}

const styles = StyleSheet.create({
  // The lid swings above the box: nothing is clipped.
  over: { position: 'absolute', left: 0, top: 0, overflow: 'visible' },
});
