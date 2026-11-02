// Two or three options on a sunken track; a white slider springs to the chosen one (spec 4.7).
import { useEffect, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useStore } from '@/state/store';
import { cue } from '@/ui/feedback';
import { Glyph, GlyphName } from './Glyph';
import { Icon, IconName } from './Icon';
import { Txt } from './Text';
import { elevation, fonts, motion } from './tokens';
import { useColors, useMotionOn } from './useTheme';

export interface SegmentOption<V extends string> {
  value: V;
  label: string;
  icon?: IconName;
  /** The icon's own color (e.g. red "no" sign); by default it follows the label. */
  iconColor?: string;
  /** A colored picture instead of the line icon (the shop's tabs, wave 5). */
  glyph?: GlyphName;
}

const PAD = 4;

export function Segmented<V extends string>({ options, value, onChange, height = 48, iconSize = 18, style }: {
  options: SegmentOption<V>[]; value: V; onChange: (value: V) => void;
  /** 48 on a page, 44 inside a settings row. */
  height?: number; iconSize?: number; style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const { night } = useStore();
  const motionOn = useMotionOn();
  const [width, setWidth] = useState(0);
  const segment = width > 0 ? (width - PAD * 2) / options.length : 0;
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  // On narrow screens (320 px, three options) the icons go, so the words fit whole.
  const showIcons = segment === 0 || segment >= 96;
  const x = useSharedValue(0);
  const placed = useSharedValue(false);
  useEffect(() => {
    if (!segment) return;
    const to = index * segment;
    // The first time the width is known the slider just appears in place.
    if (!placed.get()) {
      x.set(to);
      placed.set(true);
    } else {
      x.set(motionOn ? withSpring(to, motion.spring.thumb) : withTiming(to, { duration: motion.still }));
    }
  }, [index, segment, motionOn, x, placed]);
  const sliderStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));

  return (
    <View
      style={[styles.track, { height, backgroundColor: c.sunken }, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      role="radiogroup"
      accessibilityRole="radiogroup"
    >
      {segment > 0 && (
        <Animated.View style={[styles.slider, elevation(1, night), { width: segment, backgroundColor: c.card }, sliderStyle]} />
      )}
      {options.map((o) => {
        const active = o.value === value;
        const ink = active ? c.text : c.textSoft;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (active) return;
              cue('select');
              onChange(o.value);
            }}
            // role and aria-* as well: react-native-web reads only those.
            role="radio"
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            aria-checked={active}
            aria-selected={active}
            accessibilityLabel={o.label}
            style={styles.segment}
          >
            {o.icon && showIcons && <Icon name={o.icon} size={iconSize} color={o.iconColor ?? ink} />}
            {o.glyph && showIcons && <Glyph name={o.glyph} size={20} />}
            <Txt numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: ink, flexShrink: 1 }}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 14, padding: PAD },
  slider: { position: 'absolute', top: PAD, bottom: PAD, left: PAD, borderRadius: 11 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4 },
});
