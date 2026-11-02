// Small pieces the account screens share: the "Already have an account? Sign in" line, the error
// line over the main button, going back where the screens were opened from, sharing and copying.
import { Href, router } from 'expo-router';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import type { T } from '@/i18n';
import { inviteLink } from '@/net/api';
import { fonts, Icon, MAX_FONT_SCALE, Txt, useColors, Vault, withAlpha } from '@/ui/ds';
import { useStore } from '@/state/store';
import { AccountFrom, landing } from './model';

/** Routes made in this wave are not in the generated route types until the dev server runs. */
export const href = (path: string, params?: Record<string, string>) =>
  (params ? { pathname: path, params } : path) as unknown as Href;

/** After signing in or creating: back where the account screens were opened from (spec 3.5). */
export function leaveAccount(from: AccountFrom) {
  const { back, then } = landing(from);
  router.dismissTo(href(back));
  if (then) router.push(href(then));
}

/** The chest of an honest card (recovery, a new password without the key): 36 on a light circle. */
export function ChestBadge() {
  const { night } = useStore();
  return (
    <View style={[styles.chest, { backgroundColor: withAlpha('#FFFFFF', night ? 0.16 : 0.8) }]}>
      <Vault size={36} />
    </View>
  );
}

/** "Already have an account? — Sign in": a text button M, the action word in `doneInk`. */
export function LinkLine({ lead, action, onPress, testID }: { lead: string; action: string; onPress(): void; testID?: string }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${lead} ${action}`}
      testID={testID}
      style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}
    >
      <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[styles.linkText, { color: c.textSoft }]}>
        {lead}{' '}
        <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.linkText, { color: c.doneInk }]}>{action}</Txt>
      </Txt>
    </Pressable>
  );
}

/** A server's "no" over the main button: an "i" and a red line. */
export function ErrorLine({ text }: { text: string | null }) {
  const c = useColors();
  if (!text) return null;
  return (
    <View style={styles.error} accessibilityLiveRegion="assertive" accessibilityRole="alert">
      <Icon name="info" size={16} color={c.dangerText} />
      <Txt style={[styles.errorText, { color: c.dangerText }]}>{text}</Txt>
    </View>
  );
}

/** The screen's title on the bar's right, like "Later" (16/800 textSoft, 44 to tap). */
export function BarText({ title, onPress }: { title: string; onPress(): void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6} style={({ pressed }) => [styles.bar, pressed && { opacity: 0.6 }]}>
      <Txt maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.barText, { color: c.textSoft }]}>{title}</Txt>
    </Pressable>
  );
}

const webClipboard = () =>
  Platform.OS === 'web' ? (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator?.clipboard : undefined;

/** Copying is there only in the browser (no expo-clipboard yet); on phones the code is shared to notes. */
export const canCopy = () => !!webClipboard();

export async function copyText(text: string): Promise<boolean> {
  try {
    await webClipboard()?.writeText(text);
    return !!webClipboard();
  } catch {
    return false;
  }
}

/** The system "Share" with a text; false when there is none (a desktop browser). */
export async function shareText(message: string): Promise<boolean> {
  try {
    await Share.share({ message });
    return true;
  } catch {
    return false;
  }
}

/** "Let's grow habits together… My name is @sasha_t" and the invite link. */
export const inviteText = (t: T, nick: string) => `${t('accInviteMessage', { nick })}\n${inviteLink(nick)}`;

const styles = StyleSheet.create({
  chest: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  link: { height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  error: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 10, marginHorizontal: 4 },
  errorText: { flex: 1, fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  bar: { height: 44, justifyContent: 'center', paddingHorizontal: 4 },
  barText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
});
