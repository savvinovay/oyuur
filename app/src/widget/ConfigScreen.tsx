// "Which tree to show?" (спец 5.4, кадр 14): opens when a "Tree" or "Row" widget is placed, and again from
// long-press → Settings. It runs as its own small screen outside the app (no store, no router): it reads
// the widget snapshot, saves this widget's choice under its own key and draws the widget once. Android only.
import { Nunito_800ExtraBold, Nunito_900Black, useFonts } from '@expo-google-fonts/nunito';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { WidgetConfigurationScreenProps } from 'react-native-android-widget';
import { deviceLang, makeT, pluralForm } from '@/i18n';
import { formatHour } from '@/ui/watering/format';
import { composeWidget, configKey, parseConfig, WidgetConfig } from './compose';
import { treeKey } from './draw/layouts';
import { representation } from './render';
import { parseSnapshot, SNAPSHOT_KEY, WidgetSnapshot } from './snapshot';
import { shownName, TreeView, viewsOf } from './state';
import { TREE_PICS } from './trees.gen';

const C = { page: '#FFF0DA', card: '#FFFFFF', lip: '#E9D3B0', chosen: '#DDF5DF', chosenLip: '#B5E3BD', text: '#1E1B16', soft: '#6E6152', accent: '#4CC764', accentLip: '#34A64D', sky: '#C9F0FA', ground: '#CBE5A1' };
const F = { bold: 'Nunito_800ExtraBold', black: 'Nunito_900Black' };

export function WidgetConfigScreen({ widgetInfo, renderWidget, setResult }: WidgetConfigurationScreenProps) {
  useFonts({ Nunito_800ExtraBold, Nunito_900Black });
  const [snap, setSnap] = useState<WidgetSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(SNAPSHOT_KEY), AsyncStorage.getItem(configKey(widgetInfo.widgetId))])
      .then(([s, c]) => {
        setSnap(parseSnapshot(s));
        setConfig(parseConfig(c));
        setLoaded(true);
      })
      .catch(() => setConfig(parseConfig(null)));
  }, [widgetInfo.widgetId]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setResult('cancel');
      return true;
    });
    return () => sub.remove();
  }, [setResult]);

  const t = makeT(snap?.lang ?? deviceLang());
  const now = useMemo(() => new Date(), []);
  const views = useMemo(() => (snap ? viewsOf(snap, now) : []), [snap, now]);
  const growing = views.filter((v) => v.state !== 'dead' && v.state !== 'locked');
  if (!config) return <View style={styles.page} />;

  const chosen = (v: TreeView | 'urgent') => (v === 'urgent' ? config.tree === 'urgent' : config.tree !== 'urgent' && config.tree.lineageId === v.tree.lineageId);
  const add = () => {
    AsyncStorage.setItem(configKey(widgetInfo.widgetId), JSON.stringify(config))
      .catch(() => {})
      .finally(() => {
        renderWidget(representation(composeWidget(widgetInfo.widgetName, snap, config, widgetInfo.width, widgetInfo.height, new Date())));
        setResult('ok');
      });
  };
  const sub = (v: TreeView) => {
    const days = t('wgPickDays', { n: v.days, word: t.dict.dayWords[pluralForm(t.lang, v.days)] });
    return v.opensAt ? `${days} · ${t('wtFrom', { time: formatHour(v.opensAt, snap?.h24 ?? true) })}` : days;
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('wgPickTitle')}</Text>
      <Text style={styles.sub}>{t('wgPickSub')}</Text>
      <Card on={chosen('urgent')} onPress={() => setConfig({ ...config, tree: 'urgent' })}>
        <View style={[styles.thumb, styles.urgent]}><Text style={styles.urgentMark}>!</Text></View>
        <View style={styles.cardText}>
          <Text style={styles.name}>{t('wgPickUrgent')}</Text>
          <Text style={styles.small}>{t('wgPickUrgentSub')}</Text>
        </View>
      </Card>
      {growing.length === 0 && loaded ? <Text style={styles.hint}>{t(snap ? 'wgPickEmpty' : 'wgPickOpenApp')}</Text> : null}
      {growing.map((v) => {
        const pic = TREE_PICS[treeKey(v, false, true).key];
        const label = shownName(v.tree, snap?.showHidden ?? false, t('wgMyTree'));
        return (
          <Card key={v.tree.lineageId} on={chosen(v)} onPress={() => setConfig({ ...config, tree: { lineageId: v.tree.lineageId } })}>
            <View style={styles.thumb}>
              <View style={styles.thumbGround} />
              <Image source={pic.src} style={{ width: (pic.w / pic.h) * 40, height: 40, marginTop: 6 }} resizeMode="contain" />
            </View>
            <View style={styles.cardText}>
              <Text style={styles.name} numberOfLines={1}>{v.tree.hidden ? `🔒 ${label}` : label}</Text>
              <Text style={styles.small} numberOfLines={2}>
                {v.tree.hidden && !snap?.showHidden ? t('wgPickHidden', { name: label }) : label.length > 14 ? `${sub(v)} · ${t('wgPickLong')}` : sub(v)}
              </Text>
            </View>
          </Card>
        );
      })}
      <Text style={styles.group}>{t('wgPickStyle')}</Text>
      <View style={styles.segment}>
        {(['scene', 'simple'] as const).map((s) => (
          <Pressable key={s} onPress={() => setConfig({ ...config, style: s })} style={[styles.segItem, config.style === s && styles.segOn]} accessibilityRole="button" accessibilityState={{ selected: config.style === s }}>
            <Text style={styles.segText}>{t(s === 'scene' ? 'wgStyleScene' : 'wgStyleSimple')}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>{t('wgPickNamesHint')}</Text>
      <Pressable onPress={add} style={({ pressed }) => [styles.button, pressed && { transform: [{ translateY: 2 }] }]} accessibilityRole="button">
        <Text style={styles.buttonText}>{t('wgPickAdd')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Card({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} style={[styles.card, on && styles.cardOn]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  content: { padding: 20, paddingTop: 36, gap: 10 },
  title: { fontFamily: F.black, fontSize: 24, lineHeight: 30, color: C.text },
  sub: { fontFamily: F.bold, fontSize: 14, lineHeight: 20, color: C.soft, marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 18, backgroundColor: C.card, borderBottomWidth: 3, borderBottomColor: C.lip },
  cardOn: { backgroundColor: C.chosen, borderBottomColor: C.chosenLip },
  thumb: { width: 52, height: 52, borderRadius: 14, backgroundColor: C.sky, overflow: 'hidden', alignItems: 'center' },
  thumbGround: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 12, backgroundColor: C.ground },
  urgent: { backgroundColor: '#FFB46B', justifyContent: 'center' },
  urgentMark: { fontFamily: F.black, fontSize: 26, color: '#4A2308' },
  cardText: { flex: 1 },
  name: { fontFamily: F.black, fontSize: 16, lineHeight: 21, color: C.text },
  small: { fontFamily: F.bold, fontSize: 13, lineHeight: 18, color: C.soft },
  group: { fontFamily: F.black, fontSize: 16, color: C.text, marginTop: 12 },
  segment: { flexDirection: 'row', backgroundColor: '#F7D5A6', borderRadius: 16, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: C.card },
  segText: { fontFamily: F.black, fontSize: 15, color: C.text },
  hint: { fontFamily: F.bold, fontSize: 13, lineHeight: 18, color: C.soft },
  button: { marginTop: 12, height: 56, borderRadius: 28, backgroundColor: C.accent, borderBottomWidth: 4, borderBottomColor: C.accentLip, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: F.black, fontSize: 17, color: '#FFFFFF' },
});
