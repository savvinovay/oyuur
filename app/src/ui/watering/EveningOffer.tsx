// "Mark it in the evening?" (OYUUR-33 7, frames 08 and 08b): once for the whole app, after the
// first watering of an old "Quit" tree (open all day since the update), when the watering show
// is over and no name bubble is up. The old "Quit" trees with switches (all on); "Yes, from
// tomorrow" gives the chosen ones 18:00 from tomorrow, "Leave as it is" keeps them. Any answer
// is the last: it never asks again. Closed any other way (the shade, "back") it asks next time.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg';
import { Habit, Tree } from '@/game/tree';
import { useStore } from '@/state/store';
import { Button, elevation, Toggle, Txt, useColors } from '@/ui/ds';
import { cue } from '@/ui/feedback';
import { ThumbBox } from '@/ui/forest/sheet/ThumbBox';
import { ModalSheet } from '@/ui/shop/ModalSheet';
import { EVENING_HOUR } from '@/ui/sheet/wait';
import { hourText } from './format';

export function EveningOffer({ trees, onAnswered, onClosed }: {
  /** The trees to offer (sheet/wait.ts eveningTrees), read once when it opens. */
  trees: Tree[];
  /** Answered: the trees that get 18:00 from tomorrow (empty: "Leave as it is"); the sheet goes next. */
  onAnswered?: (ids: string[]) => void;
  onClosed: () => void;
}) {
  const { t } = useStore();
  return (
    <ModalSheet onClosed={onClosed} label={t('wbOfferTitle')}>
      {(close) => <Offer trees={trees} close={close} onAnswered={onAnswered} />}
    </ModalSheet>
  );
}

function Offer({ trees, close, onAnswered }: { trees: Tree[]; close: () => void; onAnswered?: (ids: string[]) => void }) {
  const { t, night, habits, answerEveningOffer } = useStore();
  const c = useColors();
  const [on, setOn] = useState<string[]>(() => trees.map((x) => x.id));
  const time = hourText(EVENING_HOUR, t.lang);
  const text = trees.length === 1 ? t('wbOfferOne', { name: trees[0].name, time }) : t('wbOfferMany', { time });
  const answer = (ids: string[]) => {
    answerEveningOffer(ids);
    onAnswered?.(ids);
    close();
  };
  return (
    <View style={styles.body}>
      <View style={[styles.art, { backgroundColor: c.tintQuests }]}>
        <EveningGlyph size={48} />
      </View>
      <Txt variant="title2" accessibilityRole="header" style={styles.center}>{t('wbOfferTitle')}</Txt>
      <Txt variant="body" color={c.textSoft} style={[styles.center, styles.text]}>{text}</Txt>
      <View style={[styles.card, elevation(1, night), { backgroundColor: c.card }]}>
        {trees.map((x, i) => {
          const habit: Habit = habits.find((h) => h.current.id === x.id) ?? { lineageId: x.lineageId, generations: [x], current: x };
          const checked = on.includes(x.id);
          return (
            <View key={x.id} style={styles.row}>
              {i > 0 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
              <ThumbBox habit={habit} kind="list" />
              <View style={styles.rowText}>
                <Txt variant="bodyStrong" numberOfLines={1}>{x.name}</Txt>
                <Txt variant="small" color={c.textSoft} numberOfLines={1}>
                  {x.nickname ? `${x.nickname} · ${t('wtAnyTime')}` : t('wtAnyTime')}
                </Txt>
              </View>
              <Toggle
                value={checked}
                onChange={(v) => setOn((prev) => (v ? [...prev, x.id] : prev.filter((id) => id !== x.id)))}
                accessibilityLabel={x.name}
              />
            </View>
          );
        })}
      </View>
      <Button
        size="l"
        title={t('wbOfferYes')}
        // Nothing switched on is the same as "Leave as it is".
        onPress={() => answer(on)}
        style={styles.yes}
      />
      <Button
        size="m"
        variant="text"
        title={t('wbOfferKeep')}
        onPress={() => {
          cue('select');
          answer([]);
        }}
        cue={null}
      />
    </View>
  );
}

/** Evening over a hill (design/oyuur-33/макет.html, G.evening — paths copied unchanged). */
function EveningGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <ClipPath id="eveningClip">
          <Circle cx={12} cy={12} r={10.6} />
        </ClipPath>
      </Defs>
      <Circle cx={12} cy={12} r={10.6} fill="#FFB46B" />
      <G clipPath="url(#eveningClip)">
        <Rect x={0} y={0} width={24} height={9} fill="#FF9A6B" />
        <Circle cx={12} cy={15.2} r={5.6} fill="#FFCF4D" stroke="#E5873A" strokeWidth={1.2} />
        <Path d="M0 15.6 Q6 12.4 12 15.4 T24 14.6 V24 H0Z" fill="#8BC34A" stroke="#4E8A2A" strokeWidth={1.2} strokeLinejoin="round" />
        <Path d="M0 19 Q7 16.6 13 18.6 T24 18 V24 H0Z" fill="#6FAE3A" />
      </G>
      <Circle cx={12} cy={12} r={10.6} fill="none" stroke="#E5873A" strokeWidth={1.3} />
      <Path d="M17.6 5.2 L18.1 6.3 L19.2 6.8 L18.1 7.3 L17.6 8.4 L17.1 7.3 L16 6.8 L17.1 6.3Z" fill="#FFF6C2" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, alignItems: 'stretch' },
  art: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 4, marginBottom: 12 },
  center: { textAlign: 'center' },
  text: { marginTop: 6, marginHorizontal: 8 },
  card: { marginTop: 16, borderRadius: 20, overflow: 'hidden' },
  row: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  divider: { position: 'absolute', top: 0, left: 74, right: 0, height: 1.5 },
  rowText: { flex: 1, minWidth: 0 },
  yes: { marginTop: 16 },
});
