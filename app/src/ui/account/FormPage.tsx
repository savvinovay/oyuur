// The frame of the account screens (frames 02–04): the page bar, the form that scrolls, and the
// main button stuck to the bottom like "Plant the tree" (new.tsx) — the page fades in above it.
// With the keyboard up the bottom part rides on top of it (iOS; Android resizes by itself).
import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Page, useColors } from '@/ui/ds';

const FADE = 24;

export function FormPage({ title, hideBack, onBack, right, children, footer }: {
  title: string;
  hideBack?: boolean;
  onBack?: () => void;
  right?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Page title={title} hideBack={hideBack} onBack={onBack} right={right}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View>
          <Svg width="100%" height={FADE} style={styles.fade} pointerEvents="none">
            <Defs>
              <LinearGradient id="formFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.page} stopOpacity={0} />
                <Stop offset="1" stopColor={c.page} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height={FADE} fill="url(#formFade)" />
          </Svg>
          <View style={[styles.footer, { backgroundColor: c.page, paddingBottom: insets.bottom + 8 }]}>{footer}</View>
        </View>
      </KeyboardAvoidingView>
    </Page>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  fade: { position: 'absolute', top: -FADE, left: 0 },
  footer: { paddingHorizontal: 16, paddingTop: 4 },
});
