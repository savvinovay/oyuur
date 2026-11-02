// A friend's profile (design/волна-5/спец-друзья.md, section 6, frames 15–22): the landscape
// header with their trees, avatar, name, three numbers, "Cheer on" (once a day, palms fly to the
// avatar), the shared tree card, their open trees and how many are hidden; "⋯" — shared tree,
// report, block, remove. `/friend?nick=aisha_k`.
// Opening asks the server for fresh data (`user(nick)`, it also counts for the "visit a friend"
// quest); until it answers, or without network, the friends list's copy is shown.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { partnerOf, Person } from '@/game/shared';
import { ApiError, isOffline, PublicForest, Relation } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { SignInGate } from '@/ui/account/SignInGate';
import { confirmDialog, elevation, fonts, Glyph, Icon, motion, Page, PAGE_BAR, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { CheerControl, CheerFlight, CheerGlow, jumpAvatar } from '@/ui/friends/Cheer';
import { FriendAvatar } from '@/ui/friends/FriendAvatar';
import { FriendMenu } from '@/ui/friends/FriendMenu';
import { FriendTrees } from '@/ui/friends/FriendTrees';
import {
  agoText, displayName, freshness, heroTrees, nameInCase, shortDate, statsOf, todayState, treeRows, treesOf,
} from '@/ui/friends/model';
import { friendForestPath, go } from '@/ui/friends/nav';
import { ErrorState, NetPill, SkeletonRows, useNetPill } from '@/ui/friends/NetStates';
import { PersonCard } from '@/ui/friends/PersonCard';
import { ProfileHero } from '@/ui/friends/ProfileHero';
import { ReportSheet } from '@/ui/friends/ReportSheet';
import { friendsToast, FriendsToast } from '@/ui/friends/Toast';
import { ProposeSheet } from '@/ui/together/ProposeSheet';
import { SharedCard } from '@/ui/together/SharedCard';

const SIDE = 16;
/** The compact bar shows from this scroll on, fully 40 px later (6.6). */
const BAR_FROM = 180;
const BAR_OVER = 40;
const STALE = 60_000;

export default function FriendScreen() {
  const { t } = useStore();
  const f = useFriends();
  const params = useLocalSearchParams<{ nick?: string }>();
  const nick = (params.nick ?? '').toLowerCase().replace(/^@/, '');
  if (!f.ready) return <Page title={t('friendsTitle')}>{null}</Page>;
  if (!f.account) {
    return (
      <Page title={t('friendsTitle')}>
        <SignInGate />
      </Page>
    );
  }
  return <Profile key={nick} nick={nick} />;
}

interface Fetched {
  user: Person;
  relation: Relation;
  forest: PublicForest | null;
  forestAt: number | null;
}

function Profile({ nick }: { nick: string }) {
  const { t } = useStore();
  const f = useFriends();
  const listed = f.lists.friends.find((x) => x.nick === nick) ?? null;
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [failed, setFailed] = useState<'offline' | 'error' | 'gone' | null>(null);

  const userRef = useRef(f.user);
  userRef.current = f.user;
  const refreshRef = useRef(f.refresh);
  refreshRef.current = f.refresh;
  const fetchedAtRef = useRef(f.fetchedAt);
  fetchedAtRef.current = f.fetchedAt;
  const load = useCallback(async () => {
    try {
      const r = await userRef.current(nick);
      setFetched(r);
      setFailed(null);
    } catch (e) {
      setFailed(isOffline(e) ? 'offline' : e instanceof ApiError && e.status === 404 ? 'gone' : 'error');
    }
  }, [nick]);
  useFocusEffect(
    useCallback(() => {
      load();
      if (Date.now() - fetchedAtRef.current > STALE) refreshRef.current();
    }, [load]),
  );

  const back = () => (router.canGoBack() ? router.back() : router.replace('/friends' as never));

  if (fetched && fetched.relation !== 'friend') {
    return (
      <View style={styles.root}>
        <Page title={displayName(fetched.user)}>
          <PersonCard person={fetched.user} said={fetched.relation} invited={false} offline={f.status === 'offline'} onFriends={back} />
        </Page>
        <FriendsToast />
      </View>
    );
  }
  const person: Person | null = fetched?.user ?? listed;
  if (!person) {
    if (failed === 'gone') {
      return (
        <Page title={t('friendsTitle')}>
          <View style={styles.gone}>
            <Txt style={styles.goneText}>{t('frNobody', { nick })}</Txt>
          </View>
        </Page>
      );
    }
    if (failed) {
      return (
        <Page title={t('friendsTitle')}>
          <ErrorState onRetry={load} />
        </Page>
      );
    }
    return <ProfileView nick={nick} data={null} onBack={back} />;
  }
  return (
    <ProfileView
      nick={nick}
      onBack={back}
      data={{
        person,
        forest: fetched?.forest ?? listed?.forest ?? null,
        forestAt: fetched ? fetched.forestAt : listed?.forestAt ?? null,
        since: listed?.since ?? null,
        cheeredToday: listed?.cheeredToday ?? false,
      }}
    />
  );
}

interface ProfileData {
  person: Person;
  forest: PublicForest | null;
  forestAt: number | null;
  since: number | null;
  cheeredToday: boolean;
}

function ProfileView({ nick, data, onBack }: { nick: string; data: ProfileData | null; onBack: () => void }) {
  const { t, today, night, habits } = useStore();
  const f = useFriends();
  const c = useColors();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const compact = width > 0 && width < 360;
  const heroH = insets.top + (compact ? 150 : 185);
  const avatar = compact ? 64 : 88;
  const avatarTop = heroH - avatar / 2;
  const pill = useNetPill(f.status, f.fetchedAt);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.set(e.contentOffset.y);
  });
  const barStyle = useAnimatedStyle(() => {
    const k = Math.min(1, Math.max(0, (scrollY.get() - BAR_FROM) / BAR_OVER));
    return { opacity: k, pointerEvents: k > 0.5 ? 'auto' : 'none' } as never;
  });
  const roundStyle = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.max(0, (scrollY.get() - BAR_FROM) / BAR_OVER)) }));
  const scrollRef = useRef<Animated.ScrollView>(null);

  // The cheer: the palms fly from the button's middle to the avatar's.
  const [run, setRun] = useState(0);
  const [flipping, setFlipping] = useState(false);
  const [cheeredNow, setCheeredNow] = useState(false);
  const [buttonY, setButtonY] = useState(0);
  const avatarScale = useSharedValue(1);
  const avatarStyle = useAnimatedStyle(() => ({ transform: [{ scale: avatarScale.get() }] }));
  const [sharedY, setSharedY] = useState(0);

  const [menu, setMenu] = useState(false);
  const [proposing, setProposing] = useState(false);
  const [reporting, setReporting] = useState(false);

  const name = data ? displayName(data.person) : '';
  const caseName = data ? nameInCase(t, data.person) : '';
  const trees = treesOf(data?.forest);
  const stats = statsOf(trees, today);
  const noData = todayState(trees, data?.forestAt ?? null, today).kind === 'noData';
  const sent = !flipping && (cheeredNow || (data?.cheeredToday ?? false));
  const queued = f.isWaiting({ kind: 'cheer', nick, day: today });
  const shared = f.account ? f.shared.find((s) => (s.status === 'active' || s.status === 'proposed') && partnerOf(s, f.account!.nick)?.nick === nick) : undefined;
  const open = habits.filter((h) => h.current.visibility === 'friends').length;

  const cheer = () => {
    if (sent || flipping) return;
    cue('cheer');
    f.cheer(nick);
    setFlipping(true);
    setRun((r) => r + 1);
    jumpAvatar(avatarScale, motionOn);
    setTimeout(() => {
      setCheeredNow(true);
      setFlipping(false);
    }, motionOn ? 200 : 0);
  };

  const block = async () => {
    setMenu(false);
    if (!data) return;
    const yes = await confirmDialog({
      title: t('frBlockTitle', { nick }),
      message: t('frBlockText', { name }),
      confirmLabel: t('frBlockConfirm'),
      cancelLabel: t('cancel'),
      tone: 'danger',
      picture: <FriendAvatar person={data.person} size={64} />,
    });
    if (!yes) return;
    try {
      await f.block(nick);
      cue('delete');
      friendsToast(t('frBlockedToast', { nick }));
      onBack();
    } catch (e) {
      friendsToast(isOffline(e) ? t('frNeedInternet') : t('frSendFailed'), null);
    }
  };
  const remove = async () => {
    setMenu(false);
    const yes = await confirmDialog({
      title: t('frRemoveTitle', { name: caseName }),
      message: t('frRemoveText'),
      confirmLabel: t('frRemoveConfirm'),
      cancelLabel: t('cancel'),
      tone: 'danger',
    });
    if (!yes) return;
    try {
      await f.removeFriend(nick);
      cue('delete');
      friendsToast(t('frRemovedToast', { name }));
      onBack();
    } catch (e) {
      friendsToast(isOffline(e) ? t('frNeedInternet') : t('frSendFailed'), null);
    }
  };
  const onShared = () => {
    setMenu(false);
    if (!shared) return setProposing(true);
    if (shared.status !== 'proposed') return go(`/together?id=${encodeURIComponent(shared.id)}`);
    // An invitation has no tree screen yet: its card here holds "Cancel" or "Accept / Not now".
    scrollRef.current?.scrollTo({ y: Math.max(0, sharedY - insets.top - PAGE_BAR - 16), animated: motionOn });
  };

  // The line under the name: friends since, or how old their data is (6.8).
  const fresh = freshness(data?.forestAt ?? null, Date.now());
  const subLine =
    fresh.kind === 'updated'
      ? t('frUpdatedAgo', { ago: agoText(t, fresh.ms) })
      : fresh.kind === 'away'
        ? t('frLastSeen', { ago: agoText(t, fresh.ms) })
        : data?.since
          ? t('frFriendsSince', { date: shortDate(t, data.since) })
          : '';

  const center = width / 2;
  const tile = (glyph: 'sprout' | 'rings' | 'drop', value: string, caption: string) => (
    <View style={[styles.tile, elevation(1, night), { height: compact ? 56 : 64, backgroundColor: c.card }]} accessible accessibilityLabel={`${value} ${caption}`}>
      <View style={styles.tileTop}>
        <Glyph name={glyph} size={18} />
        <Txt style={[styles.tileNumber, compact && styles.tileNumberCompact]}>{value}</Txt>
      </View>
      <Txt variant="caption" numberOfLines={1} color={c.textSoft}>{caption}</Txt>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: c.page }]} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Animated.ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
          <View>
            <ProfileHero
              nick={nick}
              trees={heroTrees(trees)}
              width={width}
              height={heroH}
              compact={compact}
              bare={!data}
              onPress={data ? () => go(friendForestPath(nick)) : undefined}
              label={t('frOpenForest', { name: caseName })}
            />
            {data && <CheerGlow at={{ x: center, y: avatarTop + avatar / 2 }} run={run} />}
            <Animated.View style={[styles.avatar, { top: avatarTop, left: center - avatar / 2 }, avatarStyle]}>
              {data ? (
                <FriendAvatar person={data.person} size={avatar} pageRing={compact ? 3 : 4} />
              ) : (
                <View style={{ width: avatar, height: avatar, borderRadius: avatar / 2, backgroundColor: c.sunken }} />
              )}
            </Animated.View>

            <View style={[styles.column, { paddingTop: avatarTop + avatar + 8 }]}>
              {data ? (
                <>
                  <Txt variant="title2" numberOfLines={1} style={styles.center} accessibilityRole="header">{name}</Txt>
                  <View style={styles.sub}>
                    {fresh.kind !== 'fresh' && <Icon name="hourglass" size={15} color={c.textSoft} strokeWidth={2} />}
                    <Txt variant="small" numberOfLines={1} color={c.textSoft} style={styles.subText}>
                      {subLine ? `@${nick} · ${subLine}` : `@${nick}`}
                    </Txt>
                  </View>
                  {pill && <NetPill kind={pill} fetchedAt={f.fetchedAt} />}
                  <View style={styles.tiles}>
                    {tile('sprout', String(stats.growing), t('frStatGrowing'))}
                    {tile('rings', String(stats.best), t('frStatBest'))}
                    {tile('drop', `${stats.week}/7`, t('frStatWeek'))}
                  </View>
                  <View style={styles.cheer} onLayout={(e) => setButtonY(e.nativeEvent.layout.y + 28)}>
                    <CheerControl
                      name={caseName}
                      nameNom={name}
                      sent={sent}
                      queued={queued}
                      offline={f.status === 'offline'}
                      onCheer={cheer}
                    />
                  </View>
                  <View style={styles.shared} onLayout={(e) => setSharedY(e.nativeEvent.layout.y)}>
                    <SharedCard friend={data.person} />
                  </View>
                  <View style={styles.treesHead}>
                    <Txt variant="title3" numberOfLines={1} style={styles.flex} accessibilityRole="header">{t('frTreesOf', { name: caseName })}</Txt>
                    <Pressable onPress={() => go(friendForestPath(nick))} accessibilityRole="link" hitSlop={10} style={styles.forestLink}>
                      <Glyph name="forest" size={18} />
                      <Txt style={[styles.forestText, { color: c.doneInk }]}>{t('frForestLink')}</Txt>
                      <Icon name="chevronRight" size={14} color={c.doneInk} />
                    </Pressable>
                  </View>
                  <FriendTrees
                    rows={treeRows(trees)}
                    hidden={data.forest?.hidden ?? 0}
                    noData={noData}
                    today={today}
                    emptyText={t('frNoOpenTrees', { name })}
                    onOpen={(lineageId) => go(friendForestPath(nick, lineageId))}
                  />
                  <Txt style={[styles.footer, { color: c.textSoft }]}>{t('frSeesYours', { name, a: open, b: habits.length })}</Txt>
                </>
              ) : (
                <>
                  <View style={[styles.skBar, { width: 140, height: 22, backgroundColor: c.sunken }]} />
                  <View style={[styles.skBar, { width: 190, height: 12, marginTop: 10, backgroundColor: c.sunken }]} />
                  <View style={[styles.tiles, { marginBottom: 24 }]}>
                    {[0, 1, 2].map((i) => (
                      <View key={i} style={[styles.tile, elevation(1, night), { height: compact ? 56 : 64, backgroundColor: c.card }]}>
                        <View style={[styles.skBar, { width: 48, height: 14, backgroundColor: c.sunken }]} />
                        <View style={[styles.skBar, { width: 64, height: 10, marginTop: 8, backgroundColor: c.sunken }]} />
                      </View>
                    ))}
                  </View>
                  <SkeletonRows count={2} />
                </>
              )}
            </View>
            {data && <CheerFlight from={{ x: center, y: buttonY }} to={{ x: center, y: avatarTop + avatar / 2 }} avatar={avatar} run={run} />}
          </View>
        </Animated.ScrollView>
      )}

      {/* The compact bar: shows after 180 px of scroll (6.6). */}
      <Animated.View style={[styles.bar, elevation(1, night), { height: insets.top + PAGE_BAR, paddingTop: insets.top, backgroundColor: c.header }, barStyle]}>
        <View style={styles.barTitle}>
          {data && <FriendAvatar person={data.person} size={32} />}
          <Txt numberOfLines={1} style={styles.barName}>{name}</Txt>
        </View>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('back')} style={[styles.barButton, { left: 10, top: insets.top + 8, backgroundColor: c.headerButton }]}>
          <Icon name="chevronLeft" size={22} color={c.text} />
        </Pressable>
        {data && (
          <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel={t('frMore')} style={[styles.barButton, { right: 10, top: insets.top + 8, backgroundColor: c.headerButton }]}>
            <Icon name="more" size={22} color={c.text} />
          </Pressable>
        )}
      </Animated.View>

      {/* Round buttons over the sky; they fade as the bar comes. */}
      <Animated.View style={[styles.rounds, { top: insets.top + 6 }, roundStyle]} pointerEvents="box-none">
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('back')} style={[styles.round, elevation(1, night), { backgroundColor: c.glass }]}>
          <Icon name="chevronLeft" size={24} color={c.text} />
        </Pressable>
        {data && (
          <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel={t('frMore')} style={[styles.round, elevation(1, night), { backgroundColor: c.glass }]}>
            <Icon name="more" size={24} color={c.text} />
          </Pressable>
        )}
      </Animated.View>

      {menu && (
        <FriendMenu
          sharedOpen={!!shared}
          onShared={onShared}
          onReport={() => {
            setMenu(false);
            setReporting(true);
          }}
          onBlock={block}
          onRemove={remove}
          onClose={() => setMenu(false)}
        />
      )}
      {reporting && data && <ReportSheet person={data.person} onClosed={() => setReporting(false)} onBlocked={onBack} />}
      {proposing && data && <ProposeSheet friend={data.person} onClosed={() => setProposing(false)} />}
      <FriendsToast />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  avatar: { position: 'absolute', zIndex: 2 },
  column: { paddingHorizontal: SIDE, alignItems: 'stretch' },
  sub: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 1 },
  subText: { flexShrink: 1 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 13 },
  tile: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileNumber: { fontFamily: fonts.black, fontSize: 22, lineHeight: 26 },
  tileNumberCompact: { fontSize: 20, lineHeight: 24 },
  cheer: { marginTop: 16 },
  shared: { marginTop: 12 },
  treesHead: { flexDirection: 'row', alignItems: 'center', marginTop: 20, marginBottom: 10, paddingHorizontal: 4, gap: 12 },
  forestLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32 },
  forestText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
  footer: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 17, textAlign: 'center', marginTop: 16 },
  skBar: { borderRadius: 7, alignSelf: 'center' },
  bar: { position: 'absolute', left: 0, right: 0, top: 0, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, justifyContent: 'center', zIndex: 5 },
  barTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 64 },
  barName: { fontFamily: fonts.black, fontSize: 20, lineHeight: 26, flexShrink: 1 },
  barButton: { position: 'absolute', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rounds: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', zIndex: 4 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  gone: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  goneText: { fontFamily: fonts.black, fontSize: 18, lineHeight: 24, textAlign: 'center' },
});
