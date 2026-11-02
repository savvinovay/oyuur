// The shared tree (спец-друзья 8.5, 8.6, frames 27–30): `?id=` of a shared tree. The same scene
// as the main screen — the sky with its clouds, the hills and the meadow the player has put on —
// "back", the "Shared tree" pill and "⋯" (leave), the counter, the habit and "You and Aisha",
// the tree at the main screen's size (one canvas with its soil; a tap waters my half), and the
// sheet: two halves (who has watered), the rule with the shared hearts, the last 7 days and the
// big button. Three live canvases in all: the sky, the meadow and the tree.
// Watering my half plays drops, a splash, my half's mark turning to a check and the tree
// half coming to life; when the friend has watered too, the "+" turns to a check, a "+1"
// flies to the counter and today's column gets its sprout. The friend watering while the
// screen is open (the data refresh every 25 s here) plays their half the same way.
// A stopped tree (someone left) is a memory: as it was on the day it ended, nothing to water.
import { Canvas, ColorMatrix, Group, Paint } from '@shopify/react-native-skia';
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from 'expo-router';
import { ComponentRef, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, LayoutChangeEvent, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SharedValue, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withTiming, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { partnerOf, Person, setMyHour, SharedTree, todayOf } from '@/game/shared';
import { growthDays, isDead, MAX_CHANCES, OpenHour, Tree, wateringOpensAt } from '@/game/tree';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { Avatar } from '@/ui/avatars/Avatar';
import type { AvatarId } from '@/game/profile';
import { Button, confirmDialog, elevation, fonts, Glyph, Grabber, Icon, motion, SheetSurface, Txt, useColors, withAlpha } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { drawnSize, treeK } from '@/ui/live/bubble';
import { liveColors, treeMatrix } from '@/ui/live/colors';
import { EarlyChip, earlyText, useMinutesToOpen } from '@/ui/live/EarlyChip';
import { askTime, earlyTap, measureRing, useChannel } from '@/ui/live/events';
import { holeWidth, Soil } from '@/ui/live/Soil';
import { frameAt, REDUCED } from '@/ui/live/timeline';
import { daysText } from '@/ui/forest/sheet/status';
import { Meadow } from '@/ui/meadow/Meadow';
import { useMeadow } from '@/ui/meadow/useMeadow';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { changeNote, sheetHours, waitLine } from '@/ui/sheet/wait';
import { WaitTitle } from '@/ui/sheet/WaitStatus';
import { fromText, hourText, waitWord } from '@/ui/watering/format';
import { WateringTimeSheet } from '@/ui/watering/TimeSheet';
import { SceneGeo, sceneGeo, Wind } from '@/ui/scene/contract';
import { Backdrop } from '@/ui/Scene';
import { Sky } from '@/ui/sky/Sky';
import { useWind } from '@/ui/sky/wind';
import { memoryHabit, nameIn, nameOf, sharedPhase, sharedTreeId, thirstOf, wateringChange } from '@/ui/together/model';
import { PairAvatar } from '@/ui/together/PairAvatar';
import { PairDays } from '@/ui/together/PairDays';
import { ProposeInitial, ProposeSheet } from '@/ui/together/ProposeSheet';
import { TreeBody } from '@/ui/TreeArt';
import { TreeHeader } from '@/ui/TreeHeader';
import { lookOf, treeZoom } from '@/ui/trees/layout';
import { hashString } from '@/ui/trees/parts';

/** The watering timeline, ms from the tap (спец 8.6). */
const T = { drops: 420, dropStep: 60, splashAt: 380, splash: 360, mark: 420, fade: 300, check: 520, tokenAt: 600, token: 500, land: 1100, grow: 420 };
/** Without animations the marks and texts just cross-fade. */
const STILL = 120;
/** The sun stands this far lower than on the main screen: under "back", left of the counter. */
const SUN_DROP = 64;
/** While the screen is open the friend's half is fetched this often, ms (the app's own refresh is once a minute). */
const POLL = 25_000;
/** The soil reaches this far below the tree's feet, px. */
const BELOW = 30;
/** Room left for the crown above the header's bottom when it sways, px. */
const ABOVE = 40;

export default function Together() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { account, shared } = useFriends();
  const s = shared.find((x) => x.id === id) ?? null;
  if (!account || !s) return <Gone signedOut={!account} />;
  return <SharedScreen key={s.id} s={s} me={account.nick} />;
}

/** No such tree (left, or never seen on this phone), or signed out. */
function Gone({ signedOut }: { signedOut: boolean }) {
  const { t, palette } = useStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <Backdrop palette={palette} groundY={null} />
      <TopBar insets={insets.top} onBack={back} />
      <View style={styles.gone}>
        <Glyph name="friends" size={48} />
        <Txt variant="title3" style={styles.center}>{signedOut ? t('tgSignIn') : t('tgGone')}</Txt>
        <Button size="m" variant="secondary" title={t('back')} onPress={back} style={{ alignSelf: 'stretch' }} />
      </View>
      <View style={{ height: insets.bottom + 40, backgroundColor: c.page }} />
    </View>
  );
}

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

function SharedScreen({ s, me }: { s: SharedTree; me: string }) {
  const store = useStore();
  const { t, today, palette, night, settings, profile } = store;
  const friends = useFriends();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const reduced = useReducedMotion();
  const animations = settings.animations && !reduced;
  // Under another screen the scene's clock stops.
  const focused = useIsFocused();
  const wind = useWind(animations && focused);
  const still = useSharedValue(0);
  const friend: Person | null = partnerOf(s, me);
  const phase = sharedPhase(s, me, today);
  // A stopped tree is shown as it was on the day it ended.
  const tree = memoryHabit(s, today).current;
  const growing = s.status === 'active' && !isDead(tree);
  const data = s.status === 'active' ? todayOf(s, me, today) : { mine: false, theirs: false };
  const both = data.mine && data.theirs;

  // Fresh data when the screen comes up, then every 25 s while it is in front.
  const refresh = friends.refresh;
  useFocusEffect(
    useCallback(() => {
      refresh();
      const id = setInterval(() => AppState.currentState === 'active' && refresh(), POLL);
      return () => clearInterval(id);
    }, [refresh]),
  );

  // ---- What the screen shows lags the data by the animation (спец 8.6) ----
  const [shown, setShown] = useState(data);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  // Today's "+1" has landed: until then the counter, the tree and today's column keep the old look.
  const [landedOn, setLandedOn] = useState<string | null>(() => (both ? today : null));
  const hold = both && landedOn !== today;
  const shownTree: Tree = hold ? { ...tree, checkins: tree.checkins.filter((d) => d !== today) } : tree;
  // How thirsty the tree looks: its colors ease to the new look (the leaves' droop follows `shown`).
  const dry = useSharedValue(thirstOf(data.mine, data.theirs));
  // The tree grows from yesterday's size when the "+1" lands.
  const grow = useSharedValue(1);
  const [token, setToken] = useState<{ id: number; from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const drops = useSharedValue(-1);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // ---- The scene: laid out for the header's bottom and the sheet's top ----
  const root = useRef<ComponentRef<typeof View>>(null);
  const [width, setWidth] = useState(0);
  const [headerBottom, setHeaderBottom] = useState<number | null>(null);
  const [sheetTop, setSheetTop] = useState<number | null>(null);
  const onRoot = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    // Under another screen a browser squeezes this one to 0×0: keep the scene as it was.
    if (w >= 1) setWidth(w);
  };
  const onHeader = (e: LayoutChangeEvent) => setHeaderBottom(Math.round(e.nativeEvent.layout.y + e.nativeEvent.layout.height));
  const onStage = (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    if (height > 0) setSheetTop(Math.round(y + height));
  };
  const geo = useMemo(
    () => (width > 0 && headerBottom !== null && sheetTop !== null ? sceneGeo(width, sheetTop, insets.top + SUN_DROP, headerBottom) : null),
    [width, headerBottom, sheetTop, insets.top],
  );
  const k = geo ? sharedK(geo, shownTree) : 0;
  const days = growthDays(shownTree);
  const size = drawnSize(shownTree.skin, days, isDead(shownTree), k);

  const flyToken = () => {
    if (!geo) return;
    const from = { x: geo.width / 2, y: geo.feetY - 0.6 * size.h };
    Promise.all([
      measureRing(),
      new Promise<{ x: number; y: number } | null>((resolve) => {
        if (!root.current) return resolve(null);
        root.current.measureInWindow((x, y) => resolve({ x, y }));
      }),
    ]).then(([ring, origin]) => {
      if (!ring || !origin) return;
      setToken({ id: Date.now(), from, to: { x: ring.x - origin.x, y: ring.y - origin.y } });
    });
  };
  // The "+1" landed: the counter turns, the tree grows from yesterday's size.
  const land = () => {
    setLandedOn(today);
    setToken(null);
    cue('grow');
    const before = treeZoom(tree.skin, Math.max(0, growthDays(tree) - 1), false);
    const after = treeZoom(tree.skin, growthDays(tree), false);
    if (animations && after > 0 && before !== after) {
      grow.set(before / after);
      grow.set(withTiming(1, { duration: T.grow, easing: Easing.out(Easing.cubic) }));
    }
  };

  useEffect(() => {
    const was = shownRef.current;
    const now = data;
    if (was.mine === now.mine && was.theirs === now.theirs) return;
    const change = wateringChange(was, now);
    const look = (ms: number) => dry.set(withTiming(thirstOf(now.mine, now.theirs), { duration: ms }));
    // A new day took the halves away (the screen was open at midnight): shown at once, no show.
    if (change.reset) {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setToken(null);
      setShown(now);
      look(animations ? T.fade : STILL);
      return;
    }
    if (!animations) {
      setShown(now);
      look(STILL);
      if (change.theyDid) cue('incoming');
      if (change.both) {
        setLandedOn(today);
        cue('grow');
      }
      return;
    }
    // The friend's half: at once, with its own sound.
    if (change.theyDid && !change.iDid) {
      cue('incoming');
      setShown(now);
      look(T.fade);
    }
    // My half: drops, a splash, then the mark and the tree.
    const start = change.iDid ? T.mark : 0;
    if (change.iDid) {
      drops.set(0);
      drops.set(withTiming(T.splashAt + T.splash, { duration: T.splashAt + T.splash, easing: Easing.linear }));
      later(T.mark, () => {
        setShown(now);
        look(T.fade);
      });
    }
    if (change.both) {
      // The "+" turns to a check (the halves show both), the "+1" flies, the counter turns.
      const lag = start - T.mark;
      later(T.check + lag, () => setShown(now));
      later(T.tokenAt + lag, flyToken);
      later(T.land + lag, land);
    }
    // Only when the data says something new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.mine, data.theirs]);

  // ---- My watering hour (OYUUR-33 6): each of us has our own, kept on this phone ----
  const half = store.sharedHalf(s);
  const wait = growing && !data.mine ? waitLine(half, today, store.clock, true) : null;
  const myWait = wait !== null && wait.kind !== 'late';
  // Before my hour the tree is calm; when the hour comes it eases into thirst (OYUUR-34, спец 5.1).
  const firstWait = useRef(true);
  useEffect(() => {
    dry.set(withTiming(thirstOf(shown.mine, shown.theirs, myWait), { duration: firstWait.current || !animations ? 0 : 600 }));
    firstWait.current = false;
  }, [myWait]); // eslint-disable-line react-hooks/exhaustive-deps
  const minutesToOpen = useMinutesToOpen();
  const [early, setEarly] = useState({ pulse: 0, text: '' });
  const tooEarly = () => {
    cue('already');
    setEarly((e) => ({ pulse: e.pulse + 1, text: earlyText(minutesToOpen(half), t) }));
    earlyTap.emit({ treeId: sharedTreeId(s.id) });
  };
  const [timeOpen, setTimeOpen] = useState(false);
  // "You can water it from 18:00 ⌄" on this screen opens this screen's sheet (the main one is under it).
  const myId = sharedTreeId(s.id);
  useChannel(
    askTime,
    useCallback((e: { treeId: string }) => {
      if (e.treeId === myId) setTimeOpen(true);
    }, [myId]),
  );
  const onPickHour = (hour: OpenHour) => {
    // Nothing changed: the sheet just goes, no note.
    if (hour === sheetHours(half, today).hour) return;
    const note = changeNote({ plantedOn: half.plantedOn, openHours: setMyHour(half, hour, today) }, today);
    store.setSharedHour(s, hour);
    cue('select');
    showQuestHint(t(note.kind === 'saved' ? 'wtSaved' : 'wtKept', { when: fromText(note.hour, t) }));
  };

  const water = () => {
    if (!growing || data.mine) {
      if (data.mine) cue('already');
      return;
    }
    // Before my hour: a hint, not a watering — nothing plays, nothing goes to the server.
    if (!store.canWaterSharedNow(s)) {
      tooEarly();
      return;
    }
    if (friends.waterShared(s.id) === 'early') {
      tooEarly();
      return;
    }
    cue('water');
  };

  // ---- "⋯": leave the shared tree ----
  const [menu, setMenu] = useState(false);
  const leave = async () => {
    setMenu(false);
    const yes = await confirmDialog({ title: t('tgLeaveTitle'), message: t('tgLeaveText'), confirmLabel: t('tgLeaveButton'), cancelLabel: t('cancel'), tone: 'danger' });
    if (!yes) return;
    try {
      await friends.endShared(s.id);
      cue('delete');
      back();
    } catch {
      cue('error');
      showQuestHint(t('tgNeedInternet'));
    }
  };
  const [proposing, setProposing] = useState<ProposeInitial | null>(null);
  const plantAgain = async () => {
    try {
      await friends.endShared(s.id);
    } catch {
      cue('error');
      showQuestHint(t('tgNeedInternet'));
      return;
    }
    setProposing({ name: s.name, kind: s.kind, skin: s.skin });
  };

  // A short phone (568): smaller halves, days and button, so the tree keeps its room.
  const compact = screenH < 700;
  const sizeBtn = compact ? 'm' : 'l';

  const friendName = nameOf(friend) || t('tgFriendGone');
  const friendIn = nameIn(friend, t.lang) || t('tgFriendGone');
  const cheered = !!friends.lists.friends.find((f) => f.nick === friend?.nick)?.cheeredToday;
  const queued = friends.isWaiting({ kind: 'water', treeId: s.id, day: today });

  // ---- The rule line and the big button by state ----
  let rule = t('tgRule');
  if (phase === 'dead') rule = t('tgDiedOn', { n: growthDays(tree) + tree.frozen.length + 1 });
  else if (s.status === 'ended') rule = t('tgEnded');
  else if (shown.mine && shown.theirs) rule = t('tgBothGrew');
  else if (shown.theirs) rule = t('tgFriendFirst', { name: friendName });
  let button: ReactNode;
  if (phase === 'dead') button = <Button size={sizeBtn} glyph="seed" variant="secondary" title={t('tgPlantTogether')} onPress={plantAgain} />;
  else if (s.status === 'ended') button = <Button size={sizeBtn} variant="done" glyph="friends" title={t('tgTogetherDays', { days: daysText(t, growthDays(tree)) })} onPress={() => {}} />;
  else if (shown.mine && shown.theirs) button = <Button size={sizeBtn} variant="done" glyph="check" title={t('tgBothDone')} onPress={() => {}} />;
  else if (shown.mine) button = <Button size={sizeBtn} variant="done" glyph="check" title={t('tgHalfDone')} onPress={() => {}} />;
  else if (wait && wait.kind !== 'late') {
    // "Water from 18:00" (under an hour to go too): the tap gives the "Too early" hint (OYUUR-33 5.3).
    button = <Button size={sizeBtn} variant="secondary" icon="clock" title={t('wtWaterFrom', { time: hourText(wateringOpensAt(half, today), t.lang) })} onPress={water} cue={null} testID="water-half" />;
  } else button = <Button size={sizeBtn} glyph="drop" title={t('tgWaterHalf')} onPress={water} cue={null} testID="water-half" />;

  const hit = { w: Math.max(size.w, 96), h: size.h + 24 };

  return (
    <View ref={root} style={[styles.screen, { backgroundColor: palette.skyTop }]} onLayout={onRoot}>
      {geo && (
        <>
          <Sky geo={geo} night={night} animations={animations} cameraX={still} wind={wind} />
          <Meadow geo={geo} night={night} animations={animations} cameraX={still} wind={wind} />
          <SharedTreeArt tree={shownTree} geo={geo} night={night} dry={dry} droop={thirstOf(shown.mine, shown.theirs, myWait)} grow={grow} wind={wind} animations={animations} memory={s.status !== 'active'} />
          {animations && <WaterFx progress={drops} x={geo.width / 2} feetY={geo.feetY} />}
        </>
      )}
      <TopBar insets={insets.top} onBack={back} onMore={s.status === 'active' ? () => setMenu((m) => !m) : undefined} />

      <View onLayout={onHeader} pointerEvents="box-none">
        <TreeHeader
          // A memory keeps its rings: nobody locked it in, so no plaque in place of the counter.
          tree={s.status === 'active' ? shownTree : { ...shownTree, completedOn: null }}
          position={1}
          total={1}
          line2={
            <View style={styles.with}>
              <PairAvatar me={profile} friend={friend} size={28} both={shown.mine && shown.theirs} />
              <Txt numberOfLines={1} style={[styles.withText, { color: c.textSoft }]}>{t('tgYouAnd', { name: friendName })}</Txt>
            </View>
          }
        />
      </View>

      <View style={styles.stage} onLayout={onStage} pointerEvents="box-none" />
      {geo && growing && (
        <Pressable
          onPress={water}
          accessibilityRole="button"
          accessibilityLabel={shown.mine ? t('tgHalfDone') : t('tgWaterHalf')}
          style={[styles.hit, { left: geo.width / 2 - hit.w / 2, top: geo.feetY - hit.h + 8, width: hit.w, height: hit.h }]}
        />
      )}

      <SheetSurface style={[styles.sheet, compact && styles.sheetCompact, { paddingBottom: insets.bottom + (compact ? 8 : 12) }]}>
        <View style={styles.grabber}>
          <Grabber />
        </View>
        <View style={styles.halves}>
          <Half
            avatar={profile}
            name={t('tgYou')}
            done={shown.mine}
            state={
              !growing
                ? ''
                : shown.mine
                  ? t('tgWateredToday')
                  : myWait
                    // "Waits for the evening": the time itself is said once, in the line below.
                    ? waitWord(wateringOpensAt(half, today), t)
                    : t('tgYourTurn')
            }
            mine
            waiting={myWait}
            idle={!growing}
            animations={animations}
            compact={compact}
          />
          <Half
            avatar={friend}
            name={friendName}
            done={shown.theirs}
            // Neutral: the friend's own watering hour is not known on this phone (OYUUR-33 6).
            state={!growing ? '' : shown.theirs ? t('tgFriendWatered') : t('wbTgFriendNotYet')}
            mine={false}
            idle={!growing}
            animations={animations}
            compact={compact}
            cheer={
              growing && !shown.theirs && friend
                ? {
                    sent: cheered,
                    label: t('tgCheerA11y', { name: friendIn }),
                    onPress: () => {
                      if (cheered) return;
                      cue('cheer');
                      friends.cheer(friend.nick);
                    },
                  }
                : undefined
            }
          />
          {growing && <Joint both={shown.mine && shown.theirs} animations={animations} />}
        </View>
        <View style={styles.rule}>
          {wait && wait.kind !== 'late' ? (
            // My half before my hour: "You can water it from 18:00 ⌄" — a tap changes my time.
            <View style={styles.ruleWait}>
              <WaitTitle treeId={sharedTreeId(s.id)} line={wait} animations={animations} />
            </View>
          ) : (
            <>
              <Icon name="info" size={16} color={c.textSoft} />
              <Txt numberOfLines={2} style={[styles.ruleText, { color: c.textSoft }]}>{rule}</Txt>
            </>
          )}
          <View style={styles.hearts} accessibilityLabel={`${t('chances')}: ${tree.chancesLeft}`}>
            {Array.from({ length: MAX_CHANCES }, (_, i) => (
              <Glyph key={i} name={i < tree.chancesLeft ? 'heart' : 'heartEmpty'} size={15} />
            ))}
          </View>
        </View>
        <PairDays s={s} me={me} holdToday={hold} compact={compact} />
        <View style={styles.button}>{button}</View>
        {queued && <Txt variant="small" color={c.textSoft} style={styles.center}>{t('tgQueued')}</Txt>}
      </SheetSurface>

      {token && <Token key={token.id} from={token.from} to={token.to} />}
      {geo && (
        <EarlyChip
          pulse={early.pulse}
          text={early.text}
          top={Math.max(-size.h - 48, geo.headerBottom + 8 - geo.feetY)}
          geo={geo}
          depth={still}
          onChange={() => setTimeOpen(true)}
        />
      )}
      <WateringTimeSheet
        visible={timeOpen}
        mode="change"
        kind={s.kind}
        {...sheetHours(half, today)}
        onPick={onPickHour}
        onClose={() => setTimeOpen(false)}
      />

      {menu && <MoreMenu top={insets.top + 8 + 44 + 6} animations={animations} onLeave={leave} onClose={() => setMenu(false)} />}
      {proposing && friend && <ProposeSheet friend={friend} initial={proposing} onClosed={() => setProposing(null)} onSent={back} />}
    </View>
  );
}

/** "Back", the "Shared tree" pill and "⋯" (спец 8.5, 2). */
function TopBar({ insets, onBack, onMore }: { insets: number; onBack(): void; onMore?: () => void }) {
  const { t, night } = useStore();
  const c = useColors();
  return (
    <View style={[styles.topBar, { paddingTop: insets + 8 }]} pointerEvents="box-none">
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('back')} style={[styles.round, elevation(1, night), { backgroundColor: c.glass }]}>
        <Icon name="chevronLeft" size={24} color={c.text} />
      </Pressable>
      <View style={[styles.tag, elevation(1, night), { backgroundColor: c.glass }]}>
        <Glyph name="friends" size={18} />
        <Txt numberOfLines={1} style={[styles.tagText, { color: c.text }]}>{t('tgOpenShared')}</Txt>
      </View>
      {onMore ? (
        <Pressable onPress={onMore} accessibilityRole="button" accessibilityLabel={t('more')} style={[styles.round, elevation(1, night), { backgroundColor: c.glass }]}>
          <Icon name="more" size={22} color={c.text} />
        </Pressable>
      ) : (
        <View style={styles.roundSpace} />
      )}
    </View>
  );
}

/**
 * "⋯" → "Leave shared tree": a small card right under the button, growing from its corner
 * (the `pop` spring; without animations it fades in), over a light shade; a tap outside closes.
 */
function MoreMenu({ top, animations, onLeave, onClose }: { top: number; animations: boolean; onLeave(): void; onClose(): void }) {
  const { t, night } = useStore();
  const c = useColors();
  const shown = useSharedValue(0);
  const scale = useSharedValue(animations ? 0.92 : 1);
  useEffect(() => {
    shown.set(withTiming(1, { duration: animations ? motion.fast : STILL }));
    if (animations) scale.set(withTiming(1, { duration: motion.fast, easing: Easing.out(Easing.back(1.6)) }));
  }, [shown, scale, animations]);
  const menuStyle = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ scale: scale.get() }] }));
  const shadeStyle = useAnimatedStyle(() => ({ opacity: shown.get() }));
  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(night ? '#06061A' : '#241808', night ? 0.3 : 0.12) }, shadeStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('close')} />
      </Animated.View>
      <Animated.View accessibilityRole="menu" style={[styles.menu, elevation(3, night), { top, backgroundColor: c.card, transformOrigin: 'top right' }, menuStyle]}>
        <Pressable onPress={onLeave} accessibilityRole="menuitem" style={({ pressed }) => [styles.menuRow, pressed && { backgroundColor: c.divider }]}>
          <Icon name="userMinus" size={20} color={c.dangerText} />
          <Txt numberOfLines={1} style={[styles.menuText, { color: c.dangerText }]}>{t('tgLeave')}</Txt>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/**
 * Screen px per drawing unit: the main screen's (as wide as allowed), unless this tree would
 * then reach up on the header — the sheet here is taller, so a big tree gets smaller (treeK
 * keeps room for the biggest tree, which would make every young one small here).
 */
function sharedK(geo: SceneGeo, tree: Tree): number {
  const wide = treeK({ ...geo, headerBottom: -Infinity });
  const h = drawnSize(tree.skin, growthDays(tree), isDead(tree), 1).h;
  return h > 0 ? Math.min(wide, (geo.feetY - geo.headerBottom - 12) / h) : wide;
}

/** Wind sway by stage, degrees at a calm gust (as the main screen's live tree). */
const SWAY: Record<ReturnType<typeof lookOf>, number> = { sprout: 1.4, seedling: 1.3, bush: 1.1, young: 1, tree: 0.8, grand: 0.65, deadSmall: 1, dead: 1 };

/**
 * The tree on the meadow at the main screen's size, its feet where the main screen's stand
 * (just above the sheet), on its planting hole: dry while thirsty, wet once watered. One
 * canvas. The colors ease to the new thirst; it sways in the scene's wind.
 */
function SharedTreeArt({ tree, geo, night, dry, droop, grow, wind, animations, memory }: {
  tree: Tree;
  geo: SceneGeo;
  night: boolean;
  /** 1 nobody watered, 0.5 one of us, 0 both: the colors. */
  dry: SharedValue<number>;
  /** The same, for the leaves' droop (not animated). */
  droop: number;
  /** Scale from the feet while it grows, 1 at rest. */
  grow: SharedValue<number>;
  wind: Wind;
  animations: boolean;
  /** A stopped tree: plain soil, still leaves. */
  memory: boolean;
}) {
  // The meadow's own earth under the tree, as on the main screen.
  const { palette } = useMeadow();
  const k = sharedK(geo, tree);
  const days = growthDays(tree);
  const dead = isDead(tree);
  const size = drawnSize(tree.skin, days, dead, k);
  const colors = liveColors(night);
  const look = lookOf(days, dead);
  const period = look === 'sprout' || look === 'seedling' ? 2.4 : 3.2;
  const phase = ((hashString(tree.id) % 1000) / 1000) * Math.PI * 2;
  const sway = SWAY[look] * (dead ? 0.25 : 1);
  const top = Math.max(0, geo.headerBottom - ABOVE);
  const height = geo.feetY + BELOW - top;

  const nightness = useSharedValue(night ? 1 : 0);
  useEffect(() => {
    nightness.set(animations ? withTiming(night ? 1 : 0, { duration: 900, easing: Easing.inOut(Easing.cubic) }) : night ? 1 : 0);
  }, [night, animations, nightness]);
  const matrix = useDerivedValue(() => treeMatrix(dead || memory ? 0 : dry.get(), 0, 0, 0, NO_HAZE, nightness.get()), [dead, memory]);
  // The hole: dry and cracked while thirsty, wet as the water soaks in (the reduced timeline's frames).
  const soil = useDerivedValue(() => {
    const d = dry.get();
    return frameAt(d >= 1 ? -1 : (1 - d) * REDUCED.fade, false, true);
  });
  const pose = useDerivedValue(() => {
    const p = animations ? Math.sin((2 * Math.PI * wind.t.get()) / period + phase) : 0;
    const gust = animations ? wind.gust.get() : 0;
    const deg = (0.5 + 1.6 * gust) * sway * p + (dead ? 0 : 1.2 * gust);
    return [{ skewX: (-deg * Math.PI) / 180 }, { scale: grow.get() }];
  }, [animations, period, phase, sway, dead]);

  return (
    <View style={[StyleSheet.absoluteFill, { top, height }]} pointerEvents="none">
      <Canvas style={{ width: geo.width, height }}>
        <Group transform={[{ translateX: geo.width / 2 }, { translateY: geo.feetY - top }]}>
          <Soil width={holeWidth(size.w)} frame={soil} neutral={dead || memory} colors={colors} skin={tree.skin} />
          <Group transform={pose} layer={<Paint><ColorMatrix matrix={matrix} /></Paint>}>
            <TreeBody days={days} dead={dead} palette={palette} skin={tree.skin} seed={tree.id} k={k} thirst={memory ? 0 : droop} ground={false} />
          </Group>
        </Group>
      </Canvas>
    </View>
  );
}

const NO_HAZE = [0, 0, 0];

/** Three drops falling to the roots, then a ring of splash around them (спец 8.6, 0–740 ms). */
function WaterFx({ progress, x, feetY }: { progress: SharedValue<number>; x: number; feetY: number }) {
  const c = useColors();
  const splash = useAnimatedStyle(() => {
    const ms = progress.get() - T.splashAt;
    if (progress.get() < 0 || ms < 0 || ms > T.splash) return { opacity: 0 };
    const p = 1 - Math.pow(1 - ms / T.splash, 3);
    return { opacity: 0.7 * (1 - p), transform: [{ scale: 0.6 + 0.7 * p }] };
  });
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Drop progress={progress} i={0} x={x - 10} feetY={feetY} from={90} glyph={26} />
      <Drop progress={progress} i={1} x={x + 14} feetY={feetY} from={75} glyph={14} />
      <Drop progress={progress} i={2} x={x - 26} feetY={feetY} from={60} glyph={12} />
      <Animated.View style={[styles.splash, { left: x - 50, top: feetY - 17, borderColor: c.water }, splash]} />
    </View>
  );
}

/** One drop: falls `from` px onto the roots in 420 ms (in quad), 60 ms after the one before. */
function Drop({ progress, i, x, feetY, from, glyph }: { progress: SharedValue<number>; i: number; x: number; feetY: number; from: number; glyph: number }) {
  const style = useAnimatedStyle(() => {
    const ms = progress.get() - i * T.dropStep;
    if (progress.get() < 0 || ms < 0 || ms > T.drops) return { opacity: 0 };
    const p = ms / T.drops;
    return {
      opacity: ms > T.drops - 80 ? (T.drops - ms) / 80 : 1,
      transform: [{ translateY: -from * (1 - p * p) }, { scale: 0.8 + 0.2 * p }],
    };
  });
  return (
    <Animated.View style={[styles.drop, { left: x - glyph / 2, top: feetY - 6 - glyph }, style]}>
      <Glyph name="drop" size={glyph} />
    </Animated.View>
  );
}

/** One half of the pair: avatar with its mark, the name, the state; the friend's may have "cheer". */
function Half({ avatar, name, done, state, mine, animations, cheer, compact = false, idle = false, waiting = false }: {
  avatar: Pick<Person, 'avatar' | 'color'> | null; name: string; done: boolean; state: string; mine: boolean; animations: boolean; compact?: boolean;
  /** My half before my watering hour: gray like every other wait, a clock instead of the drop. */
  waiting?: boolean;
  /** The tree no longer grows (dead or stopped): no marks, no state. */
  idle?: boolean;
  cheer?: { sent: boolean; label: string; onPress(): void };
}) {
  const { night } = useStore();
  const c = useColors();
  const enter = animations ? ZoomIn.springify().damping(motion.spring.bounce.damping).stiffness(motion.spring.bounce.stiffness) : FadeIn.duration(STILL);
  const exit = animations ? FadeOut.duration(120) : FadeOut.duration(STILL);
  const color = done ? c.doneInk : mine && !waiting ? c.waterInk : c.textSoft;
  return (
    <View style={[styles.half, compact && styles.halfCompact, elevation(1, night), { backgroundColor: c.card }]}>
      <View style={[styles.halfAvatar, compact && styles.halfAvatarCompact]}>
        {avatar && <Avatar id={avatar.avatar as AvatarId} color={avatar.color} size={compact ? 30 : 40} />}
        {!idle && <View style={[styles.badge, { backgroundColor: c.card }]}>
          {done ? (
            <Animated.View key="done" entering={enter} exiting={exit}>
              <Glyph name="check" size={16} />
            </Animated.View>
          ) : mine && waiting ? (
            <Animated.View key="clock" exiting={exit}>
              <Icon name="clock" size={14} color={c.textSoft} strokeWidth={2.4} />
            </Animated.View>
          ) : mine ? (
            <Animated.View key="drop" exiting={exit}>
              <Glyph name="drop" size={16} />
            </Animated.View>
          ) : (
            // The friend's half not watered yet: an empty ring, no "waiting" hourglass.
            <Animated.View key="open" exiting={exit} style={[styles.openRing, { borderColor: c.textSoft }]} />
          )}
        </View>}
      </View>
      <Txt numberOfLines={1} style={[styles.halfName, { color: c.text }]}>{name}</Txt>
      <Animated.View key={state} entering={FadeIn.duration(animations ? 200 : STILL)} style={styles.halfState}>
        <Txt numberOfLines={1} style={[styles.halfStateText, { color }]}>{state}</Txt>
      </Animated.View>
      {cheer && (
        <Pressable
          onPress={cheer.onPress}
          disabled={cheer.sent}
          accessibilityRole="button"
          accessibilityLabel={cheer.label}
          accessibilityState={{ disabled: cheer.sent }}
          style={[styles.cheer, { backgroundColor: cheer.sent ? c.sunken : c.warmSoft }]}
        >
          {cheer.sent ? <Icon name="check" size={18} color={c.textSoft} /> : <Glyph name="cheer" size={22} />}
        </Pressable>
      )}
    </View>
  );
}

/** Between the halves: "+" while waiting, a check in a green ring once both watered. */
function Joint({ both, animations }: { both: boolean; animations: boolean }) {
  const c = useColors();
  const enter = animations ? ZoomIn.springify().damping(motion.spring.bounce.damping).stiffness(motion.spring.bounce.stiffness) : FadeIn.duration(STILL);
  return (
    <View style={styles.joint} pointerEvents="none">
      {both ? (
        <Animated.View key="both" entering={enter} style={[styles.jointCircle, { width: 34, height: 34, borderRadius: 17, backgroundColor: c.card, borderColor: c.accent }]}>
          <Glyph name="check" size={26} />
        </Animated.View>
      ) : (
        <Animated.View key="plus" exiting={FadeOut.duration(120)} style={[styles.jointCircle, { width: 30, height: 30, borderRadius: 15, backgroundColor: c.sunken, borderColor: c.sheet }]}>
          <Icon name="plus" size={16} color={c.textSoft} />
        </Animated.View>
      )}
    </View>
  );
}

/** The green "+1" flying from the crown to the counter (600–1100 ms). */
function Token({ from, to }: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const c = useColors();
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(1, { duration: T.token, easing: Easing.inOut(Easing.cubic) }));
  }, [p]);
  const style = useAnimatedStyle(() => {
    const v = p.get();
    // A little arc up on the way.
    const lift = -40 * Math.sin(Math.PI * v);
    return {
      opacity: v > 0.9 ? (1 - v) * 10 : 1,
      transform: [{ translateX: from.x + (to.x - from.x) * v - 18 }, { translateY: from.y + (to.y - from.y) * v + lift - 12 }, { scale: 1 - 0.3 * v }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.token, { backgroundColor: c.accent }, style]}>
      <Txt style={styles.tokenText}>+1</Txt>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { textAlign: 'center' },
  gone: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  roundSpace: { width: 44 },
  tag: { height: 32, borderRadius: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  tagText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18 },
  with: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
  withText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  stage: { flex: 1 },
  hit: { position: 'absolute' },
  drop: { position: 'absolute' },
  splash: { position: 'absolute', width: 100, height: 34, borderRadius: 50, borderWidth: 3 },
  sheet: { paddingTop: 8, gap: 10 },
  sheetCompact: { paddingTop: 4, gap: 6 },
  grabber: { marginBottom: -2 },
  halves: { flexDirection: 'row', gap: 12, paddingHorizontal: 12 },
  half: { flex: 1, height: 96, borderRadius: 18, padding: 12, justifyContent: 'flex-end' },
  halfCompact: { height: 80, paddingVertical: 8 },
  halfAvatar: { position: 'absolute', left: 12, top: 10, width: 40, height: 40 },
  halfAvatarCompact: { top: 6, width: 30, height: 30 },
  badge: { position: 'absolute', right: -6, bottom: -4, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  halfName: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20 },
  halfState: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  openRing: { width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, opacity: 0.7 },
  halfStateText: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 16, flexShrink: 1 },
  cheer: { position: 'absolute', right: 10, top: 10, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  joint: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  jointCircle: { borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, minHeight: 20 },
  ruleText: { flex: 1, fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  ruleWait: { flex: 1, minWidth: 0 },
  hearts: { flexDirection: 'row', gap: 2 },
  button: { paddingHorizontal: 16, marginTop: 4 },
  menu: { position: 'absolute', right: 16, borderRadius: 16, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 48, paddingHorizontal: 16 },
  menuText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  token: { position: 'absolute', left: 0, top: 0, height: 24, paddingHorizontal: 8, borderRadius: 12, borderWidth: 2, borderColor: '#FFFFFF', justifyContent: 'center' },
  tokenText: { fontFamily: fonts.black, fontSize: 14, lineHeight: 18, color: '#FFFFFF' },
});
