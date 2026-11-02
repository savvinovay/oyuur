// A labeled text field of the account screens (wave 5 spec 3.3, 3.6; frames 02–04): a caption
// in capitals, a white 56 field with a 2 px ring (focus — accent, error — red), an optional
// "@" before the text, something on the right (a state badge, the eye of a password) and a
// line under it. `shake()` shakes it (300 ms) when a tap hits a button that isn't ready.
import { ComponentRef, ReactNode, Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, TextInputProps, TextStyle, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useStore } from '@/state/store';
import { elevation, fonts, Icon, MAX_FONT_SCALE, motion, Txt, useColors, useMotionOn } from '@/ui/ds';

// The browser's focus outline would cover the field's own ring; the app turns text selection
// off (_layout.tsx) and a text field needs it back (as in new.tsx).
const FIELD_WEB = Platform.OS === 'web' ? ({ outlineStyle: 'none', userSelect: 'text' } as unknown as TextStyle) : null;

export interface FieldHandle {
  shake(): void;
  focus(): void;
}

export interface FieldProps extends Omit<TextInputProps, 'style' | 'secureTextEntry'> {
  label: string;
  /** After the capitals of the label, as written: the @nick of "PASSWORD FOR @sasha_t" (spec 8.6). */
  labelTail?: string;
  /** Room above the caption (18 under the avatar, 16 between fields). */
  top?: number;
  /** Shown before the text: "@". */
  prefix?: string;
  /** A badge on the right (the nick's state). */
  right?: ReactNode;
  /** A password: dots, and the eye on the right shows / hides them. */
  secret?: boolean;
  /** The line under the field. */
  help?: string;
  helpColor?: string;
  /** An "i" before the help line (errors of sign-in). */
  helpIcon?: boolean;
  error?: boolean;
  /** Letter spacing 1.6 (the recovery code in groups, spec 8.4). */
  spaced?: boolean;
  /** Pills or anything else right under the help line. */
  below?: ReactNode;
  /**
   * On a sheet: at night the field sinks under it (the page's color, a 1.5 edge) instead of rising
   * as a lighter card — so the sheet, its cards and the field read as three layers.
   */
  sunken?: boolean;
  ref?: Ref<FieldHandle>;
}

export function Field({ label, labelTail, top = 16, prefix, right, secret = false, help, helpColor, helpIcon, error = false, spaced = false, below, sunken = false, ref, ...input }: FieldProps) {
  const c = useColors();
  const { night, t } = useStore();
  const motionOn = useMotionOn();
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);

  // The ring is always 2 px, only its color changes, so nothing moves.
  const ring = useSharedValue(0);
  const shakeX = useSharedValue(0);
  useEffect(() => {
    ring.set(withTiming(error ? 2 : focused ? 1 : 0, { duration: motion.fast }));
  }, [focused, error, ring]);
  const accent = c.accent;
  const danger = c.dangerText;
  const deep = sunken && night;
  const idle = deep ? c.divider : 'rgba(0,0,0,0)';
  const fieldStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(ring.get(), [0, 1, 2], [idle, accent, danger]),
    transform: [{ translateX: shakeX.get() }],
  }));

  useImperativeHandle(ref, () => ({
    shake: () => {
      if (!motionOn) return;
      const step = (x: number) => withTiming(x, { duration: 60 });
      shakeX.set(withSequence(step(-6), step(6), step(-4), step(4), step(0)));
    },
    focus: () => inputRef.current?.focus(),
  }));

  return (
    <View>
      <Txt variant="caption" color={c.textSoft} style={[styles.label, { marginTop: top }]} accessibilityRole="header">
        {label}
        {labelTail ? <Txt variant="caption" color={c.textSoft} style={styles.tail}>{` ${labelTail}`}</Txt> : null}
      </Txt>
      <Animated.View style={[styles.field, deep ? styles.deep : elevation(1, night), { backgroundColor: deep ? c.page : c.card }, fieldStyle]}>
        {prefix ? (
          <Txt style={[styles.text, { color: c.textSoft }]} maxFontSizeMultiplier={MAX_FONT_SCALE} onPress={() => inputRef.current?.focus()}>
            {prefix}
          </Txt>
        ) : null}
        <TextInput
          ref={inputRef}
          {...input}
          secureTextEntry={secret && !shown}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          placeholderTextColor={c.textMuted}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.text, styles.input, FIELD_WEB, spaced && styles.spaced, { color: c.text }]}
        />
        {right ? <View style={styles.right}>{right}</View> : null}
        {secret ? (
          <Pressable
            onPress={() => setShown((s) => !s)}
            accessibilityRole="button"
            accessibilityLabel={shown ? t('accHidePassword') : t('accShowPassword')}
            hitSlop={6}
            style={styles.eye}
          >
            <Icon name={shown ? 'eyeOff' : 'eye'} size={22} color={c.textSoft} />
          </Pressable>
        ) : null}
      </Animated.View>
      {help ? (
        <View style={styles.help}>
          {helpIcon ? <Icon name="info" size={16} color={helpColor ?? c.textSoft} /> : null}
          <Txt style={[styles.helpText, { color: helpColor ?? c.textSoft }]} accessibilityLiveRegion="polite">{help}</Txt>
        </View>
      ) : null}
      {below}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.black, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, marginLeft: 4 },
  tail: { fontFamily: fonts.black, textTransform: 'none', letterSpacing: 0 },
  field: { height: 56, borderRadius: 16, borderWidth: 2, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 8, gap: 6 },
  deep: { borderWidth: 1.5 },
  text: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  input: { flex: 1, height: '100%', paddingVertical: 0, minWidth: 0 },
  spaced: { letterSpacing: 1.6 },
  right: { width: 32, alignItems: 'center', justifyContent: 'center' },
  eye: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  help: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 8, marginHorizontal: 4 },
  helpText: { flex: 1, fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
});
