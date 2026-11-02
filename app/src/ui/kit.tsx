// Small shared building blocks for all screens. Since wave 2 they are thin wrappers
// over the design system ('@/ui/ds'), kept so older code keeps working; new code
// uses the design system directly.
import { ReactNode } from 'react';
import { StyleProp, Text, TextProps, TextStyle, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useStore } from '@/state/store';
import {
  Button as DsButton, ButtonVariant, confirmDialog, elevation, fonts, Glyph, Icon, MAX_FONT_SCALE, Page as DsPage, Segmented as DsSegmented,
} from './ds';
import { Palette } from './theme';

/** Text in the app font. No line height of its own: callers size big numbers themselves. */
export function AppText({ style, weight = 'regular', ...rest }: TextProps & { weight?: keyof typeof fonts }) {
  const { palette } = useStore();
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} {...rest} style={[{ color: palette.text, fontFamily: fonts[weight], fontSize: 16 }, style]} />;
}

const VARIANTS: Record<'normal' | 'accent' | 'danger', ButtonVariant> = { normal: 'secondary', accent: 'primary', danger: 'danger' };

export function Button({
  title, onPress, variant = 'normal', style, small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'normal' | 'accent' | 'danger';
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  return <DsButton title={title} onPress={onPress} variant={VARIANTS[variant]} size={small ? 's' : 'l'} style={style} />;
}

/** Two or three options, one selected. */
export function Segmented<V extends string>({
  options, value, onChange,
}: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return <DsSegmented options={options} value={value} onChange={onChange} />;
}

/** Page with the rounded title bar and a back button. */
export function Page({ title, children }: { title: string; children: ReactNode }) {
  return <DsPage title={title}>{children}</DsPage>;
}

export function BackArrow({ color }: { color: string }) {
  return <Icon name="chevronLeft" size={22} color={color} strokeWidth={2.6} />;
}

/** A chance of the tree: full or used. The colors now belong to the glyph, `color` is ignored. */
export function Heart({ filled, size = 16 }: { filled: boolean; color?: string; size?: number }) {
  return <Glyph name={filled ? 'heart' : 'heartEmpty'} size={size} />;
}

export function SunMoon({ night, size = 34 }: { night: boolean; size?: number }) {
  if (night) {
    return (
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Circle cx={20} cy={20} r={14} fill="#D9D7EE" />
        <Circle cx={15} cy={16} r={3} fill="#BEBBDD" />
        <Circle cx={24} cy={25} r={2.2} fill="#BEBBDD" />
      </Svg>
    );
  }
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return `M${20 + Math.cos(a) * 13} ${20 + Math.sin(a) * 13} L${20 + Math.cos(a) * 18} ${20 + Math.sin(a) * 18}`;
  });
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      {rays.map((d, i) => <Path key={i} d={d} stroke="#F6C33B" strokeWidth={3} strokeLinecap="round" />)}
      <Circle cx={20} cy={20} r={10} fill="#F9D548" />
    </Svg>
  );
}

/** Tree rings — a cut of a trunk. The app's mark for days of growth, instead of a flame. */
export function Rings({ size = 18 }: { size?: number }) {
  return <Glyph name="rings" size={size} />;
}

/** Drawn instead of the tombstone emoji, which older Android phones can't show. */
export function Tombstone({ size = 18 }: { size?: number }) {
  return <Glyph name="tombstone" size={size} />;
}

/** Yes/no question; now our own dialog, the same on phones and in the browser. */
export function confirm(message: string, okLabel: string, cancelLabel: string): Promise<boolean> {
  return confirmDialog({ title: '', message, confirmLabel: okLabel, cancelLabel });
}

export const shadow = (p: Palette): ViewStyle => elevation(1, p.dark);

export const textShadow: TextStyle = {
  textShadowColor: 'rgba(0,0,0,0.12)',
  textShadowOffset: { width: 0, height: 2 },
  textShadowRadius: 2,
};
