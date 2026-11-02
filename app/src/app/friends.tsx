// Friends (design/волна-5/спец-друзья.md, section 4, frames 05–08, 12–14): search, requests,
// "… cheered you on", the friends by best streak, "Invite a friend" at the bottom.
// Without an account — "Sign in to have friends". The data comes from useFriends(): the cache at
// once, fresh data in the background (on opening if older than a minute, and on a pull).
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { partnerOf } from '@/game/shared';
import type { Friend } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { SignInGate } from '@/ui/account/SignInGate';
import { fonts, Page, Txt, useColors, useMotionOn } from '@/ui/ds';
import { FriendRow, ROW_GAP, ROW_H, ROW_H_COMPACT } from '@/ui/friends/FriendRow';
import { BOTTOM_INVITE_H, BottomInvite, CheerCard, EmptyFriends, RequestsRow, SearchButton, SeeLink } from '@/ui/friends/ListParts';
import { useFriendsMemory } from '@/ui/friends/memory';
import { cheersToday, requestsRow, sortFriends } from '@/ui/friends/model';
import { friendPath, go } from '@/ui/friends/nav';
import { ErrorState, LongWait, NetPill, SkeletonRows, useNetPill } from '@/ui/friends/NetStates';
import { shareInvite } from '@/ui/friends/share';
import { FriendsToast } from '@/ui/friends/Toast';

const SIDE = 16;
/** Fresh data is fetched on opening when the cache is older than this (спец-друзья 11.1). */
const STALE = 60_000;

export default function FriendsScreen() {
  const { t } = useStore();
  const f = useFriends();
  if (!f.ready) return <Page title={t('friendsTitle')}>{null}</Page>;
  if (!f.account) {
    return (
      <Page title={t('friendsTitle')}>
        <SignInGate />
      </Page>
    );
  }
  return <FriendsList nick={f.account.nick} />;
}

function FriendsList({ nick }: { nick: string }) {
  const { t, today, habits, profile } = useStore();
  const f = useFriends();
  const c = useColors();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const compact = useWindowDimensions().width < 360;
  const memory = useFriendsMemory();
  const [pulling, setPulling] = useState(false);
  const pill = useNetPill(f.status, f.fetchedAt);

  // Fresh data on opening; today's cheers are remembered, then marked seen (the menu dot goes).
  const { refresh, fetchedAt, cheersSeen } = f;
  const fetchedRef = useRef(fetchedAt);
  fetchedRef.current = fetchedAt;
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - fetchedRef.current > STALE) refresh();
    }, [refresh]),
  );

  const friends = useMemo(() => sortFriends(f.lists.friends), [f.lists.friends]);
  const cheers = useMemo(
    () =>
      cheersToday(
        memory.cheers?.day === today ? memory.cheers.list : [],
        f.inbox.cheers,
        f.lists.friends.filter((x) => x.cheeredMe).map((x) => x.nick),
        today,
      ).filter((x) => f.lists.friends.some((y) => y.nick === x.nick) || f.inbox.cheers.some((y) => y.from.nick === x.nick)),
    [memory.cheers, f.inbox.cheers, f.lists.friends, today],
  );
  const { rememberCheers } = memory;
  const inboxCheers = f.inbox.cheers.length;
  useFocusEffect(
    useCallback(() => {
      if (cheers.length > 0) rememberCheers(today, cheers);
      if (inboxCheers > 0) cheersSeen();
    }, [cheers, inboxCheers, today, rememberCheers, cheersSeen]),
  );

  // Requests: friendship both ways and shared trees offered to me.
  const offers = f.shared.filter((s) => s.status === 'proposed' && s.partner?.nick === nick);
  const incoming = f.lists.incoming.length;
  const fresh =
    f.lists.incoming.filter((r) => r.at > memory.requestsSeenAt).length + offers.filter((s) => s.createdAt > memory.requestsSeenAt).length;
  const outgoing = f.lists.outgoing.length;
  const together = useMemo(
    () => new Set(f.shared.filter((s) => s.status === 'active').map((s) => partnerOf(s, nick)?.nick)),
    [f.shared, nick],
  );

  const visible = habits.filter((h) => h.current.visibility === 'friends').length;
  const invite = () => shareInvite(t, nick);
  const openFriend = useCallback((n: string) => go(friendPath(n)), []);
  const pull = async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  };

  // Header above the rows, measured so every row's offset is known (getItemLayout).
  const [headerH, setHeaderH] = useState(0);
  const rowH = (compact ? ROW_H_COMPACT : ROW_H) + ROW_GAP;

  const loading = fetchedAt === 0 && (f.status === 'loading' || f.status === 'idle');
  const failed = fetchedAt === 0 && (f.status === 'offline' || f.status === 'error');

  const firstCheer = cheers[0];
  const cheerFrom = firstCheer
    ? f.lists.friends.find((x) => x.nick === firstCheer.nick) ?? f.inbox.cheers.find((x) => x.from.nick === firstCheer.nick)?.from
    : null;
  const cheeredBack = !!firstCheer && !!f.lists.friends.find((x) => x.nick === firstCheer.nick)?.cheeredToday;

  const header = (
    <View onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
      {pill && <NetPill kind={pill} fetchedAt={fetchedAt} />}
      <View style={styles.blocks}>
        <SearchButton onPress={() => go('/find')} />
        {(incoming > 0 || outgoing > 0 || offers.length > 0) && (
          <RequestsRow {...requestsRow(t, { fresh, incoming, outgoing, offers: offers.length })} fresh={fresh} onPress={() => go('/requests')} />
        )}
        {cheerFrom && firstCheer && (
          <CheerCard
            from={cheerFrom}
            at={firstCheer.at}
            more={cheers.length - 1}
            cheeredBack={cheeredBack}
            onPress={cheers.length === 1 ? () => openFriend(firstCheer.nick) : undefined}
          />
        )}
      </View>
      {friends.length > 0 && (
        <Txt variant="caption" style={[styles.group, { color: c.textSoft }]} accessibilityRole="header">
          {t('frFriendsCount', { n: friends.length })}
        </Txt>
      )}
    </View>
  );

  let body;
  if (failed) {
    body = <ErrorState onRetry={refresh} />;
  } else if (loading) {
    body = (
      <View style={styles.side}>
        {header}
        <Txt variant="caption" style={[styles.group, { color: c.textSoft }]}>{t('frFriendsCount', { n: '…' })}</Txt>
        <SkeletonRows compact={compact} />
        <LongWait onRetry={refresh} />
      </View>
    );
  } else if (friends.length === 0) {
    body = (
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.side, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={pulling} onRefresh={pull} colors={[c.accent]} tintColor={c.accent} />}
      >
        {header}
        <EmptyFriends me={profile} nick={nick} onFind={() => go('/find')} onInvite={invite} />
      </Animated.ScrollView>
    );
  } else {
    body = (
      <>
        <Animated.FlatList
          showsVerticalScrollIndicator={false}
          data={friends}
          keyExtractor={(x: Friend) => x.nick}
          renderItem={({ item }: { item: Friend }) => (
            <Animated.View exiting={motionOn ? FadeOut.duration(160) : undefined} style={{ marginBottom: ROW_GAP }}>
              <FriendRow friend={item} today={today} together={together.has(item.nick)} compact={compact} onPress={openFriend} />
            </Animated.View>
          )}
          getItemLayout={(_: unknown, index: number) => ({ length: rowH, offset: headerH + rowH * index, index })}
          // On the web a layout transition scales the rows' content: only on phones.
          itemLayoutAnimation={motionOn && Platform.OS !== 'web' ? LinearTransition.duration(260) : undefined}
          ListHeaderComponent={header}
          ListFooterComponent={
            <SeeLink text={t('frFriendsSee', { a: visible, b: habits.length })} onPress={() => go('/profile')} />
          }
          contentContainerStyle={[styles.side, { paddingBottom: insets.bottom + BOTTOM_INVITE_H + 24 }]}
          refreshControl={<RefreshControl refreshing={pulling} onRefresh={pull} colors={[c.accent]} tintColor={c.accent} />}
        />
        <BottomInvite onPress={invite} />
      </>
    );
  }

  return (
    <View style={styles.root}>
      <Page title={t('friendsTitle')}>{body}</Page>
      <FriendsToast lift={friends.length > 0 ? BOTTOM_INVITE_H : 24} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  side: { paddingHorizontal: SIDE },
  blocks: { gap: 12, marginTop: 16 },
  group: { fontFamily: fonts.black, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 8, marginLeft: 6 },
});
