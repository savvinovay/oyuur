// One widget on the home screen: its kind, its own settings and its size → what to draw, light and dark
// (the library shows the one that matches the phone's theme, спец 4, Т1). Pure; the Android side only
// reads storage and hands the result to react-native-android-widget.
import { deviceLang, makeT } from '@/i18n';
import { Drawn } from './draw/layers';
import { Ctx, w22, w41, w42, w44 } from './draw/layouts';
import type { WidgetSnapshot } from './snapshot';
import { isNight, pickTree, TreeChoice, viewsOf } from './state';

/** The names in app.json (react-native-android-widget → widgets). */
export const WIDGET_NAMES = ['Tree', 'Today', 'Forest', 'Row'] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

/** Settings of one placed widget (the tree picker, спец 5.4); only "Tree" and "Row" have them. */
export interface WidgetConfig {
  tree: TreeChoice;
  style: 'scene' | 'simple';
}
export const DEFAULT_CONFIG: WidgetConfig = { tree: 'urgent', style: 'scene' };
export const configKey = (widgetId: number) => `oyuur/widget/config/${widgetId}`;

export function parseConfig(raw: string | null): WidgetConfig {
  try {
    const c = raw ? (JSON.parse(raw) as Partial<WidgetConfig>) : {};
    const tree = c.tree && typeof c.tree === 'object' && typeof c.tree.lineageId === 'string' ? { lineageId: c.tree.lineageId } : 'urgent';
    return { tree, style: c.style === 'simple' ? 'simple' : 'scene' };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** An empty snapshot: the app was never opened after install — the widgets invite to plant a tree. */
export const EMPTY_SNAPSHOT: WidgetSnapshot = { v: 1, lang: 'en', theme: 'auto', h24: true, showHidden: false, dayOffset: 0, minuteOffset: 0, trees: [] };

export function composeWidget(name: string, snap: WidgetSnapshot | null, config: WidgetConfig, W: number, H: number, now: Date): { light: Drawn; dark: Drawn | null } {
  // No snapshot yet (the app was not opened since install): the phone's language, an invitation to plant.
  const s = snap ?? { ...EMPTY_SNAPSHOT, lang: deviceLang() };
  const views = viewsOf(s, now);
  const base: Ctx = { W: Math.max(1, Math.round(W)), H: Math.max(1, Math.round(H)), night: isNight(s, now), t: makeT(s.lang), h24: s.h24, showHidden: s.showHidden };
  switch (name as WidgetName) {
    case 'Today':
      return { light: w42(views, base), dark: null };
    case 'Forest':
      return { light: w44(views, base), dark: null };
    case 'Row':
    case 'Tree': {
      const draw = name === 'Row' ? w41 : w22;
      const v = pickTree(views, config.tree);
      // "Simple" follows the phone's dark theme; the scene is the world's own day and night (спец 4).
      if (config.style === 'simple') return { light: draw(v, { ...base, simple: true, dark: false }), dark: draw(v, { ...base, simple: true, dark: true }) };
      return { light: draw(v, base), dark: null };
    }
    default:
      return { light: w22(null, base), dark: null };
  }
}
