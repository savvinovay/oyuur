// An achievement's medal (wave 5 spec, 11.2, frame 33): a round cut of a tree with the brand
// rings. A "lip" circle under the face, an inner disc with a tree cut and the number (medals
// for days) or a glyph, and a shine arc. Three tiers by the reward: wood, silver, gold.
// - claimed: in color; ready: in color with a soft glow behind it;
// - locked: colorless, with a progress ring when there is progress.
// react-native-svg, no Skia: the profile shows 14 of them. Medals don't move by themselves.
import { memo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { ACHIEVEMENTS, AchievementId, AchievementState } from '@/game/achievements';
import { parseColor } from '@/ui/ds/color';
import { GLYPHS, Paint } from '@/ui/ds/glyphs';
import { fonts } from '@/ui/ds/tokens';
import { useColors } from '@/ui/ds/useTheme';
import { CUT, GLOW, LOCKED, MARKS, TIERS, tierOf } from './colors';

/** Length of the progress ring (r 31). */
const RING = 2 * Math.PI * 31;

/** A glyph's color turned gray (a locked medal's glyph). */
const gray: Paint = (color) => {
  if (color === 'none') return color;
  const [r, g, b, a] = parseColor(color);
  const y = Math.round(0.3 * r + 0.59 * g + 0.11 * b);
  if (a < 1) return `rgba(${y},${y},${y},${a})`;
  const h = y.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
};
const asIs: Paint = (color) => color;

export interface BadgeProps {
  id: AchievementId;
  state: AchievementState;
  /** 0..1, for a locked medal: draws the progress ring when above 0. */
  progress?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export const Badge = memo(function Badge({ id, state, progress = 0, size = 64, style }: BadgeProps) {
  const c = useColors();
  const def = ACHIEVEMENTS.find((a) => a.id === id);
  const tier = TIERS[tierOf(def?.reward ?? 0)];
  const locked = state === 'locked';
  const face = locked ? LOCKED.face : tier.face;
  const lip = locked ? LOCKED.lip : tier.lip;
  const shine = locked ? LOCKED.shine : tier.shine;
  const mark = MARKS[id];
  const p = locked ? Math.max(0, Math.min(1, progress)) : 0;
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {state === 'ready' && (
          <>
            <Defs>
              <RadialGradient id="badgeGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0.6" stopColor={GLOW} stopOpacity={0.9} />
                <Stop offset="1" stopColor={GLOW} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={32} cy={31} r={34} fill="url(#badgeGlow)" />
          </>
        )}
        {p > 0 && (
          <>
            <Circle cx={32} cy={32} r={31} fill="none" stroke={c.sunken} strokeWidth={3.5} />
            <Circle
              cx={32}
              cy={32}
              r={31}
              fill="none"
              stroke={c.accent}
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeDasharray={`${(p * RING).toFixed(1)} 300`}
              transform="rotate(-90 32 32)"
            />
          </>
        )}
        <Circle cx={32} cy={33.5} r={27} fill={lip} />
        <Circle cx={32} cy={31} r={27} fill={face} />
        {'days' in mark ? (
          <>
            <Circle cx={32} cy={31} r={21} fill={locked ? LOCKED.cut : CUT.wood} />
            <Circle cx={32} cy={31} r={15.5} fill="none" stroke={locked ? LOCKED.cutRing : CUT.ring} strokeWidth={1.6} />
            <Circle cx={32} cy={31} r={9.5} fill="none" stroke={locked ? LOCKED.cutRing : CUT.ring} strokeWidth={1.6} />
            <SvgText
              x={32}
              y={mark.days >= 100 ? 37 : 38}
              textAnchor="middle"
              fontFamily={fonts.black}
              fontSize={mark.days >= 100 ? 16 : 20}
              fill={locked ? LOCKED.cutText : CUT.text}
            >
              {String(mark.days)}
            </SvgText>
          </>
        ) : (
          <>
            <Circle cx={32} cy={31} r={21} fill={locked ? LOCKED.disc : mark.disc} />
            <G transform="translate(16 15) scale(1.333)" opacity={locked ? 0.45 : 1}>
              {GLYPHS[mark.glyph](locked ? gray : asIs)}
            </G>
          </>
        )}
        <Path d="M14 22 A20 20 0 0 1 24 12.6" fill="none" stroke={shine} strokeWidth={2.6} strokeLinecap="round" opacity={0.8} />
      </Svg>
    </View>
  );
});
