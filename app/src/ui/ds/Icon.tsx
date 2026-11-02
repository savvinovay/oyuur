// One-color line icons for controls (spec 4.8): round caps, line 2.2, arrows 2.6.
import { memo } from 'react';
import Svg, { G } from 'react-native-svg';
import { useStore } from '@/state/store';
import { ICONS } from './icons';
import { colorsFor } from './tokens';

export type IconName = 'chevronLeft' | 'chevronRight' | 'chevronDown' | 'chevronUp' | 'close' | 'check' | 'plus' | 'more' | 'lock' | 'lockOpen' | 'people'
  | 'sun' | 'moon' | 'auto' | 'sparkles' | 'speaker' | 'speakerOff' | 'vibrate' | 'globe' | 'trash' | 'eye' | 'info' | 'noSign' | 'checkCircle'
  | 'move' | 'frame' | 'search' | 'locate' | 'undo'
  | 'shuffle' | 'pencil'
  | 'clock'
  | 'userPlus' | 'userMinus' | 'flag' | 'eyeOff' | 'wifiOff' | 'refresh' | 'hourglass' | 'share'
  | 'cloud' | 'cloudCheck' | 'cloudUp' | 'cloudOff' | 'key' | 'code' | 'phone' | 'logout' | 'tree' | 'dropLine' | 'undoRound' | 'copy' | 'bell';

const ARROWS: IconName[] = ['chevronLeft', 'chevronRight', 'chevronDown', 'chevronUp'];

export const Icon = memo(function Icon({ name, size = 24, color, strokeWidth }: {
  name: IconName; size?: number; color?: string; strokeWidth?: number;
}) {
  const { night } = useStore();
  const ink = color ?? colorsFor(night).text;
  const line = strokeWidth ?? (ARROWS.includes(name) ? 2.6 : 2.2);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" pointerEvents="none">
      <G fill="none" stroke={ink} strokeWidth={line} strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name](ink)}
      </G>
    </Svg>
  );
});
