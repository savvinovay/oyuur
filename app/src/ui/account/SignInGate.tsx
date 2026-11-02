// "Sign in to add friends" (spec 3.2, frame 01): what "Friends" and "Leaders" show without an
// account, under their own page bar. Three avatars (mine in the middle, bigger), why an account,
// "Create account", "Already have an account? Sign in". The account screens come back here when
// done (from Friends — on to "Find a friend"; from an invite link — back to its "Add …"), so
// where it stands is read from the path.
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { typeNick } from '@/game/nick';
import type { AvatarId } from '@/game/profile';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { Avatar } from '@/ui/avatars/Avatar';
import { Button, elevation, fonts, Txt, useColors } from '@/ui/ds';
import { AccountFrom } from './model';
import { href, LinkLine } from './parts';

/** The two friends by my sides: a fox and an owl, unless one of them is me. */
const SIDES: AvatarId[] = ['fox', 'owl', 'bear'];

export function SignInGate() {
  const c = useColors();
  const { t, profile, night } = useStore();
  const path = usePathname();
  const invite = path.startsWith('/i/') ? typeNick(path.slice(3)) : '';
  const from: AccountFrom = path.startsWith('/leaders') ? 'leaders' : invite ? `i/${invite}` : 'friends';
  // This is the account offer too: the first-start one (AccountPrompt) doesn't come after it.
  const { promptSeen, markPromptSeen } = useFriends();
  useEffect(() => {
    if (!promptSeen) markPromptSeen();
    // markPromptSeen is a new function every render of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptSeen]);
  const [left, right] = SIDES.filter((x) => x !== profile.avatar);
  const ring = (size: number) => ({ padding: 4, borderRadius: size / 2 + 4, backgroundColor: c.page });
  return (
    <View style={styles.box}>
      <View style={styles.trio} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.side, { left: 10 }, ring(64)]}>
          <Avatar id={left} color={1} size={64} />
        </View>
        <View style={[styles.side, { right: 10 }, ring(64)]}>
          <Avatar id={right} color={4} size={64} />
        </View>
        <View style={[styles.me, ring(88), elevation(1, night)]}>
          <Avatar id={profile.avatar} color={profile.color} size={88} />
        </View>
      </View>
      <Txt variant="title2" style={styles.center} accessibilityRole="header">{t('accGateTitle')}</Txt>
      <Txt style={[styles.why, { color: c.textSoft }]}>{t('accGateText')}</Txt>
      <Button title={t('accCreate')} onPress={() => router.push(href('/account', { from }))} style={styles.create} testID="gate-create" />
      <LinkLine lead={t('accHave')} action={t('accSignInLink')} onPress={() => router.push(href('/signin', { from }))} testID="gate-signin" />
      <Txt style={[styles.without, { color: c.textSoft }]}>{t('accWorksWithout')}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 48 },
  trio: { width: 240, height: 110, marginBottom: 20 },
  side: { position: 'absolute', top: 18 },
  me: { position: 'absolute', left: 72, top: 0 },
  center: { textAlign: 'center' },
  why: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  create: { alignSelf: 'stretch', marginTop: 26 },
  without: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: 14 },
});
