// The menu in the raised sheet (wave 5 spec, section 4): eight raised cards with a "lip" in
// three rows — My forest · New habit · Quests; Friends · Leaders (wide); Shop · Profile ·
// Settings (narrow). A red number on a card is what can be claimed there (Quests, Profile);
// something new without a number (the shop, friends) is a calm gold dot — red is kept for
// "Claim", so the menu never shouts in five places at once. "My forest" also catches the
// lock-in medal (wave 2 spec 3.2, 3000 ms): its glyph jumps, the card glows gold, "+1", the count changes.
import { ComponentRef, ReactNode, RefObject, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { pluralForm } from '@/i18n';
import { useStore } from '@/state/store';
import { colorsFor, elevation, fonts, Glyph, MAX_FONT_SCALE, motion, radius, Txt } from '@/ui/ds';
import { SyncBadge } from '@/ui/account/SyncBadge';
import { cue } from '@/ui/feedback';
import { useMenuNews } from './news';

export type MenuTarget = 'forest' | 'new' | 'quests' | 'friends' | 'leaders' | 'shop' | 'profile' | 'settings';

/** Gold of the landing ring and its sparkles. */
const RING = '#FFCF4D';
const SPARKS = 8;
/** How long the landing ring and "+1" stay, ms (spec 3.2). */
const HOLD = 1600;
/** Row heights (spec 4.1); the second number under 360 px wide. */
const ROWS = { big: [100, 92], wide: [72, 68], narrow: [76, 72] } as const;

/** The calm dot of news without a number: amber by day, gold at night (red is for "Claim"). */
export const newsDotColor = (night: boolean) => (night ? colorsFor(true).gold : colorsFor(false).goldLip);

type Shape = 'big' | 'wide' | 'narrow';

export function MenuGrid({ forestCount, landing, animations, forestGlyph, canPress, onOpen }: {
  /** Habits in the forest, for "3 trees". */
  forestCount: number;
  /** Grows by one on each landing of a medal; 0 — none yet. */
  landing: number;
  animations: boolean;
  /** The circle of the "My forest" glyph: where the medal flies. */
  forestGlyph: RefObject<ComponentRef<typeof View> | null>;
  /** False when the touch pulled the sheet: then it is not a tap. */
  canPress: () => boolean;
  onOpen: (target: MenuTarget) => void;
}) {
  const { t, night } = useStore();
  const c = colorsFor(night);
  const narrow = useWindowDimensions().width < 360;
  const h = (shape: Shape) => ROWS[shape][narrow ? 1 : 0];
  const news = useMenuNews();
  const open = (target: MenuTarget) => {
    if (!canPress()) return;
    cue('tap');
    // Opening Friends sees what its dot was about.
    if (target === 'friends') news.friends.markSeen();
    onOpen(target);
  };

  const q = news.quests.caption;
  const questCaption =
    q === null ? undefined : q.kind === 'of' ? t('questTilesOf', { n: q.n, total: q.total }) : t(q.kind === 'claim' ? 'questTilesClaim' : 'questTilesDone');

  return (
    <View style={styles.menu}>
      <View style={[styles.divider, { backgroundColor: c.divider }]} />
      <View style={[styles.row, { height: h('big') }]}>
        <MenuCard
          target="forest"
          shape="big"
          title={t('myForest')}
          caption={t('treesCount', { n: forestCount, word: t.dict.treeWords[pluralForm(t.lang, forestCount)] })}
          glyph={<Glyph name="forest" size={34} />}
          tint={c.tintForest}
          landing={landing}
          animations={animations}
          glyphRef={forestGlyph}
          onOpen={open}
        />
        <MenuCard
          target="new"
          shape="big"
          title={t('newHabit')}
          glyph={<Glyph name="newHabit" size={34} />}
          tint="rgba(255,255,255,0.28)"
          accent
          animations={animations}
          onOpen={open}
        />
        <MenuCard
          target="quests"
          shape="big"
          title={t('quests')}
          caption={questCaption}
          glyph={<Glyph name="tasks" size={32} />}
          tint={c.tintQuests}
          count={news.quests.count}
          animations={animations}
          onOpen={open}
        />
      </View>
      <View style={[styles.row, styles.gap, { height: h('wide') }]}>
        <MenuCard
          target="friends"
          shape="wide"
          title={t('friends')}
          caption={news.friends.friends?.text}
          captionA11y={news.friends.friends?.a11y}
          glyph={<Glyph name="friends" size={32} />}
          tint={c.tintFriends}
          circleDot={news.friends.dot}
          animations={animations}
          onOpen={open}
        />
        <MenuCard
          target="leaders"
          shape="wide"
          title={t('leaders')}
          caption={news.friends.leaders?.text}
          captionA11y={news.friends.leaders?.a11y}
          glyph={<Glyph name="leaders" size={32} />}
          tint={c.tintLeaders}
          animations={animations}
          onOpen={open}
        />
      </View>
      <View style={[styles.row, styles.gap, { height: h('narrow') }]}>
        <MenuCard target="shop" shape="narrow" title={t('shop')} glyph={<Glyph name="shop" size={26} />} tint={c.tintShop} dot={news.shop} animations={animations} onOpen={open} />
        <MenuCard
          target="profile"
          shape="narrow"
          title={t('profile')}
          glyph={<Glyph name="profile" size={26} />}
          tint={c.tintProfile}
          count={news.profile}
          animations={animations}
          onOpen={open}
        />
        <MenuCard
          target="settings"
          shape="narrow"
          title={t('settings')}
          glyph={<Glyph name="settings" size={25} />}
          tint={c.tintSettings}
          animations={animations}
          onOpen={open}
          corner={<SyncBadge animations={animations} />}
        />
      </View>
    </View>
  );
}

function MenuCard({ target, shape, title, caption, captionA11y, glyph, tint, accent, count = 0, dot = false, circleDot, landing = 0, animations, glyphRef, onOpen, corner }: {
  target: MenuTarget;
  shape: Shape;
  title: string;
  /** One short line under the title (~14 letters; on a 320 phone a wide card may take two lines). */
  caption?: string;
  /** The caption in full for a screen reader, when the line is a short form of it. */
  captionA11y?: string;
  glyph: ReactNode;
  tint: string;
  accent?: boolean;
  /** What can be claimed here: a red number. */
  count?: number;
  /** Something new without a number: a calm dot. */
  dot?: boolean;
  /** The same calm dot on the glyph's circle (Friends, спец-друзья 10); undefined — none ever. */
  circleDot?: boolean;
  landing?: number;
  animations: boolean;
  glyphRef?: RefObject<ComponentRef<typeof View> | null>;
  onOpen: (target: MenuTarget) => void;
  /** Something of its own at the top right corner (Settings: the sync badge, OYUUR-30). */
  corner?: ReactNode;
}) {
  const { night, t } = useStore();
  const c = colorsFor(night);
  const face = accent ? c.accent : c.card;
  const lip = accent ? c.accentLip : c.cardLip;
  const text = accent ? c.onAccent : c.text;

  const press = useSharedValue(0);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.03 * press.get() }] }));
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: 2 * press.get() }] }));

  // ---- Landing of the lock-in medal ----
  const bounce = useSharedValue(1);
  const ring = useSharedValue(0);
  const plus = useSharedValue(0);
  const plusAway = useSharedValue(0);
  const sparks = useSharedValue(0);
  // Turning animations on or off later must not play the landing again.
  const animationsRef = useRef(animations);
  animationsRef.current = animations;
  useEffect(() => {
    if (!landing) return;
    const animations = animationsRef.current;
    const out = (ms: number) => ({ duration: ms, easing: motion.ease.in });
    if (animations) {
      bounce.set(withSequence(withTiming(1.18, { duration: 90, easing: motion.ease.out }), withSpring(1, motion.spring.bounce)));
      ring.set(withSequence(withTiming(1, { duration: motion.fast }), withDelay(HOLD, withTiming(0, out(400)))));
      plus.set(0);
      plus.set(withSpring(1, motion.spring.pop));
      plusAway.set(0);
      plusAway.set(withDelay(HOLD, withTiming(1, out(250))));
      sparks.set(0);
      sparks.set(withTiming(1, { duration: 500, easing: motion.ease.out }));
    } else {
      // No jump: the ring and "+1" are just there, then fade. The hold is the message,
      // not decoration: the system "reduce motion" must not cut it to nothing.
      const never = ReduceMotion.Never;
      ring.set(withSequence(never, withTiming(1, { duration: 0, reduceMotion: never }), withDelay(HOLD, withTiming(0, { duration: 200, reduceMotion: never }), never)));
      plus.set(1);
      plusAway.set(0);
      plusAway.set(withDelay(HOLD, withTiming(1, { duration: 200, reduceMotion: never }), never));
    }
  }, [landing, bounce, ring, plus, plusAway, sparks]);

  const bounceStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.get() }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.get() }));
  const plusStyle = useAnimatedStyle(() => ({
    opacity: plus.get() > 0 ? 1 - plusAway.get() : 0,
    transform: [{ translateY: -8 * plusAway.get() }, { scale: 0.4 + 0.6 * plus.get() }],
  }));

  const onPressIn = () => {
    if (animations) press.set(withTiming(1, { duration: motion.press, easing: Easing.linear }));
  };
  const onPressOut = () => press.set(animations ? withSpring(0, motion.spring.press) : 0);
  const onPress = () => onOpen(target);

  // The number is part of the card's name for a screen reader (spec 4.3).
  const label = [title, captionA11y ?? caption, count > 0 ? t('menuClaimA11y', { n: count }) : dot || circleDot ? t('menuNewA11y') : undefined].filter(Boolean).join(', ');
  // Under 360 px wide the wide cards give their line more room: a smaller circle, tighter sides.
  const small = useWindowDimensions().width < 360;
  const circle = shape === 'big' ? 48 : shape === 'wide' ? (small ? 40 : 44) : 40;
  const glyphCircle = (
    <Animated.View ref={glyphRef} style={[{ width: circle, height: circle, borderRadius: circle / 2, backgroundColor: tint }, styles.circle, bounceStyle]}>
      {glyph}
      {circleDot !== undefined && <CircleDot on={circleDot} animations={animations} />}
    </Animated.View>
  );

  let content: ReactNode;
  if (shape === 'wide') {
    content = (
      <>
        {glyphCircle}
        <View style={styles.wideText}>
          <Txt variant="bodyStrong" color={text} numberOfLines={1} style={styles.wideTitle}>{title}</Txt>
          {caption !== undefined && (
            // On a 320 phone a line that still doesn't fit takes a second line rather than "…".
            <Txt variant="caption" color={c.textSoft} numberOfLines={small ? 2 : 1} style={[styles.wideCaption, small && styles.wideCaptionSmall]}>{caption}</Txt>
          )}
        </View>
      </>
    );
  } else if (shape === 'narrow') {
    content = (
      <>
        {glyphCircle}
        <Txt variant="bodyStrong" color={text} numberOfLines={1} style={styles.narrowTitle}>{title}</Txt>
      </>
    );
  } else {
    content = (
      <>
        {glyphCircle}
        <Txt variant="bodyStrong" color={text} numberOfLines={2} style={styles.title}>{title}</Txt>
        {caption !== undefined && (
          <Animated.View key={caption} entering={animations && landing ? FadeIn.duration(200) : undefined}>
            <Txt variant="caption" color={c.textSoft} numberOfLines={1} style={styles.cardCaption}>{caption}</Txt>
          </Animated.View>
        )}
      </>
    );
  }

  return (
    <Animated.View style={[styles.cardWrap, cardStyle]}>
      <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} />
      <View style={[styles.lip, { backgroundColor: lip }, elevation(1, night)]} />
      <Animated.View style={[styles.face, { backgroundColor: face }, faceStyle]}>
        <Pressable
          onPress={onPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={shape === 'wide' ? [styles.widePress, small && styles.widePressSmall] : shape === 'narrow' ? styles.narrowPress : styles.press}
        >
          {content}
        </Pressable>
      </Animated.View>
      {count > 0 ? <Badge count={count} animations={animations} /> : dot ? <Badge dot animations={animations} /> : corner}
      {landing > 0 && (
        <>
          <Animated.View pointerEvents="none" style={[styles.plus, { backgroundColor: c.accent }, plusStyle]}>
            <Txt variant="caption" color="#FFFFFF" style={styles.plusText}>+1</Txt>
          </Animated.View>
          {animations && Array.from({ length: SPARKS }, (_, i) => <Spark key={`${landing}-${i}`} i={i} t={sparks} />)}
        </>
      )}
    </Animated.View>
  );
}

/** The red number (or the calm dot) at the card's top right corner; pops in once, never wobbles after (spec 4.3). */
function Badge({ count = 0, dot = false, animations }: { count?: number; dot?: boolean; animations: boolean }) {
  const { night } = useStore();
  const c = colorsFor(night);
  const scale = useSharedValue(animations ? 0 : 1);
  useEffect(() => {
    if (animations) scale.set(withSpring(1, motion.spring.bounce));
    // Once, when it appears; a new number is not a new badge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View pointerEvents="none" style={[dot ? styles.dot : styles.badge, { backgroundColor: dot ? newsDotColor(night) : c.badge, borderColor: c.sheet }, style]}>
      {!dot && (
        <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.badgeText} color="#FFFFFF">{count > 9 ? '9+' : String(count)}</Txt>
      )}
    </Animated.View>
  );
}

/**
 * The calm dot on the glyph's circle (спец-друзья 10): pops in with a bounce and one ring wave
 * (×2.2, 900 ms), goes in 160 ms. Mounted for good, so going out can be animated.
 */
function CircleDot({ on, animations }: { on: boolean; animations: boolean }) {
  const { night } = useStore();
  const c = colorsFor(night);
  const scale = useSharedValue(on && !animations ? 1 : 0);
  const wave = useSharedValue(0);
  useEffect(() => {
    if (!on) {
      scale.set(animations ? withTiming(0, { duration: motion.fast, easing: motion.ease.out }) : 0);
      return;
    }
    if (!animations) {
      scale.set(1);
      return;
    }
    scale.set(withSpring(1, motion.spring.bounce));
    wave.set(0);
    wave.set(withDelay(80, withTiming(1, { duration: 900, easing: motion.ease.out })));
  }, [on, animations, scale, wave]);
  const dotStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const waveStyle = useAnimatedStyle(() => {
    const p = wave.get();
    return { opacity: p <= 0 || p >= 1 ? 0 : 0.5 * (1 - p), transform: [{ scale: 1 + 1.2 * p }] };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.circleDot, { backgroundColor: newsDotColor(night) }, waveStyle]} />
      <Animated.View pointerEvents="none" style={[styles.circleDot, { backgroundColor: newsDotColor(night), borderColor: c.card, borderWidth: 2.5 }, dotStyle]} />
    </>
  );
}

/** One of 8 sparkles flying 36 px out of the card's middle. */
function Spark({ i, t }: { i: number; t: ReturnType<typeof useSharedValue<number>> }) {
  const a = (i / SPARKS) * 2 * Math.PI + 0.3;
  const style = useAnimatedStyle(() => {
    const p = t.get();
    return {
      opacity: p <= 0 || p >= 1 ? 0 : 1 - p,
      transform: [{ translateX: Math.cos(a) * 36 * p }, { translateY: Math.sin(a) * 36 * p }, { rotate: '45deg' }, { scale: 1 - 0.4 * p }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.spark, { backgroundColor: i % 2 ? RING : '#FFF6C2' }, style]} />;
}

const styles = StyleSheet.create({
  menu: { paddingHorizontal: 16, paddingBottom: 16 },
  divider: { height: 1, marginBottom: 16 },
  row: { flexDirection: 'row', gap: 10 },
  gap: { marginTop: 10 },
  cardWrap: { flex: 1 },
  ring: {
    position: 'absolute',
    left: -3,
    right: -3,
    top: -3,
    bottom: -3,
    borderRadius: radius.lg + 3,
    borderWidth: 3,
    borderColor: RING,
    boxShadow: '0 0 20px 4px rgba(255,207,77,0.75)',
  },
  lip: { position: 'absolute', left: 0, right: 0, top: 3, bottom: 0, borderRadius: radius.lg },
  face: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 3, borderRadius: radius.lg, overflow: 'hidden' },
  press: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  widePress: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 10, gap: 10 },
  widePressSmall: { paddingLeft: 10, paddingRight: 6, gap: 8 },
  narrowPress: { flex: 1, alignItems: 'center', paddingTop: 9, paddingHorizontal: 4 },
  circle: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, lineHeight: 17, textAlign: 'center', marginTop: 4 },
  cardCaption: { fontSize: 11.5, lineHeight: 13, fontFamily: fonts.regular, textAlign: 'center' },
  wideText: { flex: 1, minWidth: 0 },
  wideTitle: { fontSize: 15, lineHeight: 19 },
  wideCaption: { fontSize: 12, lineHeight: 15, fontFamily: fonts.regular },
  wideCaptionSmall: { lineHeight: 14 },
  narrowTitle: { fontSize: 13, lineHeight: 16, marginTop: 4, textAlign: 'center' },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    height: 22,
    minWidth: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.black, fontSize: 12, lineHeight: 15 },
  dot: { position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  circleDot: { position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: 7 },
  plus: { position: 'absolute', top: -8, right: -6, borderRadius: 11, paddingHorizontal: 8, paddingVertical: 1, borderWidth: 2, borderColor: '#FFFFFF' },
  plusText: { fontFamily: fonts.black, fontSize: 13 },
  spark: { position: 'absolute', left: '50%', top: '50%', width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5, borderRadius: 1.5 },
});
