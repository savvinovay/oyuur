// Colored glyphs (spec 4.8): the paths are copied unchanged from the G object of
// design/волна-2/макет.html, viewBox 24. Every color goes through `c`, so the
// glyph can be drawn muted. Drawn with react-native-svg, not Skia: there can be
// dozens of them on a screen, and the browser only keeps ~16 live Skia canvases.
// Generated from the mockup; to change a glyph, change the mockup and regenerate.
import type { ReactElement } from 'react';
import { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { GlyphName } from './Glyph';

/** Maps a glyph's own color to the one that is drawn (e.g. muted). */
export type Paint = (color: string) => string;

export const GLYPHS: Record<GlyphName, (c: Paint) => ReactElement> = {
  rings: (c) => (
    <>
      <Circle cx={12} cy={12} r={11} fill={c('#7A4E26')} />
      <Circle cx={12} cy={12} r={9.2} fill={c('#F3CF92')} />
      <Circle cx={11.6} cy={12.3} r={6.4} fill="none" stroke={c('#B57A3E')} strokeWidth={1.8} />
      <Circle cx={11.35} cy={12.45} r={3.4} fill="none" stroke={c('#B57A3E')} strokeWidth={1.8} />
      <Circle cx={11} cy={12.7} r={1.2} fill={c('#9A6230')} />
    </>
  ),
  drop: (c) => (
    <>
      <Path d="M12 2.5 C12 2.5 4.5 11 4.5 15 A7.5 7.5 0 0 0 19.5 15 C19.5 11 12 2.5 12 2.5Z" fill={c('#3FA2DE')} stroke={c('#2A80BC')} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M8.6 15.2 A3.6 3.6 0 0 0 11.4 18.6" stroke={c('#fff')} strokeWidth={1.8} strokeLinecap="round" fill="none" opacity={0.85} />
    </>
  ),
  check: (c) => (
    <>
      <Circle cx={12} cy={12} r={10.5} fill={c('#4CC764')} stroke={c('#34A64D')} strokeWidth={1.3} />
      <Path d="M7.2 12.4 L10.4 15.5 L16.8 8.9" stroke={c('#fff')} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  sprout: (c) => (
    <>
      <Ellipse cx={12} cy={20.8} rx={6.5} ry={1.9} fill={c('#C99A60')} />
      <Path d="M12 20.5 V12.5" stroke={c('#5E9A2C')} strokeWidth={2} strokeLinecap="round" />
      <Path d="M12 13.5 C7.2 13.6 4.4 10.8 4.2 6.6 C8.6 6.4 11.8 9 12 13.5Z" fill={c('#8BC34A')} stroke={c('#4E8A2A')} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M12 11.6 C12.2 7.4 15.2 4.4 19.8 4.3 C19.8 8.8 16.8 11.6 12 11.6Z" fill={c('#B9DE6C')} stroke={c('#4E8A2A')} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M6.8 8.4 C8.3 9 9.6 10.2 10.6 12" stroke={c('#4E8A2A')} strokeWidth={0.9} fill="none" strokeLinecap="round" opacity={0.55} />
    </>
  ),
  stageUp: (c) => (
    <>
      <Ellipse cx={11} cy={21} rx={6} ry={1.7} fill={c('#C99A60')} />
      <Path d="M11 21 V13" stroke={c('#8A6A3B')} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={11} cy={10.5} r={6.3} fill={c('#8BC34A')} stroke={c('#4E8A2A')} strokeWidth={1.3} />
      <Circle cx={8.8} cy={8.6} r={2} fill={c('#B9DE6C')} />
      <Path d="M19 1.8 Q19.5 4.5 22.2 5 Q19.5 5.5 19 8.2 Q18.5 5.5 15.8 5 Q18.5 4.5 19 1.8Z" fill={c('#FFCF4D')} stroke={c('#D99A1E')} strokeWidth={0.9} strokeLinejoin="round" />
    </>
  ),
  snowflake: (c) => (
    <>
      <G stroke={c('#2F86BE')} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <Path d="M12 3 V21 M4.2 7.5 L19.8 16.5 M4.2 16.5 L19.8 7.5" />
        <Path d="M9.6 4.6 L12 6.6 L14.4 4.6 M9.6 19.4 L12 17.4 L14.4 19.4" />
      </G>
      <Circle cx={12} cy={12} r={1.8} fill={c('#2F86BE')} />
    </>
  ),
  tombstone: (c) => (
    <>
      <Path d="M6 21 V10 A6 6 0 0 1 18 10 V21Z" fill={c('#C3C6CE')} stroke={c('#6F7380')} strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M8.2 10.6 A4 4 0 0 1 11 7.2" stroke={c('#fff')} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.7} />
      <Path d="M9.5 12 H14.5 M9.5 15 H14.5 M9.5 18 H13" stroke={c('#6F7380')} strokeWidth={1.4} strokeLinecap="round" />
      <Path d="M3 21.3 H21" stroke={c('#5E9A2C')} strokeWidth={2.4} strokeLinecap="round" />
    </>
  ),
  plaque: (c) => (
    <>
      <Path d="M12 14 V22" stroke={c('#8A6A3B')} strokeWidth={2.4} strokeLinecap="round" />
      <Rect x={3.5} y={3.5} width={17} height={11.5} rx={2.6} fill={c('#FFCF4D')} stroke={c('#B9801E')} strokeWidth={1.4} />
      <Path d="M12 5.6 L13.25 8.2 L16 8.5 L13.95 10.35 L14.5 13.1 L12 11.75 L9.5 13.1 L10.05 10.35 L8 8.5 L10.75 8.2Z" fill={c('#FFF7E0')} stroke={c('#D99A1E')} strokeWidth={0.8} strokeLinejoin="round" />
    </>
  ),
  seed: (c) => (
    <>
      <Ellipse cx={12} cy={20.6} rx={7} ry={2} fill={c('#C99A60')} />
      <Ellipse cx={10.6} cy={15.6} rx={5.2} ry={3.6} transform="rotate(-20 10.6 15.6)" fill={c('#9A6634')} stroke={c('#6B4320')} strokeWidth={1.2} />
      <Ellipse cx={9.2} cy={14.6} rx={2} ry={1} transform="rotate(-20 9.2 14.6)" fill={c('#C99060')} />
      <Path d="M14.4 13 C15.2 9.8 17 8 19.8 7.4" stroke={c('#5E9A2C')} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      <Path d="M17.4 8.2 C17.2 5.8 18.6 4.2 20.8 4 C21 6.4 19.6 7.8 17.4 8.2Z" fill={c('#8BC34A')} stroke={c('#4E8A2A')} strokeWidth={1} />
    </>
  ),
  heart: (c) => (
    <>
      <Path d="M12 20.5 C5.2 15.2 2.5 12 2.5 8.3 A4.8 4.8 0 0 1 12 6.2 A4.8 4.8 0 0 1 21.5 8.3 C21.5 12 18.8 15.2 12 20.5Z" fill={c('#E0485F')} stroke={c('#A82A3F')} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M6.2 8.4 A2.4 2.4 0 0 1 8.6 6.1" stroke={c('#fff')} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.7} />
    </>
  ),
  heartEmpty: (c) => (
    <>
      <Path d="M12 20.5 C5.2 15.2 2.5 12 2.5 8.3 A4.8 4.8 0 0 1 12 6.2 A4.8 4.8 0 0 1 21.5 8.3 C21.5 12 18.8 15.2 12 20.5Z" fill={c('rgba(255,255,255,.35)')} stroke={c('#A82A3F')} strokeWidth={1.6} strokeLinejoin="round" />
    </>
  ),
  coin: (c) => (
    <>
      <Circle cx={12} cy={12} r={10} fill={c('#FFCF4D')} stroke={c('#C98A16')} strokeWidth={1.4} />
      <Circle cx={12} cy={12} r={7} fill="none" stroke={c('#F0B53A')} strokeWidth={1.4} />
      <Path d="M12 7.6 C9.4 9.5 9.2 13.4 12 16.3 C14.8 13.4 14.6 9.5 12 7.6Z" fill={c('#E59E1E')} />
      <Path d="M12 9 V15.6" stroke={c('#FFE7A0')} strokeWidth={0.9} />
    </>
  ),
  forest: (c) => (
    <>
      <Ellipse cx={12} cy={20.8} rx={10.5} ry={1.9} fill={c('#B9DE6C')} opacity={0.8} />
      <Path d="M5.6 15 V19.6" stroke={c('#8A6A3B')} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M5.6 4.8 L9.6 15.2 H1.6Z" fill={c('#3E8E4A')} stroke={c('#2A6A36')} strokeWidth={1.1} strokeLinejoin="round" />
      <Path d="M18.2 13.4 V19.6" stroke={c('#8A6A3B')} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={18.2} cy={9.6} r={4.3} fill={c('#F4A6C6')} stroke={c('#C9779C')} strokeWidth={1.1} />
      <Path d="M12 21 V13" stroke={c('#8A6A3B')} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={12} cy={9.8} r={5.6} fill={c('#8BC34A')} stroke={c('#4E8A2A')} strokeWidth={1.2} />
      <Circle cx={10} cy={8} r={1.8} fill={c('#B9DE6C')} />
    </>
  ),
  newHabit: (c) => (
    <>
      <G transform="translate(-2 0)">
        <Path d="M12 20.5 V12.5" stroke={c('#5E9A2C')} strokeWidth={2} strokeLinecap="round" />
        <Path d="M12 13.5 C7.2 13.6 4.4 10.8 4.2 6.6 C8.6 6.4 11.8 9 12 13.5Z" fill={c('#8BC34A')} stroke={c('#4E8A2A')} strokeWidth={1.3} strokeLinejoin="round" />
        <Path d="M12 11.6 C12.2 7.4 15.2 4.4 19.8 4.3 C19.8 8.8 16.8 11.6 12 11.6Z" fill={c('#B9DE6C')} stroke={c('#4E8A2A')} strokeWidth={1.3} strokeLinejoin="round" />
        <Path d="M6.8 8.4 C8.3 9 9.6 10.2 10.6 12" stroke={c('#4E8A2A')} strokeWidth={0.9} fill="none" strokeLinecap="round" opacity={0.55} />
      </G>
      <Circle cx={18} cy={18} r={5} fill={c('#fff')} stroke={c('#34A64D')} strokeWidth={1.3} />
      <Path d="M18 15.4 V20.6 M15.4 18 H20.6" stroke={c('#34A64D')} strokeWidth={2} strokeLinecap="round" />
    </>
  ),
  settings: (c) => (
    <>
      <Path d="M19.95 9.97 L22.50 10.52 L22.50 13.48 L19.95 14.03 L19.05 16.18 L20.47 18.38 L18.38 20.47 L16.18 19.05 L14.03 19.95 L13.48 22.50 L10.52 22.50 L9.97 19.95 L7.82 19.05 L5.62 20.47 L3.53 18.38 L4.95 16.18 L4.05 14.03 L1.50 13.48 L1.50 10.52 L4.05 9.97 L4.95 7.82 L3.53 5.62 L5.62 3.53 L7.82 4.95 L9.97 4.05 L10.52 1.50 L13.48 1.50 L14.03 4.05 L16.18 4.95 L18.38 3.53 L20.47 5.62 L19.05 7.82 Z" fill={c('#CDBB9E')} stroke={c('#8A7458')} strokeWidth={1.3} strokeLinejoin="round" />
      <Circle cx={12} cy={12} r={4.6} fill={c('#E8DAC4')} stroke={c('#8A7458')} strokeWidth={1.2} />
      <Circle cx={12} cy={12} r={2} fill={c('#8A7458')} />
    </>
  ),
  friends: (c) => (
    <>
      <Circle cx={16.2} cy={7.6} r={3.2} fill={c('#BFE6FA')} stroke={c('#2F86BE')} strokeWidth={1.2} />
      <Path d="M10.6 19.6 C11 15.4 13.2 12.6 16.2 12.6 C19.6 12.6 22 15.2 22 19.6Z" fill={c('#7FC8F0')} stroke={c('#2F86BE')} strokeWidth={1.2} strokeLinejoin="round" />
      <Circle cx={8.5} cy={8.6} r={3.6} fill={c('#FFD3A8')} stroke={c('#C47F3E')} strokeWidth={1.2} />
      <Path d="M2 20.2 C2 15.8 4.8 13.6 8.5 13.6 C12.2 13.6 15 15.8 15 20.2Z" fill={c('#FF9E5E')} stroke={c('#C4652A')} strokeWidth={1.2} strokeLinejoin="round" />
    </>
  ),
  leaders: (c) => (
    <>
      <Rect x={2} y={13} width={6.5} height={8} rx={1.2} fill={c('#E7E9EE')} stroke={c('#8D93A1')} strokeWidth={1.2} />
      <Rect x={15.5} y={15} width={6.5} height={6} rx={1.2} fill={c('#F2B98A')} stroke={c('#B97A4A')} strokeWidth={1.2} />
      <Rect x={8.5} y={9} width={7} height={12} rx={1.2} fill={c('#FFCF4D')} stroke={c('#B9801E')} strokeWidth={1.2} />
      <Path d="M9 7 L9.6 2.8 L12 5 L14.4 2.8 L15 7Z" fill={c('#FFCF4D')} stroke={c('#B9801E')} strokeWidth={1.1} strokeLinejoin="round" />
      <Circle cx={12} cy={14} r={1.6} fill={c('#FFF7E0')} />
    </>
  ),
  tasks: (c) => (
    <>
      <Rect x={4} y={4} width={16} height={18} rx={3} fill={c('#FFFFFF')} stroke={c('#B48A55')} strokeWidth={1.3} />
      <Rect x={8.5} y={2.4} width={7} height={3.6} rx={1.4} fill={c('#F4C98E')} stroke={c('#B48A55')} strokeWidth={1.1} />
      <Path d="M7.4 11.2 L8.8 12.6 L11 10.2 M7.4 16.4 L8.8 17.8 L11 15.4" stroke={c('#4CC764')} strokeWidth={1.7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M13 11.4 H16.6 M13 16.6 H16.6" stroke={c('#D8C3A3')} strokeWidth={1.7} strokeLinecap="round" />
    </>
  ),
  profile: (c) => (
    <>
      <Circle cx={12} cy={12} r={10.3} fill={c('#B7A6FF')} stroke={c('#7B66D6')} strokeWidth={1.3} />
      <Circle cx={12} cy={10} r={3.6} fill={c('#fff')} />
      <Path d="M5.6 18.4 C7 15.6 9.2 14.4 12 14.4 C14.8 14.4 17 15.6 18.4 18.4 A10.3 10.3 0 0 1 5.6 18.4Z" fill={c('#fff')} />
    </>
  ),
  shop: (c) => (
    <>
      <Rect x={4} y={10} width={16} height={11} rx={1.6} fill={c('#FFF1DC')} stroke={c('#B48A55')} strokeWidth={1.3} />
      <Rect x={9.5} y={14} width={5} height={7} rx={1} fill={c('#F4C98E')} stroke={c('#B48A55')} strokeWidth={1.1} />
      <Path d="M3 10 L4.6 3.6 H19.4 L21 10Z" fill={c('#FF8A80')} stroke={c('#C4554C')} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M8.3 3.8 L7.6 10 M12 3.8 V10 M15.7 3.8 L16.4 10" stroke={c('#fff')} strokeWidth={1.8} />
      <Path d="M3 10 A2.25 2.25 0 0 0 7.5 10 A2.25 2.25 0 0 0 12 10 A2.25 2.25 0 0 0 16.5 10 A2.25 2.25 0 0 0 21 10" fill={c('#FF8A80')} stroke={c('#C4554C')} strokeWidth={1.3} strokeLinejoin="round" />
    </>
  ),
  sparkle: (c) => (
    <>
      <Path d="M12 2 Q13.2 10.8 22 12 Q13.2 13.2 12 22 Q10.8 13.2 2 12 Q10.8 10.8 12 2Z" fill={c('#FFE27A')} stroke={c('#D99A1E')} strokeWidth={1} strokeLinejoin="round" />
    </>
  ),
  // Wave 3: from the G object of design/волна-3/макет.html.
  stump: (c) => (
    <>
      <Ellipse cx={12} cy={20.4} rx={9} ry={2.2} fill={c('#B9DE6C')} opacity={0.8} />
      <Path d="M5.5 11 V18.3 C5.5 19.9 8.4 21 12 21 C15.6 21 18.5 19.9 18.5 18.3 V11Z" fill={c('#A87644')} stroke={c('#6B4320')} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M8 13.5 V18.6 M12 14 V19.8 M16 13.5 V18.6" stroke={c('#8A5A2E')} strokeWidth={1} strokeLinecap="round" opacity={0.7} />
      <Ellipse cx={12} cy={11} rx={6.5} ry={2.9} fill={c('#F3CF92')} stroke={c('#6B4320')} strokeWidth={1.3} />
      <Ellipse cx={12} cy={11} rx={3.6} ry={1.5} fill="none" stroke={c('#B57A3E')} strokeWidth={1} />
      <Path d="M18.4 12.4 C20.6 11.2 21.6 9.4 21.4 7.4 C19.4 7.6 18.2 9 18.4 12.4Z" fill={c('#8BC34A')} stroke={c('#4E8A2A')} strokeWidth={0.9} />
    </>
  ),
  plot: (c) => (
    <>
      <Path d="M12 6 L22 11.5 L12 17 L2 11.5Z" fill={c('#A9D46C')} stroke={c('#4E8A2A')} strokeWidth={1.2} strokeLinejoin="round" />
      <Path d="M2 11.5 V13.8 L12 19.3 V17Z" fill={c('#C08F58')} stroke={c('#8A5E33')} strokeWidth={1.1} strokeLinejoin="round" />
      <Path d="M22 11.5 V13.8 L12 19.3 V17Z" fill={c('#A4733F')} stroke={c('#8A5E33')} strokeWidth={1.1} strokeLinejoin="round" />
      <Path d="M7 8.8 L17 14.3 M9.5 7.4 L19.5 12.9" stroke={c('#B4DC78')} strokeWidth={1.4} />
      <Path d="M12 6 V3.2 M2 11.5 V8.7 M22 11.5 V8.7" stroke={c('#9B7342')} strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),
  // Wave 4: from the G object of design/волна-4/макет.html.
  acorn: (c) => (
    <>
      <Path d="M12 4.6 C12.1 3 12.8 1.9 14.1 1.4" fill="none" stroke={c('#5A3A17')} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M5.7 10.9 C5.7 16.1 8.5 20.4 12 22.2 C15.5 20.4 18.3 16.1 18.3 10.9 Z" fill={c('#E0A24A')} stroke={c('#A0662A')} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M8.5 13 C8.7 15.6 9.7 17.8 11.3 19.3" fill="none" stroke={c('#FFE7B0')} strokeWidth={1.6} strokeLinecap="round" opacity={0.85} />
      <Path d="M3.8 10.8 C3.8 6.7 7.6 4.1 12 4.1 C16.4 4.1 20.2 6.7 20.2 10.8 C20.2 11.9 19.3 12.5 18.3 12.3 C14.1 11.5 9.9 11.5 5.7 12.3 C4.7 12.5 3.8 11.9 3.8 10.8 Z" fill={c('#8A5A2B')} stroke={c('#5A3A17')} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M7 9.8 L9 7.8 M10.4 10.2 L13.4 7.2 M14.4 10 L16.8 7.6 M7.6 6.8 L9.8 9 M11.6 6.2 L14.4 9 M15.8 7 L17.4 8.6" fill="none" stroke={c('#6E4520')} strokeWidth={0.9} strokeLinecap="round" opacity={0.75} />
      <Path d="M6.6 7.4 C7.9 6 9.6 5.3 11.4 5.2" fill="none" stroke={c('#B9874F')} strokeWidth={1.3} strokeLinecap="round" />
    </>
  ),
  basket: (c) => (
    <>
      <Path d="M6 10.4 C6.4 5.2 17.6 5.2 18 10.4" fill="none" stroke={c('#A0692F')} strokeWidth={1.8} strokeLinecap="round" />
      <G transform="translate(4.6 3.4) scale(0.42)">
        <Path d="M12 4.6 C12.1 3 12.8 1.9 14.1 1.4" fill="none" stroke={c('#5A3A17')} strokeWidth={2.4} strokeLinecap="round" />
        <Path d="M5.7 10.9 C5.7 16.1 8.5 20.4 12 22.2 C15.5 20.4 18.3 16.1 18.3 10.9 Z" fill={c('#E0A24A')} stroke={c('#A0662A')} strokeWidth={2} />
        <Path d="M3.8 10.8 C3.8 6.7 7.6 4.1 12 4.1 C16.4 4.1 20.2 6.7 20.2 10.8 C20.2 11.9 19.3 12.5 18.3 12.3 C14.1 11.5 9.9 11.5 5.7 12.3 C4.7 12.5 3.8 11.9 3.8 10.8 Z" fill={c('#8A5A2B')} stroke={c('#5A3A17')} strokeWidth={2} />
      </G>
      <G transform="translate(9.6 2.2) scale(0.42) rotate(14 12 12)">
        <Path d="M5.7 10.9 C5.7 16.1 8.5 20.4 12 22.2 C15.5 20.4 18.3 16.1 18.3 10.9 Z" fill={c('#E0A24A')} stroke={c('#A0662A')} strokeWidth={2} />
        <Path d="M3.8 10.8 C3.8 6.7 7.6 4.1 12 4.1 C16.4 4.1 20.2 6.7 20.2 10.8 C20.2 11.9 19.3 12.5 18.3 12.3 C14.1 11.5 9.9 11.5 5.7 12.3 C4.7 12.5 3.8 11.9 3.8 10.8 Z" fill={c('#8A5A2B')} stroke={c('#5A3A17')} strokeWidth={2} />
      </G>
      <Path d="M3 11 H21 L19.2 20 C19 21 18.2 21.6 17.2 21.6 H6.8 C5.8 21.6 5 21 4.8 20 Z" fill={c('#E7B46A')} stroke={c('#A0692F')} strokeWidth={1.3} strokeLinejoin="round" />
      <Path d="M4 14 H20 M4.6 17 H19.4 M8.4 11.4 L8.9 21.2 M12 11.4 V21.4 M15.6 11.4 L15.1 21.2" fill="none" stroke={c('#B9803F')} strokeWidth={1} opacity={0.8} />
      <Path d="M2.4 10.2 H21.6 V12.2 H2.4 Z" fill={c('#C98A46')} stroke={c('#A0692F')} strokeWidth={1.2} strokeLinejoin="round" />
      <Path d="M4.6 10.9 H12" stroke={c('#FFE2A8')} strokeWidth={0.9} strokeLinecap="round" opacity={0.8} />
    </>
  ),
  nameTag: (c) => (
    <>
      <Path d="M3 4.6 Q12 2.6 21 4.6" fill="none" stroke={c('#7A4E26')} strokeWidth={2} strokeLinecap="round" />
      <Path d="M18.2 4.1 C18 2.3 19.4 1.1 21.4 1.3 C21.4 3.3 20 4.3 18.2 4.1 Z" fill={c('#8BC34A')} stroke={c('#4E8A2A')} strokeWidth={1} strokeLinejoin="round" />
      <Path d="M7.4 4.1 L6.6 9.2 M16.6 4 L17.4 9.2" fill="none" stroke={c('#A0692F')} strokeWidth={1.2} strokeLinecap="round" />
      <Rect x={3.2} y={8.6} width={17.6} height={11.6} rx={3} fill={c('#F2C27E')} stroke={c('#A0692F')} strokeWidth={1.4} />
      <Path d="M5.4 10.4 H18.6" stroke={c('#FFF3C4')} strokeWidth={1} strokeLinecap="round" opacity={0.75} />
      <Circle cx={6.6} cy={10.2} r={0.85} fill={c('#7A4E26')} />
      <Circle cx={17.4} cy={10.2} r={0.85} fill={c('#7A4E26')} />
      <Path d="M6.4 15.6 C7.3 13.2 8.4 13 9 14.8 C9.6 16.6 10.7 16.6 11.5 14.2 C12.1 12.6 13.2 12.8 13.6 14.4 C14 16 15.1 16.2 15.9 14.8 L17.6 14.4" fill="none" stroke={c('#7A4E26')} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // Wave 5, friends: design/волна-5/макет-друзья.html (G).
  cheer: (c) => (
    <>
      <G fill={c('#C47F3E')} stroke={c('#C47F3E')} strokeWidth={2.5} strokeLinejoin="round">
      <Rect x={6.4} y={10.6} width={11.4} height={10.6} rx={4.6} />
      <Rect x={7.1} y={4.6} width={2.75} height={9.4} rx={1.375} />
      <Rect x={9.9} y={2.9} width={2.75} height={10.6} rx={1.375} />
      <Rect x={12.7} y={3.7} width={2.75} height={9.8} rx={1.375} />
      <Rect x={15.5} y={6} width={2.5} height={7.8} rx={1.25} />
      <Rect x={3.6} y={10.4} width={2.8} height={7.6} rx={1.4} transform="rotate(-36 5 14.2)" />
      </G>
      <G fill={c('#FFD3A8')}>
      <Rect x={6.4} y={10.6} width={11.4} height={10.6} rx={4.6} />
      <Rect x={7.1} y={4.6} width={2.75} height={9.4} rx={1.375} />
      <Rect x={9.9} y={2.9} width={2.75} height={10.6} rx={1.375} />
      <Rect x={12.7} y={3.7} width={2.75} height={9.8} rx={1.375} />
      <Rect x={15.5} y={6} width={2.5} height={7.8} rx={1.25} />
      <Rect x={3.6} y={10.4} width={2.8} height={7.6} rx={1.4} transform="rotate(-36 5 14.2)" />
      </G>
      <Path d="M9.88 6.4 V11.4 M12.68 5.8 V11.4 M15.48 8 V11.6" stroke={c('#C47F3E')} strokeWidth={0.9} strokeLinecap="round" opacity={0.75} />
      <Path d="M8.8 16.6 A3.4 3.4 0 0 1 10.6 13.6" stroke={c('#fff')} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.7} />
      <G stroke={c('#FFB020')} strokeWidth={1.6} strokeLinecap="round">
      <Path d="M20.2 2.6 L19.2 4.8 M22 6.2 L20.2 7.2" />
      <Path d="M4.6 2.6 L5.8 4.6 M2.4 5.8 L4.4 6.8" />
      </G>
    </>
  ),
  invite: (c) => (
    <>
      <Path d="M12 9.5 V4.4" stroke={c('#5E9A2C')} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 6.6 C9.4 6.8 7.8 5.2 7.6 2.8 C10 2.6 11.8 4 12 6.6Z" fill={c('#8BC34A')} stroke={c('#4E8A2A')} strokeWidth={1.1} strokeLinejoin="round" />
      <Path d="M12 5.6 C12.2 3.2 14 1.8 16.4 1.8 C16.4 4.2 14.6 5.8 12 5.6Z" fill={c('#B9DE6C')} stroke={c('#4E8A2A')} strokeWidth={1.1} strokeLinejoin="round" />
      <Rect x={3} y={8.6} width={18} height={12.6} rx={2.4} fill={c('#FFF1DC')} stroke={c('#B48A55')} strokeWidth={1.3} />
      <Path d="M3.8 20.4 L9.8 14.6 M20.2 20.4 L14.2 14.6" stroke={c('#D8C3A3')} strokeWidth={1.1} strokeLinecap="round" />
      <Path d="M3.6 9.6 L12 15.6 L20.4 9.6" fill="none" stroke={c('#B48A55')} strokeWidth={1.3} strokeLinejoin="round" />
      <Circle cx={12} cy={15.4} r={1.7} fill={c('#FF9E5E')} stroke={c('#C4652A')} strokeWidth={0.9} />
    </>
  ),
  crown: (c) => (
    <>
      <Path d="M3.4 17.6 L2.6 7.8 L8 11.8 L12 4.6 L16 11.8 L21.4 7.8 L20.6 17.6Z" fill={c('#FFCF4D')} stroke={c('#B9801E')} strokeWidth={1.3} strokeLinejoin="round" />
      <Rect x={3.2} y={17} width={17.6} height={3.6} rx={1.3} fill={c('#F0B53A')} stroke={c('#B9801E')} strokeWidth={1.2} />
      <Circle cx={12} cy={13.8} r={1.7} fill={c('#FF8A80')} stroke={c('#C4554C')} strokeWidth={0.8} />
      <Circle cx={2.6} cy={7.6} r={1.4} fill={c('#FFF7E0')} stroke={c('#B9801E')} strokeWidth={0.8} />
      <Circle cx={12} cy={4.4} r={1.4} fill={c('#FFF7E0')} stroke={c('#B9801E')} strokeWidth={0.8} />
      <Circle cx={21.4} cy={7.6} r={1.4} fill={c('#FFF7E0')} stroke={c('#B9801E')} strokeWidth={0.8} />
      <Path d="M5.8 15.4 L5.4 11.4" stroke={c('#fff')} strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
    </>
  ),
};
