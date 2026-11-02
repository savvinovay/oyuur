// Text in one of the type scale's styles (spec 4.3). Big system fonts are allowed
// up to ×1.3, so they never break the sheet.
import { Text, TextProps } from 'react-native';
import { MAX_FONT_SCALE, type, TypeVariant } from './tokens';
import { useColors } from './useTheme';

export function Txt({ variant = 'body', color, style, ...rest }: TextProps & { variant?: TypeVariant; color?: string }) {
  const c = useColors();
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} {...rest} style={[type[variant], { color: color ?? c.text }, style]} />;
}
