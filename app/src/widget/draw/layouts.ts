// The four widgets laid out by size (design/oyuur-37/спец.md, 2; макет.html w22, w22simple, w41, w42, w44).
// Every number is in dp and comes from the mockup. Pure: views and a size in, layers out (layers.ts).
import { pluralForm, T } from '@/i18n';
import { formatHour } from '@/ui/watering/format';
import { isThirsty, isWarm, shownName, todayPlaces, forestTrees, TreeView, WState, DAY_END_HOUR } from '../state';
import { TREE_PICS } from '../trees.gen';
import { Drawn, Layer, Weight } from './layers';
import { bubble, cloud, disc, glyph, GlyphName, hearts, paint, pill, rnd, rootGlow, scene, soil, SoilKind, spark, svgDoc, tuft } from './svg';
import { fitName, formatNumber, textWidth } from './text';

export interface Ctx {
  W: number;
  H: number;
  night: boolean;
  t: T;
  h24: boolean;
  showHidden: boolean;
  /** "Simple" (спец 2.5) and, for it, the phone's dark theme. */
  simple?: boolean;
  dark?: boolean;
  /** Prefix of the SVG ids (several widgets on one preview page). */
  id?: string;
}

// ---- Colors of words and glass (макет .wg / .wg.n / .sl / .sd) ----
interface Inks { glass: string; lip: string; ink: string; soft: string; waterInk: string; doneInk: string; warmText: string; burnBg: string; burnInk: string }
const DAY: Inks = { glass: 'rgba(255,255,255,.92)', lip: 'rgba(90,58,18,.12)', ink: '#1E1B16', soft: '#6E6152', waterInk: '#2479B5', doneInk: '#2E8B45', warmText: '#C2410C', burnBg: '#FFD7AE', burnInk: '#4A2308' };
const NIGHT: Inks = { glass: 'rgba(67,66,122,.94)', lip: 'rgba(5,4,26,.45)', ink: '#FFFFFF', soft: '#C9C8EE', waterInk: '#9AD3FF', doneInk: '#8BE39B', warmText: '#FFC48F', burnBg: '#7A4C5E', burnInk: '#FFE9D3' };
const SIMPLE_LIGHT: Inks = { ...DAY, glass: 'rgba(255,255,255,.92)' };
const SIMPLE_DARK: Inks = { ...NIGHT, glass: 'rgba(22,22,26,.88)', soft: '#C9C8D2' };
const inksOf = (c: Ctx): Inks => (c.simple ? (c.dark ? SIMPLE_DARK : SIMPLE_LIGHT) : c.night ? NIGHT : DAY);

// ---- Links (спец 5.1, Т5) ----
export const treeUri = (v: TreeView) => (v.state === 'dead' ? `oyuur://forest?highlight=${encodeURIComponent(v.tree.lineageId)}` : `oyuur://tree/${encodeURIComponent(v.tree.id)}`);
export const PLANT_URI = 'oyuur://new';
export const FOREST_URI = 'oyuur://forest';
export const HOME_URI = 'oyuur://';

// ---- Trees ----
type PicStage = 'sprout' | 'seedling' | 'bush' | 'young' | 'tree' | 'grand' | 'dead' | 'deadsmall';
const STAGE_K: Record<PicStage, number> = { sprout: 0.5, seedling: 0.64, bush: 0.76, young: 0.9, tree: 0.97, grand: 1, deadsmall: 0.5, dead: 0.85 };
const stageOfDays = (d: number): PicStage => (d >= 100 ? 'grand' : d >= 50 ? 'tree' : d >= 21 ? 'young' : d >= 7 ? 'bush' : d >= 3 ? 'seedling' : 'sprout');

/** The picture of a tree: kind, stage, day or night, thirsty or not (scripts/widget-trees.py). */
export function treeKey(v: TreeView, night: boolean, calm = false): { key: string; stage: PicStage } {
  const dn = night ? 'n' : 'd';
  if (v.state === 'dead') {
    const stage: PicStage = v.days >= 3 ? 'dead' : 'deadsmall';
    return { key: `${stage}_${dn}`, stage };
  }
  const stage = stageOfDays(v.days);
  const key = `${v.tree.skin}_${stage}_${dn}${!calm && isThirsty(v.state) ? '_t' : ''}`;
  return { key: TREE_PICS[key] ? key : `oak_${stage}_${dn}${!calm && isThirsty(v.state) ? '_t' : ''}`, stage };
}

interface Placed { layer: Layer; W: number; H: number; top: number }
function treeImg(v: TreeView, night: boolean, cx: number, feet: number, maxH: number, maxW: number, calm = false): Placed {
  const { key, stage } = treeKey(v, night, calm);
  const pic = TREE_PICS[key];
  let H = maxH * STAGE_K[stage];
  let W = (pic.w * H) / pic.h;
  if (W > maxW) {
    W = maxW;
    H = (pic.h * W) / pic.w;
  }
  const y = feet - H + H * 0.02;
  return { layer: { k: 'img', key, x: r1(cx - W / 2), y: r1(y), w: r1(W), h: r1(H) }, W, H, top: feet - H };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const soilKind = (s: WState): SoilKind => (isThirsty(s) ? 'dry' : s === 'done' ? 'wet' : null);

// ---- Words ----
const text = (x: number, y: number, w: number, lines: string[], size: number, lh: number, weight: Weight, color: string, align: 'left' | 'center' | 'right' = 'left', tight = false): Layer =>
  ({ k: 'text', x: r1(x), y: r1(y), w: r1(Math.max(w, 1)), lines, size, lh, weight, color, align, tight });

function hourOf(c: Ctx, hour: number) {
  return formatHour(hour, c.h24);
}
const num = (c: Ctx, n: number) => formatNumber(n, c.t.lang, c.t('wgThousands'));
const nameOf = (c: Ctx, v: TreeView) => shownName(v.tree, c.showHidden, c.t('wgMyTree'));
const treesWord = (c: Ctx, n: number) => c.t.dict.treeWords[pluralForm(c.t.lang, n)];

/** The panel verb (2×2): fixed short forms (спец 7.2); narrow (< 170 dp) — "С 18:00". */
export function verbOf(c: Ctx, v: TreeView | null, narrow: boolean, compact = false): string {
  if (!v) return c.t(compact ? 'wgVerbEmptyShort' : 'wgVerbEmpty');
  switch (v.state) {
    case 'water': return c.t('wgVerbWater');
    case 'done': case 'locked': return c.t('wgVerbDone');
    case 'wait': return c.t(narrow ? 'wgVerbWaitShort' : 'wgVerbWait', { time: hourOf(c, v.opensAt) });
    case 'last': return c.t('wgVerbLast');
    case 'burn': return c.t('wgVerbBurn');
    case 'dead': return c.t('wgVerbDead');
  }
}

/** The second line of the 4×1 row. */
export function lineOf(c: Ctx, v: TreeView | null): string {
  if (!v) return c.t('wgLineEmpty');
  switch (v.state) {
    case 'water': return c.t('wgLineWater');
    case 'done': case 'locked': return c.t('wgLineDone');
    case 'wait': return c.t('wgLineWait', { time: hourOf(c, v.opensAt) });
    case 'last': return c.t('wgLineLast');
    case 'burn': return c.t('wgLineBurn', { time: hourOf(c, DAY_END_HOUR) });
    case 'dead': return c.t('wgLineDead', { n: num(c, v.days) });
  }
}

const panelIcon = (s: WState | 'empty'): GlyphName =>
  s === 'water' ? 'dropWhite' : s === 'done' || s === 'locked' ? 'check' : s === 'wait' ? 'clock' : s === 'last' ? 'heartEmpty' : s === 'burn' ? 'heart' : s === 'dead' ? 'seed' : 'plus';
const lineIcon = (s: WState | 'empty'): GlyphName =>
  s === 'water' ? 'drop' : s === 'done' || s === 'locked' ? 'check' : s === 'wait' ? 'clock' : s === 'last' ? 'heartEmpty' : s === 'burn' ? 'heart' : s === 'dead' ? 'tombstone' : 'seed';
const lineColor = (s: WState | 'empty', k: Inks) =>
  s === 'water' ? k.waterInk : s === 'done' || s === 'locked' ? k.doneInk : s === 'last' || s === 'burn' ? k.warmText : k.soft;

/** The panel attached to the bottom edge (спец 2.0): its color is the call. */
function panel(W: number, H: number, P: number, kind: 'water' | 'last' | 'burn' | 'go' | 'glass', k: Inks): { svg: string; ink: string } {
  const y = H - P;
  const [bg, lip, ink] =
    kind === 'water' ? ['#2A80BC', '#1F6A9E', '#FFFFFF']
    : kind === 'last' ? ['#FFB46B', '#E5873A', '#4A2308']
    : kind === 'burn' ? [k.burnBg, 'rgba(229,135,58,.7)', k.burnInk]
    : kind === 'go' ? ['#34A64D', '#2B8A40', '#FFFFFF']
    : [k.glass, k.lip, k.ink];
  let svg = `<rect x="0" y="${r1(y - 1)}" width="${W}" height="1" ${paint('fill', lip)}/><rect x="0" y="${r1(y)}" width="${W}" height="${r1(P + 1)}" ${paint('fill', bg)}/>`;
  if (kind === 'burn') svg += `<rect x="0" y="${r1(y)}" width="5" height="${r1(P + 1)}" fill="#E5873A"/>`;
  return { svg, ink };
}
const panelKind = (s: WState | 'empty') => (s === 'water' ? 'water' : s === 'last' ? 'last' : s === 'burn' ? 'burn' : s === 'dead' || s === 'empty' ? 'go' : 'glass') as 'water' | 'last' | 'burn' | 'go' | 'glass';

/** The ring of the streak and its number; returns the layers and the width. */
function ringNum(c: Ctx, n: number, x: number, y: number, size: number, ringS: number, color: string): { svg: string; layer: Layer; w: number } {
  const lh = Math.round(size * 1.12);
  const label = num(c, n);
  const gap = Math.round(size * 0.16);
  const tw = textWidth(label, size) * 0.96;
  return {
    svg: glyph('rings', x, y + (lh - ringS) / 2, ringS),
    layer: text(x + ringS + gap, y, tw + 6, [label], size, lh, 900, color, 'left', true),
    w: ringS + gap + tw,
  };
}

/** The hearts in their capsule (спец 2.0: green; last chance — orange, all empty; at risk — pale warm). */
function heartsPill(s: WState, n: number, right: number, y: number, size: number, h: number, pad: number): string {
  const w = 3 * size + 2 + 2 * pad;
  const x = right - w;
  const [bg, lip] = s === 'last' ? ['#FFB46B', '#E5873A'] : s === 'burn' ? ['#FFD7AE', '#E5873A'] : ['#58D46A', '#34A64D'];
  return pill(x, y, w, h, bg, lip) + hearts(s === 'last' ? 0 : n, x + pad, y + (h - size) / 2, size);
}

/** The seed in its glowing hole: no growing tree yet. */
function seedHole(cx: number, feet: number, night: boolean, id: string): string {
  return `<defs><radialGradient id="${id}e"><stop offset="0" ${paint('stop-color', night ? 'rgba(255,227,154,.45)' : 'rgba(255,246,194,.95)')}/><stop offset=".7" ${paint('stop-color', 'rgba(255,246,194,0)')}/></radialGradient></defs>`
    + `<ellipse cx="${cx}" cy="${r1(feet)}" rx="30" ry="7" ${paint('fill', night ? 'rgba(40,28,20,.55)' : 'rgba(160,116,72,.45)')}/><ellipse cx="${cx}" cy="${r1(feet - 2)}" rx="22" ry="4.5" fill="${night ? '#6B4A33' : '#C99A60'}"/>`
    + `<circle cx="${cx}" cy="${r1(feet - 26)}" r="26" fill="url(#${id}e)"/>` + glyph('seed', cx - 17, feet - 40, 34);
}

// =====================================================================================================
// 2×2 «Дерево» (спец 2.1, кадры 06, 07, 11, 17)
// =====================================================================================================
export function w22(v: TreeView | null, c: Ctx): Drawn {
  const { W, H } = c;
  const cp = W < 150 || H < 140; // compact (minimum 130×117)
  if (c.simple) return w22simple(v, c, cp);
  const id = c.id ?? 'w';
  const N = c.night, k = inksOf(c);
  const st: WState | 'empty' = v ? v.state : 'empty';
  const P = cp ? 34 : 40, band = cp ? 32 : 40;
  const feet = H - P - 3, hill = H - P - 16;
  let back = scene(W, H, id, { night: N, muted: st === 'dead', warm: v ? isThirsty(v.state) : false, hill, sun: 'glow', sunX: W - 10, sunY: 8, clouds: [[W * 0.26, band + 16, cp ? 0.45 : 0.55]], seed: 11 + (v?.days || 3), clear: [[W / 2 - 34, W / 2 + 34]], starTop: band, grassBottom: H - P });
  let front = '';
  const out: Layer[] = [];
  const pk = panel(W, H, P, panelKind(st), k);
  if (!v) {
    back += seedHole(W / 2, feet, N, id);
    out.push(text(cp ? 11 : 14, cp ? 8 : 11, W - 24, [c.t('wgEmptyTitle1'), c.t('wgEmptyTitle2')], cp ? 12.5 : 14, cp ? 15 : 17, 900, k.ink));
    front += pk.svg;
    const vs = cp ? 12.5 : 14, is = cp ? 16 : 20;
    // "Посадить дерево", or "Посадить" when it would not fit (спец 7.1, 2).
    const long = verbOf(c, null, W < 170, false);
    const verb = cp || is + 7 + textWidth(long, vs) > W - 20 ? verbOf(c, null, W < 170, true) : long;
    const tw = textWidth(verb, vs);
    const x0 = (W - (is + 7 + tw)) / 2;
    front += glyph('plus', x0, H - P + (P - is) / 2, is);
    out.push(text(x0 + is + 7, H - P + (P - 18) / 2, tw + 8, [verb], vs, 18, 900, pk.ink));
    return done(c, back, front, out, PLANT_URI, verb);
  }
  const ti = treeImg(v, N, W / 2, feet, feet - band - 2, W - 22);
  back += soil(W / 2, feet + 1, clamp(ti.W * 0.9, 40, 88), soilKind(v.state), N);
  out.push(ti.layer);
  if (v.state === 'done') front += N ? rootGlow(W / 2, feet, Math.min(ti.W, 90), id) : spark(W / 2 - ti.W * 0.44, Math.max(band + 8, ti.top + 14), 11) + spark(W / 2 + ti.W * 0.44, Math.max(band + 4, ti.top + 8), 13);
  if (isThirsty(v.state)) front += bubble(Math.min(W - (cp ? 30 : 40), W / 2 + ti.W * (cp ? 0.34 : 0.26)), Math.max(band + 2, ti.top), cp ? 24 : 34, v.state !== 'water', N);
  // The top band: the streak (the big number) and the hearts.
  const rn = ringNum(c, v.days, cp ? 10 : 13, cp ? 5 : v.state === 'dead' ? 7 : 6, cp ? 24 : 28, cp ? 17 : 20, k.ink);
  front += rn.svg;
  out.push(rn.layer);
  if (v.state === 'dead') {
    out.push(text((cp ? 10 : 13) + rn.w + 6, (cp ? 5 : 7) + Math.round((cp ? 24 : 28) * 1.12) - 15 - (cp ? 3 : 5), 60, [c.t('wgRecord')], 12, 15, 800, k.soft));
  } else if (!cp || (isWarm(v.state) && v.days < 100)) {
    front += heartsPill(v.state, v.hearts, W - (cp ? 8 : 12), cp ? 8 : 10, cp ? 11 : 13, cp ? 19 : 22, cp ? 4 : 5);
  }
  // The panel: the verb on top, the name under it.
  front += pk.svg;
  const pad = cp ? 10 : 12;
  const iconW = cp ? 0 : 22 + 8;
  if (!cp) front += glyph(panelIcon(v.state), pad + (v.state === 'burn' ? 3 : 0), H - P + (P - 22) / 2, 22);
  const tx = pad + iconW + (v.state === 'burn' ? 3 : 0);
  const tw = W - tx - pad;
  const verbColor = v.state === 'done' ? k.doneInk : v.state === 'wait' ? k.soft : v.state === 'burn' ? k.warmText : pk.ink;
  const vs = cp ? 10.5 : 11.5, vl = cp ? 12 : 14, ns = cp ? 12 : 13, nl = cp ? 15 : 17;
  const name = fitName(nameOf(c, v), tw, ns, 1, 800);
  const ty = H - P + (P - vl - nl) / 2;
  const verb = verbOf(c, v, W < 170);
  out.push(text(tx, ty, tw, [verb], vs, vl, 900, verbColor));
  out.push(text(tx, ty + vl, tw, name.lines, name.size, nl, 800, pk.ink));
  return done(c, back, front, out, treeUri(v), `${nameOf(c, v)}, ${verb}, ${v.days}`);
}

// «Простой»: no scene, no inner frame — the tree on its patch of earth, the number large (спец 2.5).
function w22simple(v: TreeView | null, c: Ctx, cp: boolean): Drawn {
  const { W, H } = c;
  const id = c.id ?? 'w';
  const k = inksOf(c), D = !!c.dark;
  const band = cp ? 34 : 44, textH = cp ? 30 : 38, feet = H - textH - 10;
  let back = `<rect width="${W}" height="${H}" ${paint('fill', k.glass)}/>`;
  let front = '';
  const out: Layer[] = [];
  if (!v) {
    front += glyph('seed', W / 2 - 17, feet - 36, 34);
    out.push(text(cp ? 11 : 14, cp ? 8 : 11, W - (cp ? 22 : 28), [c.t('wgEmptyTitle1'), c.t('wgEmptyTitle2')], cp ? 12 : 14, cp ? 15 : 17, 900, k.ink));
  } else {
    // The day picture also in the dark: on a dark ground it reads better than the night one.
    const ti = treeImg(v, false, W / 2, feet, feet - band, W - 30);
    back += `<ellipse cx="${W / 2}" cy="${feet}" rx="34" ry="5" ${paint('fill', D ? 'rgba(255,255,255,.08)' : 'rgba(90,58,18,.10)')}/>`;
    back += soil(W / 2, feet + 1, clamp(ti.W * 0.9, 40, 84), soilKind(v.state), false);
    out.push(ti.layer);
    if (isThirsty(v.state)) front += bubble(Math.min(W - 40, W / 2 + ti.W * 0.26), Math.max(band, ti.top), cp ? 28 : 32, v.state !== 'water', false, D ? '#E9E8FF' : '#E3F1FB');
    const rn = ringNum(c, v.days, 14, cp ? 8 : 10, cp ? 26 : 32, cp ? 18 : 22, k.ink);
    front += rn.svg;
    out.push(rn.layer);
    if (v.state !== 'dead' && !cp) front += hearts(v.state === 'last' ? 0 : v.hearts, W - 14 - 41, 16, 13);
  }
  const st: WState | 'empty' = v ? v.state : 'empty';
  const verb = verbOf(c, v, W < 170);
  const color = st === 'water' ? k.waterInk : st === 'last' || st === 'burn' ? k.warmText : st === 'empty' || st === 'dead' || st === 'done' || st === 'locked' ? k.doneInk : k.soft;
  const bottom = cp ? 8 : 11;
  const vs = cp ? 10.5 : 11.5, ns = cp ? 12 : 13;
  const blockH = v ? 14 + 17 : 14;
  const y = H - bottom - blockH;
  out.push(text(14, y, W - 28, [verb], vs, 14, 900, color));
  if (v) {
    const name = fitName(nameOf(c, v), W - 28, ns, 1, 800);
    out.push(text(14, y + 14, W - 28, name.lines, name.size, 17, 800, k.ink));
  }
  return done(c, back, front, out, v ? treeUri(v) : PLANT_URI, v ? `${nameOf(c, v)}, ${verb}, ${v.days}` : verb, 28);
}

// =====================================================================================================
// 4×1 «Строка» (спец 2.2, кадр 10, 17)
// =====================================================================================================
export function w41(v: TreeView | null, c: Ctx): Drawn {
  const { W, H } = c;
  const id = c.id ?? 'w';
  const cp = H < 64; // compact (minimum 276×51): one line
  const simple = !!c.simple;
  const N = c.night && !simple;
  const k = inksOf(c);
  const st: WState | 'empty' = v ? v.state : 'empty';
  let back = simple ? `<rect width="${W}" height="${H}" ${paint('fill', k.glass)}/>`
    : scene(W, H, id, { night: N, muted: st === 'dead', warm: v ? isThirsty(v.state) : false, hill: H - 14, flat: true, sun: 'glow', sunX: W - 20, sunY: 4, sunR: 9, clouds: cp ? 0 : [[W * 0.56, 20, 0.5]], seed: 5 + (v?.days || 1), clear: [[4, cp ? 58 : 76]] });
  let front = '';
  const out: Layer[] = [];
  const tx = cp ? 62 : 94, cx = cp ? 32 : 42;
  if (!v) {
    const s = cp ? 28 : 34;
    front += glyph('seed', cx - s / 2, (H - s) / 2, s);
  } else {
    const feet = H - (cp ? 8 : 10);
    const ti = treeImg(v, N, cx, feet, feet - (cp ? 4 : 6), cp ? 46 : 64);
    back += soil(cx, feet + 1, clamp(ti.W * 0.9, 30, 50), soilKind(v.state), N);
    out.push(ti.layer);
    if (v.state === 'done') front += N ? rootGlow(cx, feet, Math.min(ti.W, 54), id) : cp ? '' : spark(cx + 24, 16, 10) + spark(cx - 24, 26, 8);
    if (!cp && isThirsty(v.state)) front += bubble(cx + 16, 4, 28, v.state !== 'water', N);
  }
  // Right: the streak, or "Plant" for an empty forest.
  let right = W;
  if (!v && cp) {
    right = W - 12;
  } else if (!v) {
    const label = c.t('wgVerbEmptyShort');
    const bh = cp ? 28 : 34, bw = textWidth(label, 13) + 28;
    const bx = W - (cp ? 10 : 14) - bw, by = (H - bh) / 2;
    front += pill(bx, by, bw, bh, '#34A64D', '#2B8A40', 17);
    out.push(text(bx, by + (bh - 18) / 2, bw, [label], 13, 18, 900, '#FFFFFF', 'center'));
    right = bx - 8;
  } else {
    const size = cp ? 24 : 32, ringS = cp ? 18 : 22;
    const probe = ringNum(c, v.days, 0, 0, size, ringS, k.ink);
    const x = W - (cp ? 12 : 14) - probe.w;
    const rn = ringNum(c, v.days, x, (H - Math.round(size * 1.12)) / 2, size, ringS, v.state === 'dead' ? `${k.ink}B3` : k.ink);
    front += v.state === 'dead' ? `<g opacity=".7">${rn.svg}</g>` : rn.svg;
    out.push(rn.layer);
    right = x - 10;
  }
  const title = v ? nameOf(c, v) : c.t('wgPlantShort');
  const ts = cp ? 14 : 16;
  if (cp) {
    const tw = right - tx - 22;
    front += glyph(lineIcon(st), tx, (H - 16) / 2, 16);
    const name = fitName(title, tw, ts, 1, 900);
    out.push(text(tx + 22, (H - 21) / 2, tw, name.lines, name.size, 21, 900, k.ink));
  } else {
    const tw = right - tx;
    const y = (H - 41) / 2;
    const name = fitName(title, tw, ts, 1, 900);
    out.push(text(tx, y, tw, name.lines, name.size, 21, 900, k.ink));
    front += glyph(lineIcon(st), tx, y + 24 + 1, 15);
    out.push(text(tx + 20, y + 24, tw - 20, [lineOf(c, v)], 12.5, 17, st === 'last' ? 900 : 800, lineColor(st, k)));
  }
  return done(c, back, front, out, v ? treeUri(v) : PLANT_URI, v ? `${title}, ${lineOf(c, v)}, ${v.days}` : title, 28);
}

// =====================================================================================================
// 4×2 «Сегодня» (спец 2.3, кадр 08, 17)
// =====================================================================================================
export function w42(views: TreeView[], c: Ctx): Drawn {
  const { W, H } = c;
  const id = c.id ?? 'w';
  const N = c.night, k = inksOf(c);
  const cp = H < 150, narrow = W < 320; // compact: no header; narrow: 3 places
  const P = cp ? 50 : 52, band = cp ? 6 : 40, feet = H - P - 3;
  let back = scene(W, H, id, { night: N, hill: H - P - 18, sun: 'glow', sunX: W - 10, sunY: 4, sunR: 11, clouds: cp ? 0 : [[W * 0.62, 52, 0.5]], seed: 31, starTop: 40, grassBottom: H - P });
  let front = '';
  const out: Layer[] = [];
  const places = todayPlaces(views, narrow ? 3 : 4);
  const grow = places.growing;
  if (!grow.length) {
    if (!cp) out.push(text(16, 11, W - 32, [c.t('wgToday')], 16, 22, 900, k.ink));
    back += seedHole(W / 2, feet, N, id);
    const pk = panel(W, H, P, 'go', k);
    front += pk.svg;
    const verb = c.t('wgPlantFirst'), vs = narrow ? 14 : 15;
    const tw = textWidth(verb, vs);
    const x0 = (W - (20 + 8 + tw)) / 2;
    front += glyph('plus', x0, H - P + (P - 20) / 2, 20);
    out.push(text(x0 + 28, H - P + (P - 20) / 2, tw + 8, [verb], vs, 20, 900, pk.ink));
    return done(c, back, front, out, PLANT_URI, verb);
  }
  const { shown, more } = places;
  const slots = shown.length + (more.length ? 1 : 0);
  const doneN = grow.filter((v) => v.state === 'done').length;
  const all = doneN === grow.length;
  const taps: Layer[] = [];
  if (!cp) {
    const title = c.t('wgToday');
    out.push(text(16, 11, textWidth(title, 16) + 6, [title], 16, 22, 900, k.ink));
    const sx = 16 + textWidth(title, 16) + 8;
    if (all) {
      front += glyph('check', sx, 15, 14);
      out.push(text(sx + 18, 13, 140, [c.t('wgAllDone')], 12.5, 18, 800, k.doneInk));
    } else {
      out.push(text(sx, 13, 160, [c.t('wgOfDone', { a: doneN, b: grow.length })], 12.5, 18, 800, k.soft));
    }
    const bw = Math.max(8, 44 / grow.length);
    const barsW = grow.length * bw + (grow.length - 1) * 3;
    grow.forEach((v, i) => {
      front += pill(W - 16 - barsW + i * (bw + 3), 19, bw, 6, i < doneN ? '#4CC764' : N ? 'rgba(255,255,255,.22)' : 'rgba(30,27,22,.14)', undefined, 3);
    });
    taps.push({ k: 'tap', x: 0, y: 0, w: W, h: band, uri: HOME_URI, label: title });
  }
  const slotW = W / slots;
  const tH = Math.min(feet - band - 2, 96);
  const pk = panel(W, H, P, 'glass', k);
  const cells: Layer[] = [];
  let cellSvg = '';
  const fits = shown.map((v) => fitName(nameOf(c, v), slotW - 12, 11, 2, 800));
  const cellTop = H - P + (P - (18 + Math.max(1, ...fits.map((f) => f.lines.length)) * 13)) / 2;
  shown.forEach((v, i) => {
    const cx = slotW * i + slotW / 2;
    const ti = treeImg(v, N, cx, feet, tH * 0.8, Math.min(slotW - 14, slotW * 0.74));
    back += soil(cx, feet + 1, clamp(ti.W * 0.9, 32, 60), soilKind(v.state), N);
    out.push(ti.layer);
    if (v.state === 'done') front += N ? rootGlow(cx, feet, Math.min(ti.W, 56), `${id}${i}`) : spark(cx + ti.W * 0.42, Math.max(band + 6, ti.top + 6), 10) + spark(cx - ti.W * 0.44, Math.max(band + 10, ti.top + 14), 8);
    if (isThirsty(v.state)) front += bubble(Math.min(cx + ti.W * 0.2, cx + slotW / 2 - 30), Math.max(band, ti.top - 4), 28, v.state !== 'water', N);
    if (v.state === 'wait') {
      const label = hourOf(c, v.opensAt);
      const cw = 5 + 13 + 3 + textWidth(label, 11) + 7;
      const chx = Math.max(slotW * i + 4, Math.min(cx + Math.min(ti.W * 0.18, 12), slotW * (i + 1) - cw - 4, W - cw - 8)), chy = Math.max(band, ti.top - 14);
      front += pill(chx, chy, cw, 20, k.glass, k.lip, 10) + glyph('clock', chx + 5, chy + 3.5, 13);
      out.push(text(chx + 21, chy + 3, cw - 21, [label], 11, 14, 900, k.soft));
    }
    // The cell: the streak and the name in up to two lines, centered; no dividers — only air (6 dp).
    const nm = fits[i];
    const top = cellTop;
    const label = num(c, v.days);
    const rw = 13 + 3 + textWidth(label, 15) * 0.96;
    const rx = cx - rw / 2;
    cellSvg += glyph('rings', rx, top + 2.5, 13);
    cells.push(text(rx + 16, top, rw - 16 + 6, [label], 15, 18, 900, isWarm(v.state) ? k.warmText : k.ink, 'left', true));
    cells.push(text(slotW * i + 6, top + 18, slotW - 12, nm.lines, nm.size, 13, 800, k.soft, 'center'));
    taps.push({ k: 'tap', x: slotW * i, y: band, w: slotW, h: H - band, uri: treeUri(v), label: `${nameOf(c, v)}, ${verbOf(c, v, false)}` });
  });
  if (more.length) {
    const cx = slotW * shown.length + slotW / 2;
    const cy = feet - Math.min(50, tH * 0.8);
    front += `<circle cx="${r1(cx)}" cy="${r1(cy + 25)}" r="23" ${paint('fill', k.lip)}/><circle cx="${r1(cx)}" cy="${r1(cy + 23)}" r="23" ${paint('fill', k.glass)}/>`;
    out.push(text(cx - 23, cy + 23 - 11, 46, [`+${more.length}`], 17, 22, 900, k.ink, 'center', true));
    const top = H - P + (P - 30) / 2;
    if (c.t.lang === 'ru') {
      cells.push(text(slotW * shown.length + 4, top, slotW - 8, [c.t('wgMoreWord')], 13, 17, 900, k.ink, 'center'));
      cells.push(text(slotW * shown.length + 4, top + 17, slotW - 8, [c.t('wgTrees', { n: more.length, word: treesWord(c, more.length) })], 11, 13, 800, k.soft, 'center'));
    } else {
      cells.push(text(slotW * shown.length + 4, H - P + (P - 17) / 2, slotW - 8, [c.t('wgMoreOne', { n: more.length })], 13, 17, 900, k.ink, 'center'));
    }
    taps.push({ k: 'tap', x: slotW * shown.length, y: band, w: slotW, h: H - band, uri: treeUri(more[0]), label: c.t('wgMoreOne', { n: more.length }) });
  }
  front += pk.svg + cellSvg;
  const first = grow[0];
  return done(c, back, front, [...out, ...cells, ...taps], treeUri(first), c.t('wgOfDone', { a: doneN, b: grow.length }));
}

// =====================================================================================================
// 4×4 «Мой лес» (спец 2.4, кадр 02, 09, 16, 17)
// =====================================================================================================
const FOREST_DAY = { meadow: '#CDE7A4', meadow2: '#BFDF92', bush: '#8DC58F', bushTop: '#A9D7A2', lawnA: '#ACD96C', lawnB: '#9FD05E', lip: '#D6EEA9', bankL: '#C08F58', bankR: '#A4733F', post: '#D7A86A', rail: '#C79A60', cap: '#ECC88E', shadow: 'rgba(52,78,22,.22)', tuft: '#8EBF55' };
const FOREST_NIGHT = { meadow: '#36477C', meadow2: '#2F3F70', bush: '#3B5A80', bushTop: '#4A6A90', lawnA: '#47775A', lawnB: '#416F53', lip: '#5C9470', bankL: '#6B5340', bankR: '#55402F', post: '#86694F', rail: '#76604A', cap: '#9C8166', shadow: 'rgba(8,8,34,.38)', tuft: '#4A6890' };

export function w44(views: TreeView[], c: Ctx): Drawn {
  const { W, H } = c;
  const id = c.id ?? 'w';
  const N = c.night, k = inksOf(c);
  const s = Math.min(W / 368, H / 364), cp = s < 0.85;
  const F = N ? FOREST_NIGHT : FOREST_DAY;
  const P = cp ? 40 : 48;
  const hz = H * 0.34;
  const headR = 16 + 210 * Math.min(1, s + 0.1), headB = cp ? 58 : 70;
  let back = `<defs><linearGradient id="${id}k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${N ? '#191E5E' : '#9FE1F5'}"/><stop offset=".7" stop-color="${N ? '#2B2F7A' : '#C9F0FA'}"/><stop offset="1" stop-color="${N ? '#5357A8' : '#EAFBFF'}"/></linearGradient>`
    + `<linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${F.meadow}"/><stop offset="1" stop-color="${F.meadow2}"/></linearGradient>`
    + `<radialGradient id="${id}g"><stop offset="0" ${paint('stop-color', N ? 'rgba(201,199,255,.5)' : 'rgba(255,246,194,.9)')}/><stop offset="1" ${paint('stop-color', 'rgba(255,241,168,0)')}/></radialGradient>`
    + `<radialGradient id="${id}s" cx=".38" cy=".35"><stop offset="0" stop-color="#FFF6BE"/><stop offset=".55" stop-color="#FBD84E"/><stop offset="1" stop-color="#F4BE34"/></radialGradient></defs>`
    + `<rect width="${W}" height="${r1(hz + 2)}" fill="url(#${id}k)"/>`;
  const sx = W - 40 * s, sy = 44 * s, sr = 13 * s;
  back += `<circle cx="${r1(sx)}" cy="${r1(sy)}" r="${r1(sr * 4.5)}" fill="url(#${id}g)"/>` + disc(sx, sy, sr, N, `${id}s`);
  const r = rnd(17);
  if (N) {
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = 42 + r() * (hz - 60), rad = 0.6 + r() * 0.7, op = 0.5 + r() * 0.4;
      if ((x < headR && y < headB + 6) || Math.hypot(x - sx, y - sy) < sr * 2.4) continue;
      back += `<circle cx="${r1(x)}" cy="${r1(y)}" r="${rad.toFixed(2)}" fill="#FFFFFF" fill-opacity="${op.toFixed(2)}"/>`;
    }
  } else {
    back += cloud(Math.max(headR + 34 * s, W * 0.66), Math.max(headB + 14, hz * 0.7), s);
  }
  back += `<rect y="${r1(hz)}" width="${W}" height="${r1(H - hz)}" fill="url(#${id}m)"/>`;
  // The row of round bushes on the horizon (like the bushes around the forest map).
  for (let x = -10; x < W + 20; x += 18 + r() * 14) {
    const rr = (10 + r() * 9) * s;
    back += `<circle cx="${r1(x)}" cy="${r1(hz + 4)}" r="${r1(rr)}" fill="${F.bush}"/><circle cx="${r1(x - rr * 0.3)}" cy="${r1(hz + 4 - rr * 0.35)}" r="${r1(rr * 0.45)}" fill="${F.bushTop}"/>`;
  }
  back += `<rect y="${r1(hz + 4)}" width="${W}" height="${r1(H - hz)}" fill="url(#${id}m)"/>`;
  for (let i = 0; i < 14; i++) {
    const x = r() * W, y = hz + 14 + r() * (H - hz - P - 20), q = 0.8 + r() * 0.5;
    back += tuft(x, y, q, F.tuft);
  }
  const f = forestTrees(views);
  const list = f.placed;
  // The plot: 1–3 trees — a small 2×2 plot (a new forest should not look empty), 4 — 2×2, 5–9 — 3×3; whole in the frame.
  const n = list.length <= 4 ? 2 : 3;
  const a = n === 3 ? (W - 28) / 6 : (list.length <= 3 ? 56 : 62) * s, b = a / 2;
  const plotH = 2 * n * b;
  const cx = W / 2, top = H - P - 8 - plotH - 12 * s;
  const Pt = (i: number, j: number): [number, number] => [cx + (i - j) * a, top + (i + j) * b];
  const [Lx, Ly] = Pt(0, n), [Rx, Ry] = Pt(n, 0), [Bx, By] = Pt(n, n);
  const p = (x: number, y: number) => `${r1(x)} ${r1(y)}`;
  back += `<path d="M${p(Lx, Ly)} L${p(Bx, By)} L${p(Bx, By + 12 * s)} L${p(Lx, Ly + 12 * s)}Z" fill="${F.bankL}"/><path d="M${p(Bx, By)} L${p(Rx, Ry)} L${p(Rx, Ry + 12 * s)} L${p(Bx, By + 12 * s)}Z" fill="${F.bankR}"/>`;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = Pt(i, 0), [x2, y2] = Pt(i + 1, 0), [x3, y3] = Pt(i + 1, n), [x4, y4] = Pt(i, n);
    back += `<path d="M${p(x1, y1)} L${p(x2, y2)} L${p(x3, y3)} L${p(x4, y4)}Z" fill="${i % 2 ? F.lawnB : F.lawnA}"/>`;
  }
  back += `<path d="M${p(Lx, Ly)} L${p(Bx, By)} L${p(Rx, Ry)}" fill="none" stroke="${F.lip}" stroke-width="2.5"/>`;
  const fence = (pts: [number, number][]) => {
    let out = '';
    for (let q = 0; q < pts.length - 1; q++) {
      const [x1, y1] = pts[q], [x2, y2] = pts[q + 1];
      out += `<path d="M${p(x1, y1 - 10 * s)} L${p(x2, y2 - 10 * s)} M${p(x1, y1 - 4.5 * s)} L${p(x2, y2 - 4.5 * s)}" stroke="${F.rail}" stroke-width="${r1(2.2 * s)}" stroke-linecap="round"/>`;
    }
    for (const [x, y] of pts) out += `<rect x="${r1(x - 1.8 * s)}" y="${r1(y - 14 * s)}" width="${r1(3.6 * s)}" height="${r1(14 * s)}" rx="1" fill="${F.post}"/><rect x="${r1(x - 2.2 * s)}" y="${r1(y - 15 * s)}" width="${r1(4.4 * s)}" height="${r1(2.6 * s)}" rx="1" fill="${F.cap}"/>`;
    return out;
  };
  const edge = (from: [number, number], to: [number, number]) => {
    const pts: [number, number][] = [];
    for (let q = 0; q <= n; q++) pts.push(Pt(from[0] + ((to[0] - from[0]) * q) / n, from[1] + ((to[1] - from[1]) * q) / n));
    return pts;
  };
  back += fence(edge([0, n], [0, 0])) + fence(edge([0, 0], [n, 0]));
  // Cells are filled middle → front → back; the back corner (0,0) sits under the header: last. The biggest trees
  // take the cells farthest back; a tree with a tree right behind it is kept lower than the gap between them.
  const order: [number, number][] = n === 2 ? [[1, 1], [0, 1], [1, 0], [0, 0]] : [[1, 1], [0, 2], [2, 0], [1, 2], [2, 1], [2, 2], [0, 1], [1, 0], [0, 0]];
  const used = order.slice(0, Math.min(list.length, n * n)).sort((u, w) => u[0] + u[1] - (w[0] + w[1]));
  const busy = new Set(used.map(([i, j]) => `${i},${j}`));
  const placed = list.slice(0, used.length).map((v, q) => ({ v, cell: used[q] })).sort((u, w) => u.cell[0] + u.cell[1] - (w.cell[0] + w.cell[1]));
  // A small plot keeps the trees about as big as the 3×3 one, so neighbouring crowns don't run together.
  const tmax = (n === 3 ? 110 : list.length <= 3 ? 116 : 104) * s;
  const out: Layer[] = [];
  for (const { v, cell } of placed) {
    const [x, y] = Pt(cell[0] + 0.5, cell[1] + 0.5);
    const depth = (cell[0] + cell[1]) / (2 * n - 2);
    const K = STAGE_K[treeKey(v, N, true).stage];
    const want = tmax * (0.86 + depth * 0.14);
    const limTop = x - want * K * 0.45 < headR ? headB + 4 : 42; // the top band and the header stay clear
    let room = Math.min(want, (y - limTop) / K);
    if (busy.has(`${cell[0] - 1},${cell[1] - 1}`)) room = Math.min(room, (2 * b - 6) / K);
    back += `<ellipse cx="${r1(x)}" cy="${r1(y + 0.5 * s)}" rx="${r1(22 * s)}" ry="${r1(6.5 * s)}" ${paint('fill', F.shadow)}/>`;
    out.push(treeImg(v, N, x, y + 2, room, n === 3 ? 2 * a - 8 : 1.6 * a, true).layer);
  }
  let front = fence(edge([0, n], [n, n])) + fence(edge([n, n], [n, 0]));
  // The header: "My forest", the number of all days and two short lines beside it.
  const hx = cp ? 14 : 16, hy = cp ? 9 : 11;
  out.push(text(hx, hy, 200, [c.t('wgForest')], cp ? 12.5 : 13.5, 17, 900, k.soft));
  if (!views.length) {
    // An empty forest: an invitation, not "0 days" (спец 3, "Нет деревьев").
    out.push(text(hx, hy + 19, Math.min(W - 2 * hx, 260), [c.t('wgEmptyTitle1'), c.t('wgEmptyTitle2')], cp ? 16 : 19, cp ? 20 : 24, 900, k.ink));
    const pk = panel(W, H, P, 'go', k);
    front += pk.svg;
    const verb = c.t('wgPlantFirst');
    const tw = textWidth(verb, 15);
    const x0 = (W - (20 + 8 + tw)) / 2;
    front += glyph('plus', x0, H - P + (P - 20) / 2, 20);
    out.push(text(x0 + 28, H - P + (P - 20) / 2, tw + 8, [verb], 15, 20, 900, pk.ink));
    return done(c, back, front, out, PLANT_URI, verb);
  }
  const label = num(c, f.days), ns = cp ? 30 : 40, nlh = cp ? 34 : 44;
  const nw = textWidth(label, ns) * 0.96;
  out.push(text(hx, hy + 17, nw + 8, [label], ns, nlh, 900, k.ink, 'left', true));
  const ls = cp ? 11.5 : 12.5, llh = cp ? 14 : 16;
  out.push(text(hx + nw + 8, hy + 17 + (nlh - 2 * llh) / 2, 170, [c.t.dict.wgDaysWords[pluralForm(c.t.lang, f.days)], c.t('wgTrees', { n: f.total, word: treesWord(c, f.total) })], ls, llh, 800, k.soft));
  // The panel: what is left to water today.
  const grow = views.filter((v) => v.state !== 'dead' && v.state !== 'locked');
  const doneN = grow.filter((v) => v.state === 'done').length;
  const left = grow.length - doneN;
  const pk = panel(W, H, P, 'glass', k);
  front += pk.svg + glyph(left ? 'drop' : 'check', 14, H - P + (P - 22) / 2, 22);
  // One bar per growing tree while they fit in a third of the panel; more trees — no bars, the verb says it.
  const bw = clamp((W * 0.36) / Math.max(1, grow.length) - 3, 3, 10);
  const showBars = grow.length > 1 && grow.length * (bw + 3) - 3 <= W * 0.36;
  const barsW = showBars ? grow.length * (bw + 3) - 3 : 0;
  // One tree needs no bars: the verb says it.
  if (showBars) grow.forEach((v, i) => {
    front += pill(W - 16 - barsW + i * (bw + 3), H - P / 2 - 3, bw, 6, v.state === 'done' ? '#4CC764' : N ? 'rgba(255,255,255,.22)' : 'rgba(30,27,22,.14)', undefined, 3);
  });
  const verb = grow.length === 0 ? c.t('wgAllDone') : left ? c.t('wgToWater', { n: left, word: treesWord(c, left) }) : c.t('wgAllDone');
  const vs = cp ? 13 : 14;
  out.push(text(14 + 22 + 9, H - P + (P - 18) / 2, W - 45 - barsW - 24, [verb], vs, 18, 900, left ? k.ink : k.doneInk));
  return done(c, back, front, out, FOREST_URI, `${c.t('wgForest')}, ${verb}`);
}

/** The two SVG layers around the trees and words. */
function done(c: Ctx, back: string, front: string, rest: Layer[], uri: string, label: string, radius = 28): Drawn {
  const id = c.id ?? 'w';
  const layers: Layer[] = [{ k: 'svg', svg: svgDoc(c.W, c.H, `${id}b`, back, radius) }];
  const pics = rest.filter((l) => l.k === 'img');
  const words = rest.filter((l) => l.k === 'text');
  const taps = rest.filter((l) => l.k === 'tap');
  layers.push(...pics, { k: 'svg', svg: svgDoc(c.W, c.H, `${id}f`, front, radius) }, ...words, ...taps);
  return { W: c.W, H: c.H, layers, uri, label };
}
