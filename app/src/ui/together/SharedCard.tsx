// The shared tree card on a friend's profile (спец-друзья 8.1, frame 31). States:
// - none: a dashed invitation to suggest one (opens ProposeSheet);
// - invited / invitedMe: the offer, waiting for them ("Cancel invitation") or for me (accept / not now);
// - none / mine / theirs / both watered today: the tree, who watered, "Water your half" until I have;
// - dead: the dead tree and "Plant again together" (the same habit, a new invitation).
// An ended tree has no card (it is a memory in the forests). The card opens together.tsx.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { partnerOf, Person, SharedTree, sharedAsTree } from '@/game/shared';
import { growthDays } from '@/game/tree';
import { isOffline } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { Button, elevation, fonts, Glyph, Icon, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { earlyText, useMinutesToOpen } from '@/ui/live/EarlyChip';
import { showQuestHint } from '@/ui/quests/QuestHint';
import { daysText } from '@/ui/forest/sheet/status';
import { nameIn, nameOf, openWith, sharedPhase } from './model';
import { PairAvatar } from './PairAvatar';
import { DaysBadge, SharedThumb, WhoMark } from './parts';
import { ProposeInitial, ProposeSheet } from './ProposeSheet';

/** The picture; 72 on a narrow screen, so the text keeps its room. */
const THUMB = 88;
const THUMB_NARROW = 72;

export function SharedCard({ friend }: { friend: Person }) {
  const { account, shared } = useFriends();
  const [proposing, setProposing] = useState<{ initial?: ProposeInitial } | null>(null);
  if (!account) return null;
  const s = openWith(shared, account.nick, friend.nick);
  return (
    <>
      {s ? <TreeCardBody s={s} me={account.nick} friend={friend} onPlantAgain={(initial) => setProposing({ initial })} /> : <OfferCard friend={friend} onPropose={() => setProposing({})} />}
      {proposing && <ProposeSheet friend={friend} initial={proposing.initial} onClosed={() => setProposing(null)} />}
    </>
  );
}

/** No shared tree yet: a dashed card that invites to suggest one. */
function OfferCard({ friend, onPropose }: { friend: Person; onPropose(): void }) {
  const { t, profile } = useStore();
  const c = useColors();
  return (
    <View style={[styles.offer, { borderColor: c.textMuted }]}>
      <View style={styles.offerTop}>
        <PairAvatar me={profile} friend={friend} size={56} />
        <View style={styles.text}>
          <Txt style={[styles.offerTitle, { color: c.text }]} numberOfLines={2}>{t('tgSharedWith', { name: nameIn(friend, t.lang) })}</Txt>
          <Txt style={[styles.offerText, { color: c.textSoft }]}>{t('tgOfferText')}</Txt>
        </View>
      </View>
      <Button size="m" variant="secondary" glyph="sprout" title={t('tgPropose')} onPress={onPropose} cue="tap" style={styles.button} testID="shared-offer" />
    </View>
  );
}

function TreeCardBody({ s, me, friend, onPlantAgain }: { s: SharedTree; me: string; friend: Person; onPlantAgain(initial: ProposeInitial): void }) {
  const { t, today, profile, night, canWaterSharedNow, sharedHalf } = useStore();
  const minutesToOpen = useMinutesToOpen();
  const { width } = useWindowDimensions();
  const box = width < 360 ? THUMB_NARROW : THUMB;
  const friends = useFriends();
  const c = useColors();
  const [busy, setBusy] = useState(false);
  const phase = sharedPhase(s, me, today);
  const tree = sharedAsTree(s, today);
  const other = partnerOf(s, me) ?? friend;
  const offer = phase === 'invited' || phase === 'invitedMe';
  const both = phase === 'both';
  const open = () => router.push({ pathname: '/together', params: { id: s.id } });

  const act = async (run: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await run();
    } catch (e) {
      cue('error');
      showQuestHint(isOffline(e) ? t('tgNeedInternet') : t('tgSendFailed'));
    } finally {
      setBusy(false);
    }
  };

  let tag: { text: string; bg: string; ink: string };
  if (offer) tag = { text: t('tgInvitationTag'), bg: c.sunken, ink: c.textSoft };
  else tag = { text: t('tgSharedTag'), bg: c.accentSoft, ink: c.doneInk };

  let lines;
  if (phase === 'invited') {
    lines = (
      <View style={styles.line}>
        <Icon name="hourglass" size={15} color={c.textSoft} />
        <Txt variant="small" color={c.textSoft} numberOfLines={1} style={styles.shrink}>{t('tgWaitingAnswer', { name: nameIn(other, t.lang) })}</Txt>
      </View>
    );
  } else if (phase === 'invitedMe') {
    lines = (
      <View style={styles.line}>
        <Glyph name="invite" size={16} />
        <Txt variant="small" color={c.textSoft} numberOfLines={2} style={styles.shrink}>{t('tgInvitedYou', { name: nameOf(other) })}</Txt>
      </View>
    );
  } else if (phase === 'dead') {
    lines = (
      <>
        <Txt variant="small" color={c.textSoft} numberOfLines={1}>{t('tgYouAnd', { name: nameOf(other) })}</Txt>
        <View style={styles.line}>
          <Glyph name="stump" size={16} />
          <Txt variant="small" color={c.textSoft} numberOfLines={1} style={styles.shrink}>{t('tgDeadShort', { days: daysText(t, growthDays(tree)) })}</Txt>
        </View>
      </>
    );
  } else {
    const mine = phase === 'mine' || both;
    const theirs = phase === 'theirs' || both;
    lines = (
      <>
        <View style={styles.line}>
          <Icon name="info" size={15} color={c.textSoft} />
          <Txt variant="small" color={c.textSoft} numberOfLines={2} style={styles.shrink}>{both ? t('tgBothDone') : t('tgRuleShort')}</Txt>
        </View>
        <View style={[styles.line, styles.who]}>
          <WhoMark mine done={mine} label={mine ? t('tgYouDone') : t('tgYouNot')} />
          <Txt variant="small" color={c.textMuted}>·</Txt>
          <WhoMark mine={false} done={theirs} label={theirs ? nameOf(other) : t('tgFriendWait', { name: nameOf(other) })} />
        </View>
      </>
    );
  }

  let button = null;
  if (phase === 'none' || phase === 'theirs') {
    button = (
      <Button
        size="m"
        glyph="drop"
        title={t('tgWaterHalf')}
        onPress={() => {
          // Before my watering hour (OYUUR-33 6): a hint, nothing is watered or sent.
          if (!canWaterSharedNow(s) || friends.waterShared(s.id) === 'early') {
            cue('already');
            showQuestHint(earlyText(minutesToOpen(sharedHalf(s)), t));
            return;
          }
          cue('water');
        }}
        cue={null}
        style={styles.button}
      />
    );
  } else if (phase === 'dead') {
    button = (
      <Button
        size="m"
        variant="secondary"
        glyph="seed"
        title={t('tgPlantTogether')}
        disabled={busy}
        onPress={() =>
          act(async () => {
            // One open tree per pair: the dead one goes to the forests first.
            await friends.endShared(s.id);
            onPlantAgain({ name: s.name, kind: s.kind, skin: s.skin });
          })
        }
        style={styles.button}
      />
    );
  } else if (phase === 'invited') {
    button = (
      <Button size="m" variant="text" title={t('tgCancelInvitation')} disabled={busy} onPress={() => act(() => friends.endShared(s.id))} style={styles.textButton} />
    );
  } else if (phase === 'invitedMe') {
    button = (
      <View style={styles.pair}>
        <Button size="m" variant="secondary" title={t('tgNotNow')} disabled={busy} onPress={() => act(() => friends.declineShared(s.id))} style={styles.half} />
        <Button
          size="m"
          glyph="sprout"
          title={t('tgAccept')}
          disabled={busy}
          cue={null}
          onPress={() =>
            act(async () => {
              await friends.acceptShared(s.id);
              cue('plant');
              showQuestHint(t('tgPlanted'));
            })
          }
          style={styles.half}
        />
      </View>
    );
  }

  const top = (
    <>
      <View style={{ width: box, height: box }}>
        <SharedThumb tree={tree} box={box} thirsty={!offer && !both && phase !== 'dead'} faded={offer} />
        {!offer && phase !== 'dead' && <DaysBadge days={growthDays(tree)} />}
        <PairAvatar me={profile} friend={other} size={36} both={both} style={styles.corner} />
      </View>
      <View style={styles.text}>
        <View style={[styles.tag, { backgroundColor: tag.bg }]}>
          <Txt variant="micro" style={{ color: tag.ink }}>{tag.text}</Txt>
        </View>
        <Txt variant="title3" numberOfLines={2} style={styles.habit}>{s.name}</Txt>
        {lines}
      </View>
      {!offer && <Icon name="chevronRight" size={20} color={c.textSoft} />}
    </>
  );
  // The top opens the tree; the buttons stay apart (a button inside a button is not allowed on the web).
  // An offer is not a tree yet: nothing to open.
  return (
    <View style={[styles.card, elevation(1, night), { backgroundColor: c.card }]} testID="shared-card">
      {offer ? (
        <View style={styles.top}>{top}</View>
      ) : (
        <Pressable onPress={open} accessibilityRole="button" style={({ pressed }) => [styles.top, pressed && { opacity: 0.7 }]} testID="shared-open">
          {top}
        </Pressable>
      )}
      {button}
    </View>
  );
}

const styles = StyleSheet.create({
  offer: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 24, padding: 16 },
  offerTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  offerTitle: { fontFamily: fonts.black, fontSize: 16, lineHeight: 21 },
  offerText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, marginTop: 2 },
  card: { borderRadius: 24, padding: 14 },
  top: { flexDirection: 'row', gap: 14 },
  corner: { position: 'absolute', right: -10, bottom: -8 },
  text: { flex: 1, minWidth: 0, gap: 3 },
  tag: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  habit: { fontSize: 18, lineHeight: 24 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  who: { flexWrap: 'wrap' },
  shrink: { flexShrink: 1 },
  button: { marginTop: 14 },
  textButton: { marginTop: 8 },
  pair: { flexDirection: 'row', gap: 8, marginTop: 14 },
  half: { flex: 1 },
});
