// The @nick field of "Create an account" with the check on the fly (wave 5 spec 3.4, frames
// 02–03): what is typed is cleaned at once (typeNick), broken rules are told without the server,
// a good nick is asked about 400 ms after the last letter. Free — a green check pops in; taken —
// a red cross and three free ones to tap; no network — asked again every 5 s.
import { ReactNode, Ref, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { atNick, typeNick } from '@/game/nick';
import type { api } from '@/net/api';
import { useStore } from '@/state/store';
import { Chip, Glyph, Icon, motion, useColors, useMotionOn } from '@/ui/ds';
import { Field, FieldHandle } from './Field';
import { localCheck, NickCheck, nickLine, serverCheck } from './model';

const ASK_AFTER = 400;
const RETRY_OFFLINE = 5000;
const SPIN = 800;

/** The state of a nick as typed: asks the server when the rules are fine, remembers answers. */
export function useNickCheck(nick: string, ask: typeof api.nick) {
  const [check, setCheck] = useState<NickCheck>(() => localCheck(nick));
  const known = useRef(new Map<string, NickCheck>());
  useEffect(() => {
    const local = localCheck(nick);
    const cached = known.current.get(nick);
    if (local.kind !== 'checking' || cached) {
      setCheck(cached ?? local);
      return;
    }
    setCheck(local);
    let alive = true;
    let timer = setTimeout(function go() {
      ask(nick)
        .then((answer) => {
          if (!alive) return;
          const next = serverCheck(answer);
          known.current.set(nick, next);
          setCheck(next);
        })
        .catch(() => {
          if (!alive) return;
          setCheck({ kind: 'offline' });
          timer = setTimeout(go, RETRY_OFFLINE);
        });
    }, ASK_AFTER);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [nick, ask]);
  /** The server said "taken" when creating (someone was a second faster). */
  const markTaken = useCallback(
    (suggestions: string[]) => {
      const next: NickCheck = { kind: 'taken', suggestions };
      known.current.set(nick, next);
      setCheck(next);
    },
    [nick],
  );
  return { check, markTaken };
}

export function NickField({ nick, onChange, check, autoFocus, onSubmitEditing, ref }: {
  nick: string;
  onChange(nick: string): void;
  check: NickCheck;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  ref?: Ref<FieldHandle>;
}) {
  const c = useColors();
  const { t } = useStore();
  const color =
    check.kind === 'free' ? c.doneInk : check.kind === 'taken' || check.kind === 'bad' ? c.dangerText : c.textSoft;
  return (
    <Field
      ref={ref}
      label={t('accNickLabel')}
      top={18}
      prefix="@"
      value={nick}
      onChangeText={(v) => onChange(typeNick(v))}
      autoFocus={autoFocus}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="username-new"
      textContentType="username"
      keyboardType={Platform.OS === 'android' ? 'visible-password' : 'ascii-capable'}
      returnKeyType="next"
      onSubmitEditing={onSubmitEditing}
      accessibilityLabel={t('accNickA11y')}
      testID="nick"
      error={check.kind === 'taken' || check.kind === 'bad'}
      right={<NickBadge check={check} />}
      help={nickLine(t, nick, check)}
      helpColor={color}
      below={
        check.kind === 'taken' && check.suggestions.length > 0 ? (
          <View style={styles.chips}>
            {check.suggestions.map((s) => (
              <Chip key={s} label={atNick(s)} onPress={() => onChange(s)} />
            ))}
          </View>
        ) : null
      }
    />
  );
}

function NickBadge({ check }: { check: NickCheck }) {
  const c = useColors();
  switch (check.kind) {
    case 'checking': return <Spinner />;
    case 'free': return <Pop><Glyph name="check" size={24} /></Pop>;
    case 'taken':
      return (
        <Pop>
          <View style={[styles.cross, { backgroundColor: c.danger }]}>
            <Icon name="close" size={14} color="#FFFFFF" strokeWidth={3} />
          </View>
        </Pop>
      );
    case 'offline': return <Icon name="wifiOff" size={20} color={c.textSoft} />;
    default: return null;
  }
}

/** Pops in with the "pop" spring; just appears when animations are off. */
function Pop({ children }: { children: ReactNode }) {
  const motionOn = useMotionOn();
  const scale = useSharedValue(motionOn ? 0.4 : 1);
  useEffect(() => {
    if (motionOn) scale.set(withSpring(1, motion.spring.pop));
  }, [motionOn, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }], opacity: Math.min(1, scale.get() * 1.5) }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** A ring of 22: accent over sunken, a turn in 800 ms; standing still when animations are off. */
export function Spinner({ size = 22 }: { size?: number }) {
  const c = useColors();
  const motionOn = useMotionOn();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (!motionOn) return;
    turn.set(withRepeat(withTiming(360, { duration: SPIN, easing: Easing.linear }), -1));
    return () => cancelAnimation(turn);
  }, [motionOn, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={8.5} fill="none" stroke={c.sunken} strokeWidth={3} />
        <Path d="M12 3.5 A8.5 8.5 0 0 1 20.5 12" fill="none" stroke={c.accent} strokeWidth={3} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  cross: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
