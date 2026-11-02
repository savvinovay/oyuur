import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  AchievementId,
  achievementViews,
  AchievementView,
  claimAchievement as claimAchievementRule,
  Claimed,
  Facts,
  Stats,
  statsOf,
} from '@/game/achievements';
import { addDays, DayKey, gameClock, GameClock, gameDay } from '@/game/dates';
import {
  achievementKey,
  addReward,
  bonusKey,
  buy,
  BuyResult,
  chooseMeadow,
  ItemId,
  Ledger,
  MeadowId,
  newShop,
  ownedSkins,
  pruneLedger,
  questKey,
  seeAffordable,
  Shop,
  shopNews as shopNewsRule,
  Wallet,
  walletOf,
  sharedWateringReward,
  migrateStageCount,
  newStageCount,
  owedStageRewards,
  StageCount,
  wateringReward,
} from '@/game/economy';
import { Hlc, hlcMax, hlcNext } from '@/game/merge';
import { finalName, withAsk, withLater, withName } from '@/game/naming';
import { Cell, emptyPlot, markShown, moveTo, Plot, PlotHabit, syncPlot } from '@/game/plot';
import { newProfile, Profile, withProfile } from '@/game/profile';
import { canWaterHalf, myHalf, setMyHour, SharedTree } from '@/game/shared';
import { ALL_QUESTS_BONUS, claimQuest as claimQuestRule, newQuests, QuestContext, questDone, QuestId, Quests, rollQuests } from '@/game/quests';
import {
  canWaterAt,
  checkedInToday,
  checkIn,
  CheckInResult,
  complete,
  groupHabits,
  growthDays,
  Habit,
  HabitKind,
  isGrowing,
  OpenHour,
  OpenHourEntry,
  openHourOn,
  plantFromSeed,
  plantTree,
  seedUsed,
  setOpenHour,
  settle,
  Skin,
  Tree,
  TreeStamps,
  Visibility,
} from '@/game/tree';
import { deviceLang, LangSetting, makeT, T } from '@/i18n';
import { analytics, settleEvents, startAnalytics } from '@/net/analytics';
import { dark, isNightHour, light, Palette } from '@/ui/theme';
import { uses24 } from '@/ui/watering/format';
import { buildSnapshot } from '@/widget/snapshot';
import { syncWidgets } from '@/widget/sync';
import { acornsEarned, EarnSource } from './acorns';
import { saveBackup, STORAGE_KEY, sweepCopies } from './backup';
import { loadDeviceId } from './device';
import { EveningOffer, migrateSave } from './migrate';
import { emptyForest, Forest, hiddenTreeIds, latestStamp, mergeRemote as mergeRemoteRule, Remote } from './records';

export type ThemeSetting = 'auto' | 'light' | 'dark';

export interface Settings {
  theme: ThemeSetting;
  animations: boolean;
  vibration: boolean;
  sounds: boolean;
  /** The "pull up for the menu" hint was shown once. */
  menuHintSeen: boolean;
  language: LangSetting;
  /** Developer time travel, in days added to the real date. */
  dayOffset: number;
  /** Developer time travel within the day, in minutes added to the real clock (OYUUR-34). */
  minuteOffset: number;
  /** Android widgets: hidden trees are signed with the habit, not the tree's name (OYUUR-39, спец 6). Off by default. */
  widgetNames: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'auto',
  animations: true,
  vibration: true,
  sounds: true,
  menuHintSeen: false,
  language: 'auto',
  dayOffset: 0,
  minuteOffset: 0,
  widgetNames: false,
};

interface SavedData {
  /**
   * 1: first version. 2: generations, monthly refill, lock-in. 3: places on the forest plot.
   * 4: acorns, the shop, quests, achievements, the profile.
   * 5: watering time (trees' `openHours`, my hours of shared trees, the one-time evening offer).
   * 6: the forest in the account (OYUUR-30): trees' `stamps`, the acorn journal, places' `at`,
   *    deleted habits, the hybrid clock.
   */
  version: 6;
  trees: Tree[];
  settings: Settings;
  plot: Plot;
  /** Version 5 and older: `{acorns, earned, …}` — moved into the journal on load (economy.ts). */
  /** `stages`: this phone's count of stage rewards paid today (OYUUR-43, economy.ts); older saves have none. */
  wallet: { ledger: Ledger; stages?: StageCount };
  shop: Shop;
  quests: Quests;
  achievements: Claimed;
  /** Achievements the toast already told about. */
  announced: AchievementId[];
  profile: Profile;
  /** "Mark it in the evening?" for old "Quit" trees: 'pending' — not shown yet, 'done' — shown or not needed. */
  eveningOffer: EveningOffer;
  /** My watering hours of shared trees, by shared tree id (each of the two has their own). */
  sharedHours: Record<string, OpenHourEntry[]>;
  /** The day this phone moved to version 5: shared trees planted by then stay "any time" (null — a new player). */
  oldSharedUntil: DayKey | null;
  /** Deleted open habits (lineageId → when): they go on every phone (merge.ts). */
  tombs: Record<string, Hlc>;
  /** Deleted hidden habits: kept on the phone only (the chest's in OYUUR-31). */
  hiddenTombs: Record<string, Hlc>;
  /** The latest time of the hybrid clock this phone has seen (merge.ts). */
  hlc: Hlc;
}

/** The phone's clock, shifted by the developer time travel within the day. */
export const clockNow = (minuteOffset: number) => new Date(Date.now() + minuteOffset * 60_000);

const plotHabits = (habits: Habit[]): PlotHabit[] =>
  habits.map((h) => ({ lineageId: h.lineageId, days: growthDays(h.current) }));

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

interface Store {
  ready: boolean;
  trees: Tree[];
  /** Trees grouped by habit; each habit is one place in the forest. */
  habits: Habit[];
  settings: Settings;
  today: DayKey;
  night: boolean;
  palette: Palette;
  t: T;
  /** The time of the game day now (0:00–2:59 at night are 24..26), refreshed at each new minute. */
  clock: GameClock;
  plant(input: { name: string; kind: HabitKind; visibility: Visibility; skin: Skin; openHour?: OpenHour }): string;
  tapTree(id: string): CheckInResult;
  plantSeed(deadId: string): string | null;
  lockIn(id: string): void;
  /** A new watering hour for a growing tree, from tomorrow. */
  setTreeHour(id: string, hour: OpenHour): void;
  /** The tree can be watered right now (the clock is read fresh). */
  canWaterNow(tree: Tree): boolean;
  /** Show "Mark it in the evening?": some old "Quit" tree is still "any time" and it was not shown yet. */
  eveningOffer: boolean;
  /** The answer: these trees get 18:00 from tomorrow (empty: "Leave as it is"). Never asked again. */
  answerEveningOffer(ids: string[]): void;
  /** My half of a shared tree for the watering-time rules. */
  sharedHalf(s: SharedTree): ReturnType<typeof myHalf>;
  /** My half of the shared tree can be watered right now. */
  canWaterSharedNow(s: SharedTree): boolean;
  /** A new hour for my half of a shared tree, from tomorrow. */
  setSharedHour(s: SharedTree, hour: OpenHour): void;
  /** Removes a habit with all its generations. */
  deleteHabit(lineageId: string): void;
  /** Gives, changes (or with null removes) the tree's own name. */
  nameTree(id: string, nickname: string | null): void;
  /** The tree asked for a name today (the bubble is up). */
  askName(id: string): void;
  /** "Later": no bubble for the rest of today. */
  nameLater(id: string): void;
  updateSettings(patch: Partial<Settings>): void;
  resetAll(): void;
  /** Where every habit stands in the forest. A habit planted a moment ago may have no place for one render. */
  plot: Plot;
  /** Saves a new place at once. Returns the habit it swapped with, if any. */
  moveTree(lineageId: string, to: Cell): { swapped: string | null };
  /** The forest screen was shown: every habit is seen, the plot size is shown. */
  forestShown(): void;

  // ---- Wave 5: acorns, the shop, quests, achievements, the profile ----
  wallet: Wallet;
  shop: Shop;
  /** Kinds of trees the player owns (can plant or switch to). */
  skins: Skin[];
  buyItem(id: ItemId): BuyResult;
  /** Something new is affordable and the player hasn't seen it in the shop (the shop's dot). */
  shopNews: boolean;
  /** The shop was opened: what is affordable now is seen. */
  shopSeen(): void;
  /** Puts an owned meadow on. */
  setMeadow(id: MeadowId): void;
  /** Gives a growing tree another owned kind. Returns false if it can't. */
  setTreeSkin(id: string, skin: Skin): boolean;
  /** Today's quests (rolled for today once the data is loaded). */
  quests: Quests;
  /** Something a quest asks for happened (counts only if it is one of today's). */
  questEvent(id: QuestId): void;
  /** "Claim": returns the acorns paid (0 — nothing to claim). */
  claimQuest(id: QuestId): number;
  achievements: AchievementView[];
  claimAchievement(id: AchievementId): number;
  /** Achievements the "new achievement" toast already told about (kept across restarts). */
  announced: AchievementId[];
  markAnnounced(ids: AchievementId[]): void;
  profile: Profile;
  updateProfile(patch: Partial<Profile>): void;
  stats: Stats;
  /** Friends now (the friends state tells, once it knows). */
  friendsCount: number;
  /** The friends state tells how many friends and growing shared trees there are (for quests and achievements). */
  setSocial(s: { friends: number; shared: number }): void;
  /** Who sees a habit: every generation of it gets the mark. */
  setVisibility(lineageId: string, visibility: Visibility): void;
  /** My half of a shared tree was watered today: acorns as for a tree (within the daily limit). */
  paySharedWatering(treeId: string): void;

  /** For the sync with the account (sync.tsx, OYUUR-30); screens don't use it. */
  forest: StoreForest;
}

/** What the sync engine needs from the store. Reads and writes are synchronous (refs). */
export interface StoreForest {
  /** This phone's id ('' until the store is ready). */
  deviceId: string;
  /** Grows when the forest is replaced or reset on this phone: the sync then reads the account whole again. */
  gen: number;
  /** The forest right now (not the last render). */
  exportForest(): Forest;
  /** Merges what came from the account into the forest now. `revived` — days of late waterings that brought a dead tree back. */
  mergeRemote(remote: Remote): { revived: DayKey[] };
  /** Puts another forest in place of this one (settings and the profile stay). */
  replaceForest(forest: Forest): void;
  /**
   * 'signOut' — "Sign out and remove the forest": the first-start state without the first-start
   * hints; 'wiped' — the account was erased on another phone: the forest goes, settings and profile stay.
   */
  resetForest(mode: 'signOut' | 'wiped'): void;
  /** Keeps a copy of the saved data for 30 days (backup.ts). */
  backup(reason: string, overwrite: boolean): Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  // If stored data can't be read, never write over it: the user's forest may still be there.
  const [canSave, setCanSave] = useState(false);
  const [trees, setTreesState] = useState<Tree[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [now, setNow] = useState(() => new Date());
  // Mirror of the latest plot, so a move can report the swap at once.
  const [plot, setPlotState] = useState<Plot>(emptyPlot);
  const plotRef = useRef(plot);
  const setPlot = useCallback((update: (prev: Plot) => Plot) => {
    const next = update(plotRef.current);
    if (next === plotRef.current) return;
    plotRef.current = next;
    setPlotState(next);
  }, []);

  // Mirror of the latest trees, so taps read fresh data even before a re-render.
  const treesRef = useRef<Tree[]>([]);
  const setTrees = useCallback((update: (prev: Tree[]) => Tree[]) => {
    const next = update(treesRef.current);
    if (next === treesRef.current) return;
    treesRef.current = next;
    setTreesState(next);
  }, []);
  // The acorn journal changes from taps that may come several in a frame: kept in a ref like the trees.
  const [ledger, setLedgerState] = useState<Ledger>({});
  const ledgerRef = useRef(ledger);
  const setLedger = useCallback((update: (prev: Ledger) => Ledger) => {
    const next = update(ledgerRef.current);
    if (next === ledgerRef.current) return;
    ledgerRef.current = next;
    setLedgerState(next);
  }, []);
  // Changes only with the journal, so it is saved with it.
  const stageCountRef = useRef<StageCount>(newStageCount(gameDay(clockNow(0))));
  // Deleted habits, open and hidden (OYUUR-30).
  const [tombs, setTombsState] = useState<Record<string, Hlc>>({});
  const tombsRef = useRef(tombs);
  const [hiddenTombs, setHiddenTombsState] = useState<Record<string, Hlc>>({});
  const hiddenTombsRef = useRef(hiddenTombs);
  const setTombs = useCallback((open: Record<string, Hlc>, hidden: Record<string, Hlc>) => {
    if (open !== tombsRef.current) {
      tombsRef.current = open;
      setTombsState(open);
    }
    if (hidden !== hiddenTombsRef.current) {
      hiddenTombsRef.current = hidden;
      setHiddenTombsState(hidden);
    }
  }, []);
  // The hybrid clock and this phone's id: every stamp of a change comes from here.
  const hlcRef = useRef<Hlc>('');
  const deviceIdRef = useRef('');
  const stamp = useCallback(() => (hlcRef.current = hlcNext(hlcRef.current, Date.now(), deviceIdRef.current)), []);
  const [gen, setGen] = useState(0);
  const [shop, setShopState] = useState<Shop>(newShop);
  const shopRef = useRef(shop);
  const setShop = useCallback((update: (prev: Shop) => Shop) => {
    const next = update(shopRef.current);
    if (next === shopRef.current) return;
    shopRef.current = next;
    setShopState(next);
  }, []);
  const [quests, setQuestsState] = useState<Quests>(newQuests);
  const questsRef = useRef(quests);
  const setQuests = useCallback((update: (prev: Quests) => Quests) => {
    const next = update(questsRef.current);
    if (next === questsRef.current) return;
    questsRef.current = next;
    setQuestsState(next);
  }, []);
  const [claimed, setClaimedState] = useState<Claimed>({});
  const claimedRef = useRef(claimed);
  const setClaimed = useCallback((next: Claimed) => {
    claimedRef.current = next;
    setClaimedState(next);
  }, []);
  const [announced, setAnnouncedState] = useState<AchievementId[]>([]);
  const announcedRef = useRef(announced);
  const setAnnounced = useCallback((update: AchievementId[] | ((prev: AchievementId[]) => AchievementId[])) => {
    const next = typeof update === 'function' ? update(announcedRef.current) : update;
    if (next === announcedRef.current) return;
    announcedRef.current = next;
    setAnnouncedState(next);
  }, []);
  const [profile, setProfile] = useState<Profile>(newProfile);
  const [eveningState, setEveningState] = useState<EveningOffer>('done');
  const [sharedHours, setSharedHoursState] = useState<Record<string, OpenHourEntry[]>>({});
  const [oldSharedUntil, setOldSharedUntil] = useState<DayKey | null>(null);
  const oldSharedRef = useRef(oldSharedUntil);
  oldSharedRef.current = oldSharedUntil;
  const sharedHoursRef = useRef(sharedHours);
  sharedHoursRef.current = sharedHours;
  const stopAnalytics = useRef<(() => void) | null>(null);
  useEffect(() => () => stopAnalytics.current?.(), []);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  /** Today's game day read from the clock right now, not from the last render. */
  const freshNow = () => clockNow(settingsRef.current.minuteOffset);
  const freshToday = () => gameDay(freshNow(), settingsRef.current.dayOffset);

  // Load once.
  useEffect(() => {
    let hadData = false;
    let savedLang: LangSetting = 'auto';
    let savedOffset = 0;
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), loadDeviceId()])
      .then(async ([raw, deviceId]) => {
        deviceIdRef.current = deviceId;
        if (raw) {
          hadData = true;
          const saved = JSON.parse(raw) as Omit<Partial<SavedData>, 'version' | 'wallet'> & { version?: number; wallet?: unknown };
          // Before the journal of acorns and the stamps (version 6): a copy of the save as it was, for 30 days.
          if ((saved.version ?? 1) < 6) await saveBackup('v6', false, raw).catch(() => {});
          savedLang = saved.settings?.language ?? 'auto';
          savedOffset = __DEV__ ? (saved.settings?.dayOffset ?? 0) : 0;
          const loaded = migrateSave(saved, deviceId, gameDay(clockNow(0), savedOffset));
          setTrees(() => loaded.trees);
          setPlot(() => loaded.plot);
          // Time travel is a developer tool: a release build always lives today.
          const minuteOffset = Number.isFinite(saved.settings?.minuteOffset) ? saved.settings!.minuteOffset : 0;
          setSettings({ ...DEFAULT_SETTINGS, ...saved.settings, minuteOffset, ...(__DEV__ ? {} : { dayOffset: 0, minuteOffset: 0 }) });
          setShop(() => loaded.shop);
          setLedger(() => loaded.ledger);
          // Version 5 and older paid today's stages into legacy: (no st: keys): the count begins tomorrow.
          const loadDay = gameDay(clockNow(0), savedOffset);
          stageCountRef.current = migrateStageCount(
            (saved.wallet as { stages?: unknown } | undefined)?.stages,
            (saved.version ?? 1) < 6 ? addDays(loadDay, 1) : loadDay,
          );
          setQuests(() => loaded.quests);
          setClaimed(loaded.claimed);
          setProfile(loaded.profile);
          setAnnounced(loaded.announced);
          setEveningState(loaded.eveningOffer);
          setSharedHoursState(loaded.sharedHours);
          setOldSharedUntil(loaded.oldSharedUntil);
          setTombs(loaded.tombs, loaded.hiddenTombs);
          hlcRef.current = loaded.hlc;
        }
        setCanSave(true);
        sweepCopies().catch(() => {});
      })
      .catch((error) => console.warn('Could not read saved data, saving is off for this session', error))
      .finally(() => {
        setReady(true);
        // The saved language, before the first render applies it: the first events carry it.
        analytics.configure({ lang: savedLang === 'auto' ? deviceLang() : savedLang, dayOffset: savedOffset });
        stopAnalytics.current = startAnalytics(hadData);
      });
  }, [setTrees, setPlot, setLedger, setShop, setQuests, setClaimed, setAnnounced, setTombs]);

  // Save on every change after a successful load.
  useEffect(() => {
    if (!canSave) return;
    const data: SavedData = {
      version: 6, trees, settings, plot, wallet: { ledger, stages: stageCountRef.current }, shop, quests, achievements: claimed, announced, profile, eveningOffer: eveningState, sharedHours, oldSharedUntil,
      tombs, hiddenTombs, hlc: hlcRef.current,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [canSave, trees, settings, plot, ledger, shop, quests, claimed, announced, profile, eveningState, sharedHours, oldSharedUntil, tombs, hiddenTombs]);

  // Android widgets (OYUUR-39): after every change of trees or of what they show, a fresh snapshot and a redraw.
  // Only after a successful load, so an unreadable save never empties the widgets. A new game day or the night
  // redraws even an unchanged snapshot (the state on the widget is worked out from the time).
  useEffect(() => {
    if (!canSave) return;
    const lang = settings.language === 'auto' ? deviceLang() : settings.language;
    const timer = setTimeout(() => {
      const snap = buildSnapshot({
        trees, lang, theme: settings.theme, h24: uses24(lang), showHidden: settings.widgetNames, dayOffset: settings.dayOffset, minuteOffset: settings.minuteOffset,
      });
      // The hour too: 18:00 (watering opens) and 22:00 (a chance at risk) show at once while the app is open.
      const at = clockNow(settings.minuteOffset);
      syncWidgets(snap, `${gameDay(at, settings.dayOffset)}|${at.getHours()}`);
    }, 400);
    return () => clearTimeout(timer);
  }, [canSave, trees, settings.language, settings.theme, settings.widgetNames, settings.dayOffset, settings.minuteOffset, now]);

  // Keep the clock fresh so the day (at 3:00), watering hours and the night theme roll over while the app is open.
  useEffect(() => {
    const tick = () => setNow(clockNow(settingsRef.current.minuteOffset));
    // Ticks right after each new minute, so "from 18:00" opens at 18:00, not up to half a minute later.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const ms = 60_000 - (clockNow(settingsRef.current.minuteOffset).getTime() % 60_000) + 50;
      timer = setTimeout(() => {
        tick();
        schedule();
      }, ms);
    };
    schedule();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
  // Developer time travel within the day moves the clock at once.
  useEffect(() => setNow(clockNow(settings.minuteOffset)), [settings.minuteOffset]);

  const today = gameDay(now, settings.dayOffset);
  const clock = gameClock(now);

  // Judge missed days whenever the date moves forward.
  useEffect(() => {
    if (!ready) return;
    // setTrees runs the update once and at once (see above), so it can tell statistics what changed.
    setTrees((prev) => {
      const next = prev.map((tree) => settle(tree, today));
      if (!next.some((tree, i) => tree !== prev[i])) return prev;
      next.forEach((tree, i) => settleEvents(prev[i], tree).forEach((e) => analytics.track(e.name, e.props)));
      return next;
    });
    // Old months of the acorn journal fold into one key each (the balance stays).
    // Rewards of hidden trees fold apart: the account never learns of them (records.ts).
    setLedger((prev) => pruneLedger(prev, today, hiddenTreeIds({ trees: treesRef.current, hiddenTombs: hiddenTombsRef.current })));
    // Stages that came past yesterday's limit (OYUUR-43) — even of trees no longer watered.
    payOwedStages(treesRef.current, today);
  }, [ready, today, setTrees, setLedger]);

  const night = settings.theme === 'dark' || (settings.theme === 'auto' && isNightHour(now.getHours()));
  const lang = settings.language === 'auto' ? deviceLang() : settings.language;
  const t = useMemo(() => makeT(lang), [lang]);
  analytics.configure({ lang, dayOffset: settings.dayOffset });

  /** Something a quest asks for happened (counts only if it is one of today's). */
  const questEvent = useCallback<Store['questEvent']>(
    (id) => setQuests((prev) => questDone(prev, id, gameDay(clockNow(settingsRef.current.minuteOffset), settingsRef.current.dayOffset))),
    [setQuests],
  );

  const plant: Store['plant'] = (input) => {
    const id = newId();
    setTrees((prev) => [...prev, plantTree({ ...input, id, today: freshToday() })]);
    questEvent('plantHabit');
    analytics.track('plant', { seed: false, generation: 1 });
    return id;
  };

  /** Tells the screen about acorns just added to the wallet. */
  const announce = (amount: number, source: EarnSource, treeId?: string) => {
    if (amount > 0) acornsEarned.emit({ amount, source, treeId });
  };

  /** Stages reached on a day past the limit and not paid yet: paid within today's limit (economy.ts). */
  function payOwedStages(trees: Tree[], day: DayKey) {
    const owed = owedStageRewards(ledgerRef.current, trees, day, stageCountRef.current);
    if (owed.paid.length === 0) return;
    stageCountRef.current = owed.count;
    setLedger(() => owed.ledger);
    owed.paid.forEach((p) => announce(p.amount, 'stage', p.treeId));
  }

  const tapTree: Store['tapTree'] = (id) => {
    const tree = treesRef.current.find((x) => x.id === id);
    if (!tree) return 'dead';
    const at = freshNow();
    const day = gameDay(at, settingsRef.current.dayOffset);
    const outcome = checkIn(tree, day, gameClock(at));
    setTrees((prev) => prev.map((x) => (x.id === id ? outcome.tree : x)));
    settleEvents(tree, outcome.tree).forEach((e) => analytics.track(e.name, e.props));
    if (outcome.result === 'grown') {
      analytics.track('water');
      const reward = wateringReward(ledgerRef.current, id, day, growthDays(outcome.tree), stageCountRef.current);
      stageCountRef.current = reward.count;
      setLedger(() => reward.ledger);
      announce(reward.water, 'water', id);
      announce(reward.stage, 'stage', id);
      // This tree first: a stage it reached on a day past the limit, then the other trees'.
      payOwedStages([outcome.tree, ...treesRef.current.filter((x) => x.id !== id)], day);
    }
    return outcome.result;
  };

  const plantSeed: Store['plantSeed'] = (deadId) => {
    const dead = treesRef.current.find((x) => x.id === deadId);
    if (!dead || !dead.diedOn || seedUsed(dead, treesRef.current)) return null;
    const id = newId();
    const tree = plantFromSeed(dead, id, freshToday());
    setTrees((prev) => [...prev, tree]);
    analytics.track('plant', { seed: true, generation: tree.generation });
    return id;
  };

  const lockIn = (id: string) => {
    const tree = treesRef.current.find((x) => x.id === id);
    if (!tree) return;
    const done = complete(tree, freshToday());
    setTrees((prev) => prev.map((x) => (x.id === id ? done : x)));
    // complete() settles missed days first: the tree may spend a chance or die instead.
    settleEvents(tree, done).forEach((e) => analytics.track(e.name, e.props));
    if (done.completedOn && !tree.completedOn) analytics.track('lock_in', { days: growthDays(done) });
  };

  const update = (id: string, change: (tree: Tree) => Tree) =>
    setTrees((prev) => prev.map((x) => (x.id === id ? change(x) : x)));
  /** The time of a change of one of the tree's "latest change wins" fields (merge.ts). */
  const stamped = (tree: Tree, field: keyof TreeStamps): Tree => ({ ...tree, stamps: { ...tree.stamps, [field]: stamp() } });
  const nameTree: Store['nameTree'] = (id, nickname) => {
    const name = nickname === null ? null : finalName(nickname);
    update(id, (x) => stamped(withName(x, name, freshToday()), 'nickname'));
    if (name !== null) questEvent('nameTree');
  };
  const askName: Store['askName'] = (id) => update(id, (x) => withAsk(x, freshToday()));
  const nameLater: Store['nameLater'] = (id) => update(id, (x) => withLater(x, freshToday()));

  const setTreeHour: Store['setTreeHour'] = (id, hour) =>
    update(id, (x) => {
      const next = setOpenHour(x, hour, freshToday());
      return next === x ? x : stamped(next, 'openHours');
    });
  const canWaterNow: Store['canWaterNow'] = (tree) => {
    const at = freshNow();
    return canWaterAt(tree, gameDay(at, settingsRef.current.dayOffset), gameClock(at));
  };
  const eveningOffer =
    eveningState === 'pending' && trees.some((x) => x.kind === 'quit' && isGrowing(x) && openHourOn(x, today) === 0);
  const answerEveningOffer: Store['answerEveningOffer'] = (ids) => {
    const day = freshToday();
    if (ids.length) setTrees((prev) => prev.map((x) => (ids.includes(x.id) ? stamped(setOpenHour(x, 18, day), 'openHours') : x)));
    setEveningState('done');
  };
  const sharedHalf: Store['sharedHalf'] = (s) => myHalf(s, sharedHoursRef.current[s.id], today, oldSharedRef.current);
  const canWaterSharedNow: Store['canWaterSharedNow'] = (s) => {
    const at = freshNow();
    const day = gameDay(at, settingsRef.current.dayOffset);
    return canWaterHalf(myHalf(s, sharedHoursRef.current[s.id], day, oldSharedRef.current), day, gameClock(at));
  };
  const setSharedHour: Store['setSharedHour'] = (s, hour) => {
    const day = freshToday();
    const next = setMyHour(myHalf(s, sharedHoursRef.current[s.id], day, oldSharedRef.current), hour, day);
    sharedHoursRef.current = { ...sharedHoursRef.current, [s.id]: next };
    setSharedHoursState(sharedHoursRef.current);
  };

  // A deleted habit leaves a tomb (only its id and the time): it goes from every phone (спец 4.3).
  const deleteHabit = useCallback(
    (lineageId: string) => {
      const habit = treesRef.current.filter((x) => x.lineageId === lineageId);
      if (habit.length === 0) return;
      const at = stamp();
      const hidden = habit.some((x) => x.visibility !== 'friends');
      // The trees' ids too: their acorns stay known as hidden (records.ts, openLedger).
      if (hidden) setTombs(tombsRef.current, { ...hiddenTombsRef.current, ...Object.fromEntries(habit.map((x) => [x.id, at])), [lineageId]: at });
      else setTombs({ ...tombsRef.current, [lineageId]: at }, hiddenTombsRef.current);
      setTrees((prev) => prev.filter((x) => x.lineageId !== lineageId));
    },
    [setTrees, setTombs, stamp],
  );
  const habits = useMemo(() => groupHabits(trees), [trees]);
  const habitsRef = useRef(habits);
  habitsRef.current = habits;
  // Planting, deleting and resetting all reach the plot through here.
  useEffect(() => {
    if (ready) setPlot((prev) => syncPlot(prev, plotHabits(habits)));
  }, [ready, habits, setPlot]);
  const moveTree = useCallback<Store['moveTree']>(
    (lineageId, to) => {
      const moved = moveTo(plotRef.current, lineageId, to, stamp());
      if (moved.plot !== plotRef.current) questEvent('moveTree');
      setPlot(() => moved.plot);
      return { swapped: moved.swapped };
    },
    [setPlot, questEvent, stamp],
  );
  const forestShown = useCallback(() => {
    setPlot((prev) => markShown(prev, habitsRef.current.map((h) => h.lineageId)));
    questEvent('visitForest');
  }, [setPlot, questEvent]);
  const updateSettings = useCallback(
    (patch: Partial<Settings>) => setSettings((prev) => ({ ...prev, ...patch })),
    [],
  );
  // ---- The forest as a whole (the sync with the account, OYUUR-30) ----
  const exportForest = useCallback(
    (): Forest => ({
      trees: treesRef.current,
      plot: plotRef.current,
      ledger: ledgerRef.current,
      shop: shopRef.current,
      quests: questsRef.current,
      claimed: claimedRef.current,
      announced: announcedRef.current,
      tombs: tombsRef.current,
      hiddenTombs: hiddenTombsRef.current,
    }),
    [],
  );
  const applyForest = useCallback(
    (f: Forest) => {
      setTrees(() => f.trees);
      setPlot(() => f.plot);
      setLedger(() => f.ledger);
      setShop(() => f.shop);
      setQuests(() => f.quests);
      if (f.claimed !== claimedRef.current) setClaimed(f.claimed);
      setAnnounced(f.announced);
      setTombs(f.tombs, f.hiddenTombs);
      hlcRef.current = hlcMax(hlcRef.current, latestStamp(f));
    },
    [setTrees, setPlot, setLedger, setShop, setQuests, setClaimed, setAnnounced, setTombs],
  );
  const resetAll = useCallback(() => {
    applyForest(emptyForest());
    setSettings(DEFAULT_SETTINGS);
    setProfile(newProfile());
    setEveningState('done');
    setSharedHoursState({});
    setOldSharedUntil(null);
    setGen((g) => g + 1);
  }, [applyForest]);
  const forest = useMemo<StoreForest>(
    () => ({
      deviceId: ready ? deviceIdRef.current : '',
      gen,
      exportForest,
      mergeRemote: (remote) => {
        const day = gameDay(clockNow(settingsRef.current.minuteOffset), settingsRef.current.dayOffset);
        const r = mergeRemoteRule(exportForest(), remote, day);
        applyForest(r.forest);
        return { revived: r.revived };
      },
      replaceForest: (f) => {
        applyForest(f);
        setGen((g) => g + 1);
      },
      resetForest: (mode) => {
        applyForest(emptyForest());
        if (mode === 'signOut') {
          // The first start, but the first-start hints were already seen on this phone.
          setSettings((prev) => ({ ...prev, menuHintSeen: true }));
          setProfile(newProfile());
          setSharedHoursState({});
        }
        setEveningState('done');
        setGen((g) => g + 1);
      },
      backup: (reason, overwrite) => saveBackup(reason, overwrite),
    }),
    [ready, gen, exportForest, applyForest],
  );

  // ---- Wave 5 ----
  const skins = useMemo(() => ownedSkins(shop), [shop]);
  const [social, setSocialState] = useState({ friends: 0, shared: 0 });
  const setSocial = useCallback<Store['setSocial']>(
    (next) => setSocialState((prev) => (prev.friends === next.friends && prev.shared === next.shared ? prev : next)),
    [],
  );
  const friendsCount = social.friends;
  const setVisibility = useCallback<Store['setVisibility']>(
    (lineageId, visibility) =>
      setTrees((prev) => {
        if (!prev.some((x) => x.lineageId === lineageId && x.visibility !== visibility)) return prev;
        // One time for every generation: they stay together on other phones too (merge.ts).
        const at = stamp();
        return prev.map((x) => (x.lineageId === lineageId ? { ...x, visibility, stamps: { ...x.stamps, visibility: at } } : x));
      }),
    [setTrees, stamp],
  );
  const paySharedWatering: Store['paySharedWatering'] = (treeId) => {
    // Only the watering pays (within the same daily limit), once per tree and day; a shared tree's stages don't.
    const sharedId = treeId.replace(/^shared:/, '');
    const reward = sharedWateringReward(ledgerRef.current, sharedId, freshToday());
    setLedger(() => reward.ledger);
    announce(reward.water, 'water', treeId);
  };
  const questCtx: QuestContext = {
    growing: trees.filter(isGrowing).length,
    habits: habits.length,
    unnamed: trees.some((x) => x.nickname === null && isGrowing(x)),
    friends: friendsCount,
    shared: social.shared > 0,
  };
  const questCtxRef = useRef(questCtx);
  questCtxRef.current = questCtx;
  // New quests at midnight (and on the first load).
  useEffect(() => {
    // The time of the pick: on another phone the same day keeps the quests picked first (merge.ts).
    if (ready) setQuests((prev) => {
      const next = rollQuests(prev, today, questCtxRef.current);
      return next === prev ? prev : { ...next, rolledAt: stamp() };
    });
    // The first tree planted on a bare day re-rolls it (quests.ts).
  }, [ready, today, setQuests, questCtx.growing > 0]);
  // "Water all your trees" counts the moment the last growing tree is watered.
  useEffect(() => {
    if (!ready || quests.day !== today) return;
    const growing = trees.filter(isGrowing);
    if (growing.length > 0 && growing.every((x) => checkedInToday(x, today))) {
      setQuests((prev) => questDone(prev, 'waterAll', today));
    }
  }, [ready, trees, today, quests.day, setQuests]);

  // The balance is worked out from the journal (economy.ts): screens read numbers as before.
  const wallet = useMemo<Wallet>(() => walletOf(ledger, shop), [ledger, shop]);
  const buyItem: Store['buyItem'] = (id) => {
    const r = buy(shopRef.current, ledgerRef.current, id);
    if (r.result === 'ok') {
      setShop(() => r.shop);
      analytics.track('purchase', { item: id });
    }
    return r.result;
  };
  const shopNews = shopNewsRule(shop, wallet);
  const shopSeen = useCallback(
    () => setShop((prev) => seeAffordable(prev, walletOf(ledgerRef.current, prev))),
    [setShop],
  );
  const markAnnounced = useCallback(
    (ids: AchievementId[]) => setAnnounced((prev) => (ids.every((id) => prev.includes(id)) ? prev : [...new Set([...prev, ...ids])])),
    [setAnnounced],
  );
  const setMeadow: Store['setMeadow'] = (id) =>
    setShop((prev) => {
      const next = chooseMeadow(prev, id);
      return next === prev ? prev : { ...next, meadowAt: stamp() };
    });
  const setTreeSkin: Store['setTreeSkin'] = (id, skin) => {
    const tree = treesRef.current.find((x) => x.id === id);
    if (!tree || !isGrowing(tree) || !ownedSkins(shopRef.current).includes(skin)) return false;
    update(id, (x) => stamped({ ...x, skin }, 'skin'));
    return true;
  };
  const claimQuest: Store['claimQuest'] = (id) => {
    const day = freshToday();
    const before = questsRef.current;
    const r = claimQuestRule(before, id, day);
    if (r.reward === 0) return 0;
    setQuests(() => r.quests);
    // Each reward has its key: claimed on two phones, paid once (economy.ts).
    setLedger((prev) => {
      let next = addReward(prev, questKey(day, id), r.reward - (r.quests.bonus && !before.bonus ? ALL_QUESTS_BONUS : 0));
      if (r.quests.bonus && !before.bonus) next = addReward(next, bonusKey(day), ALL_QUESTS_BONUS);
      return next;
    });
    announce(r.reward, 'quest');
    return r.reward;
  };
  const facts: Facts = { trees, bought: shop.owned.length, questBest: quests.best, friends: friendsCount };
  const factsRef = useRef(facts);
  factsRef.current = facts;
  const achievements = useMemo(
    () => achievementViews({ trees, bought: shop.owned.length, questBest: quests.best, friends: friendsCount }, claimed),
    [trees, shop.owned.length, quests.best, friendsCount, claimed],
  );
  const claimAchievement: Store['claimAchievement'] = (id) => {
    const r = claimAchievementRule(claimedRef.current, id, factsRef.current, freshToday());
    if (r.reward === 0) return 0;
    setClaimed(r.claimed);
    setLedger((prev) => addReward(prev, achievementKey(id), r.reward));
    announce(r.reward, 'achievement');
    return r.reward;
  };
  const updateProfile: Store['updateProfile'] = (patch) => setProfile((prev) => withProfile(prev, patch));
  const stats = useMemo(() => statsOf(trees), [trees]);

  const value: Store = {
    ready,
    trees,
    habits,
    settings,
    today,
    night,
    palette: night ? dark : light,
    t,
    clock,
    plant,
    tapTree,
    plantSeed,
    lockIn,
    setTreeHour,
    canWaterNow,
    eveningOffer,
    answerEveningOffer,
    sharedHalf,
    canWaterSharedNow,
    setSharedHour,
    deleteHabit,
    nameTree,
    askName,
    nameLater,
    updateSettings,
    resetAll,
    plot,
    moveTree,
    forestShown,
    wallet,
    shop,
    skins,
    buyItem,
    shopNews,
    shopSeen,
    setMeadow,
    setTreeSkin,
    quests,
    questEvent,
    claimQuest,
    achievements,
    claimAchievement,
    announced,
    markAnnounced,
    profile,
    updateProfile,
    stats,
    friendsCount,
    setSocial,
    setVisibility,
    paySharedWatering,
    forest,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside StoreProvider');
  return store;
}
