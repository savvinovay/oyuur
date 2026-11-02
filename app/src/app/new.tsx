// Plant a new tree (spec 4.11, frame 19): what you do, the habit's name, the kind of
// tree and who sees it. The "Plant" button sticks to the bottom; without a name it
// is unavailable, and tapping it shakes the empty field.
// Wave 5 (spec 8.2): the kinds are a grid of three, only the owned ones, and a tile that
// leads to the shop for more; `?skin=` chooses a kind on opening (back from a purchase).
// OYUUR-34 (design/oyuur-33/спец.md 2, frames 01–03): the last row "Water: in the evening,
// from 18:00 ›" opens the watering-time sheet; "Quit ↔ Do" moves the hour to the new kind's
// default until the user picks one (like "Who sees it").
import { router, useLocalSearchParams } from 'expo-router';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, TextStyle, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { defaultOpenHour, HabitKind, OpenHour, Skin, Visibility } from '@/game/tree';
import { useStore } from '@/state/store';
import { Button, Chip, elevation, fonts, Glyph, Icon, MAX_FONT_SCALE, motion, Page, Segmented, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { KindTile } from '@/ui/shop/KindTile';
import { openShop } from '@/ui/shop/links';
import { parseSkin } from '@/ui/shop/model';
import { hourLook, HourIcon } from '@/ui/watering/art';
import { openHourLabel } from '@/ui/watering/format';
import { WateringTimeSheet } from '@/ui/watering/TimeSheet';

// Over the sticky button the page fades in over 24 px, then is solid down to the screen's edge.
const FADE = 24;
// The browser's focus outline would cover the field's own ring; RN's types have no 'none' for it.
// The app turns text selection off (_layout.tsx); a text field needs it back.
const FIELD_WEB = Platform.OS === 'web' ? ({ outlineStyle: 'none', userSelect: 'text' } as unknown as TextStyle) : null;

export default function NewHabit() {
  const { night, t, plant, skins } = useStore();
  const params = useLocalSearchParams<{ skin?: string }>();
  const c = useColors();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<HabitKind>('quit');
  // Quitting habits are often private; positive ones are fun to share.
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [visibilityTouched, setVisibilityTouched] = useState(false);
  const [openHour, setOpenHour] = useState<OpenHour>(defaultOpenHour('quit'));
  const [hourTouched, setHourTouched] = useState(false);
  const [hourSheet, setHourSheet] = useState(false);
  const [skin, setSkin] = useState<Skin>(() => parseSkin(params.skin, skins) ?? 'oak');
  // Back here from the shop with a kind just bought.
  useEffect(() => {
    const asked = parseSkin(params.skin, skins);
    if (asked) setSkin(asked);
  }, [params.skin, skins]);

  const chooseKind = (k: HabitKind) => {
    setKind(k);
    if (!visibilityTouched) setVisibility(k === 'quit' ? 'private' : 'friends');
    if (!hourTouched) setOpenHour(defaultOpenHour(k));
  };

  // The field: focus ring (always 2 px, only its color changes, so nothing moves) and a shake on error.
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState(false);
  const ring = useSharedValue(0);
  const shake = useSharedValue(0);
  useEffect(() => {
    ring.set(withTiming(error ? 2 : focused ? 1 : 0, { duration: motion.fast }));
  }, [focused, error, ring]);
  const accent = c.accent;
  const danger = c.dangerText;
  const fieldStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(ring.get(), [0, 1, 2], ['rgba(0,0,0,0)', accent, danger]),
    transform: [{ translateX: shake.get() }],
  }));

  // Guards against a double tap planting two trees while the screen closes.
  const planted = useRef(false);
  const canPlant = name.trim().length > 0;
  const onPlant = () => {
    if (!canPlant) return complain();
    if (planted.current) return;
    planted.current = true;
    const id = plant({ name: name.trim().slice(0, 40), kind, visibility, skin, openHour });
    cue('plant');
    router.dismissTo({ pathname: '/', params: { tree: id } });
  };
  const complain = () => {
    cue('error');
    setError(true);
    if (motionOn) {
      const step = (x: number) => withTiming(x, { duration: 50 });
      shake.set(withSequence(step(-6), step(6), step(-4), step(4), step(0)));
    }
  };

  const ideas = kind === 'quit' ? t.dict.suggestQuit : t.dict.suggestDo;
  const bottom = insets.bottom + 12;

  return (
    <Page title={t('newHabit')}>
      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 140 + insets.bottom }]} keyboardShouldPersistTaps="handled">
          <Section title={t('whatWeDo')}>
            <Segmented
              value={kind}
              onChange={chooseKind}
              options={[
                { value: 'quit', label: t('kindQuit'), icon: 'noSign', iconColor: c.dangerText },
                { value: 'do', label: t('kindDo'), icon: 'checkCircle' },
              ]}
            />
            <Txt variant="small" color={c.textSoft}>{kind === 'quit' ? t('kindQuitHint') : t('kindDoHint')}</Txt>
          </Section>

          <Section title={t('habitName')}>
            <Animated.View style={[styles.field, elevation(1, night), { backgroundColor: c.card }, fieldStyle]}>
              <TextInput
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  if (error) setError(false);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder={t('habitPlaceholder')}
                placeholderTextColor={c.textSoft}
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={onPlant}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={[styles.input, FIELD_WEB, { color: c.text }]}
                accessibilityLabel={t('habitName')}
                testID="habit-name"
              />
            </Animated.View>
            <View style={styles.ideas}>
              {ideas.map((idea) => (
                <Chip
                  key={idea}
                  label={idea}
                  onPress={() => {
                    setName(idea);
                    setError(false);
                  }}
                />
              ))}
            </View>
          </Section>

          <Section title={t('treeKind')}>
            <View style={styles.skins} role="radiogroup">
              {rowsOf([...skins, null]).map((row, r) => (
                <View key={r} style={styles.skinRow}>
                  {row.map((s) =>
                    s ? (
                      <KindTile
                        key={s}
                        skin={s}
                        days={60}
                        seed={s}
                        selected={s === skin}
                        price={0}
                        sky={86}
                        big
                        onPress={() => {
                          if (s !== skin) cue('select');
                          setSkin(s);
                        }}
                      />
                    ) : (
                      <MoreKinds key="more" />
                    ),
                  )}
                  {/* The last row keeps the tiles' width. */}
                  {Array.from({ length: KIND_COLS - row.length }, (_, i) => <View key={`gap${i}`} style={styles.skinGap} />)}
                </View>
              ))}
            </View>
          </Section>

          <Section title={t('visibility')}>
            <Segmented
              value={visibility}
              onChange={(v) => {
                setVisibility(v);
                setVisibilityTouched(true);
              }}
              options={[
                { value: 'private', label: t('visibilityPrivate'), icon: 'lock' },
                { value: 'friends', label: t('visibilityFriends'), icon: 'people' },
              ]}
            />
            <Txt variant="small" color={c.textSoft}>{t('visibilityHint')}</Txt>
          </Section>

          <View>
            <WateringRow hour={openHour} focused={hourSheet} onPress={() => setHourSheet(true)} />
            <Txt variant="small" color={c.textSoft} style={styles.hourNote}>{t('wtPlantNote')}</Txt>
          </View>
        </ScrollView>

        {/* The button sticks to the bottom; the page fades in above it so text never ends under it abruptly. */}
        <View style={styles.footer} pointerEvents="box-none">
          <Svg width="100%" height={FADE} style={styles.fade} pointerEvents="none">
            <Defs>
              <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.page} stopOpacity={0} />
                <Stop offset="1" stopColor={c.page} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height={FADE} fill="url(#fade)" />
          </Svg>
          {/* Solid under the button too: nothing scrolls through below it. */}
          <View style={[styles.footerBody, { backgroundColor: c.page, paddingBottom: bottom }]}>
            <Button title={t('plant')} glyph="seed" disabled={!canPlant} onDisabledPress={complain} onPress={onPlant} cue={null} />
          </View>
        </View>
      </View>
      <WateringTimeSheet
        visible={hourSheet}
        mode="plant"
        kind={kind}
        hour={openHour}
        onPick={(h) => {
          setOpenHour(h);
          setHourTouched(true);
        }}
        onClose={() => setHourSheet(false)}
      />
    </Page>
  );
}

/** "Water: in the evening, from 18:00 ›" — a card row on the whole width (frame 01). */
function WateringRow({ hour, focused, onPress }: { hour: OpenHour; focused: boolean; onPress(): void }) {
  const { t, night } = useStore();
  const c = useColors();
  const look = hourLook(hour);
  const label = openHourLabel(hour, t);
  return (
    <Pressable
      onPress={() => {
        cue('select');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${t('wtRowLead')} ${label}`}
      testID="watering-row"
      style={({ pressed }) => [
        styles.hourRow,
        elevation(1, night),
        { backgroundColor: c.card, borderColor: focused ? c.accent : 'transparent' },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={[styles.hourSquare, { backgroundColor: look.tint }]}>
        <HourIcon name={look.icon} size={18} color="#FFFFFF" strokeWidth={2.4} />
      </View>
      {/* Never cut: a long line (English, 320 px) takes a second line; the hour keeps together (no-break spaces). */}
      <Txt numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.hourText, { color: c.text }]}>
        <Txt style={[styles.hourLead, { color: c.textSoft }]}>{t('wtRowLead')} </Txt>
        {label}
      </Txt>
      <Icon name="chevronRight" size={18} color={c.textSoft} />
    </Pressable>
  );
}

const KIND_COLS = 3;
const rowsOf = <T,>(list: T[]): T[][] => {
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += KIND_COLS) rows.push(list.slice(i, i + KIND_COLS));
  return rows;
};

/** The last tile: more kinds are in the shop. */
function MoreKinds() {
  const { t, night } = useStore();
  const c = useColors();
  return (
    <Pressable
      onPress={() => {
        cue('tap');
        openShop();
      }}
      accessibilityRole="link"
      accessibilityLabel={t('shopMoreKinds')}
      style={({ pressed }) => [styles.more, elevation(1, night), { backgroundColor: c.card }, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.moreCircle, { backgroundColor: c.tintShop }]}>
        <Glyph name="shop" size={32} />
      </View>
      <Txt variant="caption" numberOfLines={2} style={styles.moreText}>{t('shopMoreKinds')}</Txt>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt variant="title3" accessibilityRole="header">{title}</Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 16, gap: 20 },
  section: { gap: 10 },
  field: { height: 56, borderRadius: 16, borderWidth: 2, justifyContent: 'center' },
  input: { fontFamily: fonts.bold, fontSize: 17, paddingHorizontal: 14, height: '100%' },
  ideas: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skins: { gap: 10 },
  skinRow: { flexDirection: 'row', gap: 10 },
  skinGap: { flex: 1 },
  more: { flex: 1, borderRadius: 20, borderWidth: 3, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8, minHeight: 86 + 7 + 32 },
  moreCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  moreText: { textAlign: 'center' },
  hourRow: { minHeight: 52, paddingVertical: 6, borderRadius: 14, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 10, paddingRight: 8 },
  hourSquare: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  hourText: { flex: 1, fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  hourLead: { fontFamily: fonts.regular },
  hourNote: { marginTop: 6, paddingHorizontal: 4 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  fade: { position: 'absolute', top: -FADE, left: 0 },
  footerBody: { paddingHorizontal: 16 },
});
