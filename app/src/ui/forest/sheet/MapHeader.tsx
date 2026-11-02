// The floating header over the forest map (spec 1.3 layers 3 and 5, 2.5, 4.2): "back",
// the "My forest" capsule and "Whole plot" on glass, over a haze under the status bar.
// While a tree is being moved the buttons fade out and the capsule becomes a banner
// with a cross that cancels the move: one goes first, then the other comes, never both.
import { ReactNode, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, Extrapolation, interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useStore } from '@/state/store';
import { elevation, fonts, Glyph, HIT, Icon, scene, Txt, useColors, useMotionOn } from '@/ui/ds';

/** The header's row: 6 above, 44 buttons, 6 below; the map's visible area starts under it. */
export const HEADER_H = 56;
const FADE_EXTRA = 90;
/** The swap, ms: the old row is gone after OUT, the new one starts after a short pause. */
const SWAP = 150;
const OUT = 80;
const IN_FROM = 90;

export function MapHeader({ topInset, width, banner, showFit, atFit, onBack, onFit, onCancelMove, title, picture }: {
  topInset: number;
  /** A friend's forest (wave 5): "Mei's forest" with their avatar instead of "My forest". */
  title?: string;
  picture?: ReactNode;
  width: number;
  /** While moving: "Move “…”" or "Where should “…” go?"; null — the normal header. */
  banner: string | null;
  /** No trees — no "Whole plot". */
  showFit: boolean;
  /** The camera shows the whole plot: the button has a ring and leads back to the trees. */
  atFit: boolean;
  onBack(): void;
  onFit(): void;
  onCancelMove(): void;
}) {
  const { t, night } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const moving = banner !== null;
  // 0 — the normal row, 1 — the banner. Linear, so the fractions below are times.
  const b = useSharedValue(moving ? 1 : 0);
  useEffect(() => {
    if (motionOn) b.set(withTiming(moving ? 1 : 0, { duration: SWAP, easing: Easing.linear }));
    else b.set(moving ? 1 : 0);
  }, [b, moving, motionOn]);
  // Going to the banner the capsule fades in the first OUT ms, the banner in the last
  // SWAP − IN_FROM; coming back the same windows, run backwards.
  const normalStyle = useAnimatedStyle(() => ({ opacity: interpolate(b.get(), [0, OUT / SWAP], [1, 0], Extrapolation.CLAMP) }));
  const bannerStyle = useAnimatedStyle(() => ({ opacity: interpolate(b.get(), [IN_FROM / SWAP, 1], [0, 1], Extrapolation.CLAMP) }));
  const fade = (night ? scene.forest.night : scene.forest.day).topFade;
  const top = topInset + (HEADER_H - HIT) / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View pointerEvents="none" style={styles.fade}>
        <Svg width={width} height={topInset + FADE_EXTRA}>
          <Defs>
            <LinearGradient id="forestTopFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={fade} stopOpacity={1} />
              <Stop offset="1" stopColor={fade} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={width} height={topInset + FADE_EXTRA} fill="url(#forestTopFade)" />
        </Svg>
      </View>

      <Animated.View style={[styles.row, { top }, normalStyle]} pointerEvents={moving ? 'none' : 'box-none'}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('back')} style={[styles.circle, elevation(1, night), { backgroundColor: c.glass }]}>
          <Icon name="chevronLeft" size={22} color={c.text} />
        </Pressable>
        <View style={[styles.capsule, elevation(1, night), { backgroundColor: c.glass }]}>
          {picture ?? <Glyph name="forest" size={22} />}
          <Txt variant="title3" numberOfLines={1} style={styles.capsuleText} accessibilityRole="header">{title ?? t('myForest')}</Txt>
        </View>
        {showFit ? (
          <Pressable
            onPress={onFit}
            accessibilityRole="button"
            accessibilityLabel={atFit ? t('fitTrees') : t('fitPlot')}
            accessibilityState={{ selected: atFit }}
            style={[styles.circle, elevation(1, night), { backgroundColor: c.glass }]}
          >
            {atFit && <View pointerEvents="none" style={[styles.ring, { borderColor: c.accent }]} />}
            <Icon name="frame" size={22} color={c.text} />
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}
      </Animated.View>

      <Animated.View style={[styles.row, { top }, bannerStyle]} pointerEvents={moving ? 'box-none' : 'none'}>
        <View style={[styles.banner, elevation(2, night), { backgroundColor: c.glass }]}>
          <Icon name="move" size={18} color={c.text} />
          <Txt numberOfLines={1} ellipsizeMode="tail" style={styles.bannerText}>{banner ?? ''}</Txt>
          <Pressable onPress={onCancelMove} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('moveCancel')} style={styles.cross}>
            <View style={[styles.crossCircle, { backgroundColor: c.sunken }]}>
              <Icon name="close" size={16} color={c.text} />
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', left: 0, right: 0, top: 0 },
  row: { position: 'absolute', left: 16, right: 16, height: HIT, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  circle: { width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', left: -3, top: -3, right: -3, bottom: -3, borderRadius: HIT / 2 + 3, borderWidth: 3 },
  spacer: { width: HIT, height: HIT },
  capsule: { height: HIT, borderRadius: HIT / 2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, flexShrink: 1 },
  capsuleText: { flexShrink: 1 },
  banner: { flex: 1, height: HIT, borderRadius: HIT / 2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 6 },
  bannerText: { flex: 1, fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  cross: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  crossCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
