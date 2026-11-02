// Colored pictures instead of emoji (spec 4.8). The colors belong to the glyph
// (they are the brand), the theme does not change them.
import { memo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg from 'react-native-svg';
import { useStore } from '@/state/store';
import { mixColor } from './color';
import { GLYPHS, Paint } from './glyphs';
import { colorsFor } from './tokens';

export type GlyphName = 'rings' | 'drop' | 'check' | 'sprout' | 'stageUp' | 'snowflake' | 'tombstone' | 'plaque' | 'seed'
  | 'heart' | 'heartEmpty' | 'coin' | 'sparkle' | 'forest' | 'newHabit' | 'settings' | 'friends' | 'leaders' | 'tasks' | 'profile' | 'shop'
  | 'stump' | 'plot'
  | 'nameTag' | 'acorn' | 'basket'
  | 'cheer' | 'invite' | 'crown';

const asIs: Paint = (color) => color;

export const Glyph = memo(function Glyph({ name, size = 24, muted = false, style }: {
  name: GlyphName; size?: number; muted?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const { night } = useStore();
  // Muted: every color 45 % of the way to the sunken surface, for an unavailable look.
  const paint: Paint = muted ? (color) => mixColor(color, colorsFor(night).sunken, 0.45) : asIs;
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {GLYPHS[name](paint)}
      </Svg>
    </View>
  );
});
