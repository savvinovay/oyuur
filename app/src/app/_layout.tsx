import { Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ReactNode, useEffect } from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FriendsProvider } from '@/state/friends';
import { StoreProvider, useStore } from '@/state/store';
import { SyncProvider } from '@/state/sync';
import { AcornLayer } from '@/ui/acorns';
import { FoundForestHost } from '@/ui/account/FoundForest';
import { LockSheetHost } from '@/ui/account/LockSheet';
import { SyncToasts } from '@/ui/account/SyncToasts';
import { DialogHost } from '@/ui/ds';
import { QuestHintHost } from '@/ui/quests/QuestHint';
import { FeedbackHost } from '@/ui/feedback';
import { InstallHintHost } from '@/ui/install/InstallHint';
import { ReminderHost } from '@/remind/ReminderHost';

// The phone's splash (the tree on the sky, app.json) stays up until the trees and the fonts are in,
// so the app opens straight onto the forest and not onto an empty screen (OYUUR-18).
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Nunito_700Bold, Nunito_800ExtraBold, Nunito_900Black });
  // Without Nunito the app still opens, in the phone's own font, rather than as an empty screen.
  const fontsDone = fontsLoaded || fontError != null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <FriendsProvider>
            {/* The forest in the account (OYUUR-30): fetch, merge, send. */}
            <SyncProvider>
              <FeedbackHost />
              <Shell fontsDone={fontsDone}>
                {fontsDone ? <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} /> : null}
                {/* Acorns fly over every screen, under the dialogs (wave 5 spec 3.1). */}
                {fontsDone ? <AcornLayer /> : null}
                {/* "We found a forest in your account" and the sync toasts (OYUUR-30), under the dialogs. */}
                {fontsDone ? <FoundForestHost /> : null}
                {/* "Lock your hidden trees in your account" (OYUUR-31), never over the sheet above. */}
                {fontsDone ? <LockSheetHost /> : null}
                {fontsDone ? <QuestHintHost /> : null}
                {fontsDone ? <SyncToasts /> : null}
                {fontsDone ? <DialogHost /> : null}
                {/* iPhone browser only, once: how to put the web version on the Home Screen (OYUUR-17). */}
                {fontsDone ? <InstallHintHost /> : null}
                {/* Android: watering reminders on the phone, planned again after every change (OYUUR-23). */}
                {fontsDone ? <ReminderHost /> : null}
              </Shell>
            </SyncProvider>
          </FriendsProvider>
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// In a desktop browser the app is shown as a phone-sized column.
function Shell({ children, fontsDone }: { children: ReactNode; fontsDone: boolean }) {
  const { ready, palette, t } = useStore();
  useEffect(() => {
    if (!ready || !fontsDone) return;
    SplashScreen.hide();
    if (Platform.OS === 'web' && typeof document !== 'undefined') hideWebBoot();
  }, [ready, fontsDone]);
  const backdrop = palette.dark ? '#121130' : '#E9D6B8';
  // Web: the browser's bar, the iPhone status bar area and the page behind the app follow day and night.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', palette.skyTop);
    document.body.style.backgroundColor = palette.skyTop;
  }, [palette]);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.lang = t.lang;
  }, [t.lang]);
  return (
    <View style={[styles.backdrop, NO_SELECT, { backgroundColor: backdrop }]}>
      <StatusBar style={palette.dark ? 'light' : 'dark'} />
      <View style={[styles.phone, { backgroundColor: palette.screen }]}>{ready ? children : null}</View>
    </View>
  );
}

// The web loading screen (public/index.html, OYUUR-35) fades out once the first screen is on the page:
// two frames after the forest is in, so the browser has painted it under the loading screen.
function hideWebBoot() {
  const boot = document.getElementById('boot');
  if (!boot) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      boot.classList.add('gone');
      // The fade is 0.35 s (none with reduced motion); then the element goes.
      setTimeout(() => boot.remove(), 400);
    }),
  );
}

// An app, not a document: dragging over it in a browser must not paint the text blue.
// Text fields turn selection back on for themselves (new.tsx). RN's types know
// userSelect only on text, so it is cast here.
const NO_SELECT = Platform.OS === 'web' ? ({ userSelect: 'none' } as unknown as ViewStyle) : null;

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center' },
  phone: {
    flex: 1,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? 460 : undefined,
    overflow: 'hidden',
  },
});
