// The profile's head (wave 5 spec, 11.1): the avatar 96 with a white ring and a pencil
// button, the name (or a soft "You"), the @nick when there is an account (wave 5, friends),
// and "Growing since …" (not shown without trees). Any of them opens "Edit".
import { Pressable, StyleSheet, View } from 'react-native';
import { atNick } from '@/game/nick';
import type { Profile } from '@/game/profile';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { Avatar } from '@/ui/avatars/Avatar';
import { elevation, fonts, Icon, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { firstPlanted, formatDay } from './model';

const SIZE = 96;
const PENCIL = 34;

export function ProfileHead({ profile, onEdit }: { profile: Profile; onEdit(): void }) {
  const { t, trees, today, night } = useStore();
  const c = useColors();
  const since = firstPlanted(trees);
  const nick = useFriends().account?.nick ?? null;
  const edit = () => {
    cue('select');
    onEdit();
  };
  return (
    <View style={styles.head}>
      <Pressable
        onPress={edit}
        accessibilityRole="button"
        accessibilityLabel={t('meAvatarA11y', { name: t.dict.meAvatarNames[profile.avatar] })}
        hitSlop={4}
      >
        <Avatar id={profile.avatar} color={profile.color} size={SIZE} ring />
        <View style={[styles.pencil, elevation(1, night), { backgroundColor: c.card }]}>
          <Icon name="pencil" size={18} color={c.text} />
        </View>
      </Pressable>
      <Pressable onPress={edit} accessibilityRole="button" accessibilityHint={t('meEditA11y')} style={styles.nameBox}>
        <Txt variant="title1" numberOfLines={1} ellipsizeMode="tail" color={profile.name ? c.text : c.textSoft} style={styles.name}>
          {profile.name ?? t('meYou')}
        </Txt>
      </Pressable>
      {nick !== null && (
        <Txt variant="small" color={c.textSoft} numberOfLines={1} style={styles.handle}>{atNick(nick)}</Txt>
      )}
      {since !== null && (
        <Txt variant="small" color={c.textSoft} numberOfLines={1} style={styles.since}>
          {t('meGrowingSince', { date: formatDay(t, since, today) })}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingTop: 20, paddingHorizontal: 20 },
  pencil: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    width: PENCIL,
    height: PENCIL,
    borderRadius: PENCIL / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameBox: { marginTop: 12, maxWidth: '100%' },
  name: { textAlign: 'center' },
  handle: { fontFamily: fonts.bold, marginTop: 0 },
  since: { fontFamily: fonts.bold, marginTop: 2 },
});
