// "Put Oyuur on your Home Screen" (OYUUR-17): a card from the bottom on the first visit
// in a browser on iPhone. iOS has no install button of its own, so we show the two taps.
// Shown once: "Got it" or a tap on the dim area is remembered. Mounted once in _layout.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { analytics } from '@/net/analytics';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { Button, elevation, Icon, IconName, radius, Txt, useColors, useMotionOn } from '@/ui/ds';
import { readBrowser, shouldOfferInstall } from './detect';

const KEY = 'oyuur/install-hint-seen';
/** The same picture the Home Screen will show (scripts/web-icons.py). */
const APP_ICON = require('../../../assets/web-icon.png');
/** Let the first screen draw before the card comes up. */
const DELAY = 900;
/** The layer stays this long after "Got it", so the card can slide away (Reanimated on the web needs the parent). */
const LEAVE = 240;

export function InstallHintHost() {
  const c = useColors();
  const { t, night } = useStore();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'hidden' | 'open' | 'leaving'>('hidden');
  const nick = useFriends().account?.nick;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const browser = readBrowser();
    if (!browser || !shouldOfferInstall(browser)) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    AsyncStorage.getItem(KEY)
      .then((seen) => {
        if (alive && !seen) {
          timer = setTimeout(() => {
            setPhase('open');
            analytics.track('install_card_shown');
          }, DELAY);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const id = setTimeout(() => setPhase('hidden'), LEAVE);
    return () => clearTimeout(id);
  }, [phase]);

  const close = () => {
    if (phase !== 'open') return;
    setPhase('leaving');
    analytics.track('install_card_closed');
    AsyncStorage.setItem(KEY, '1').catch(() => {});
  };

  if (phase === 'hidden') return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents={phase === 'open' ? 'auto' : 'none'}>
      {phase === 'open' && <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={close} accessibilityRole="button" accessibilityLabel={t('installOk')} />
      </Animated.View>}
      {phase === 'open' && <Animated.View
        entering={motionOn ? SlideInDown.springify().damping(18) : FadeIn.duration(160)}
        exiting={motionOn ? SlideOutDown.duration(200) : FadeOut.duration(120)}
        style={[styles.card, elevation(3, night), { backgroundColor: c.card, marginBottom: insets.bottom + 12 }]}
        accessibilityViewIsModal
        accessibilityLiveRegion="polite"
      >
        <View style={styles.head}>
          <Image source={APP_ICON} style={styles.appIcon} accessibilityIgnoresInvertColors />
          <View style={styles.headText}>
            <Txt variant="title3" accessibilityRole="header">{t('installTitle')}</Txt>
            <Txt variant="small" color={c.textSoft}>{t('installText')}</Txt>
          </View>
        </View>
        <Step n={1} icon="share" text={t('installStep1')} sub={t('installStep1Alt')} />
        <Step n={2} icon="plus" text={t('installStep2')} />
        {nick ? (
          // Signed in (OYUUR-30, frame 16): the same @nick on the Home Screen brings the same forest.
          <View style={[styles.account, { backgroundColor: c.accentSoft }]}>
            <Icon name="cloudCheck" size={22} color={c.doneInk} />
            <Txt variant="small" color={c.text} style={styles.accountText}>{t('installNoteAccount', { nick })}</Txt>
          </View>
        ) : (
          <Txt variant="small" color={c.textSoft} style={styles.note}>{t('installNote')}</Txt>
        )}
        <Button title={t('installOk')} onPress={close} />
      </Animated.View>}
    </View>
  );
}

function Step({ n, icon, text, sub }: { n: number; icon: IconName; text: string; sub?: string }) {
  const c = useColors();
  return (
    <View style={styles.step}>
      <Txt variant="bodyStrong" color={c.textSoft} style={styles.num}>{n}</Txt>
      <View style={[styles.stepIcon, { backgroundColor: c.waterSoft }]}>
        <Icon name={icon} size={22} color={c.water} />
      </View>
      <View style={styles.stepText}>
        <Txt variant="bodyStrong">{text}</Txt>
        {sub ? <Txt variant="small" color={c.textSoft}>{sub}</Txt> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { zIndex: 40, justifyContent: 'flex-end' },
  card: { marginHorizontal: 12, borderRadius: radius.xl, padding: 20, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  appIcon: { width: 52, height: 52, borderRadius: 12 },
  headText: { flex: 1, gap: 2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  num: { width: 14, textAlign: 'center' },
  stepIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1 },
  note: { marginTop: 2 },
  account: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  accountText: { flex: 1 },
});
