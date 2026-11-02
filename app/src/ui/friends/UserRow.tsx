// A person found by @nick (спец-друзья 5.1, frame 09) and what can be done with them:
// add (the row says "request sent" at once, before the server answers), cancel my request,
// accept theirs; friends and me are only marked. `useRelation` is shared with the invite card.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Person } from '@/game/shared';
import { ApiError, Relation } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { Button, fonts, Glyph, Txt, useColors, withAlpha } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { FriendAvatar } from './FriendAvatar';
import { displayName, nameInCase } from './model';
import { friendsToast } from './Toast';

/** The relation as the lists know it now, or as the search said; my last action wins until the lists catch up. */
export function useRelation(person: Person, said: Relation) {
  const { t } = useStore();
  const f = useFriends();
  const [mine, setMine] = useState<Relation | null>(null);
  const [busy, setBusy] = useState(false);
  const known: Relation | null = f.lists.friends.some((x) => x.nick === person.nick)
    ? 'friend'
    : f.lists.outgoing.some((x) => x.nick === person.nick)
      ? 'outgoing'
      : f.lists.incoming.some((x) => x.nick === person.nick)
        ? 'incoming'
        : null;
  const relation = mine ?? known ?? said;

  const run = async (optimistic: Relation, action: () => Promise<void>, after?: () => void) => {
    if (busy) return;
    const before = mine;
    setMine(optimistic);
    setBusy(true);
    try {
      await action();
      after?.();
    } catch (e) {
      setMine(before);
      friendsToast(e instanceof ApiError && e.code === 'too_many_friends' ? t('frTooManyRequests') : t('frSendFailed'), null);
    } finally {
      setBusy(false);
    }
  };

  return {
    relation,
    busy,
    add: () => {
      cue('tap');
      run('outgoing', () => f.requestFriend(person.nick));
    },
    cancel: () => run('none', () => f.removeFriend(person.nick), () => friendsToast(t('frRequestCanceled'))),
    accept: () =>
      run('friend', () => f.acceptFriend(person.nick), () => {
        cue('friendAdded');
        friendsToast(t('frNowFriends', { name: nameInCase(t, person) }));
      }),
  };
}

export function UserRow({ person, said, offline, onOpen }: {
  person: Person;
  said: Relation;
  offline: boolean;
  /** A tap on a friend's row (not on a button) opens their profile. */
  onOpen: (nick: string) => void;
}) {
  const { t } = useStore();
  const c = useColors();
  const { relation, add, cancel, accept } = useRelation(person, said);

  let right = null;
  switch (relation) {
    case 'none':
      right = <Button title={t('frAdd')} icon="userPlus" size="s" cue={null} disabled={offline} onPress={add} />;
      break;
    case 'incoming':
      right = <Button title={t('frAccept')} icon="check" size="s" cue={null} disabled={offline} onPress={accept} />;
      break;
    case 'outgoing':
      right = (
        <View style={styles.sent}>
          <Txt style={[styles.small, { color: c.textSoft }]}>{t('frRequestSent')}</Txt>
          <Pressable onPress={cancel} disabled={offline} accessibilityRole="button" hitSlop={8}>
            <Txt style={[styles.small, { color: offline ? c.textMuted : c.dangerText }]}>{t('frCancelLower')}</Txt>
          </Pressable>
        </View>
      );
      break;
    case 'friend':
      right = (
        <View style={styles.friends}>
          <Glyph name="check" size={18} />
          <Txt style={[styles.small, { color: c.doneInk }]}>{t('frAlreadyFriends')}</Txt>
        </View>
      );
      break;
    case 'self':
      right = <Txt style={[styles.small, { color: c.textSoft }]}>{t('frThatsYou')}</Txt>;
      break;
  }

  const name = displayName(person);
  const body = (
    <>
      <FriendAvatar person={person} size={48} />
      <View style={styles.text}>
        <Txt numberOfLines={1} style={styles.name}>{name}</Txt>
        <Txt numberOfLines={1} style={[styles.nick, { color: c.textSoft }]}>@{person.nick}</Txt>
      </View>
      {right}
    </>
  );
  if (relation !== 'friend') return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={() => onOpen(person.nick)}
      accessibilityRole="button"
      accessibilityLabel={`${name}, @${person.nick}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: withAlpha(c.sunken, 0.5) }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 72, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.black, fontSize: 16, lineHeight: 21, textAlign: 'left' },
  small: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, textAlign: 'right' },
  nick: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, textAlign: 'left' },
  sent: { alignItems: 'flex-end' },
  friends: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
