// One-color line icons (spec 4.8): the paths are copied unchanged from the I object
// of design/волна-2/макет.html, viewBox 24. Stroke, caps and joins come from the
// <G> around them in Icon.tsx; `color` is only for the few filled dots.
import type { ReactElement } from 'react';
import { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import type { IconName } from './Icon';

export const ICONS: Record<IconName, (color: string) => ReactElement> = {
  chevronLeft: () => (
    <>
      <Path d="M15 5 L8 12 L15 19" />
    </>
  ),
  chevronRight: () => (
    <>
      <Path d="M9 5 L16 12 L9 19" />
    </>
  ),
  chevronDown: () => (
    <>
      <Path d="M5 9 L12 16 L19 9" />
    </>
  ),
  chevronUp: () => (
    <>
      <Path d="M5 15 L12 8 L19 15" />
    </>
  ),
  close: () => (
    <>
      <Path d="M6 6 L18 18 M18 6 L6 18" />
    </>
  ),
  check: () => (
    <>
      <Path d="M5 12.5 L10 17 L19 7.5" />
    </>
  ),
  plus: () => (
    <>
      <Path d="M12 5 V19 M5 12 H19" />
    </>
  ),
  more: (color) => (
    <>
      <Circle cx={6} cy={12} r={1.6} fill={color} />
      <Circle cx={12} cy={12} r={1.6} fill={color} />
      <Circle cx={18} cy={12} r={1.6} fill={color} />
    </>
  ),
  lock: (color) => (
    <>
      <Rect x={5} y={10.5} width={14} height={10} rx={2.6} />
      <Path d="M8 10.5 V8 A4 4 0 0 1 16 8 V10.5" />
      <Circle cx={12} cy={15.5} r={1.3} fill={color} />
    </>
  ),
  // OYUUR-31 (design/oyuur-29/макет.html, the I object): a hidden tree not locked in the account yet.
  lockOpen: (color) => (
    <>
      <Rect x={5} y={10.5} width={14} height={10} rx={2.6} />
      <Path d="M8 10.5 V7.5 A4 4 0 0 1 15.6 5.8" />
      <Circle cx={12} cy={15.5} r={1.3} fill={color} />
    </>
  ),
  people: () => (
    <>
      <Circle cx={9} cy={8.5} r={3.2} />
      <Path d="M3 19.5 C3 15.8 5.6 13.8 9 13.8 C12.4 13.8 15 15.8 15 19.5" />
      <Circle cx={16.6} cy={7.6} r={2.6} />
      <Path d="M17.2 12.8 C19.6 13 21 15 21 18" />
    </>
  ),
  sun: () => (
    <>
      <Circle cx={12} cy={12} r={4} />
      <Path d="M12 2.5 V4.5 M12 19.5 V21.5 M2.5 12 H4.5 M19.5 12 H21.5 M5.3 5.3 L6.7 6.7 M17.3 17.3 L18.7 18.7 M5.3 18.7 L6.7 17.3 M17.3 6.7 L18.7 5.3" />
    </>
  ),
  moon: () => (
    <>
      <Path d="M19.5 14.6 A8 8 0 1 1 9.4 4.5 A6.4 6.4 0 0 0 19.5 14.6Z" />
    </>
  ),
  auto: (color) => (
    <>
      <Circle cx={12} cy={12} r={8} />
      <Path d="M12 4 A8 8 0 0 0 12 20Z" fill={color} />
    </>
  ),
  sparkles: () => (
    <>
      <Path d="M10 3 Q11 9 17 10 Q11 11 10 17 Q9 11 3 10 Q9 9 10 3Z" />
      <Path d="M18 14 Q18.4 16.6 21 17 Q18.4 17.4 18 20 Q17.6 17.4 15 17 Q17.6 16.6 18 14Z" />
    </>
  ),
  speaker: () => (
    <>
      <Path d="M4 9.5 H7.5 L12 5.5 V18.5 L7.5 14.5 H4Z" />
      <Path d="M15.5 9 A4.2 4.2 0 0 1 15.5 15 M18.2 6.4 A8 8 0 0 1 18.2 17.6" />
    </>
  ),
  speakerOff: () => (
    <>
      <Path d="M4 9.5 H7.5 L12 5.5 V18.5 L7.5 14.5 H4Z" />
      <Path d="M16 9.5 L21 14.5 M21 9.5 L16 14.5" />
    </>
  ),
  vibrate: () => (
    <>
      <Rect x={8} y={4} width={8} height={16} rx={2} />
      <Path d="M4.5 9 V15 M19.5 9 V15 M2 10.5 V13.5 M22 10.5 V13.5" />
    </>
  ),
  globe: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Ellipse cx={12} cy={12} rx={3.8} ry={9} />
      <Path d="M3 12 H21" />
    </>
  ),
  trash: () => (
    <>
      <Path d="M4.5 7 H19.5 M9.5 7 V4.8 H14.5 V7 M6.6 7 L7.4 19.2 A1.6 1.6 0 0 0 9 20.7 H15 A1.6 1.6 0 0 0 16.6 19.2 L17.4 7 M10.2 10.5 V17 M13.8 10.5 V17" />
    </>
  ),
  eye: () => (
    <>
      <Path d="M2.5 12 C5 7.5 8.3 5.5 12 5.5 C15.7 5.5 19 7.5 21.5 12 C19 16.5 15.7 18.5 12 18.5 C8.3 18.5 5 16.5 2.5 12Z" />
      <Circle cx={12} cy={12} r={3} />
    </>
  ),
  info: (color) => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 11 V16.5" />
      <Circle cx={12} cy={7.8} r={1.2} fill={color} stroke="none" />
    </>
  ),
  noSign: () => (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M6 6 L18 18" />
    </>
  ),
  checkCircle: () => (
    <>
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M8 12.3 L10.8 15 L16.2 9.4" />
    </>
  ),
  // Wave 3: from the I object of design/волна-3/макет.html.
  move: () => (
    <>
      <Path d="M12 3.5 V20.5 M3.5 12 H20.5" />
      <Path d="M9.2 6.3 L12 3.5 L14.8 6.3 M9.2 17.7 L12 20.5 L14.8 17.7 M6.3 9.2 L3.5 12 L6.3 14.8 M17.7 9.2 L20.5 12 L17.7 14.8" />
    </>
  ),
  frame: () => (
    <>
      <Path d="M4 9 V5.6 A1.6 1.6 0 0 1 5.6 4 H9 M15 4 H18.4 A1.6 1.6 0 0 1 20 5.6 V9 M20 15 V18.4 A1.6 1.6 0 0 1 18.4 20 H15 M9 20 H5.6 A1.6 1.6 0 0 1 4 18.4 V15" />
      <Path d="M12 8.2 L16.6 11.8 L12 15.4 L7.4 11.8Z" />
    </>
  ),
  search: () => (
    <>
      <Circle cx={10.5} cy={10.5} r={6.2} />
      <Path d="M15.2 15.2 L20 20" />
    </>
  ),
  locate: (color) => (
    <>
      <Circle cx={12} cy={12} r={6.6} />
      <Circle cx={12} cy={12} r={2} fill={color} stroke="none" />
      <Path d="M12 2.5 V5.4 M12 18.6 V21.5 M2.5 12 H5.4 M18.6 12 H21.5" />
    </>
  ),
  undo: () => (
    <>
      <Path d="M8.5 6.5 L4.5 10.5 L8.5 14.5" />
      <Path d="M4.8 10.5 H14 A5.5 5.5 0 0 1 14 21.5 H10.5" />
    </>
  ),
  // Wave 4: from the I object of design/волна-4/макет.html.
  shuffle: () => (
    <>
      <Path d="M3.5 7 H7 C9.6 7 10.6 8.8 12 12 C13.4 15.2 14.4 17 17 17 H20.5" />
      <Path d="M3.5 17 H7 C8.6 17 9.6 16.3 10.4 15" />
      <Path d="M13.6 9 C14.4 7.7 15.4 7 17 7 H20.5" />
      <Path d="M18 4.5 L20.5 7 L18 9.5" />
      <Path d="M18 14.5 L20.5 17 L18 19.5" />
    </>
  ),
  pencil: () => (
    <>
      <Path d="M4 20 L4.6 16.4 L15.8 5.2 A1.9 1.9 0 0 1 18.5 5.2 L18.8 5.5 A1.9 1.9 0 0 1 18.8 8.2 L7.6 19.4 Z" />
      <Path d="M13.6 7.4 L16.6 10.4" />
      <Path d="M12.5 20 L20 20" />
    </>
  ),
  // Wave 5: design/волна-5/спец-магазин.md, 15.2.
  clock: () => (
    <>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7 V12 L15.5 14.2" />
    </>
  ),
  // Wave 5, friends: design/волна-5/макет-друзья.html (I).
  userPlus: () => (
    <>
      <Circle cx={10} cy={8.5} r={3.4} />
      <Path d="M3.5 19.5 C3.5 15.8 6.4 13.8 10 13.8 C11.9 13.8 13.5 14.3 14.7 15.3" />
      <Path d="M18.5 14.5 V20.5 M15.5 17.5 H21.5" />
    </>
  ),
  userMinus: () => (
    <>
      <Circle cx={10} cy={8.5} r={3.4} />
      <Path d="M3.5 19.5 C3.5 15.8 6.4 13.8 10 13.8 C11.9 13.8 13.5 14.3 14.7 15.3" />
      <Path d="M16 17.5 H21.5" />
    </>
  ),
  flag: () => (
    <>
      <Path d="M5.5 21 V4" />
      <Path d="M5.5 4.5 C9 2.8 11.5 6.6 15 5 C16.6 4.3 17.6 4.2 18.5 4.6 V13.2 C17.6 12.8 16.6 12.9 15 13.6 C11.5 15.2 9 11.4 5.5 13.1" />
    </>
  ),
  eyeOff: () => (
    <>
      <Path d="M2.5 12 C5 7.5 8.3 5.5 12 5.5 C15.7 5.5 19 7.5 21.5 12 C19 16.5 15.7 18.5 12 18.5 C8.3 18.5 5 16.5 2.5 12Z" />
      <Circle cx={12} cy={12} r={3} />
      <Path d="M4 4 L20 20" />
    </>
  ),
  wifiOff: (color) => (
    <>
      <Path d="M2.5 8.8 C4.6 6.9 7 5.8 9.6 5.4 M14.4 5.4 C17 5.8 19.4 6.9 21.5 8.8" />
      <Path d="M5.6 12.2 C7.1 10.9 8.8 10.1 10.6 9.9 M16.2 10.8 C17 11.2 17.7 11.6 18.4 12.2" />
      <Path d="M9 15.6 C10.9 14.2 13.1 14.2 15 15.6" />
      <Circle cx={12} cy={19} r={1.2} fill={color} stroke="none" />
      <Path d="M3.5 3.5 L20.5 20.5" />
    </>
  ),
  refresh: () => (
    <>
      <Path d="M19.5 12 A7.5 7.5 0 1 1 17.3 6.7" />
      <Path d="M19.6 3.6 V7.4 H15.8" />
    </>
  ),
  hourglass: (color) => (
    <>
      <Path d="M6.5 3.5 H17.5 M6.5 20.5 H17.5" />
      <Path d="M8 3.5 C8 8 12 9.6 12 12 C12 14.4 8 16 8 20.5 M16 3.5 C16 8 12 9.6 12 12 C12 14.4 16 16 16 20.5" />
      <Path d="M9.6 18.6 C10.4 17.2 11.2 16.6 12 16.6 C12.8 16.6 13.6 17.2 14.4 18.6Z" fill={color} stroke="none" />
    </>
  ),
  share: () => (
    <>
      <Path d="M12 3.5 V14.5 M8 7.5 L12 3.5 L16 7.5" />
      <Path d="M8 10.5 H7 A2.5 2.5 0 0 0 4.5 13 V18 A2.5 2.5 0 0 0 7 20.5 H17 A2.5 2.5 0 0 0 19.5 18 V13 A2.5 2.5 0 0 0 17 10.5 H16" />
    </>
  ),
  // OYUUR-30 (design/oyuur-29/макет.html, the I object): the forest in the account.
  cloud: () => (
    <>
      <Path d="M7 18.5 H17.2 A4.3 4.3 0 0 0 17.6 9.9 A5.8 5.8 0 0 0 6.4 11.3 A3.65 3.65 0 0 0 7 18.5Z" />
    </>
  ),
  cloudCheck: () => (
    <>
      <Path d="M7 18.5 H17.2 A4.3 4.3 0 0 0 17.6 9.9 A5.8 5.8 0 0 0 6.4 11.3 A3.65 3.65 0 0 0 7 18.5Z" />
      <Path d="M9.3 13.9 L11.3 15.8 L14.9 12" />
    </>
  ),
  cloudUp: () => (
    <>
      <Path d="M7 18.5 H17.2 A4.3 4.3 0 0 0 17.6 9.9 A5.8 5.8 0 0 0 6.4 11.3 A3.65 3.65 0 0 0 7 18.5Z" />
      <Path d="M12 16.4 V11.6 M9.9 13.6 L12 11.5 L14.1 13.6" />
    </>
  ),
  cloudOff: () => (
    <>
      <Path d="M7 18.5 H17.2 A4.3 4.3 0 0 0 17.6 9.9 A5.8 5.8 0 0 0 6.4 11.3 A3.65 3.65 0 0 0 7 18.5Z" />
      <Path d="M3.5 3.5 L20.5 20.5" />
    </>
  ),
  key: () => (
    <>
      <Circle cx="7.8" cy="15.8" r="4.1" />
      <Path d="M10.7 12.9 L19.6 4 M16.4 7.2 L18.8 9.6 M14.1 9.5 L16 11.4" />
    </>
  ),
  code: () => (
    <>
      <Rect x="2.8" y="6.5" width="18.4" height="11" rx="2.8" />
      <Path d="M7 12 H7.01 M10.3 12 H10.31 M13.7 12 H13.71 M17 12 H17.01" strokeWidth={3.2} />
    </>
  ),
  copy: () => (
    <>
      <Rect x="8.5" y="8.5" width="12" height="12" rx="2.6" />
      <Path d="M15.5 5.6 V5.4 A2.4 2.4 0 0 0 13.1 3 H5.9 A2.4 2.4 0 0 0 3.5 5.4 V13.1 A2.4 2.4 0 0 0 5.9 15.5 H6" />
    </>
  ),
  phone: () => (
    <>
      <Rect x="6.5" y="2.8" width="11" height="18.4" rx="2.6" />
      <Path d="M10.5 18 H13.5" />
    </>
  ),
  logout: () => (
    <>
      <Path d="M14 4.5 H17.5 A2 2 0 0 1 19.5 6.5 V17.5 A2 2 0 0 1 17.5 19.5 H14" />
      <Path d="M10 8 L6 12 L10 16 M6 12 H15" />
    </>
  ),
  tree: () => (
    <>
      <Path d="M12 21 V14.4" />
      <Path d="M12 3 C8.2 3 5.5 6 5.5 9.3 C5.5 12.3 8.3 14.6 12 14.6 C15.7 14.6 18.5 12.3 18.5 9.3 C18.5 6 15.8 3 12 3Z" />
    </>
  ),
  dropLine: () => (
    <>
      <Path d="M12 3.5 C12 3.5 5.5 10.6 5.5 14.6 A6.5 6.5 0 0 0 18.5 14.6 C18.5 10.6 12 3.5 12 3.5Z" />
    </>
  ),
  /** The macket's `undo` (bring the phone's forest back); the older `undo` above stays for the forest's toast. */
  undoRound: () => (
    <>
      <Path d="M4.5 12 A7.5 7.5 0 1 0 6.7 6.7" />
      <Path d="M4.4 3.6 V7.4 H8.2" />
    </>
  ),
  // OYUUR-23: watering reminders (Settings → Reminders).
  bell: () => (
    <>
      <Path d="M6 16.5 V11 a6 6 0 0 1 12 0 V16.5 L19.5 18 H4.5 Z" />
      <Path d="M10 20.5 a2.2 2.2 0 0 0 4 0" />
    </>
  ),
};
