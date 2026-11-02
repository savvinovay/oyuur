// Settings → "Account", the first groups (wave 5 spec 3.7, frame 40; OYUUR-30 — design/oyuur-29/
// спец.md 7, 8.2, frames 10–12). Signed in: my @nick with "Share", the saving row, "Blocked" with
// how many, "Sign out" (the forest comes back when you sign in) — then "Password and code" and,
// in a group of its own, the red "Delete account". Signed out: one row, "Sign in or create an account".
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { atNick } from '@/game/nick';
import type { AvatarId } from '@/game/profile';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { useSync } from '@/state/sync';
import { Avatar } from '@/ui/avatars/Avatar';
import { Group, Icon, Row, rowTint, Txt, useColors, withAlpha } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { HintRow, rowStyles } from './HintRow';
import { ACCOUNT_TINT, softOnCard } from './look';
import { copyText, href, inviteText, shareText } from './parts';
import { SyncRow } from './SyncRow';

const TINT = { blocked: '#8D93A1', signOut: '#F4B740', signIn: '#FF9E5E' };

/** `onSignOut` opens the sign-out sheet: it lives on the page, over the whole screen. */
export function SettingsAccount({ onSignOut }: { onSignOut(): void }) {
  const c = useColors();
  const { t, night } = useStore();
  const friends = useFriends();
  const sync = useSync();
  const { account } = friends;
  const [blocked, setBlocked] = useState<number | null>(null);

  // How many are blocked: asked each time Settings comes to the front (back from "Blocked" too).
  const signedIn = !!account;
  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      let alive = true;
      friends
        .blocks()
        .then((r) => alive && setBlocked(r.users.length))
        .catch(() => {});
      return () => {
        alive = false;
      };
      // `friends.blocks` is a new function every render of the provider.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signedIn]),
  );

  if (!friends.ready) return null;

  // The server ended the session (the password was changed elsewhere): "Sign in again" with the
  // nick, not the plain "Sign in or create" — this phone's forest still belongs to that account.
  if (!account && sync.state === 'session') {
    return (
      <Group title={t('accGroup')}>
        <SyncRow />
      </Group>
    );
  }

  if (!account) {
    return (
      <Group title={t('accGroup')}>
        <Row icon="people" tint={TINT.signIn} label={t('accSignInOrCreate')} onPress={() => router.push(href('/account', { from: 'settings' }))} />
      </Group>
    );
  }

  const share = async () => {
    cue('tap');
    const text = inviteText(t, account.nick);
    if (!(await shareText(text)) && (await copyText(text))) showQuestHint(t('accTextCopied'), 2000);
  };

  return (
    <>
      <Group title={t('accGroup')}>
        <View style={rowStyles.row}>
          <Avatar id={account.avatar as AvatarId} color={account.color} size={32} />
          <View style={rowStyles.text}>
            <Txt variant="bodyStrong" numberOfLines={1} testID="my-nick">{atNick(account.nick)}</Txt>
            <Txt style={[rowStyles.hint, { color: softOnCard(c, night) }]} numberOfLines={2}>{t('accNickRowHint')}</Txt>
          </View>
          <Pressable
            onPress={share}
            accessibilityRole="button"
            accessibilityLabel={t('accShare')}
            hitSlop={4}
            style={({ pressed }) => [styles.share, pressed && { backgroundColor: withAlpha(c.sunken, 0.6) }]}
          >
            <Icon name="share" size={22} color={c.textSoft} />
          </Pressable>
        </View>
        <SyncRow />
        <Row
          icon="noSign"
          tint={TINT.blocked}
          label={t('accBlocked')}
          onPress={() => router.push(href('/blocked'))}
          right={
            <View style={styles.count}>
              {blocked ? <Txt variant="bodyStrong" color={c.textSoft}>{blocked}</Txt> : null}
              <Icon name="chevronRight" size={20} color={c.textSoft} />
            </View>
          }
        />
        <HintRow icon="logout" tint={TINT.signOut} label={t('accSignOut')} hint={t('accSignOutHint')} onPress={onSignOut} testID="signout" />
      </Group>
      <Group title={t('accPassGroup')}>
        <HintRow icon="key" tint={ACCOUNT_TINT.password} label={t('accChangePassword')} chevron onPress={() => router.push(href('/password'))} testID="change-password" />
        <HintRow
          icon="code"
          tint={ACCOUNT_TINT.code}
          label={t('accNewCode')}
          hint={t('accNewCodeHint')}
          chevron
          onPress={() => router.push(href('/new-code'))}
          testID="new-code"
        />
      </Group>
      <Group style={styles.apart}>
        <HintRow
          icon="trash"
          tint={rowTint.danger}
          label={t('accDelete')}
          labelColor={c.dangerText}
          hint={t('accDeleteHint')}
          onPress={() => router.push(href('/delete-account'))}
        />
      </Group>
    </>
  );
}

const styles = StyleSheet.create({
  share: { width: 40, height: 44, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginLeft: -4, marginRight: -8 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  apart: { marginTop: 20 },
});
