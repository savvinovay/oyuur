// Someone who is not a friend (yet): the invite link's first screen ("Sasha invites you…") and
// the profile of a non-friend, whose trees are not shown. Avatar, name, @nick and what can be
// done: add, accept, cancel my request; already friends — "Go to friends".
import { StyleSheet, View } from 'react-native';
import type { Person } from '@/game/shared';
import type { Relation } from '@/net/api';
import { useStore } from '@/state/store';
import { Button, fonts, Glyph, Txt, useColors } from '@/ui/ds';
import { FriendAvatar } from './FriendAvatar';
import { displayName } from './model';
import { useRelation } from './UserRow';

export function PersonCard({ person, said, invited, offline, onFriends }: {
  person: Person;
  said: Relation;
  /** Came by their invite link: the lead says they invite me. */
  invited: boolean;
  offline: boolean;
  onFriends: () => void;
}) {
  const { t } = useStore();
  const c = useColors();
  const { relation, busy, add, accept, cancel } = useRelation(person, said);
  const name = displayName(person);
  return (
    <View style={styles.root}>
      <FriendAvatar person={person} size={88} pageRing={4} />
      <Txt variant="title2" style={[styles.center, styles.name]}>{name}</Txt>
      <Txt variant="small" color={c.textSoft} style={styles.center}>@{person.nick}</Txt>
      {invited && relation !== 'self' && (
        <View style={styles.lead}>
          <Glyph name="invite" size={28} />
          <Txt style={[styles.leadText, { color: c.textSoft }]}>{t('frInvitesYou', { name })}</Txt>
        </View>
      )}
      <View style={styles.actions}>
        {relation === 'none' && <Button title={t('frAdd')} icon="userPlus" cue={null} disabled={offline || busy} onPress={add} />}
        {relation === 'incoming' && <Button title={t('frAccept')} icon="check" cue={null} disabled={offline || busy} onPress={accept} />}
        {relation === 'outgoing' && (
          <>
            <Button title={t('frRequestSent')} variant="done" glyph="check" cue={null} onPress={() => {}} />
            <Button title={t('frCancel')} variant="text" size="m" cue={null} disabled={offline || busy} onPress={cancel} />
          </>
        )}
        {(relation === 'friend' || relation === 'self') && (
          <Button title={t('frToFriends')} variant="secondary" size="m" glyph="friends" onPress={onFriends} />
        )}
        {relation === 'none' && !invited && <Txt variant="small" color={c.textSoft} style={styles.center}>{t('frNotFriendYet')}</Txt>}
      </View>
      {offline && <Txt variant="small" color={c.textSoft} style={[styles.center, styles.offline]}>{t('frNeedInternet')}</Txt>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 56 },
  center: { textAlign: 'center' },
  name: { marginTop: 16 },
  lead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20, paddingHorizontal: 8 },
  leadText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, flexShrink: 1 },
  actions: { alignSelf: 'stretch', gap: 12, marginTop: 28 },
  offline: { marginTop: 12 },
});
