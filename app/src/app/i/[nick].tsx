// The invite link's screen (спец-друзья 5.4): `https://…/i/sasha_t` opens "Sasha invites you"
// with "Add". In a browser it is the first screen an invited person sees; without an account —
// "Sign in" first, the link's screen stays under it to come back to.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { typeNick } from '@/game/nick';
import type { Person } from '@/game/shared';
import { ApiError, isOffline, Relation } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { SignInGate } from '@/ui/account/SignInGate';
import { fonts, Page, Txt, useColors } from '@/ui/ds';
import { ErrorState } from '@/ui/friends/NetStates';
import { PersonCard } from '@/ui/friends/PersonCard';
import { FriendsToast } from '@/ui/friends/Toast';

export default function InviteScreen() {
  const { t } = useStore();
  const f = useFriends();
  const params = useLocalSearchParams<{ nick?: string }>();
  const nick = typeNick(params.nick ?? '');
  if (!f.ready) return <Page title={t('frFindTitle')}>{null}</Page>;
  if (!f.account) {
    return (
      <Page title={t('frFindTitle')}>
        <SignInGate />
      </Page>
    );
  }
  return <Invite key={nick} nick={nick} />;
}

function Invite({ nick }: { nick: string }) {
  const { t } = useStore();
  const f = useFriends();
  const c = useColors();
  const [found, setFound] = useState<{ user: Person; relation: Relation } | null>(null);
  const [failed, setFailed] = useState<'offline' | 'error' | 'gone' | null>(null);
  const userRef = useRef(f.user);
  userRef.current = f.user;

  const load = async () => {
    try {
      const r = await userRef.current(nick);
      setFound({ user: r.user, relation: r.relation });
      setFailed(null);
    } catch (e) {
      setFailed(isOffline(e) ? 'offline' : e instanceof ApiError && e.status === 404 ? 'gone' : 'error');
    }
  };
  useEffect(() => {
    load();
    // Once per nick (the screen is keyed by it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toFriends = () => router.replace('/friends' as never);
  let body;
  if (found) {
    body = <PersonCard person={found.user} said={found.relation} invited offline={f.status === 'offline'} onFriends={toFriends} />;
  } else if (failed === 'gone') {
    body = (
      <View style={styles.center}>
        <Txt style={styles.gone}>{t('frNobody', { nick })}</Txt>
      </View>
    );
  } else if (failed) {
    body = <ErrorState onRetry={load} />;
  } else {
    body = (
      <View style={styles.center}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }
  return (
    <View style={styles.root}>
      <Page title={t('frFindTitle')} onBack={() => (router.canGoBack() ? router.back() : toFriends())}>
        {body}
      </Page>
      <FriendsToast />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  gone: { fontFamily: fonts.black, fontSize: 18, lineHeight: 24, textAlign: 'center' },
});
