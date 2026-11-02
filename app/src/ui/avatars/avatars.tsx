// The drawn avatars (wave 5 spec, 12.1): the paths are copied unchanged from the AV object of
// design/волна-5/макет-магазин-рисунки.js, viewBox 48, drawn over the circle's color (Avatar.tsx).
// Generated from the sketch; to change an avatar, change the sketch and regenerate.
import type { ReactElement } from 'react';
import { Circle, Ellipse, G, Path } from 'react-native-svg';
import type { AvatarId } from '@/game/profile';

export const AVATAR_ART: Record<AvatarId, ReactElement> = {
  fox: (
    <>
      <Path d="M9 9 L18 18 L13 24 Z" fill="#F07A3A" stroke="#B4521E" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M39 9 L30 18 L35 24 Z" fill="#F07A3A" stroke="#B4521E" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M11.5 12.5 L16 17 L13.4 20 Z M36.5 12.5 L32 17 L34.6 20 Z" fill="#5A3020" />
      <Path d="M24 15 C33 15 39 21 39 28 C39 34 32 40 24 41 C16 40 9 34 9 28 C9 21 15 15 24 15 Z" fill="#F58A45" stroke="#B4521E" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M24 41 C17 40 11.5 35 10.6 30.4 C14 31.2 18 33.2 20.4 36 C21.6 33.6 22.6 32.6 24 32.4 C25.4 32.6 26.4 33.6 27.6 36 C30 33.2 34 31.2 37.4 30.4 C36.5 35 31 40 24 41 Z" fill="#FFF4E6" />
      <Ellipse cx={18} cy={26.6} rx={2} ry={2.4} fill="#2B1A12" />
      <Ellipse cx={30} cy={26.6} rx={2} ry={2.4} fill="#2B1A12" />
      <Circle cx={18.7} cy={25.8} r={0.7} fill="#fff" />
      <Circle cx={30.7} cy={25.8} r={0.7} fill="#fff" />
      <Path d="M22 33 C22 31.8 26 31.8 26 33 C26 34 24.8 34.8 24 34.8 C23.2 34.8 22 34 22 33 Z" fill="#2B1A12" />
      <Ellipse cx={14.5} cy={30.5} rx={2.2} ry={1.3} fill="#FF9E8A" opacity={0.6} />
      <Ellipse cx={33.5} cy={30.5} rx={2.2} ry={1.3} fill="#FF9E8A" opacity={0.6} />
      <Path d="M15 18.6 C17.6 16.8 20.6 16 23.4 16" fill="none" stroke="#FFC18F" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
    </>
  ),
  owl: (
    <>
      <Path d="M12 12 L16 16 M36 12 L32 16" stroke="#6E4A2E" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M24 11 C34 11 39 18 39 27 C39 36 33 42 24 42 C15 42 9 36 9 27 C9 18 14 11 24 11 Z" fill="#B98A5A" stroke="#6E4A2E" strokeWidth={1.6} />
      <Path d="M24 30 C31 30 34 34 33 40 C30 41.6 27 42 24 42 C21 42 18 41.6 15 40 C14 34 17 30 24 30 Z" fill="#F3DDB8" />
      <Path d="M19 34 L20 35.4 L21 34 M23 36 L24 37.4 L25 36 M27 34 L28 35.4 L29 34" fill="none" stroke="#C9A06E" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={18} cy={23} r={6.4} fill="#FFF7E6" stroke="#6E4A2E" strokeWidth={1.4} />
      <Circle cx={30} cy={23} r={6.4} fill="#FFF7E6" stroke="#6E4A2E" strokeWidth={1.4} />
      <Circle cx={18.6} cy={23.4} r={3.2} fill="#2B1A12" />
      <Circle cx={29.4} cy={23.4} r={3.2} fill="#2B1A12" />
      <Circle cx={19.6} cy={22.2} r={1.1} fill="#fff" />
      <Circle cx={30.4} cy={22.2} r={1.1} fill="#fff" />
      <Path d="M22.4 28 L24 31.4 L25.6 28 Z" fill="#F4B740" stroke="#B9801E" strokeWidth={1} strokeLinejoin="round" />
      <Path d="M14 15.6 C16.6 13.6 19.6 12.8 22.6 12.8" fill="none" stroke="#DDB585" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
    </>
  ),
  bear: (
    <>
      <Circle cx={13} cy={14} r={5.4} fill="#A0724A" stroke="#6B4628" strokeWidth={1.6} />
      <Circle cx={35} cy={14} r={5.4} fill="#A0724A" stroke="#6B4628" strokeWidth={1.6} />
      <Circle cx={13} cy={14} r={2.6} fill="#E3B98A" />
      <Circle cx={35} cy={14} r={2.6} fill="#E3B98A" />
      <Path d="M24 12 C34 12 40 19 40 27.5 C40 36 33 41.5 24 41.5 C15 41.5 8 36 8 27.5 C8 19 14 12 24 12 Z" fill="#B3845A" stroke="#6B4628" strokeWidth={1.6} />
      <Ellipse cx={24} cy={32.5} rx={7.4} ry={5.8} fill="#EBCBA2" />
      <Circle cx={17.6} cy={25.6} r={2.1} fill="#2B1A12" />
      <Circle cx={30.4} cy={25.6} r={2.1} fill="#2B1A12" />
      <Circle cx={18.3} cy={24.9} r={0.7} fill="#fff" />
      <Circle cx={31.1} cy={24.9} r={0.7} fill="#fff" />
      <Path d="M21.4 30.2 C21.4 28.8 26.6 28.8 26.6 30.2 C26.6 31.6 25 32.6 24 32.6 C23 32.6 21.4 31.6 21.4 30.2 Z" fill="#3A2416" />
      <Path d="M24 32.6 V34.6 M21.6 35.6 C22.6 36.6 25.4 36.6 26.4 35.6" fill="none" stroke="#3A2416" strokeWidth={1.3} strokeLinecap="round" />
      <Path d="M14 18.4 C16.6 15.4 19.6 14 22.6 13.8" fill="none" stroke="#D2A678" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
    </>
  ),
  hedgehog: (
    <>
      <Path d="M8 30 L5 24 L10 23 L8 17 L14 17.6 L14 11.4 L19.6 14 L22 8.4 L26 13 L30.6 9 L32 14.8 L37.6 13 L36.6 19 L42 19.6 L38.6 25 L43 28.6 L37.4 31 Z" fill="#8A6A4E" stroke="#5A4230" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M14 21 L16.4 18 M20 17.4 L21.6 14.4 M26.4 16.6 L27.6 13.4 M32.4 18.4 L34.6 15.8" stroke="#B49274" strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M10.4 31 C10.4 24.6 16 21.6 23.6 21.6 C31.6 21.6 38 25 38 31 C38 37.4 31.6 41.6 24 41.6 C16.6 41.6 10.4 37.4 10.4 31 Z" fill="#F3D9B5" stroke="#B48A55" strokeWidth={1.4} />
      <Circle cx={19} cy={29} r={2} fill="#2B1A12" />
      <Circle cx={29} cy={29} r={2} fill="#2B1A12" />
      <Circle cx={19.6} cy={28.4} r={0.7} fill="#fff" />
      <Circle cx={29.6} cy={28.4} r={0.7} fill="#fff" />
      <Ellipse cx={24} cy={33.6} rx={2.4} ry={1.9} fill="#2B1A12" />
      <Ellipse cx={15.4} cy={33.4} rx={2.2} ry={1.3} fill="#FF9E8A" opacity={0.6} />
      <Ellipse cx={32.6} cy={33.4} rx={2.2} ry={1.3} fill="#FF9E8A" opacity={0.6} />
      <Path d="M30.4 10.6 C31.8 8.6 34.4 8 36.4 9 C35.4 11 33 11.8 30.4 10.6 Z" fill="#E0485F" stroke="#A82A3F" strokeWidth={1} />
    </>
  ),
  rabbit: (
    <>
      <Path d="M17.6 18 C14 12 14 4.6 17.4 4.2 C21 3.8 22 11 21.4 17.4" fill="#F4EEE8" stroke="#9A8A80" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M30.4 18 C34 12 34 4.6 30.6 4.2 C27 3.8 26 11 26.6 17.4" fill="#F4EEE8" stroke="#9A8A80" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M18.2 15.6 C16.6 11.6 16.8 7.4 17.8 7 M29.8 15.6 C31.4 11.6 31.2 7.4 30.2 7" fill="none" stroke="#FFB3C4" strokeWidth={2} strokeLinecap="round" />
      <Path d="M24 16 C33 16 38.6 21.6 38.6 29 C38.6 36.4 32 41.6 24 41.6 C16 41.6 9.4 36.4 9.4 29 C9.4 21.6 15 16 24 16 Z" fill="#FBF7F2" stroke="#9A8A80" strokeWidth={1.6} />
      <Circle cx={18.2} cy={28} r={2.1} fill="#2B1A12" />
      <Circle cx={29.8} cy={28} r={2.1} fill="#2B1A12" />
      <Circle cx={18.9} cy={27.3} r={0.7} fill="#fff" />
      <Circle cx={30.5} cy={27.3} r={0.7} fill="#fff" />
      <Path d="M22.4 32 C22.4 31 25.6 31 25.6 32 C25.6 33 24.6 33.6 24 33.6 C23.4 33.6 22.4 33 22.4 32 Z" fill="#FF8FA6" />
      <Path d="M24 33.6 V35 M21.8 36 C22.8 37 25.2 37 26.2 36" fill="none" stroke="#9A8A80" strokeWidth={1.2} strokeLinecap="round" />
      <Ellipse cx={14.6} cy={32.4} rx={2.2} ry={1.3} fill="#FFB3C4" opacity={0.7} />
      <Ellipse cx={33.4} cy={32.4} rx={2.2} ry={1.3} fill="#FFB3C4" opacity={0.7} />
    </>
  ),
  squirrel: (
    <>
      <Path d="M33 41 C44 40 46 28 41 20 C37 13 29 14 30 21 C31 26 37 26 37 31 C37 35 34 37 31 38" fill="#D9824A" stroke="#9A5226" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M38 20 C40.4 23 41.4 27.6 40 31.6" fill="none" stroke="#F2B07A" strokeWidth={1.6} strokeLinecap="round" opacity={0.9} />
      <Path d="M12 15 L13.6 7.6 L18.6 13 Z M30 15 L28.4 7.6 L23.4 13 Z" fill="#C8703A" stroke="#9A5226" strokeWidth={1.5} strokeLinejoin="round" />
      <Path d="M21 12.6 C29 12.6 33.6 18.4 33.6 25.6 C33.6 33 28 38.4 21 38.4 C14 38.4 8.4 33 8.4 25.6 C8.4 18.4 13 12.6 21 12.6 Z" fill="#E08C50" stroke="#9A5226" strokeWidth={1.6} />
      <Path d="M21 38.4 C16.4 38.2 13.2 35.6 12.6 31.4 C15.2 30.6 18.2 31 21 33 C23.8 31 26.8 30.6 29.4 31.4 C28.8 35.6 25.6 38.2 21 38.4 Z" fill="#FFF0DC" />
      <Circle cx={16} cy={24.6} r={2} fill="#2B1A12" />
      <Circle cx={26} cy={24.6} r={2} fill="#2B1A12" />
      <Circle cx={16.7} cy={23.9} r={0.7} fill="#fff" />
      <Circle cx={26.7} cy={23.9} r={0.7} fill="#fff" />
      <Ellipse cx={21} cy={29.6} rx={1.9} ry={1.4} fill="#2B1A12" />
      <G transform="translate(12.4 34.4) scale(0.36)">
        <Path d="M5.7 10.9 C5.7 16.1 8.5 20.4 12 22.2 C15.5 20.4 18.3 16.1 18.3 10.9 Z" fill="#E0A24A" stroke="#A0662A" strokeWidth={2.4} />
        <Path d="M3.8 10.8 C3.8 6.7 7.6 4.1 12 4.1 C16.4 4.1 20.2 6.7 20.2 10.8 C20.2 11.9 19.3 12.5 18.3 12.3 C14.1 11.5 9.9 11.5 5.7 12.3 C4.7 12.5 3.8 11.9 3.8 10.8 Z" fill="#8A5A2B" stroke="#5A3A17" strokeWidth={2.4} />
      </G>
    </>
  ),
  deer: (
    <>
      <Path d="M16 14 C13 10 10.6 6 11.6 3.4 M13 8.6 L8.4 7 M14.4 11.4 L10.6 11.6 M32 14 C35 10 37.4 6 36.4 3.4 M35 8.6 L39.6 7 M33.6 11.4 L37.4 11.6" fill="none" stroke="#8A5A2E" strokeWidth={2} strokeLinecap="round" />
      <Path d="M12.4 18.6 C8 17.4 5.6 19.6 6.4 22 C9 23.6 12.4 22.6 14 21 Z M35.6 18.6 C40 17.4 42.4 19.6 41.6 22 C39 23.6 35.6 22.6 34 21 Z" fill="#C98A52" stroke="#8A5A2E" strokeWidth={1.4} strokeLinejoin="round" />
      <Path d="M24 13.6 C32 13.6 36 19 36 25.6 C36 32 31.6 41.6 24 41.6 C16.4 41.6 12 32 12 25.6 C12 19 16 13.6 24 13.6 Z" fill="#D69A5E" stroke="#8A5A2E" strokeWidth={1.6} />
      <Path d="M24 41.6 C19.4 41.6 17 37.6 17.4 33.6 C19.4 32.4 22 32 24 32 C26 32 28.6 32.4 30.6 33.6 C31 37.6 28.6 41.6 24 41.6 Z" fill="#F6DDBF" />
      <Circle cx={19} cy={25.6} r={2.1} fill="#2B1A12" />
      <Circle cx={29} cy={25.6} r={2.1} fill="#2B1A12" />
      <Circle cx={19.7} cy={24.9} r={0.7} fill="#fff" />
      <Circle cx={29.7} cy={24.9} r={0.7} fill="#fff" />
      <Ellipse cx={24} cy={35} rx={2.4} ry={1.8} fill="#3A2416" />
      <Circle cx={17} cy={19.6} r={1} fill="#FFF0DC" />
      <Circle cx={31} cy={19.6} r={1} fill="#FFF0DC" />
      <Circle cx={24} cy={17.4} r={1} fill="#FFF0DC" />
    </>
  ),
  frog: (
    <>
      <Circle cx={16} cy={15.6} r={6} fill="#7CC456" stroke="#3F7F2E" strokeWidth={1.6} />
      <Circle cx={32} cy={15.6} r={6} fill="#7CC456" stroke="#3F7F2E" strokeWidth={1.6} />
      <Circle cx={16} cy={15.4} r={3.6} fill="#FFFFFF" />
      <Circle cx={32} cy={15.4} r={3.6} fill="#FFFFFF" />
      <Circle cx={16.4} cy={15.8} r={2.2} fill="#2B1A12" />
      <Circle cx={31.6} cy={15.8} r={2.2} fill="#2B1A12" />
      <Circle cx={17} cy={15} r={0.7} fill="#fff" />
      <Circle cx={32.2} cy={15} r={0.7} fill="#fff" />
      <Path d="M24 18.6 C34 18.6 41 24 41 30.6 C41 37 33.6 41.4 24 41.4 C14.4 41.4 7 37 7 30.6 C7 24 14 18.6 24 18.6 Z" fill="#8CD263" stroke="#3F7F2E" strokeWidth={1.6} />
      <Path d="M14 31.6 C18 35.6 30 35.6 34 31.6" fill="none" stroke="#2F6A24" strokeWidth={1.6} strokeLinecap="round" />
      <Ellipse cx={12.4} cy={29} rx={2.4} ry={1.4} fill="#FF9E8A" opacity={0.6} />
      <Ellipse cx={35.6} cy={29} rx={2.4} ry={1.4} fill="#FF9E8A" opacity={0.6} />
      <Circle cx={21} cy={25} r={0.8} fill="#3F7F2E" />
      <Circle cx={27} cy={25} r={0.8} fill="#3F7F2E" />
      <Path d="M12 23.4 C14.4 21.4 17.6 20.4 20.6 20.2" fill="none" stroke="#C6EC9E" strokeWidth={1.6} strokeLinecap="round" opacity={0.9} />
    </>
  ),
  leaf: (
    <>
      <Path d="M24 42 V31" stroke="#6B4A2E" strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M24 34 C21 34 19 33.6 17.6 32.6 C18.6 31.2 19 30 18.6 28.6 C16.4 29 14 28.4 12.4 26.6 C14 25.4 14.8 24 14.6 22.4 C12.6 22 11 20.6 10.6 18.6 C12.6 18 14 16.6 14.2 14.8 C16.4 15.2 18.4 14.6 19.6 12.8 C20.6 14 21.6 14.4 22.6 14 C22.4 11.4 23 8.4 24 6 C25 8.4 25.6 11.4 25.4 14 C26.4 14.4 27.4 14 28.4 12.8 C29.6 14.6 31.6 15.2 33.8 14.8 C34 16.6 35.4 18 37.4 18.6 C37 20.6 35.4 22 33.4 22.4 C33.2 24 34 25.4 35.6 26.6 C34 28.4 31.6 29 29.4 28.6 C29 30 29.4 31.2 30.4 32.6 C29 33.6 27 34 24 34 Z" fill="#8BC34A" stroke="#4E8A2A" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M24 33 V10 M24 26 L17.6 21.6 M24 26 L30.4 21.6 M24 19.6 L19 15.6 M24 19.6 L29 15.6" fill="none" stroke="#4E8A2A" strokeWidth={1.2} strokeLinecap="round" opacity={0.8} />
      <Path d="M15.6 18 C16.6 16.6 18 15.8 19.6 15.4" fill="none" stroke="#D6EF9E" strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={20.4} cy={27.6} r={1.4} fill="#2B1A12" />
      <Circle cx={27.6} cy={27.6} r={1.4} fill="#2B1A12" />
      <Path d="M22.4 30.4 C23.4 31.4 24.6 31.4 25.6 30.4" fill="none" stroke="#2B1A12" strokeWidth={1.2} strokeLinecap="round" />
    </>
  ),
  acorn: (
    <>
      <Path d="M24 9 C24.2 6 25.6 4 28 3" fill="none" stroke="#5A3A17" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M12.4 21.6 C12.4 32 18 40 24 43.6 C30 40 35.6 32 35.6 21.6 Z" fill="#E0A24A" stroke="#A0662A" strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M8.6 21.4 C8.6 13.2 15.6 8.4 24 8.4 C32.4 8.4 39.4 13.2 39.4 21.4 C39.4 23.4 37.8 24.6 35.8 24.2 C28 22.8 20 22.8 12.2 24.2 C10.2 24.6 8.6 23.4 8.6 21.4 Z" fill="#8A5A2B" stroke="#5A3A17" strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M14 19.6 L18 15.6 M20.6 20.4 L26.6 14.4 M28.6 20 L33.4 15.2 M15.4 13.6 L19.6 17.8 M23.2 12.4 L28.8 18 M31.4 14 L34.6 17.2" fill="none" stroke="#6E4520" strokeWidth={1.3} strokeLinecap="round" opacity={0.75} />
      <Circle cx={19.6} cy={30} r={1.8} fill="#2B1A12" />
      <Circle cx={28.4} cy={30} r={1.8} fill="#2B1A12" />
      <Circle cx={20.2} cy={29.4} r={0.6} fill="#fff" />
      <Circle cx={29} cy={29.4} r={0.6} fill="#fff" />
      <Path d="M21.6 34 C22.8 35.4 25.2 35.4 26.4 34" fill="none" stroke="#5A3A17" strokeWidth={1.4} strokeLinecap="round" />
      <Ellipse cx={16.4} cy={33.4} rx={2} ry={1.2} fill="#FF8A6A" opacity={0.6} />
      <Ellipse cx={31.6} cy={33.4} rx={2} ry={1.2} fill="#FF8A6A" opacity={0.6} />
      <Path d="M16.8 26.6 C17.2 31.4 19 35.4 21.6 38.4" fill="none" stroke="#FFE7B0" strokeWidth={1.8} strokeLinecap="round" opacity={0.7} />
    </>
  ),
  mushroom: (
    <>
      <Path d="M17.4 27 C17 33 16.6 37.6 18 41.4 C21.6 42.6 26.4 42.6 30 41.4 C31.4 37.6 31 33 30.6 27 Z" fill="#FFF4E2" stroke="#B48A55" strokeWidth={1.6} strokeLinejoin="round" />
      <Path d="M6.6 26.4 C6.6 15.6 14.4 8.4 24 8.4 C33.6 8.4 41.4 15.6 41.4 26.4 C41.4 28.4 39.8 29.4 37.6 29 C28.8 27.4 19.2 27.4 10.4 29 C8.2 29.4 6.6 28.4 6.6 26.4 Z" fill="#E8483E" stroke="#A82A2A" strokeWidth={1.6} strokeLinejoin="round" />
      <Circle cx={15} cy={18} r={2.6} fill="#FFFFFF" />
      <Circle cx={24.6} cy={13.6} r={2.2} fill="#FFFFFF" />
      <Circle cx={32.8} cy={19.6} r={3} fill="#FFFFFF" />
      <Circle cx={22} cy={22.4} r={1.6} fill="#FFFFFF" />
      <Circle cx={10.6} cy={24.4} r={1.4} fill="#FFFFFF" />
      <Circle cx={21} cy={34} r={1.6} fill="#2B1A12" />
      <Circle cx={27} cy={34} r={1.6} fill="#2B1A12" />
      <Path d="M22.6 37.4 C23.4 38.2 24.6 38.2 25.4 37.4" fill="none" stroke="#2B1A12" strokeWidth={1.2} strokeLinecap="round" />
      <Path d="M11 15 C13 12 16 10.4 19.2 9.8" fill="none" stroke="#FF9A8A" strokeWidth={1.8} strokeLinecap="round" />
    </>
  ),
  flower: (
    <>
      <Path d="M24 42 V30" stroke="#5E9A2C" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M24 38 C20 38 16.6 36 15.6 32.4 C19.6 32 22.6 34 24 38 Z" fill="#8BC34A" stroke="#4E8A2A" strokeWidth={1.2} strokeLinejoin="round" />
      <G fill="#FFFFFF" stroke="#E0A6B8" strokeWidth={1.4}>
        <Ellipse cx={24} cy={11.4} rx={5.4} ry={7} />
        <Ellipse cx={24} cy={11.4} rx={5.4} ry={7} transform="rotate(72 24 20)" />
        <Ellipse cx={24} cy={11.4} rx={5.4} ry={7} transform="rotate(144 24 20)" />
        <Ellipse cx={24} cy={11.4} rx={5.4} ry={7} transform="rotate(216 24 20)" />
        <Ellipse cx={24} cy={11.4} rx={5.4} ry={7} transform="rotate(288 24 20)" />
      </G>
      <Circle cx={24} cy={20} r={7} fill="#FFD84D" stroke="#D99A1E" strokeWidth={1.4} />
      <Circle cx={21.6} cy={19.4} r={1.3} fill="#2B1A12" />
      <Circle cx={26.4} cy={19.4} r={1.3} fill="#2B1A12" />
      <Path d="M22.2 22.4 C23.2 23.4 24.8 23.4 25.8 22.4" fill="none" stroke="#2B1A12" strokeWidth={1.2} strokeLinecap="round" />
      <Ellipse cx={19.6} cy={22} rx={1.4} ry={0.9} fill="#FF8A6A" opacity={0.6} />
      <Ellipse cx={28.4} cy={22} rx={1.4} ry={0.9} fill="#FF8A6A" opacity={0.6} />
    </>
  ),
};
