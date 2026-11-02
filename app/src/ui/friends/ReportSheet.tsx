// "Report @nick" (спец-друзья 6.7, frame 20): a bottom sheet with five reasons, an optional
// comment (up to 300), "also block" (off by default) and the red "Send report", available once a
// reason is picked. The reported person is never told who it was. When the report went but the
// block didn't, the button becomes "Block": a second tap only blocks, the report isn't sent twice.
// `treeId` and `reason: 'treeName'` — a report on a tree's name (from the friend's forest).
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, TextStyle, View } from 'react-native';
import type { Person } from '@/game/shared';
import { isOffline, ReportReason } from '@/net/api';
import { useFriends } from '@/state/friends';
import { useStore } from '@/state/store';
import { Button, elevation, fonts, Icon, MAX_FONT_SCALE, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { ModalSheet } from '@/ui/shop/ModalSheet';
import { displayName } from './model';
import { friendsToast } from './Toast';

export type Reason = 'nick' | 'treeName' | 'spam' | 'bully' | 'other';
const REASONS: Reason[] = ['nick', 'treeName', 'spam', 'bully', 'other'];
const LABEL = { nick: 'frReasonNick', treeName: 'frReasonTreeName', spam: 'frReasonSpam', bully: 'frReasonBully', other: 'frReasonOther' } as const;
/** The server knows four reasons: a name (of the person or of a tree), spam, abuse, other. */
const TO_SERVER: Record<Reason, ReportReason> = { nick: 'name', treeName: 'name', spam: 'spam', bully: 'abuse', other: 'other' };

const FIELD_WEB = Platform.OS === 'web' ? ({ outlineStyle: 'none', userSelect: 'text' } as unknown as TextStyle) : null;

export function ReportSheet({ person, treeId, reason: first = null, onClosed, onBlocked }: {
  person: Person;
  treeId?: string;
  reason?: Reason | null;
  onClosed: () => void;
  /** "Also block" was on and the block went through. */
  onBlocked: () => void;
}) {
  const { t, night } = useStore();
  const f = useFriends();
  const c = useColors();
  const [reason, setReason] = useState<Reason | null>(first);
  const [text, setText] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState(false);

  const send = async (close: () => void) => {
    if (!reason || busy) return;
    setBusy(true);
    let sent = reported;
    try {
      if (!sent) {
        await f.report({ nick: person.nick, reason: TO_SERVER[reason], text: text.trim() || undefined, treeId });
        sent = true;
        setReported(true);
        cue('select');
      }
      if (alsoBlock) {
        await f.block(person.nick);
        cue('delete');
        friendsToast(t('frBlockedToast', { nick: person.nick }));
        close();
        onBlocked();
        return;
      }
      friendsToast(t('frReportThanks'));
      close();
    } catch (e) {
      const why = isOffline(e) ? t('frNeedInternet') : t('frSendFailed');
      friendsToast(sent ? t('frReportSentBlockFailed', { why }) : why, null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalSheet onClosed={onClosed} label={t('frReportTitle', { nick: person.nick })}>
      {(close) => (
        <View style={styles.body}>
          <Txt variant="title2">{t('frReportTitle', { nick: person.nick })}</Txt>
          <Txt style={[styles.lead, { color: c.textSoft }]}>{t('frReportPrivate', { name: displayName(person) })}</Txt>
          <View style={[styles.group, elevation(1, night), { backgroundColor: c.card }]} accessibilityRole="radiogroup">
            {REASONS.map((r) => {
              const on = reason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => {
                    cue('select');
                    setReason(r);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  style={styles.reason}
                >
                  <View style={[styles.radio, { borderColor: on ? c.accent : c.textMuted }]}>
                    {on && <View style={[styles.radioDot, { backgroundColor: c.accent }]} />}
                  </View>
                  <Txt style={styles.reasonText}>{t(LABEL[r])}</Txt>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.field, elevation(1, night), { backgroundColor: c.card }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('frReportComment')}
              placeholderTextColor={c.textMuted}
              maxLength={300}
              multiline
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[styles.input, FIELD_WEB, { color: c.text }]}
              accessibilityLabel={t('frReportComment')}
            />
          </View>
          <Pressable
            onPress={() => {
              cue('select');
              setAlsoBlock((v) => !v);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: alsoBlock }}
            style={styles.check}
          >
            <View style={[styles.box, alsoBlock ? { backgroundColor: c.accent } : { borderWidth: 2, borderColor: c.textMuted }]}>
              {alsoBlock && <Icon name="check" size={16} color="#FFFFFF" strokeWidth={3} />}
            </View>
            <Txt style={styles.checkText}>{t('frAlsoBlock', { nick: person.nick })}</Txt>
          </Pressable>
          <Button
            title={reported && alsoBlock ? t('frBlock') : t('frSendReport')}
            icon={reported && alsoBlock ? 'noSign' : 'flag'}
            variant="danger"
            cue={null}
            disabled={!reason || busy}
            onPress={() => send(close)}
          />
        </View>
      )}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, gap: 12 },
  lead: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, marginTop: -4 },
  group: { borderRadius: 20, paddingVertical: 4 },
  reason: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 14 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  reasonText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, flex: 1 },
  field: { borderRadius: 16, minHeight: 52, justifyContent: 'center', paddingHorizontal: 16 },
  input: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22, paddingVertical: 14, maxHeight: 120 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 4 },
  box: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, flex: 1 },
});
