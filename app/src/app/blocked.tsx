// "Blocked" (wave 5 spec 3.7): people I blocked, each with "Unblock" — no dialog, a toast
// "@aisha_k unblocked" and the row goes. Loaded from the server each time the screen opens.
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { AvatarId } from '@/game/profile';
import type { Person } from '@/game/shared';
import { atNick } from '@/game/nick';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { errorText } from '@/ui/account/model';
import { Spinner } from '@/ui/account/NickField';
import { Avatar } from '@/ui/avatars/Avatar';
import { Button, fonts, Group, Icon, Page, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { showQuestHint } from '@/ui/quests/QuestHint';

type Load = { state: 'loading' } | { state: 'failed'; text: string } | { state: 'ok'; users: Person[] };

export default function Blocked() {
  const c = useColors();
  const { t } = useStore();
  const { account, blocks, unblock } = useFriends();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);

  const fetchList = useCallback(() => {
    setLoad({ state: 'loading' });
    blocks()
      .then((r) => setLoad({ state: 'ok', users: r.users }))
      .catch((e) => setLoad({ state: 'failed', text: errorText(t, e) }));
    // `blocks` is a new function every render of the provider; once per opening is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  useEffect(() => {
    if (account) fetchList();
    else setLoad({ state: 'ok', users: [] });
  }, [account, fetchList]);

  const free = async (nick: string) => {
    if (busy) return;
    setBusy(nick);
    try {
      await unblock(nick);
      cue('select');
      showQuestHint(t('accUnblocked', { nick }), 2500);
      setLoad((l) => (l.state === 'ok' ? { state: 'ok', users: l.users.filter((u) => u.nick !== nick) } : l));
    } catch (e) {
      cue('error');
      showQuestHint(errorText(t, e), 3000);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Page title={t('accBlocked')}>
      {load.state === 'loading' ? (
        <View style={styles.center}>
          <Spinner size={32} />
        </View>
      ) : load.state === 'failed' ? (
        <View style={styles.center}>
          <Message icon="wifiOff" title={t('accLoadFailed')} text={load.text} />
          <Button title={t('accRetry')} variant="secondary" size="m" icon="refresh" onPress={fetchList} style={styles.retry} />
        </View>
      ) : load.users.length === 0 ? (
        <View style={styles.center}>
          <Message icon="noSign" title={t('accBlockedEmpty')} text={t('accBlockedEmptyText')} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Group>
            {load.users.map((u) => (
              <View key={u.nick} style={styles.row}>
                <Avatar id={u.avatar as AvatarId} color={u.color} size={40} />
                <View style={styles.who}>
                  <Txt variant="bodyStrong" numberOfLines={1}>{u.name ?? atNick(u.nick)}</Txt>
                  {u.name ? <Txt variant="small" color={c.textSoft} numberOfLines={1} style={styles.nick}>{atNick(u.nick)}</Txt> : null}
                </View>
                <Button
                  title={t('accUnblock')}
                  variant="text"
                  size="s"
                  disabled={busy === u.nick}
                  onPress={() => free(u.nick)}
                  accessibilityLabel={`${t('accUnblock')} ${atNick(u.nick)}`}
                />
              </View>
            ))}
          </Group>
        </ScrollView>
      )}
    </Page>
  );
}

function Message({ icon, title, text }: { icon: 'wifiOff' | 'noSign'; title: string; text: string }) {
  const c = useColors();
  return (
    <>
      <View style={[styles.circle, { backgroundColor: c.sunken }]}>
        <Icon name={icon} size={44} color={c.textSoft} />
      </View>
      <Txt variant="title2" style={styles.title}>{title}</Txt>
      <Txt style={[styles.text, { color: c.textSoft }]}>{text}</Txt>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 80 },
  circle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { textAlign: 'center' },
  text: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  retry: { width: 220, marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 64 },
  who: { flex: 1, minWidth: 0 },
  nick: { fontFamily: fonts.bold },
});
