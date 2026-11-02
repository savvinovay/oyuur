// The pictures of the watering time (design/oyuur-33/макет.html: G.clock, I.sunrise, I.sunset,
// I.allDay — paths copied unchanged). They live here and not in ds/glyphs.tsx / ds/icons.tsx so
// the watering pieces don't touch the shared design-system files; move them there when convenient.
import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { useStore } from '@/state/store';
import { colorsFor, fonts, Glyph, GlyphName, mixColor } from '@/ui/ds';

/** The gold clock: "waiting for its hour" (rim gold, face cream, hands gold ink). */
export const ClockGlyph = memo(function ClockGlyph({ size = 24, muted = false }: { size?: number; muted?: boolean }) {
  const { night } = useStore();
  const c = (color: string) => (muted ? mixColor(color, colorsFor(night).sunken, 0.45) : color);
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={10.5} fill={c('#FFCF4D')} stroke={c('#D99A1E')} strokeWidth={1.3} />
        <Circle cx={12} cy={12} r={7.3} fill={c('#FFF8E6')} />
        <Path d="M3.6 8.9 A9 9 0 0 1 7.5 4.2" stroke={c('#FFF3C4')} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.9} />
        <Circle cx={12} cy={6.2} r={0.85} fill={c('#E3B04A')} />
        <Circle cx={17.8} cy={12} r={0.85} fill={c('#E3B04A')} />
        <Circle cx={12} cy={17.8} r={0.85} fill={c('#E3B04A')} />
        <Circle cx={6.2} cy={12} r={0.85} fill={c('#E3B04A')} />
        <Path d="M12 7.9 V12 L14.9 13.7" stroke={c('#5A3A0E')} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={12} cy={12} r={1.25} fill={c('#5A3A0E')} />
      </Svg>
    </View>
  );
});

/** A status line's glyph: one of the design system's, or 'clock' — the gold clock. */
export function StateMark({ name, size = 16 }: { name: GlyphName | 'clock'; size?: number }) {
  return name === 'clock' ? <ClockGlyph size={size} /> : <Glyph name={name} size={size} />;
}

export type HourIconName = 'allDay' | 'sunrise' | 'sun' | 'sunset' | 'moon' | 'clock';

/** One-color line icons of the choices (the ds Icon's look: round caps, line 2.2). */
export const HourIcon = memo(function HourIcon({ name, size = 20, color, strokeWidth = 2.3 }: {
  name: HourIconName; size?: number; color: string; strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      <G fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        {PATHS[name](color)}
      </G>
    </Svg>
  );
});

const PATHS: Record<HourIconName, (color: string) => React.ReactElement> = {
  // "Any time": a ring with 24 inside, not a clock (the clock means "wait").
  allDay: (color) => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <SvgText x={12} y={15.4} textAnchor="middle" fontFamily={fonts.black} fontWeight="900" fontSize={9.5} fill={color} stroke="none">24</SvgText>
    </>
  ),
  sunrise: () => (
    <>
      <Path d="M3 18.5 H21" />
      <Path d="M7 18.5 A5 5 0 0 1 17 18.5" />
      <Path d="M12 3 V9.2 M9.4 5.6 L12 3 L14.6 5.6" />
      <Path d="M4.4 12.9 L5.9 14.2 M19.6 12.9 L18.1 14.2" />
    </>
  ),
  sun: () => (
    <>
      <Circle cx={12} cy={12} r={4.2} />
      <Path d="M12 2.8 V4.6 M12 19.4 V21.2 M2.8 12 H4.6 M19.4 12 H21.2 M5.5 5.5 L6.8 6.8 M17.2 17.2 L18.5 18.5 M5.5 18.5 L6.8 17.2 M17.2 6.8 L18.5 5.5" />
    </>
  ),
  sunset: () => (
    <>
      <Path d="M3 18.5 H21" />
      <Path d="M7 18.5 A5 5 0 0 1 17 18.5" />
      <Path d="M12 3 V9.2 M9.4 6.6 L12 9.2 L14.6 6.6" />
      <Path d="M4.4 12.9 L5.9 14.2 M19.6 12.9 L18.1 14.2" />
    </>
  ),
  moon: () => <Path d="M19.5 14.6 A8 8 0 1 1 9.4 4.5 A6.3 6.3 0 0 0 19.5 14.6 Z" />,
  clock: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7 V12 L15.5 14.2" />
    </>
  ),
};

/** The colored square behind a choice's icon: the sky at that time (спец 2, frame 02). */
export const HOUR_TINT = { any: '#C4A574', morning: '#F6B26B', day: '#F2C94C', evening: '#F2994A', late: '#6C63C7', other: '#A08E78' } as const;

/** The icon and tint of an hour: the ready choices have their own, any other hour — the clock. */
export function hourLook(hour: number): { icon: HourIconName; tint: string } {
  switch (hour) {
    case 0: return { icon: 'allDay', tint: HOUR_TINT.any };
    case 6: return { icon: 'sunrise', tint: HOUR_TINT.morning };
    case 12: return { icon: 'sun', tint: HOUR_TINT.day };
    case 18: return { icon: 'sunset', tint: HOUR_TINT.evening };
    case 21: return { icon: 'moon', tint: HOUR_TINT.late };
    default: return { icon: 'clock', tint: HOUR_TINT.other };
  }
}
