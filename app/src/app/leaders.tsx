// Leaders (спец-друзья 9, frames 32–38): me and my friends, "This week" (days with watering of
// the last 7) or "Best streak" (the longest growing open tree). A podium for the first three,
// a list for the rest; ties share a place. Only trees friends can see count.
// No account — "sign in"; no data yet — a dashed podium breathing; no network — the last data
// with its time. The numbers are counted on the phone from the friends' cache (useFriends).
import { Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Board } from '@/game/leaders';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { SignInGate } from '@/ui/account/SignInGate';
import { Button, fonts, Icon, Page, Segmented, Txt, useColors, useMotionOn } from '@/ui/ds';
import { LeaderList, ListSkeleton } from '@/ui/leaders/LeaderList';
import type { BoardRow } from '@/ui/leaders/model';
import { LoadError, LoadingLong, NetPill } from '@/ui/leaders/NetStates';
import { Podium } from '@/ui/leaders/Podium';
import { inviteFriend, useBoard } from '@/ui/leaders/useLeaders';

const SIDE = 16;
/** Data older than this is fetched again when the screen opens (спец-друзья 11.1). */
const STALE = 60_000;
/** The chosen tab is remembered while the app is open. */
let lastBoard: Board = 'week';

export default function LeadersScreen() {
  const { t } = useStore();
  const { ready, account } = useFriends();
  return <Page title={t('leaders')}>{!ready ? null : account ? <Leaders nick={account.nick} /> : <SignInGate />}</Page>;
}

function Leaders({ nick }: { nick: string }) {
  const { t } = useStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const motionOn = useMotionOn();
  const { status, fetchedAt, refresh, lists } = useFriends();
  const [board, setBoardState] = useState<Board>(lastBoard);
  const setBoard = (b: Board) => {
    lastBoard = b;
    setBoardState(b);
  };
  const view = useBoard(board);
  const [width, setWidth] = useState(0);
  const [pulling, setPulling] = useState(false);

  useEffect(() => {
    if (Date.now() - fetchedAt > STALE) refresh();
    // Once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasData = fetchedAt > 0 && view !== null;
  // The entry plays once: the first time the screen shows data.
  const intro = useRef(true);
  const introNow = intro.current;
  useEffect(() => {
    if (hasData && width > 0) intro.current = false;
  });

  const onPull = async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  };
  const find = () => router.push('/find' as string as Href);
  const invite = () => inviteFriend(t, nick);

  if (!hasData && (status === 'error' || status === 'offline')) {
    return <LoadError onRetry={refresh} />;
  }

  const empty = hasData && lists.friends.length === 0;
  let podiumRows: BoardRow[] = [];
  let listRows: BoardRow[] = [];
  if (view && hasData) {
    if (empty) {
      // Alone: me in the middle, even without open trees.
      const me = view.ranked[0] ?? view.out[0];
      podiumRows = me ? [{ ...me, place: 1 }] : [];
    } else {
      podiumRows = view.ranked.slice(0, 3);
      listRows = [...view.ranked.slice(3), ...view.out];
    }
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={pulling} onRefresh={onPull} tintColor={c.textSoft} colors={[c.accent]} />}
    >
      <View style={styles.side}>
        <NetPill status={status} fetchedAt={fetchedAt} />
        <Segmented
          height={44}
          value={board}
          onChange={setBoard}
          options={[
            { value: 'week', label: t('leadersTabWeek'), glyph: 'drop' },
            { value: 'streak', label: t('leadersTabStreak'), glyph: 'rings' },
          ]}
        />
        <Txt style={[styles.caption, { color: c.textSoft }]}>{t(board === 'week' ? 'leadersCapWeek' : 'leadersCapStreak')}</Txt>
      </View>

      <View style={styles.podium} onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}>
        {width > 0 &&
          (hasData ? (
            <Podium rows={podiumRows} board={board} width={width} intro={introNow} motionOn={motionOn} crown={!empty} onFree={find} />
          ) : (
            <Podium rows={[]} board={board} width={width} intro={false} motionOn={motionOn} mode="loading" />
          ))}
      </View>

      {!hasData ? (
        <View style={[styles.side, styles.list]}>
          <ListSkeleton motionOn={motionOn} />
          <LoadingLong onRetry={refresh} />
        </View>
      ) : empty ? (
        <View style={styles.empty}>
          <Txt variant="title2" style={styles.center}>{t('leadersEmptyTitle')}</Txt>
          <Txt style={[styles.emptyText, { color: c.textSoft }]}>{t('leadersEmptyText')}</Txt>
          <Button title={t('leadersInvite')} glyph="invite" size="l" onPress={invite} style={styles.emptyButton} />
          <Button title={t('leadersFind')} icon="search" variant="text" size="m" cue="tap" onPress={find} style={styles.findButton} />
        </View>
      ) : (
        <>
          {width > 0 && listRows.length > 0 && (
            <View style={[styles.side, styles.list]}>
              <LeaderList key={board} rows={listRows} board={board} intro={introNow} motionOn={motionOn} onOpenTrees={() => router.push('/profile')} />
            </View>
          )}
          <View style={styles.foot}>
            <View style={styles.footLine}>
              <Icon name="eye" size={16} color={c.textSoft} />
              <Txt style={[styles.footText, { color: c.textSoft }]}>{t('leadersOnlyVisible')}</Txt>
            </View>
            <Button title={t('leadersInvite')} glyph="invite" variant="text" size="m" cue="tap" onPress={invite} style={styles.inviteButton} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  side: { paddingHorizontal: SIDE },
  caption: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 8 },
  podium: { marginTop: 16 },
  list: { marginTop: 16 },
  foot: { marginTop: 18, paddingHorizontal: SIDE, alignItems: 'center' },
  footLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  footText: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 17, flexShrink: 1, textAlign: 'center' },
  inviteButton: { marginTop: 4, alignSelf: 'center' },
  empty: { paddingHorizontal: 32, marginTop: 28, alignItems: 'stretch' },
  center: { textAlign: 'center' },
  emptyText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  emptyButton: { marginTop: 24 },
  findButton: { marginTop: 6, alignSelf: 'center' },
});
