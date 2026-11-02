// "Edit" (wave 5 spec, 11.5, frame 26): the preview avatar changes at once, the name field
// (the tree name's rules, nameText.ts; empty — "You"), 12 avatars and 8 circle colors, and
// "Save" stuck to the bottom (unavailable without changes). Closing with changes asks
// "Discard changes?".
import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, TextInput, TextStyle, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { cleanTyping, finalName, NAME_MAX } from '@/game/nameText';
import { AVATAR_COLORS, AVATARS, AvatarId, Profile } from '@/game/profile';
import { useStore } from '@/state/store';
import { Avatar } from '@/ui/avatars/Avatar';
import { avatarColor } from '@/ui/avatars/colors';
import { Button, confirmDialog, elevation, fonts, Glyph, MAX_FONT_SCALE, motion, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { ProfileSheet } from './ProfileSheet';

// The browser's focus outline would cover the field's own ring; the app turns text selection off (_layout.tsx).
const FIELD_WEB = Platform.OS === 'web' ? ({ outlineStyle: 'none', userSelect: 'text' } as unknown as TextStyle) : null;
/** The field's red ring after a character that isn't allowed, ms. */
const BAD_RING = 600;
const PREVIEW = 88;
const CHOICE = 64;
const COLOR = 36;
/** Under this screen height (a 320×568 phone) the preview and the avatars are smaller, so less scrolls. */
const SHORT = 640;
const PREVIEW_SHORT = 64;
const CHOICE_SHORT = 54;

export function EditSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const { profile } = useStore();
  // A fresh form every time the sheet opens (counted while rendering, so the old form never flashes).
  const session = useRef({ open: false, key: 0 });
  if (open && !session.current.open) session.current.key += 1;
  session.current.open = open;
  return <Form key={session.current.key} open={open} onClose={onClose} start={profile} />;
}

function Form({ open, onClose, start }: { open: boolean; onClose(): void; start: Profile }) {
  const { t, night, updateProfile } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const short = useWindowDimensions().height < SHORT;
  const [value, setValue] = useState(start.name ?? '');
  const [avatar, setAvatar] = useState<AvatarId>(start.avatar);
  const [color, setColor] = useState(start.color);
  const [focused, setFocused] = useState(false);
  const [bad, setBad] = useState(false);
  const badTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(badTimer.current), []);

  const name = finalName(value);
  const dirty = name !== start.name || avatar !== start.avatar || color !== start.color;
  const asking = useRef(false);

  const requestClose = async () => {
    if (!dirty) return onClose();
    if (asking.current) return;
    asking.current = true;
    const discard = await confirmDialog({
      title: t('meDiscardTitle'),
      message: t('meDiscardText'),
      confirmLabel: t('meDiscard'),
      cancelLabel: t('cancel'),
      tone: 'danger',
    });
    asking.current = false;
    if (discard) {
      cue('select');
      onClose();
    }
  };
  const save = () => {
    if (!dirty) return;
    updateProfile({ name, avatar, color });
    onClose();
  };

  const onChangeText = (raw: string) => {
    const r = cleanTyping(raw);
    if (r.dropped) {
      cue('error');
      setBad(true);
      clearTimeout(badTimer.current);
      badTimer.current = setTimeout(() => setBad(false), BAD_RING);
    }
    setValue(r.value);
  };

  // The preview pops in a little every time the avatar or its color changes.
  const pop = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const popPreview = () => {
    if (!motionOn) return;
    pop.set(0.85);
    pop.set(withSpring(1, motion.spring.pop));
  };
  const pickAvatar = (id: AvatarId) => {
    cue('select');
    setAvatar(id);
    popPreview();
  };
  const pickColor = (i: number) => {
    cue('select');
    setColor(i);
    popPreview();
  };

  // Room for the rows: 4 avatars and 8 colors fill the width (320 phones get smaller colors).
  const [rowW, setRowW] = useState(0);
  const onRow = (e: LayoutChangeEvent) => setRowW(Math.floor(e.nativeEvent.layout.width));
  const most = short ? CHOICE_SHORT : CHOICE;
  const choice = rowW > 0 ? Math.min(most, Math.floor(rowW / 4) - 14) : most;
  const dot = rowW > 0 ? Math.min(COLOR, Math.floor((rowW - 7 * 6) / 8)) : COLOR;
  const count = Array.from(value).length;

  return (
    // As tall as the form, not up to the page bar: a tall phone kept a blank gap above "Save".
    <ProfileSheet
      open={open}
      onRequestClose={requestClose}
      footer={<Button title={t('meSave')} size="l" disabled={!dirty} onPress={save} cue="tap" />}
    >
      <View style={styles.body}>
        <Animated.View style={[styles.preview, popStyle]}>
          <Avatar id={avatar} color={color} size={short ? PREVIEW_SHORT : PREVIEW} ring />
        </Animated.View>

        <View style={[styles.field, elevation(1, night), { backgroundColor: c.card, borderColor: bad ? c.dangerText : focused ? c.accent : 'transparent' }]}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={t('meYou')}
            placeholderTextColor={c.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            returnKeyType="done"
            keyboardAppearance={night ? 'dark' : 'light'}
            selectionColor={c.accent}
            cursorColor={c.accent}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={[styles.input, FIELD_WEB, { color: c.text }]}
            accessibilityLabel={t('meNameField')}
            testID="profile-name-field"
          />
          <Txt variant="caption" color={count >= NAME_MAX ? c.dangerText : c.textSoft} style={styles.count}>
            {t('nameCount', { n: count })}
          </Txt>
        </View>
        {bad ? (
          <Txt variant="caption" color={c.textSoft} style={styles.badLine} accessibilityLiveRegion="polite">{t('nameBadChar')}</Txt>
        ) : null}

        <Txt variant="caption" color={c.textSoft} style={styles.label} accessibilityRole="header">{t('meAvatar')}</Txt>
        <View style={styles.grid} onLayout={onRow}>
          {AVATARS.map((id) => (
            <AvatarChoice key={id} id={id} color={color} size={choice} selected={id === avatar} onPress={() => pickAvatar(id)} />
          ))}
        </View>

        <Txt variant="caption" color={c.textSoft} style={styles.label} accessibilityRole="header">{t('meCircleColor')}</Txt>
        <View style={styles.colors}>
          {Array.from({ length: AVATAR_COLORS }, (_, i) => {
            const on = i === color;
            return (
              <Pressable
                key={i}
                onPress={() => pickColor(i)}
                hitSlop={4}
                accessibilityRole="radio"
                accessibilityLabel={t.dict.meColorNames[i]}
                accessibilityState={{ selected: on }}
                aria-checked={on}
                style={{ width: dot, height: dot }}
              >
                {on && <View style={[styles.colorRing, { borderColor: c.accent, borderRadius: dot / 2 + 4.5 }]} />}
                {/* A hairline edge: the light circles don't melt into the sheet. */}
                <View style={{ width: dot, height: dot, borderRadius: dot / 2, backgroundColor: avatarColor(i, night), borderWidth: 1, borderColor: c.divider }} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </ProfileSheet>
  );
}

function AvatarChoice({ id, color, size, selected, onPress }: { id: AvatarId; color: number; size: number; selected: boolean; onPress(): void }) {
  const { t } = useStore();
  const c = useColors();
  const motionOn = useMotionOn();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <View style={styles.cell}>
      <Pressable
        onPress={() => {
          if (motionOn) scale.set(withSequence(withTiming(1.1, { duration: 90 }), withSpring(1, motion.spring.bounce)));
          onPress();
        }}
        accessibilityRole="radio"
        accessibilityLabel={t.dict.meAvatarNames[id]}
        accessibilityState={{ selected }}
        aria-checked={selected}
      >
        <Animated.View style={[{ width: size, height: size }, style]}>
          {selected && <View style={[styles.choiceRing, { borderColor: c.accent, borderRadius: size / 2 + 6 }]} />}
          <Avatar id={id} color={color} size={size} />
          {selected && <Glyph name="check" size={22} style={styles.check} />}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 2 },
  preview: { alignSelf: 'center', marginTop: 4 },
  field: { height: 56, marginTop: 16, borderRadius: 16, borderWidth: 2, flexDirection: 'row', alignItems: 'center', paddingRight: 14, gap: 8 },
  input: { flex: 1, minWidth: 0, height: '100%', fontFamily: fonts.bold, fontSize: 18, paddingLeft: 14, paddingRight: 0 },
  count: { fontFamily: fonts.bold },
  badLine: { marginTop: 6, marginLeft: 6 },
  label: { fontFamily: fonts.black, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 18, marginBottom: 10, marginLeft: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  cell: { width: '25%', alignItems: 'center', paddingVertical: 6 },
  // A 3 px accent ring 3 px out from the circle, the gap in the sheet's own color.
  choiceRing: { position: 'absolute', left: -6, top: -6, right: -6, bottom: -6, borderWidth: 3 },
  check: { position: 'absolute', right: -6, top: -6 },
  colors: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingVertical: 6 },
  colorRing: { position: 'absolute', left: -4.5, top: -4.5, right: -4.5, bottom: -4.5, borderWidth: 2.5 },
});
