// A friend's forest, "view only" (спец-друзья 7, frames 23–24): `forest.tsx?friend=<nick>`.
// The same map and sheet as "My forest", with the friend's open trees on their plot and their
// meadow. Hidden trees are not there at all: their cells are just grass. No moving, no
// watering, no renaming; the card has "View", "Cheer" (once a day) and "⋯ → Report name".
// Their data comes from the friends' cache at once (no network — "Offline · data from 14:05")
// and is fetched fresh on entry.
// OYUUR-34 (спец 5.4): a tree waiting for its watering hour (theirs, by my clock) has no drop on
// the map, its card says "Ждёт вечера" and shows "Watering from 18:00".
import { router, Stack } from 'expo-router';
import { ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MeadowId } from '@/game/economy';
import type { Plot } from '@/game/plot';
import type { Person } from '@/game/shared';
import { groupHabits } from '@/game/tree';
import { ApiError, friendTree, isOffline, PublicForest } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import type { AvatarId } from '@/game/profile';
import { Avatar } from '@/ui/avatars/Avatar';
import { confirmDialog, elevation, fonts, Icon, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import type { ForestMapHandle } from '@/ui/forest/contract';
import { ForestMap } from '@/ui/forest/ForestMap';
import { ForestSheet } from '@/ui/forest/sheet/ForestSheet';
import { baseDetent, ForestDetent } from '@/ui/forest/sheet/forestDetents';
import { HEADER_H, MapHeader } from '@/ui/forest/sheet/MapHeader';
import { Anchor, CardAction } from '@/ui/forest/sheet/TreeCard';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { waitingNow } from '@/ui/friends/model';
import { nameIn, nameOf } from './model';
import { rememberFriendForest } from './friendForests';

const NO_SCROLL_WEB = Platform.OS === 'web' ? ({ overflow: 'clip' } as unknown as ViewStyle) : null;
/** The "View only" pill: 32 high, its top 54 below the capsule's top (спец 7). */
const PILL_H = 32;
const MENU_W = 290;

/** `tree` — a habit (lineage) to open on: its card comes up and the camera flies to it. */
export function FriendForest({ nick, tree }: { nick: string; tree: string | null }) {
  const { today, night, settings, t, clock } = useStore();
  const friends = useFriends();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const animations = settings.animations && !reduced;
  const mapRef = useRef<ForestMapHandle>(null);
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  const sheetVisible = useSharedValue(0);
  const progressList = useSharedValue(0);

  // ---- Their data: the cache first, then the server ----
  const cached = friends.lists.friends.find((f) => f.nick === nick) ?? null;
  const [loaded, setLoaded] = useState<{ user: Person; forest: PublicForest | null; at: number } | null>(null);
  const [net, setNet] = useState<'loading' | 'ok' | 'offline' | 'error' | 'gone'>('loading');
  useEffect(() => {
    let live = true;
    friends
      .user(nick)
      .then((r) => {
        if (!live) return;
        setLoaded({ user: r.user, forest: r.forest, at: Date.now() });
        setNet('ok');
      })
      // 404: there is no such person (not "no internet").
      .catch((e) => live && setNet(isOffline(e) ? 'offline' : e instanceof ApiError && e.status === 404 ? 'gone' : 'error'));
    return () => {
      live = false;
    };
    // Once per friend.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nick]);
  const person: Person | null = loaded?.user ?? cached ?? null;
  const forest: PublicForest | null = loaded ? loaded.forest : cached?.forest ?? null;
  const dataAt = loaded?.at ?? friends.fetchedAt;

  const habits = useMemo(() => groupHabits((forest?.trees ?? []).map(friendTree)), [forest]);
  const plot: Plot = useMemo(() => {
    const size = Math.max(4, forest?.plot.size ?? 4);
    return { size, places: forest?.plot.places ?? {}, shownSize: size, seen: habits.map((h) => h.lineageId) };
  }, [forest, habits]);
  // Their trees waiting for the watering hour: no drop yet (one string, so the map's list changes only when an hour comes).
  const waitingKey = habits.filter((h) => waitingNow(h.current, today, clock)).map((h) => h.lineageId).join(',');
  const waiting = useMemo(() => (waitingKey ? waitingKey.split(',') : []), [waitingKey]);
  // "View" opens the tree big (habit.tsx with `friend`): it reads them from here.
  useEffect(() => {
    if (forest) rememberFriendForest(nick, habits);
  }, [nick, forest, habits]);

  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((old) => (old && old.w === width && old.h === height ? old : { w: width, h: height }));
  };

  // ---- What is chosen ----
  const [selected, setSelected] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [menu, setMenu] = useState<Anchor | null>(null);
  const [atFit, setAtFit] = useState(false);
  const selectedHabit = habits.find((h) => h.lineageId === selected) ?? null;
  const base = baseDetent({ empty: false, moving: false, selected: selectedHabit !== null });
  const place: ForestDetent = listOpen && habits.length > 0 ? 'list' : base;
  const flyAfter = useRef<string | null>(null);

  const choose = (lineageId: string | null, fly = false) => {
    setMenu(null);
    if (lineageId === null) return setSelected(null);
    if (lineageId !== selected) cue('select');
    flyAfter.current = fly ? lineageId : null;
    setSelected(lineageId);
    setListOpen(false);
  };
  // Opened on one tree (a row of the friend's profile): once their trees are known, choose it.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !tree || !habits.some((h) => h.lineageId === tree)) return;
    opened.current = true;
    choose(tree, true);
    // `choose` is a plain function of this render; the guard keeps it to once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, habits]);
  const onSettle = (p: ForestDetent) => {
    const id = flyAfter.current;
    if (p !== 'card' || !id) return;
    flyAfter.current = null;
    mapRef.current?.flyTo(id);
  };
  const onGesture = (p: ForestDetent) => {
    if (p === 'list') {
      setListOpen(true);
      setMenu(null);
    } else {
      setListOpen(false);
      if (p === 'peek') setSelected(null);
    }
  };
  const onAction = (action: CardAction) => {
    if (action === 'view' && selectedHabit) router.push({ pathname: '/habit', params: { lineage: selectedHabit.lineageId, friend: nick } });
  };
  const cheered = !!cached?.cheeredToday;
  const onCheer = () => {
    if (cheered) return;
    cue('cheer');
    friends.cheer(nick);
  };
  const onMore = (at: Anchor) => {
    if (!rootRef.current) return;
    rootRef.current.measureInWindow((x, y) => setMenu({ ...at, x: at.x - x, y: at.y - y }));
  };
  const report = async () => {
    setMenu(null);
    const tree = selectedHabit?.current;
    if (!tree) return;
    const yes = await confirmDialog({ title: t('tgReportName'), message: `«${tree.nickname ?? tree.name}»`, confirmLabel: t('tgReport'), cancelLabel: t('cancel'), tone: 'danger' });
    if (!yes) return;
    try {
      await friends.report({ nick, reason: 'name', treeId: tree.id });
      cue('select');
      showQuestHint(t('tgReportThanks'));
    } catch (e) {
      cue('error');
      showQuestHint(isOffline(e) ? t('tgNeedInternet') : t('tgSendFailed'));
    }
  };

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progressList.value }));
  const title = t('tgForestOf', { name: nameIn(person ?? { nick, name: null, avatar: 'fox', color: 0 }, t.lang) });
  const offline = net === 'offline' || net === 'error';
  const time = dataAt > 0 ? new Date(dataAt).toTimeString().slice(0, 5) : '—';
  const pillTop = insets.top + (HEADER_H - 44) / 2 + 54;
  const empty = forest !== null && habits.length === 0;

  return (
    <View ref={rootRef} style={[styles.root, NO_SCROLL_WEB, { backgroundColor: c.page }]} onLayout={onLayout}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      {box && (
        <>
          <ForestMap
            ref={mapRef}
            habits={habits}
            plot={plot}
            today={today}
            night={night}
            animations={animations}
            areaTop={insets.top + HEADER_H + PILL_H}
            sheetVisible={sheetVisible}
            selected={selected}
            highlight={null}
            fresh={[]}
            grewFrom={null}
            onIntroDone={() => {}}
            onSelect={choose}
            onMoveStart={() => {}}
            onMoveEnd={() => {}}
            onFitChange={setAtFit}
            readOnly
            waiting={waiting}
            meadow={forest?.meadow as MeadowId | undefined}
          />
          <MapHeader
            topInset={insets.top}
            width={box.w}
            banner={null}
            showFit={habits.length > 0}
            atFit={atFit}
            onBack={leave}
            onFit={() => (atFit ? mapRef.current?.fitTrees() : mapRef.current?.fitPlot())}
            onCancelMove={() => {}}
            title={title}
            picture={person ? <Avatar id={person.avatar as AvatarId} color={person.color} size={28} /> : undefined}
          />
          {net !== 'gone' && (
            <View style={[styles.pillRow, { top: pillTop }]} pointerEvents="none">
              <View style={[styles.pill, elevation(offline ? 2 : 1, night), { backgroundColor: offline ? c.offline : c.glass }]}>
                <Icon name={offline ? 'wifiOff' : 'eye'} size={18} color={offline ? '#FFFFFF' : c.text} />
                <Txt numberOfLines={1} style={[styles.pillText, { color: offline ? '#FFFFFF' : c.text }]}>
                  {offline ? t('tgOffline', { time }) : t('tgViewOnly')}
                </Txt>
              </View>
            </View>
          )}
          {empty && (
            <View style={styles.emptyWrap} pointerEvents="none">
              <View style={[styles.emptyCard, elevation(2, night), { backgroundColor: c.card }]}>
                <Icon name="lock" size={24} color={c.textSoft} />
                <Txt variant="bodyStrong" style={styles.center}>{t('tgNoOpenTrees', { name: nameOf(person ?? { nick, name: null, avatar: '', color: 0 }) })}</Txt>
              </View>
            </View>
          )}
          {!forest && net !== 'loading' && (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyCard, elevation(2, night), { backgroundColor: c.card }]}>
                <Icon name={net === 'gone' ? 'search' : 'wifiOff'} size={24} color={c.textSoft} />
                <Txt variant="bodyStrong" style={styles.center}>{net === 'gone' ? t('frNobody', { nick }) : t('tgLoadFailed')}</Txt>
              </View>
            </View>
          )}
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }, scrimStyle]} pointerEvents={listOpen ? 'auto' : 'none'}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setListOpen(false)} accessibilityLabel={t('close')} />
          </Animated.View>
          <ForestSheet
            place={place}
            base={base}
            habits={habits}
            selected={selectedHabit}
            highlight={null}
            today={today}
            screenW={box.w}
            screenH={box.h}
            topInset={insets.top}
            bottomInset={insets.bottom}
            animations={animations}
            visible={sheetVisible}
            progressList={progressList}
            onGesture={onGesture}
            onSettle={onSettle}
            onClose={() => choose(null)}
            onAction={onAction}
            onMove={() => {}}
            onMore={onMore}
            onPick={(id) => choose(id, true)}
            view={{ cheered, onCheer }}
          />
          {menu && (
            <>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(null)} accessibilityLabel={t('close')} />
              <View
                style={[
                  styles.menu,
                  elevation(2, night),
                  { backgroundColor: c.card, left: Math.max(8, Math.min(menu.x + menu.width - MENU_W, box.w - MENU_W - 8)), top: Math.max(insets.top + 8, menu.y - 58) },
                ]}
              >
                <Pressable onPress={report} accessibilityRole="button" style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.6 }]}>
                  <Icon name="flag" size={20} color={c.dangerText} />
                  <Txt numberOfLines={1} style={[styles.menuText, { color: c.dangerText }]}>{t('tgReportName')}</Txt>
                </Pressable>
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  center: { textAlign: 'center' },
  pillRow: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pill: { height: PILL_H, borderRadius: PILL_H / 2, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, maxWidth: '90%' },
  pillText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  emptyWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyCard: { borderRadius: 20, padding: 20, alignItems: 'center', gap: 10, maxWidth: 300 },
  menu: { position: 'absolute', width: MENU_W, borderRadius: 16, paddingVertical: 4 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 14 },
  menuText: { fontFamily: fonts.bold, fontSize: 15, flexShrink: 1 },
});
