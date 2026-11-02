// Requests (design/волна-5/спец-друзья.md, 5.2, frame 11): incoming friendship and shared trees
// offered to me (accept / decline), my outgoing requests (cancel). A row leaves in 160 ms. Opening
// the screen marks the requests seen: the red count and the "NEW" tags go next time.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Person, SharedTree } from '@/game/shared';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { SignInGate } from '@/ui/account/SignInGate';
import { Button, elevation, fonts, Page, Txt, useColors, useMotionOn } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { FriendAvatar } from '@/ui/friends/FriendAvatar';
import { useFriendsMemory } from '@/ui/friends/memory';
import { agoText, displayName, nameInCase } from '@/ui/friends/model';
import { friendsToast, FriendsToast } from '@/ui/friends/Toast';
import { TreeBox } from '@/ui/friends/TreeBox';

export default function RequestsScreen() {
  const { t } = useStore();
  const f = useFriends();
  if (!f.ready) return <Page title={t('frRequestsTitle')}>{null}</Page>;
  if (!f.account) {
    return (
      <Page title={t('frRequestsTitle')}>
        <SignInGate />
      </Page>
    );
  }
  return <Requests nick={f.account.nick} />;
}

type Busy = Record<string, boolean>;

function Requests({ nick }: { nick: string }) {
  const { t, night } = useStore();
  const f = useFriends();
  const c = useColors();
  const motionOn = useMotionOn();
  const insets = useSafeAreaInsets();
  const memory = useFriendsMemory();
  // What was new when the screen opened stays marked while it is open.
  const [seenAt] = useState(memory.requestsSeenAt);
  const [gone, setGone] = useState<Busy>({});
  const { requestsSeen } = memory;
  useFocusEffect(
    useCallback(() => {
      requestsSeen(Date.now());
    }, [requestsSeen]),
  );

  const offers = f.shared.filter((s) => s.status === 'proposed' && s.partner?.nick === nick && !gone[s.id]);
  const incoming = f.lists.incoming.filter((r) => !gone[r.nick]);
  const outgoing = f.lists.outgoing.filter((r) => !gone[r.nick]);
  const now = Date.now();

  /** The row goes at once; on an error it comes back with a toast. */
  const act = async (key: string, run: () => Promise<void>, done?: () => void) => {
    setGone((g) => ({ ...g, [key]: true }));
    try {
      await run();
      done?.();
    } catch {
      setGone((g) => ({ ...g, [key]: false }));
      friendsToast(t('frSendFailed'), null);
    }
  };
  const acceptFriend = (p: Person) => {
    cue('friendAdded');
    act(p.nick, () => f.acceptFriend(p.nick), () => friendsToast(t('frNowFriends', { name: nameInCase(t, p) })));
  };
  const acceptShared = (s: SharedTree) => {
    cue('plant');
    act(s.id, () => f.acceptShared(s.id), () => friendsToast(t('frSharedPlanted')));
  };

  const offline = f.status === 'offline';
  const total = incoming.length + offers.length + outgoing.length;
  const leave = motionOn ? FadeOut.duration(160) : undefined;
  // On the web a layout transition scales the rows' content: only on phones.
  const move = motionOn && Platform.OS !== 'web' ? LinearTransition.duration(260) : undefined;
  const divider = <View style={[styles.divider, { backgroundColor: c.divider }]} />;

  return (
    <View style={styles.root}>
      <Page title={t('frRequestsTitle')}>
        {total === 0 ? (
          <View style={styles.empty}>
            <Txt variant="title3" color={c.textSoft}>{t('frNoRequests')}</Txt>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
            {incoming.length + offers.length > 0 && (
              <>
                <Txt variant="caption" style={[styles.group, { color: c.textSoft }]} accessibilityRole="header">
                  {t('frIncoming', { n: incoming.length + offers.length })}
                </Txt>
                <View style={[styles.card, elevation(1, night), { backgroundColor: c.card }]}>
                  {incoming.map((r, i) => (
                    <Animated.View key={r.nick} exiting={leave} layout={move}>
                      {i > 0 && divider}
                      <View style={styles.row}>
                        <FriendAvatar person={r} size={48} />
                        <View style={styles.text}>
                          <View style={styles.nameLine}>
                            <Txt numberOfLines={1} style={styles.name}>{displayName(r)}</Txt>
                            {r.at > seenAt && (
                              <View style={[styles.tag, { backgroundColor: c.badge }]}>
                                <Txt variant="micro" color="#FFFFFF">{t('frNewTag')}</Txt>
                              </View>
                            )}
                          </View>
                          <Txt style={[styles.sub, { color: c.textSoft }]}>
                            {t('frWantsFriends', { nick: `@${r.nick}`, ago: agoText(t, now - r.at) })}
                          </Txt>
                          <View style={styles.buttons}>
                            <Button title={t('frAccept')} icon="check" size="s" cue={null} disabled={offline} onPress={() => acceptFriend(r)} />
                            <Button
                              title={t('frDecline')}
                              icon="close"
                              size="s"
                              variant="secondary"
                              cue={null}
                              disabled={offline}
                              onPress={() => act(r.nick, () => f.removeFriend(r.nick))}
                            />
                          </View>
                        </View>
                      </View>
                    </Animated.View>
                  ))}
                  {offers.map((s, i) => {
                    const from = s.proposer;
                    if (!from) return null;
                    return (
                      <Animated.View key={s.id} exiting={leave} layout={move}>
                        {(i > 0 || incoming.length > 0) && divider}
                        <View style={styles.row}>
                          <FriendAvatar person={from} size={48} />
                          <View style={styles.text}>
                            <View style={styles.nameLine}>
                              <Txt style={[styles.name, { flexShrink: 1 }]}>{t('frSharedProposal', { name: displayName(from) })}</Txt>
                              {s.createdAt > seenAt && (
                                <View style={[styles.tag, { backgroundColor: c.badge }]}>
                                  <Txt variant="micro" color="#FFFFFF">{t('frNewTag')}</Txt>
                                </View>
                              )}
                            </View>
                            <View style={styles.offer}>
                              <TreeBox box={48} days={1} skin={s.skin} seed={s.id} />
                              <View style={styles.text}>
                                <Txt numberOfLines={2} style={styles.habit}>{s.name}</Txt>
                                <Txt style={[styles.offerLine, { color: c.textSoft }]}>
                                  {t('frSharedLine', {
                                    kind: t(s.kind === 'do' ? 'frDoIt' : 'frQuitIt'),
                                    skin: t.dict.skinNames[s.skin].toLocaleLowerCase(t.lang),
                                  })}
                                </Txt>
                              </View>
                            </View>
                            <View style={styles.buttons}>
                              <Button title={t('frAccept')} icon="check" size="s" cue={null} disabled={offline} onPress={() => acceptShared(s)} />
                              <Button
                                title={t('frNotNow')}
                                icon="close"
                                size="s"
                                variant="secondary"
                                cue={null}
                                disabled={offline}
                                onPress={() => act(s.id, () => f.declineShared(s.id))}
                              />
                            </View>
                          </View>
                        </View>
                      </Animated.View>
                    );
                  })}
                </View>
              </>
            )}
            {outgoing.length > 0 && (
              <View>
                <Txt variant="caption" style={[styles.group, { color: c.textSoft }]} accessibilityRole="header">
                  {t('frOutgoing', { n: outgoing.length })}
                </Txt>
                <View style={[styles.card, elevation(1, night), { backgroundColor: c.card }]}>
                  {outgoing.map((r, i) => (
                    <Animated.View key={r.nick} exiting={leave} layout={move}>
                      {i > 0 && divider}
                      <View style={[styles.row, styles.outRow]}>
                        <FriendAvatar person={r} size={48} />
                        <View style={styles.text}>
                          <Txt numberOfLines={1} style={styles.name}>{displayName(r)}</Txt>
                          <Txt numberOfLines={1} style={[styles.sub, { color: c.textSoft }]}>{t('frWaitingReply', { nick: `@${r.nick}` })}</Txt>
                        </View>
                        <Pressable
                          disabled={offline}
                          onPress={() => act(r.nick, () => f.removeFriend(r.nick), () => friendsToast(t('frRequestCanceled')))}
                          accessibilityRole="button"
                          hitSlop={10}
                          style={styles.cancel}
                        >
                          <Txt style={[styles.cancelText, { color: offline ? c.textMuted : c.dangerText }]}>{t('frCancel')}</Txt>
                        </Pressable>
                      </View>
                    </Animated.View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </Page>
      <FriendsToast />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  group: { fontFamily: fonts.black, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 8, marginLeft: 6 },
  card: { borderRadius: 20, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth * 2, marginLeft: 74 },
  row: { padding: 14, flexDirection: 'row', gap: 12 },
  outRow: { alignItems: 'center', paddingVertical: 12 },
  text: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: fonts.black, fontSize: 16, lineHeight: 21, flexShrink: 1 },
  tag: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  sub: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, marginTop: 2 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  habit: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20 },
  offerLine: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 17 },
  cancel: { minHeight: 44, justifyContent: 'center' },
  cancelText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
});
