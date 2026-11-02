// The pieces of the friends list above and below the rows (спец-друзья 4.1, 4.3, 4.4, frames 05, 07):
// the search "field" (a button to "Find a friend"), the requests row, "… cheered you on", the
// empty state, the "friends see 2 of 3" link and the sticky "Invite a friend".
import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { Person } from '@/game/shared';
import { useStore } from '@/state/store';
import { Button, elevation, fonts, Glyph, Icon, Txt, useColors, withAlpha } from '@/ui/ds';
import { FriendAvatar } from './FriendAvatar';
import { clock, displayName } from './model';

/** A white card that is a button (the search field, the requests row, the cheers card). */
function CardButton({ children, onPress, height, label }: { children: ReactNode; onPress?: () => void; height: number; label: string }) {
  const c = useColors();
  const { night } = useStore();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.card, elevation(1, night), { minHeight: height, backgroundColor: pressed ? withAlpha(c.card, 0.85) : c.card }]}
    >
      {children}
    </Pressable>
  );
}

export function SearchButton({ onPress }: { onPress: () => void }) {
  const { t } = useStore();
  const c = useColors();
  return (
    <CardButton onPress={onPress} height={48} label={t('frSearch')}>
      <Icon name="search" size={20} color={c.textSoft} />
      <Txt numberOfLines={1} style={[styles.searchText, { color: c.textMuted }]}>{t('frSearch')}</Txt>
    </CardButton>
  );
}

export function RequestsRow({ title, summary, fresh, onPress }: { title: string; summary: string; fresh: number; onPress: () => void }) {
  const c = useColors();
  return (
    <CardButton onPress={onPress} height={56} label={`${title}. ${summary}`}>
      <View style={[styles.circle, { backgroundColor: c.tintFriends }]}>
        <Icon name="userPlus" size={20} color="#2F86BE" />
      </View>
      <View style={styles.flex}>
        <Txt numberOfLines={1} style={styles.rowTitle}>{title}</Txt>
        <Txt numberOfLines={1} style={[styles.rowSub, { color: c.textSoft }]}>{summary}</Txt>
      </View>
      {fresh > 0 && (
        <View style={[styles.count, { backgroundColor: c.badge }]}>
          <Txt style={styles.countText}>{fresh}</Txt>
        </View>
      )}
      <Icon name="chevronRight" size={18} color={c.textSoft} />
    </CardButton>
  );
}

/** "Mei cheered you on · today at 10:42 · cheer back"; several — "Mei and 2 more …". */
export function CheerCard({ from, at, more, cheeredBack, onPress }: {
  from: Person; at: number | null; more: number; cheeredBack: boolean; onPress?: () => void;
}) {
  const { t } = useStore();
  const c = useColors();
  const name = displayName(from);
  const title = more > 0 ? t('frCheeredMany', { name, n: more }) : t('frCheeredYou', { name });
  const when = at ? t('frCheeredAt', { time: clock(at) }) : t('frCheeredToday');
  const sub = cheeredBack || more > 0 ? when : `${when} · ${t('frCheerBack')}`;
  return (
    <CardButton onPress={onPress} height={60} label={`${title}. ${sub}`}>
      <FriendAvatar person={from} size={40} badge="cheer" />
      <View style={[styles.flex, { marginLeft: 4 }]}>
        <Txt numberOfLines={1} style={styles.rowTitle}>{title}</Txt>
        <Txt numberOfLines={1} style={[styles.rowSub, { color: c.textSoft }]}>{sub}</Txt>
      </View>
      {onPress && <Icon name="chevronRight" size={18} color={c.textSoft} />}
    </CardButton>
  );
}

/** "Friends see 2 of your 3 trees ›" under the rows. */
export function SeeLink({ text, onPress }: { text: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.see} hitSlop={8}>
      <Icon name="eye" size={16} color={c.textSoft} />
      <Txt numberOfLines={1} style={[styles.seeText, { color: c.textSoft }]}>{text}</Txt>
      <Icon name="chevronRight" size={14} color={c.textSoft} />
    </Pressable>
  );
}

/** "Your name: @sasha_t", the nick bold; with `onShare` a share icon after it. */
export function YourNick({ nick, onShare }: { nick: string; onShare?: () => void }) {
  const { t } = useStore();
  const c = useColors();
  const body = (
    <>
      <Txt style={[styles.nick, { color: c.textSoft }]}>
        {t('frYourNick')} <Txt style={[styles.nick, { color: c.text, fontFamily: fonts.black }]}>@{nick}</Txt>
      </Txt>
      {onShare && <Icon name="share" size={16} color={c.textSoft} />}
    </>
  );
  if (!onShare) return <View style={styles.nickRow}>{body}</View>;
  return (
    <Pressable onPress={onShare} accessibilityRole="button" style={styles.nickRow} hitSlop={8}>
      {body}
    </Pressable>
  );
}

/** No friends yet (frame 07): two "holes" — me and an empty one — and the ways to find someone. */
export function EmptyFriends({ me, nick, onFind, onInvite }: { me: Pick<Person, 'avatar' | 'color'>; nick: string; onFind: () => void; onInvite: () => void }) {
  const { t } = useStore();
  const c = useColors();
  const dash = withAlpha(c.textMuted, 0.6);
  return (
    <View style={styles.empty}>
      <View style={styles.holes}>
        <View style={[styles.hole, { borderColor: dash }]}>
          <FriendAvatar person={me} size={64} />
        </View>
        <Glyph name="sprout" size={36} style={styles.sprout} />
        <View style={[styles.hole, { borderColor: dash }]}>
          <Icon name="plus" size={28} color={dash} strokeWidth={2} />
        </View>
      </View>
      <Txt variant="title2" style={styles.center}>{t('frEmptyTitle')}</Txt>
      <Txt style={[styles.emptyText, { color: c.textSoft }]}>{t('frEmptyText')}</Txt>
      <View style={styles.emptyButtons}>
        <Button title={t('frFindByNick')} icon="search" onPress={onFind} />
        <Button title={t('frInviteByLink')} glyph="invite" variant="secondary" size="m" cue="tap" onPress={onInvite} />
      </View>
      <YourNick nick={nick} />
    </View>
  );
}

/** "Invite a friend" stuck to the bottom, the list fading into the page above it (34 px). */
export function BottomInvite({ onPress }: { onPress: () => void }) {
  const { t } = useStore();
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <Svg width="100%" height={34} style={styles.fade} pointerEvents="none">
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={c.page} stopOpacity={0} />
            <Stop offset="1" stopColor={c.page} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="34" fill="url(#fade)" />
      </Svg>
      <View style={{ backgroundColor: c.page, paddingHorizontal: 16 }}>
        <Button title={t('frInvite')} glyph="invite" onPress={onPress} />
      </View>
    </View>
  );
}

/** Height of BottomInvite above the bottom inset, for the list's padding. */
export const BOTTOM_INVITE_H = 34 + 60 + 12;

const styles = StyleSheet.create({
  card: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  searchText: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, flex: 1 },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: fonts.black, fontSize: 15, lineHeight: 20 },
  rowSub: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  count: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: fonts.black, fontSize: 12.5, lineHeight: 16, color: '#FFFFFF' },
  see: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, minHeight: 20 },
  seeText: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  nickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, minHeight: 24 },
  nick: { fontFamily: fonts.bold, fontSize: 13, lineHeight: 18 },
  empty: { alignItems: 'center', paddingHorizontal: 16, paddingTop: 72 },
  holes: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28 },
  hole: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  sprout: { marginTop: 24 },
  center: { textAlign: 'center' },
  emptyText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  emptyButtons: { alignSelf: 'stretch', gap: 12, marginTop: 24, paddingHorizontal: 16 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  fade: { marginBottom: -1 },
});
