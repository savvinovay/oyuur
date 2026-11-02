// The item window (spec 7, frames 17–22): a big picture of the tree or the meadow (the
// tree's growth shown stage by stage, day or night), its name and words, and the action:
// buy, "need more", put it on a tree, plant one, or use the meadow. The window itself is the
// confirmation (architect's decision): "Buy" works 400 ms after opening and only once.
// A purchase spends the acorns (developer А's flight, ui/shop/spend.ts), counts the wallet
// down and throws the "New!" celebration. The second step, "Which tree?", changes the kind of
// growing trees right in the window.
import { ComponentRef, Ref, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { ItemId } from '@/game/economy';
import { Habit, isGrowing, Skin, Stage, STAGES } from '@/game/tree';
import { pluralForm } from '@/i18n';
import { useStore } from '@/state/store';
import { Button, elevation, fonts, Glyph, Icon, MAX_FONT_SCALE, motion, Txt, useColors, useMotionOn } from '@/ui/ds';
import { ThumbBox } from '@/ui/forest/sheet/ThumbBox';
import { dark, light } from '@/ui/theme';
import { TreeThumb, warmThumb } from '@/ui/TreeArt';
import { Burst, KIND_LEAVES, MEADOW_BITS } from './Burst';
import { shopCue } from './cues';
import { openQuests, plantKind } from './links';
import { LipButton } from './LipButton';
import { ModalSheet } from './ModalSheet';
import { NewParty } from './NewParty';
import {
  cardState, countDown, formatAcorns, meadowOfItem, priceOf, SHOW_STAGES, SHOW_STEP, SHOWN_STAGE, skinOfItem, STAGE_SHOW_DAYS, stageFromDay, stageFromSo,
} from './model';
import { Preview, previewTree } from './Preview';
import { spendAcorns } from './spend';
import { WalletChip } from './WalletChip';

/** "Buy" works this long after the window opens: a double tap on the card must not buy. */
const BUY_DEAF = 400;
/** The purchase (7.4): acorns leave at 120 ms, the wallet counts 600 ms, the last one lands at 950. */
const SPEND_AT = 120;
const COUNT = 600;
const LANDED = 950;
/** The action area turns to "bought" this long into the celebration. */
const SWAP_AT = 200;
const COMPACT_BELOW = 700;

export function ItemSheet({ id, onClosed, onEarn }: {
  id: ItemId;
  onClosed(): void;
  /** "How to earn" with nothing to do in the quests today: the shop scrolls to its card. */
  onEarn(): void;
}) {
  const { t } = useStore();
  const skin = skinOfItem(id);
  const label = skin ? t.dict.skinNames[skin] : t.dict.shopMeadowNames[meadowOfItem(id)!];
  return (
    <ModalSheet onClosed={onClosed} label={label}>
      {(close) => <ItemBody id={id} close={close} onEarn={onEarn} />}
    </ModalSheet>
  );
}

type Step = 'item' | 'which';

function ItemBody({ id, close, onEarn }: { id: ItemId; close(): void; onEarn(): void }) {
  const store = useStore();
  const { t, night, wallet, shop, habits, quests, today } = store;
  const c = useColors();
  const motionOn = useMotionOn();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const compact = screenH < COMPACT_BELOW;
  const W = Math.min(screenW, 460) - 32;
  const previewH = compact ? 200 : 248;
  const tile = compact ? 40 : 48;

  const skin = skinOfItem(id);
  const meadow = meadowOfItem(id);
  const price = priceOf(id);
  const state = cardState(shop, wallet, id);

  // ---- The picture: day or night, the stage shown ----
  const [previewNight, setPreviewNight] = useState(night);
  const [stage, setStage] = useState<Stage>(skin && motionOn ? SHOW_STAGES[0] : SHOWN_STAGE);
  const showing = useRef(!!skin && motionOn);
  const pop = useSharedValue(1);
  const popAlpha = useSharedValue(1);
  const treeStyle = useAnimatedStyle(() => ({ opacity: popAlpha.get(), transform: [{ scale: pop.get() }] }));
  const changeStage = useCallback((next: Stage, animate: boolean) => {
    setStage(next);
    if (animate) {
      pop.set(0.9);
      popAlpha.set(0);
      pop.set(withSpring(1, motion.spring.pop));
      popAlpha.set(withTiming(1, { duration: 200 }));
    }
  }, [pop, popAlpha]);
  const stopShow = () => {
    showing.current = false;
  };
  // The growth show (7.2): every 450 ms the next stage, up to "tree".
  useEffect(() => {
    if (!showing.current) return;
    let i = 0;
    const timer = setInterval(() => {
      if (!showing.current) return clearInterval(timer);
      i += 1;
      if (i >= SHOW_STAGES.length) {
        showing.current = false;
        return clearInterval(timer);
      }
      changeStage(SHOW_STAGES[i], true);
    }, SHOW_STEP);
    return () => clearInterval(timer);
  }, [changeStage]);

  const tree = skin ? { skin, days: STAGE_SHOW_DAYS[stage], seed: 'shop' } : { skin: 'birch' as Skin, days: STAGE_SHOW_DAYS.young, seed: 'meadow' };
  const previewProps = {
    meadow: meadow ?? shop.meadow,
    night: previewNight,
    width: W,
    height: previewH,
    fill: 0.76,
    sizeByDays: skin ? STAGE_SHOW_DAYS[SHOWN_STAGE] : undefined,
    pictureWidth: meadow ? 0.36 : undefined,
    horizon: 0.55,
    feet: meadow ? 0.8 : 0.82,
  };
  // Every stage's picture is drawn ahead, so the show never waits for one.
  useEffect(() => {
    if (!skin) return;
    for (const s of STAGES) {
      const days = STAGE_SHOW_DAYS[s.stage];
      warmThumb(previewTree({ ...previewProps, tree: { skin, days, seed: 'shop' } }).props).catch(() => {});
    }
    // Once per day/night.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewNight]);

  // ---- Buying ----
  const openedAt = useRef(Date.now());
  const [buying, setBuying] = useState<{ from: number; to: number; at: number } | null>(null);
  const [revealed, setRevealed] = useState(true);
  const [party, setParty] = useState(0);
  const [skip, setSkip] = useState(0);
  const bounce = useSharedValue(1);
  const bounceStyle = useAnimatedStyle(() => ({ transform: [{ scale: bounce.get() }] }));
  const walletRef = useRef<ComponentRef<typeof View>>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const celebrate = () => {
    shopCue('unlock');
    setParty(Date.now());
    if (motionOn) {
      bounce.set(withSequence(withTiming(0.94, { duration: 60 }), withSpring(1, motion.spring.bounce)));
      later(() => setRevealed(true), SWAP_AT);
    } else {
      setRevealed(true);
    }
  };
  const buy = () => {
    if (buying || Date.now() - openedAt.current < BUY_DEAF) return;
    const from = wallet.acorns;
    if (store.buyItem(id) !== 'ok') return;
    stopShow();
    if (skin && stage !== SHOWN_STAGE) changeStage(SHOWN_STAGE, false);
    shopCue('buy');
    setRevealed(false);
    setBuying({ from, to: from - price, at: Date.now() + (motionOn ? SPEND_AT : 0) });
    walletRef.current?.measureInWindow((x, y, width, height) => spendAcorns(price, { x, y, width, height }));
    if (motionOn) later(celebrate, LANDED);
    else celebrate();
  };
  // What the action area shows: during the purchase still the "buy" look, then the new state.
  const shown = !revealed ? 'afford' : state;

  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.get() }] }));
  const poor = () => {
    shopCue('poor');
    if (motionOn) {
      const step = (x: number) => withTiming(x, { duration: 40 });
      shakeX.set(withSequence(step(-4), step(4), step(-4), step(4), step(-2), step(0)));
    }
  };
  const earn = () => {
    shopCue('tap');
    const toDo = quests.day === today && quests.ids.some((q) => !quests.claimed.includes(q));
    close();
    if (toDo) openQuests();
    else onEarn();
  };

  // ---- Steps ----
  const [step, setStep] = useState<Step>('item');
  const slide = useSharedValue(0);
  const slideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: slide.get() }] }));
  const go = (next: Step) => {
    shopCue('select');
    setStep(next);
    if (motionOn) {
      slide.set(next === 'which' ? W + 32 : -(W + 32));
      slide.set(withTiming(0, { duration: motion.base, easing: motion.ease.inOut }));
    }
  };

  const growing = habits.filter((h) => isGrowing(h.current));
  const name = skin ? t.dict.skinNames[skin] : t.dict.shopMeadowNames[meadow!];
  const desc = skin ? t.dict.shopKindDesc[skin] : t.dict.shopMeadowDesc[meadow!];
  const shownWallet = buying ? null : wallet.acorns;

  if (step === 'which' && skin) {
    return (
      <Animated.View style={[styles.body, slideStyle]}>
        <WhichTree skin={skin} habits={growing} onBack={() => go('item')} onDone={close} />
      </Animated.View>
    );
  }

  const fromDay = stageFromDay(stage);
  return (
    <Animated.View style={[styles.body, slideStyle]}>
      {/* The picture. A tap stops the show, or skips the celebration to its end. */}
      <Pressable
        onPress={() => {
          stopShow();
          if (party) setSkip(Date.now());
        }}
        accessible={false}
        style={styles.previewWrap}
      >
        <Animated.View style={[!skin && bounceStyle]}>
          <Preview
            {...previewProps}
            radius={24}
            tree={tree}
            sun
            weather
            seed={meadow ? 11 : 5}
            treeStyle={skin ? [treeStyle, bounceStyle] : undefined}
          >
            <NewPartyLayer run={party} skip={skip} width={W} height={previewH} colors={skin ? KIND_LEAVES[skin] : MEADOW_BITS[meadow!]} motionOn={motionOn} />
          </Preview>
        </Animated.View>
        <DayNight night={previewNight} onChange={(n) => {
          shopCue('select');
          setPreviewNight(n);
        }} />
      </Pressable>

      {/* The stages: six squares, the chosen one raised with a green ring. */}
      {skin && (
        <>
          <View style={[styles.stages, { height: tile }]}>
            {STAGES.map((s) => {
              const on = s.stage === stage;
              const size = Math.round(((tile - 6) * 300) / 320);
              return (
                <Pressable
                  key={s.stage}
                  onPress={() => {
                    stopShow();
                    if (!on) shopCue('select');
                    changeStage(s.stage, motionOn && !on);
                  }}
                  role="radio"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, checked: on }}
                  aria-checked={on}
                  accessibilityLabel={t.dict.stageNames[s.stage]}
                  style={[
                    styles.stage,
                    { width: tile, height: tile, backgroundColor: on ? c.card : c.sunken, borderColor: on ? c.accent : 'transparent' },
                    on && elevation(1, night),
                  ]}
                >
                  <TreeThumb days={STAGE_SHOW_DAYS[s.stage]} skin={skin} seed="shop" size={size} palette={previewNight ? dark : light} night={previewNight} fill={0.8} />
                </Pressable>
              );
            })}
          </View>
          <Txt variant="small" color={c.textSoft} style={styles.stageLine}>
            {t(stageFromSo(fromDay) ? 'shopStageFromSo' : 'shopStageFrom', { stage: t.dict.stageNames[stage], n: fromDay })}
          </Txt>
        </>
      )}

      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Txt variant="title2" numberOfLines={1} accessibilityRole="header">{name}</Txt>
          <Txt variant="small" color={c.textSoft} numberOfLines={3} style={styles.desc}>{desc}</Txt>
        </View>
        {(shown === 'afford' || shown === 'poor') && (
          <CountingWallet ref={walletRef} value={shownWallet} count={buying} />
        )}
      </View>

      <View style={styles.actions}>
        {shown === 'afford' && (
          <>
            <LipButton
              variant="gold"
              disabled={!!buying}
              onPress={buy}
              label={`${t('shopBuyFor')} ${formatAcorns(price, t.lang)} ${t.dict.shopAcornWords[pluralForm(t.lang, price)]}`}
            >
              {(ink) => (
                <>
                  <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.buyText, { color: ink }]}>{t('shopBuyFor')}</Txt>
                  <Glyph name="acorn" size={22} muted={!!buying} />
                  <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.buyText, styles.num, { color: ink }]}>{formatAcorns(price, t.lang)}</Txt>
                </>
              )}
            </LipButton>
            <Txt variant="small" color={c.textSoft} style={styles.under}>
              {t('shopLeft', { n: formatAcorns(Math.max(0, (buying ? buying.from : wallet.acorns) - price), t.lang) })}
            </Txt>
          </>
        )}
        {shown === 'poor' && (
          <>
            <View style={styles.progressRow} accessible accessibilityLabel={t('shopProgressA11y', { n: wallet.acorns, total: price })}>
              <View style={[styles.track, { backgroundColor: c.sunken }]}>
                <View style={[styles.fillBar, { backgroundColor: c.gold, width: `${Math.min(100, (wallet.acorns / price) * 100)}%` }]} />
              </View>
              <Glyph name="acorn" size={16} />
              <Txt variant="caption" style={styles.num}>
                {formatAcorns(wallet.acorns, t.lang)}
                <Txt variant="caption" color={c.textSoft}>{` / ${formatAcorns(price, t.lang)}`}</Txt>
              </Txt>
            </View>
            <Animated.View style={shakeStyle}>
              <LipButton
                variant="gold"
                disabled
                onPress={() => {}}
                onDisabledPress={poor}
                label={`${t('shopNeed')} ${formatAcorns(price - wallet.acorns, t.lang)}`}
              >
                {(ink) => (
                  <>
                    <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.buyText, { color: ink }]}>{t('shopNeed')}</Txt>
                    <Glyph name="acorn" size={22} muted />
                    <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.buyText, styles.num, { color: ink }]}>{formatAcorns(price - wallet.acorns, t.lang)}</Txt>
                  </>
                )}
              </LipButton>
            </Animated.View>
            <Pressable onPress={earn} accessibilityRole="button" accessibilityLabel={t('shopHowToEarn')} style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.6 }]}>
              <Glyph name="tasks" size={20} />
              <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.textButtonLabel, { color: c.accentLip }]}>{t('shopHowToEarn')}</Txt>
              <Icon name="chevronRight" size={16} color={c.accentLip} strokeWidth={2.6} />
            </Pressable>
          </>
        )}
        {shown === 'owned' && skin && (
          growing.length > 0 ? (
            <>
              <Button title={t('shopPutOnTree')} glyph="sprout" onPress={() => go('which')} cue={null} />
              <Button title={t('shopPlantSame')} variant="text" size="m" onPress={() => {
                close();
                plantKind(skin);
              }} />
            </>
          ) : (
            <Button title={t('shopPlantThis')} glyph="seed" onPress={() => {
              close();
              plantKind(skin);
            }} />
          )
        )}
        {shown === 'owned' && meadow && (
          <Button title={t('shopChooseMeadow')} onPress={() => store.setMeadow(meadow)} cue="select" />
        )}
        {shown === 'selected' && <Button title={t('shopMeadowChosen')} icon="check" disabled onPress={() => {}} />}
      </View>
    </Animated.View>
  );
}

/** Only when there is a celebration: none of its views exist before a purchase. */
function NewPartyLayer(props: Parameters<typeof NewParty>[0]) {
  return props.run ? <NewParty {...props} /> : null;
}

/** The wallet in the window: counts down while acorns are spent (3.5), else shows the store's number. */
function CountingWallet({ ref, value, count }: { ref?: Ref<ComponentRef<typeof View>>; value: number | null; count: { from: number; to: number; at: number } | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!count) return;
    let frame = 0;
    const tick = () => {
      setNow(Date.now());
      if (Date.now() < count.at + COUNT) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [count]);
  const n = count ? countDown(count.from, count.to, now - count.at, COUNT) : (value ?? 0);
  return <WalletChip ref={ref} value={n} compact style={styles.wallet} />;
}

/** Day / night of the picture only (7.1): a glass capsule with two halves. */
function DayNight({ night, onChange }: { night: boolean; onChange(night: boolean): void }) {
  const { t, night: appNight } = useStore();
  const c = useColors();
  const half = (isNight: boolean) => {
    const on = night === isNight;
    return (
      <Pressable
        key={String(isNight)}
        onPress={() => !on && onChange(isNight)}
        role="radio"
        accessibilityRole="radio"
        accessibilityState={{ selected: on, checked: on }}
        aria-checked={on}
        accessibilityLabel={t(isNight ? 'shopNight' : 'shopDay')}
        hitSlop={6}
        style={[styles.half, on && { backgroundColor: c.accent }]}
      >
        <Icon name={isNight ? 'moon' : 'sun'} size={18} color={on ? '#FFFFFF' : c.textSoft} />
      </Pressable>
    );
  };
  return (
    <View style={[styles.dayNight, elevation(1, appNight), { backgroundColor: c.glass }]} role="radiogroup">
      {half(false)}
      {half(true)}
    </View>
  );
}

/** "Which tree?" (7.6): every growing tree with "Change", the change happens at once. */
function WhichTree({ skin, habits, onBack, onDone }: { skin: Skin; habits: Habit[]; onBack(): void; onDone(): void }) {
  const { t, night, setTreeSkin } = useStore();
  const c = useColors();
  const [puffs, setPuffs] = useState<Record<string, number>>({});
  const change = (h: Habit) => {
    if (!setTreeSkin(h.current.id, skin)) return;
    shopCue('skinChange');
    setPuffs((p) => ({ ...p, [h.current.id]: Date.now() }));
  };
  return (
    <View>
      <View style={styles.whichHead}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('back')} hitSlop={4} style={[styles.backCircle, elevation(1, night), { backgroundColor: c.card }]}>
          <Icon name="chevronLeft" size={22} color={c.text} />
        </Pressable>
        <Txt variant="title2" numberOfLines={1} style={styles.whichTitle} accessibilityRole="header">{t('shopWhichTree')}</Txt>
      </View>
      <View style={[styles.group, elevation(1, night), { backgroundColor: c.card }]}>
        {habits.map((h, i) => {
          const tree = h.current;
          const same = tree.skin === skin;
          const title = tree.nickname ?? tree.name;
          const line = tree.nickname ? `${tree.name} · ${t.dict.skinNames[tree.skin]}` : t.dict.skinNames[tree.skin];
          return (
            <View key={tree.id}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
              <View style={styles.treeRow}>
                <View>
                  <ThumbBox habit={h} kind="list" />
                  <Burst run={puffs[tree.id] ?? 0} x={24} y={22} colors={KIND_LEAVES[skin]} count={10} spread={[20, 30]} out={400} fallTime={300} leaf={8} />
                </View>
                <View style={styles.treeText}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{title}</Txt>
                  <Txt variant="caption" color={c.textSoft} numberOfLines={1}>{line}</Txt>
                </View>
                {same ? (
                  <View style={[styles.donePill, { backgroundColor: c.accentSoft }]} accessible accessibilityLabel={t('shopChangedTo', { kind: t.dict.skinNames[skin] })}>
                    <Icon name="check" size={16} color={c.accentInk} strokeWidth={2.8} />
                    <Txt numberOfLines={1} style={[styles.donePillText, { color: c.accentInk }]}>{t.dict.skinNames[skin]}</Txt>
                  </View>
                ) : (
                  <Button title={t('shopChange')} variant="secondary" size="s" onPress={() => change(h)} cue={null} />
                )}
              </View>
            </View>
          );
        })}
      </View>
      <Txt variant="small" color={c.textSoft} style={styles.note}>{t('shopWhichTreeNote')}</Txt>
      <Button title={t('shopDone')} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 4 },
  previewWrap: {},
  dayNight: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', borderRadius: 16, padding: 3, gap: 2 },
  half: { width: 30, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stages: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  stage: { borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  stageLine: { textAlign: 'center', marginTop: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 14 },
  titleText: { flex: 1, minWidth: 0 },
  desc: { marginTop: 2 },
  wallet: { marginTop: 0 },
  actions: { marginTop: 16, gap: 10 },
  buyText: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  num: { fontVariant: ['tabular-nums'] },
  under: { textAlign: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', marginRight: 6 },
  fillBar: { height: 10, borderRadius: 5 },
  textButton: { height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  textButtonLabel: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  whichHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  backCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  whichTitle: { flex: 1 },
  group: { borderRadius: 20, overflow: 'hidden' },
  divider: { height: 1, marginLeft: 16 },
  treeRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  treeText: { flex: 1, minWidth: 0 },
  donePill: { height: 32, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 },
  donePillText: { fontFamily: fonts.black, fontSize: 14, lineHeight: 20 },
  note: { textAlign: 'center', marginTop: 12, marginBottom: 16 },
});
