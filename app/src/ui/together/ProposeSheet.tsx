// "Suggest a shared tree" (спец-друзья 8.2, frame 25): a bottom sheet over the friend's
// profile — the two half avatars and who it is with, the habit (focused on opening), do /
// quit, the kind of tree (the free ones and those I bought), and the button. An empty habit
// shakes the field. Sent: the sheet closes and "Invitation sent" shows; the card turns to
// "waiting for the answer". Mount it to open, it calls `onClosed` when it has slid away.
// Used by SharedCard and by the friend profile's "⋯" (the friends' screens): it lives in its
// own Modal, so it covers the whole screen from wherever it is mounted (a card in a list too).
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, TextInput, TextStyle, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import type { Person } from '@/game/shared';
import { HabitKind, Skin } from '@/game/tree';
import { ApiError } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { Button, elevation, fonts, MAX_FONT_SCALE, motion, Segmented, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { KindTile } from '@/ui/shop/KindTile';
import { ModalSheet } from '@/ui/shop/ModalSheet';
import { nameIn, nameOf, ProposeError, proposeError } from './model';
import { PairAvatar } from './PairAvatar';

const COLS = 3;
const FIELD_WEB = Platform.OS === 'web' ? ({ outlineStyle: 'none', userSelect: 'text' } as unknown as TextStyle) : null;

export interface ProposeInitial {
  name: string;
  kind: HabitKind;
  skin: Skin;
}

export function ProposeSheet({ friend, initial, onClosed, onSent }: {
  friend: Person;
  /** "Plant again together": the dead tree's habit, kind and look. */
  initial?: ProposeInitial;
  onClosed(): void;
  onSent?(): void;
}) {
  const { t } = useStore();
  // Android's "back" inside a Modal comes here, not to the sheet's own listener.
  const closeRef = useRef<(() => void) | null>(null);
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={() => closeRef.current?.()}>
      {/* Gestures inside a Modal need their own root (the grabber's drag). */}
      <GestureHandlerRootView style={styles.root}>
        <ModalSheet onClosed={onClosed} label={t('tgSharedWith', { name: nameIn(friend, t.lang) })}>
          {(close) => {
            closeRef.current = close;
            return <ProposeBody friend={friend} initial={initial} close={close} onSent={onSent} />;
          }}
        </ModalSheet>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ProposeBody({ friend, initial, close, onSent }: { friend: Person; initial?: ProposeInitial; close(): void; onSent?(): void }) {
  const { t, night, skins, profile } = useStore();
  const friends = useFriends();
  const c = useColors();
  const motionOn = useMotionOn();
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<HabitKind>(initial?.kind ?? 'do');
  const [skin, setSkin] = useState<Skin>(initial && skins.includes(initial.skin) ? initial.skin : 'oak');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ProposeError | null>(null);

  // The field: a ring that only changes color, and a shake when empty.
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(false);
  const ring = useSharedValue(0);
  const shake = useSharedValue(0);
  useEffect(() => {
    ring.set(withTiming(empty ? 2 : focused ? 1 : 0, { duration: motion.fast }));
  }, [focused, empty, ring]);
  const accent = c.accent;
  const danger = c.dangerText;
  const fieldStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(ring.get(), [0, 1, 2], ['rgba(0,0,0,0)', accent, danger]),
    transform: [{ translateX: shake.get() }],
  }));
  // Focus once the sheet has come up (a field focused mid-slide jumps on the web).
  useEffect(() => {
    const id = setTimeout(() => input.current?.focus(), motionOn ? 320 : 50);
    return () => clearTimeout(id);
  }, [motionOn]);

  const complain = () => {
    cue('error');
    setEmpty(true);
    if (motionOn) {
      const step = (x: number) => withTiming(x, { duration: 50 });
      shake.set(withSequence(step(-6), step(6), step(-4), step(4), step(0)));
    }
  };
  const canSend = name.trim().length > 0 && !sending;
  const send = async () => {
    if (!name.trim()) return complain();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await friends.proposeShared({ nick: friend.nick, name: name.trim().slice(0, 40), kind, skin });
      cue('tap');
      showQuestHint(t('tgInvitationSent'));
      onSent?.();
      close();
    } catch (e) {
      cue('error');
      setError(e instanceof ApiError ? proposeError(e.code, e.status) : 'other');
      setSending(false);
    }
  };

  const errorText =
    error === 'offline' ? t('tgNeedInternet')
      : error === 'shared_exists' ? t('tgPairExists', { name: nameIn(friend, t.lang) })
        : error === 'too_many_shared' ? t('tgTooMany')
          : error === 'friend_too_many_shared' ? t('tgFriendTooMany', { name: nameIn(friend, t.lang) })
            : error ? t('tgSendFailed') : null;

  const rows: Skin[][] = [];
  for (let i = 0; i < skins.length; i += COLS) rows.push(skins.slice(i, i + COLS));

  return (
    <View style={styles.body}>
      <View style={styles.head}>
        <PairAvatar me={profile} friend={friend} size={44} />
        <Txt variant="title2" accessibilityRole="header" numberOfLines={2} style={styles.title}>
          {t('tgSharedWith', { name: nameIn(friend, t.lang) })}
        </Txt>
      </View>
      <Txt variant="small" color={c.textSoft} style={styles.lead}>{t('tgProposeText', { name: nameOf(friend) })}</Txt>

      <Label text={t('tgHabitLabel')} />
      <Animated.View style={[styles.field, elevation(1, night), { backgroundColor: c.card }, fieldStyle]}>
        <TextInput
          ref={input}
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (empty) setEmpty(false);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={t('tgPlaceholder')}
          placeholderTextColor={c.textSoft}
          maxLength={40}
          returnKeyType="done"
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.input, FIELD_WEB, { color: c.text }]}
          accessibilityLabel={t('tgHabitLabel')}
          testID="shared-habit"
        />
      </Animated.View>

      <Label text={t('tgWhatLabel')} />
      <Segmented
        value={kind}
        onChange={setKind}
        height={44}
        options={[
          { value: 'do', label: t('tgDoIt'), icon: 'checkCircle' },
          { value: 'quit', label: t('tgQuitIt'), icon: 'noSign', iconColor: c.dangerText },
        ]}
      />

      <Label text={t('tgTreeLabel')} />
      <View style={styles.skins} role="radiogroup">
        {rows.map((row, r) => (
          <View key={r} style={styles.skinRow}>
            {row.map((s) => (
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
            ))}
            {Array.from({ length: COLS - row.length }, (_, i) => <View key={`gap${i}`} style={styles.skinGap} />)}
          </View>
        ))}
      </View>

      {errorText && <Txt variant="small" color={c.dangerText} style={styles.error}>{errorText}</Txt>}
      <Button
        title={t('tgProposeTo')}
        glyph="sprout"
        disabled={!canSend}
        onDisabledPress={sending ? undefined : complain}
        onPress={send}
        cue={null}
        style={styles.send}
        testID="shared-propose"
      />
    </View>
  );
}

function Label({ text }: { text: string }) {
  const c = useColors();
  return <Txt variant="micro" color={c.textSoft} style={styles.label}>{text}</Txt>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1 },
  lead: { marginTop: 8 },
  label: { marginTop: 18, marginBottom: 8, marginLeft: 4, fontSize: 12, lineHeight: 16 },
  field: { height: 56, borderRadius: 16, borderWidth: 2, justifyContent: 'center' },
  input: { fontFamily: fonts.bold, fontSize: 17, paddingHorizontal: 14, height: '100%' },
  skins: { gap: 10 },
  skinRow: { flexDirection: 'row', gap: 10 },
  skinGap: { flex: 1 },
  error: { marginTop: 14, textAlign: 'center' },
  send: { marginTop: 18 },
});
