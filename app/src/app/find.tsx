// Find a friend (design/волна-5/спец-друзья.md, 5.1, frames 09–10): the @nick field in focus,
// a search 400 ms after the last letter from 3 letters on (an older answer is dropped), up to
// 10 people with what can be done with each; "nobody" with a hint; the invite card always.
// `/find?q=aisha_k` comes with the nick typed in.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, TextStyle, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { typeNick } from '@/game/nick';
import type { Person } from '@/game/shared';
import { isOffline, Relation } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { SignInGate } from '@/ui/account/SignInGate';
import { elevation, fonts, Icon, MAX_FONT_SCALE, Page, Txt, useColors } from '@/ui/ds';
import { InviteCard } from '@/ui/friends/InviteCard';
import { YourNick } from '@/ui/friends/ListParts';
import { friendPath, go } from '@/ui/friends/nav';
import { shareInvite } from '@/ui/friends/share';
import { FriendsToast } from '@/ui/friends/Toast';
import { UserRow } from '@/ui/friends/UserRow';

const MIN = 3;
const WAIT = 400;
const FIELD_WEB = Platform.OS === 'web' ? ({ outlineStyle: 'none', userSelect: 'text' } as unknown as TextStyle) : null;

type Found = Person & { relation: Relation };

export default function FindScreen() {
  const { t } = useStore();
  const f = useFriends();
  if (!f.ready) return <Page title={t('frFindTitle')}>{null}</Page>;
  if (!f.account) {
    return (
      <Page title={t('frFindTitle')}>
        <SignInGate />
      </Page>
    );
  }
  return <Find nick={f.account.nick} />;
}

function Find({ nick }: { nick: string }) {
  const { t, night } = useStore();
  const f = useFriends();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(() => typeNick(params.q ?? ''));
  const [focused, setFocused] = useState(true);
  const [found, setFound] = useState<{ q: string; users: Found[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [offline, setOffline] = useState(f.status === 'offline');
  const asked = useRef(0);

  // `search` is a new function every render of the provider (each refresh): kept in a ref, so a
  // refresh doesn't ask the same again.
  const searchRef = useRef(f.search);
  searchRef.current = f.search;
  useEffect(() => {
    const q = text;
    if (q.length < MIN) {
      asked.current++;
      setFound(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = setTimeout(() => {
      const ticket = ++asked.current;
      searchRef.current(q)
        .then((r) => {
          if (ticket !== asked.current) return;
          setFound({ q, users: r.users.filter((u) => u.relation !== 'blocked') });
          setOffline(false);
        })
        .catch((e) => {
          if (ticket !== asked.current) return;
          setOffline(isOffline(e));
          setFound(null);
        })
        .finally(() => ticket === asked.current && setSearching(false));
    }, WAIT);
    return () => clearTimeout(id);
  }, [text]);

  // Back online: the screen says so as soon as the friends data comes.
  useEffect(() => {
    if (f.status === 'ok') setOffline(false);
    if (f.status === 'offline') setOffline(true);
  }, [f.status]);

  const share = () => shareInvite(t, nick);
  const results = found && found.q === text ? found.users : null;

  return (
    <View style={styles.root}>
      <Page title={t('frFindTitle')}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          <View
            style={[
              styles.field,
              elevation(1, night),
              { backgroundColor: c.card, borderColor: focused ? c.accent : 'transparent' },
            ]}
          >
            <Icon name="search" size={20} color={c.textSoft} />
            <Txt style={[styles.at, { color: c.textSoft }]}>@</Txt>
            <TextInput
              value={text}
              onChangeText={(v) => setText(typeNick(v))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              keyboardType={Platform.OS === 'android' ? 'visible-password' : 'ascii-capable'}
              returnKeyType="search"
              maxLength={20}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              accessibilityLabel={t('frSearch')}
              style={[styles.input, FIELD_WEB, { color: c.text }]}
            />
            {searching ? (
              <ActivityIndicator size="small" color={c.accent} style={styles.spin} />
            ) : text.length > 0 ? (
              <Pressable
                onPress={() => setText('')}
                accessibilityRole="button"
                accessibilityLabel={t('frClearSearch')}
                hitSlop={10}
                style={[styles.clear, { backgroundColor: c.sunken }]}
              >
                <Icon name="close" size={12} color={c.text} strokeWidth={2.6} />
              </Pressable>
            ) : null}
          </View>

          {offline && (
            <View style={styles.offline}>
              <Icon name="wifiOff" size={16} color={c.textSoft} />
              <Txt style={[styles.offlineText, { color: c.textSoft }]}>{t('frSearchOffline')}</Txt>
            </View>
          )}

          {results && results.length > 0 && (
            <>
              <Txt variant="caption" style={[styles.group, { color: c.textSoft }]} accessibilityRole="header">{t('frFound')}</Txt>
              <View style={[styles.card, elevation(1, night), { backgroundColor: c.card }]}>
                <View style={styles.clip}>
                  {results.map((u, i) => (
                    <View key={u.nick}>
                      {i > 0 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
                      <UserRow person={u} said={u.relation} offline={offline} onOpen={(n) => go(friendPath(n))} />
                    </View>
                  ))}
                </View>
              </View>
            </>
          )}

          {results && results.length === 0 && (
            <View style={styles.nobody}>
              <Txt style={styles.nobodyTitle}>{t('frNobody', { nick: text })}</Txt>
              <Txt style={[styles.nobodyText, { color: c.textSoft }]}>{t('frNobodyHint')}</Txt>
            </View>
          )}

          <View style={styles.invite}>
            <InviteCard onShare={share} />
          </View>
          <YourNick nick={nick} onShare={share} />
        </ScrollView>
      </Page>
      <FriendsToast />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  field: { height: 52, borderRadius: 16, borderWidth: 2, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  at: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, marginRight: -6 },
  input: { flex: 1, minWidth: 0, height: 48, fontFamily: fonts.bold, fontSize: 17, padding: 0 },
  spin: { width: 24, height: 24 },
  clear: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginLeft: 6 },
  offlineText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  group: { fontFamily: fonts.black, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 8, marginLeft: 6 },
  card: { borderRadius: 20 },
  clip: { borderRadius: 20, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth * 2, marginLeft: 72 },
  nobody: { alignItems: 'center', marginTop: 28, paddingHorizontal: 12 },
  nobodyTitle: { fontFamily: fonts.black, fontSize: 18, lineHeight: 24, textAlign: 'center' },
  nobodyText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6 },
  invite: { marginTop: 24 },
});
