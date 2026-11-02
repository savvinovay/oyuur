// The four widgets at every size from the minimum up, in RU and EN, in every state (спец 2, 7.1, кадры 12, 17):
// nothing leaves the widget and no word is cut. With WIDGET_PREVIEW=1 it also writes the browser preview
// design/oyuur-39/preview.html (`?f=<frame>` shows one frame) — the snapshots of the widgets come from it.
import { describe, expect, it } from '@jest/globals';
import { Lang, makeT } from '@/i18n';
import type { WidgetTree } from '../snapshot';
import type { TreeView, WState } from '../state';
import { toHtml } from '../draw/html';
import { Drawn } from '../draw/layers';
import { Ctx, w22, w41, w42, w44 } from '../draw/layouts';
import { composeWidget, DEFAULT_CONFIG } from '../compose';
import { fitName, formatNumber, textWidth } from '../draw/text';

const tree = (id: string, name: string, extra: Partial<WidgetTree> = {}): WidgetTree => ({
  id, lineageId: id, skin: 'oak', kind: 'quit', hidden: false, name, nick: null, plantedOn: '2026-09-01', settledThrough: '2026-10-28',
  refilledMonth: '2026-10', chancesLeft: 3, checkins: [], frozen: [], days: 24, diedOn: null, completedOn: null, openHours: [], generation: 1, ...extra,
});
const view = (t: WidgetTree, state: WState, extra: Partial<TreeView> = {}): TreeView => ({ tree: t, state, days: t.days, hearts: 3, opensAt: 18, ...extra });

// The same trees as the mockup: «Без соцсетей» is the hidden one («Дубочек»); the dead one is «Спать до 23:00» («Яблочко», 41).
const T = {
  sugar: tree('sugar', 'Без сладкого', { days: 24 }),
  social: tree('social', 'Без соцсетей', { hidden: true, name: null, nick: 'Дубочек', skin: 'oak', days: 57 }),
  run: tree('run', 'Пробежка по утрам в парке', { skin: 'birch', kind: 'do', days: 8 }),
  read: tree('read', 'Читать 10 страниц', { skin: 'sakura', kind: 'do', days: 132 }),
  water: tree('water', 'Пить воду', { skin: 'spruce', kind: 'do', days: 3 }),
  smoke: tree('smoke', 'Не курить', { skin: 'maple', days: 15 }),
  sleep: tree('sleep', 'Спать до 23:00', { skin: 'apple', nick: 'Яблочко', days: 41, diedOn: '2026-10-20' }),
  palm: tree('palm', 'Медитация', { skin: 'palm', kind: 'do', days: 1 }),
  apple: tree('apple', 'Английский', { skin: 'apple', kind: 'do', days: 64 }),
};
const EN: Record<string, string> = { sugar: 'No sugar', run: 'Morning run in the park', read: 'Read 10 pages', water: 'Drink water', smoke: 'No smoking', sleep: 'Bed by 11 PM', palm: 'Meditate', apple: 'English' };
const inLang = (v: TreeView, lang: Lang): TreeView =>
  lang === 'en' && v.tree.name ? { ...v, tree: { ...v.tree, name: EN[v.tree.id] ?? v.tree.name, nick: v.tree.id === 'social' ? 'Acorn' : v.tree.id === 'sleep' ? 'Appley' : v.tree.nick } } : lang === 'en' && v.tree.id === 'social' ? { ...v, tree: { ...v.tree, nick: 'Acorn' } } : v;

const one: Record<string, TreeView | null> = {
  water: view(T.sugar, 'water'),
  done: view(T.read, 'done'),
  wait: view(T.social, 'wait'),
  last: view(T.smoke, 'last', { hearts: 0 }),
  burn: view(T.run, 'burn', { hearts: 2 }),
  dead: view(T.sleep, 'dead', { hearts: 0 }),
  empty: null,
};
const today: TreeView[] = [view(T.sugar, 'water'), view(T.social, 'wait'), view(T.read, 'done'), view(T.smoke, 'last', { hearts: 0 })];
const todayMany: TreeView[] = [...today, view(T.water, 'water'), view(T.run, 'done'), view(T.palm, 'wait')];
const todayDone: TreeView[] = [view(T.read, 'done'), view(T.run, 'done'), view(T.water, 'done')];
const forest: TreeView[] = [view(T.read, 'done'), view(T.apple, 'water'), view(T.social, 'wait'), view(T.sugar, 'done'), view(T.smoke, 'last', { hearts: 0 }), view(T.run, 'burn'), view(T.water, 'done'), view(T.sleep, 'dead')];

const ctx = (W: number, H: number, lang: Lang, o: Partial<Ctx> = {}): Ctx => ({ W, H, night: false, t: makeT(lang), h24: lang === 'ru', showHidden: false, ...o });

/** Every word inside the widget, and no line wider than its box. */
function checkFits(d: Drawn, what: string) {
  for (const l of d.layers) {
    if (l.k === 'text') {
      for (const line of l.lines) {
        if (textWidth(line, l.size, l.weight) > l.w + 0.5) throw new Error(`${what}: “${line}” ${textWidth(line, l.size, l.weight).toFixed(1)} > ${l.w}`);
      }
      if (l.x < 0 || l.x + l.w > d.W + 0.5 || l.y < 0 || l.y + l.lh * l.lines.length > d.H + 0.5) throw new Error(`${what}: “${l.lines.join(' ')}” leaves the widget`);
    }
    if (l.k === 'img' && (l.x < -0.5 || l.x + l.w > d.W + 0.5 || l.y < -0.5 || l.y + l.h > d.H + 0.5)) throw new Error(`${what}: tree ${l.key} leaves the widget`);
  }
}

const SIZES = {
  w22: [[130, 117], [152, 150], [174, 172], [204, 212]],
  w41: [[276, 51], [368, 76], [368, 90]],
  w42: [[276, 117], [368, 140], [368, 172], [400, 200]],
  w44: [[276, 249], [368, 364], [400, 400]],
} as const;

describe('widgets fit at every size (спец 7.1, кадр 17)', () => {
  for (const lang of ['ru', 'en'] as Lang[]) {
    for (const night of [false, true]) {
      it(`${lang}${night ? ' night' : ''}: 2×2 and 4×1, every state, scene and simple`, () => {
        for (const [W, H] of SIZES.w22) for (const [k, v] of Object.entries(one)) for (const simple of [false, true]) {
          checkFits(w22(v && inLang(v, lang), ctx(W, H, lang, { night, simple, dark: night })), `2×2 ${W}×${H} ${k} ${simple ? 'simple' : ''}`);
        }
        for (const [W, H] of SIZES.w41) for (const [k, v] of Object.entries(one)) for (const simple of [false, true]) {
          checkFits(w41(v && inLang(v, lang), ctx(W, H, lang, { night, simple, dark: night })), `4×1 ${W}×${H} ${k}`);
        }
      });
      it(`${lang}${night ? ' night' : ''}: 4×2 and 4×4`, () => {
        for (const [W, H] of SIZES.w42) for (const list of [today, todayMany, todayDone, []]) {
          checkFits(w42(list.map((v) => inLang(v, lang)), ctx(W, H, lang, { night })), `4×2 ${W}×${H} ${list.length}`);
        }
        for (const [W, H] of SIZES.w44) for (const list of [forest, forest.slice(0, 1), forest.slice(0, 3), forest.slice(0, 4), []]) {
          checkFits(w44(list.map((v) => inLang(v, lang)), ctx(W, H, lang, { night })), `4×4 ${W}×${H} ${list.length}`);
        }
      });
    }
  }
});

describe('edge cases (проверка кода)', () => {
  it('a forest of 40 growing trees: no bars over the words', () => {
    const many = Array.from({ length: 40 }, (_, i) => view(tree(`t${i}`, `Habit ${i}`, { days: i + 1 }), 'water'));
    for (const [W, H] of SIZES.w44) checkFits(w44(many, ctx(W, H, 'ru')), `4×4 ${W}×${H} 40`);
  });

  it('no snapshot yet (the app not opened since install): an invitation, not a crash', () => {
    for (const name of ['Tree', 'Today', 'Forest', 'Row', 'Unknown']) {
      const r = composeWidget(name, null, DEFAULT_CONFIG, 200, 200, new Date(2026, 9, 29, 12, 0));
      expect(r.light.uri).toBe('oyuur://new');
    }
  });
});

describe('widget words', () => {
  it('a hidden tree shows its own name, never the habit', () => {
    const d = w22(one.wait, ctx(174, 172, 'ru'));
    const words = d.layers.flatMap((l) => (l.k === 'text' ? l.lines : []));
    expect(words).toContain('Дубочек');
    expect(words.join(' ')).not.toContain('соцсет');
  });

  it('long names: one size smaller, then whole words with "…"', () => {
    expect(fitName('Без сладкого', 120, 13).lines).toEqual(['Без сладкого']);
    const cut = fitName('Пробежка по утрам в парке', 100, 13);
    expect(cut.size).toBe(12);
    expect(cut.lines[0].endsWith('…')).toBe(true);
    // Only whole words before "…".
    expect('Пробежка по утрам в парке '.startsWith(`${cut.lines[0].replace('…', '')} `)).toBe(true);
    const two = fitName('Пробежка по утрам в парке', 80, 11, 2);
    expect(two.lines.length).toBeLessThanOrEqual(2);
  });

  it('numbers: grouped, shortened from 100 000', () => {
    expect(formatNumber(1284, 'ru', '{n} тыс.')).toBe('1 284');
    expect(formatNumber(1284, 'en', '{n}K')).toBe('1,284');
    expect(formatNumber(123456, 'en', '{n}K')).toBe('123K');
  });

  it('a tap opens the tree; dead — its card in the forest; nothing — a new habit', () => {
    expect(w22(one.water, ctx(174, 172, 'ru')).uri).toBe('oyuur://tree/sugar');
    expect(w22(one.dead, ctx(174, 172, 'ru')).uri).toBe('oyuur://forest?highlight=sleep');
    expect(w22(null, ctx(174, 172, 'ru')).uri).toBe('oyuur://new');
    expect(w44(forest, ctx(368, 364, 'ru')).uri).toBe('oyuur://forest');
    const taps = w42(todayMany, ctx(368, 172, 'ru')).layers.filter((l) => l.k === 'tap');
    expect(taps.map((l) => (l.k === 'tap' ? l.uri : ''))).toEqual(['oyuur://', 'oyuur://tree/smoke', 'oyuur://tree/sugar', 'oyuur://tree/water', 'oyuur://tree/social']);
  });
});

// ---- The browser preview (WIDGET_PREVIEW=1 npx jest layouts) ----
const preview = process.env.WIDGET_PREVIEW ? it : it.skip;
preview('writes design/oyuur-39/preview.html', () => {
  // Node's own modules, without Node's types in the app (jest runs from app/).
  const fs = require('fs');
  const out = `${require('path').resolve('..')}/design/oyuur-39`;
  fs.mkdirSync(out, { recursive: true });
  let uid = 0;
  const pic = (key: string) => `../../app/assets/widget/trees/${key}.png`;
  const html = (d: Drawn) => toHtml(d, pic);
  const c = (W: number, H: number, lang: Lang, o: Partial<Ctx> = {}) => ({ ...ctx(W, H, lang, o), id: `p${uid++}` });
  const item = (label: string, d: Drawn) => `<div class="it">${html(d)}<div class="lb">${label}</div></div>`;
  const frames: [string, string, string][] = [];
  const frame = (key: string, title: string, items: string[], bg = '') => frames.push([key, title, `<div class="row ${bg}">${items.join('')}</div>`]);
  for (const lang of ['ru', 'en'] as Lang[]) {
    const L = (v: TreeView | null) => v && inLang(v, lang);
    const sfx = lang === 'en' ? '-en' : '';
    frame(`22-day${sfx}`, `2×2 «Дерево» — день (${lang})`, Object.entries(one).map(([k, v]) => item(k, w22(L(v), c(174, 172, lang)))));
    frame(`22-night${sfx}`, `2×2 «Дерево» — ночь (${lang})`, Object.entries(one).map(([k, v]) => item(k, w22(L(v), c(174, 172, lang, { night: true })))), 'dark');
    frame(`22-sizes${sfx}`, `2×2 — от минимума до крупной сетки (${lang})`, SIZES.w22.flatMap(([W, H]) => ['water', 'burn', 'dead'].map((k) => item(`${W}×${H} ${k}`, w22(L(one[k]), c(W, H, lang))))));
    frame(`22-simple${sfx}`, `2×2 «Простой» — светлый и тёмный (${lang})`, [
      ...Object.entries(one).map(([k, v]) => item(k, w22(L(v), c(174, 172, lang, { simple: true })))),
      ...Object.entries(one).map(([k, v]) => item(`${k} dark`, w22(L(v), c(174, 172, lang, { simple: true, dark: true })))),
    ], 'wall');
    frame(`41${sfx}`, `4×1 «Строка» (${lang})`, [
      ...Object.entries(one).map(([k, v]) => item(k, w41(L(v), c(368, 76, lang)))),
      ...['water', 'done'].map((k) => item(`${k} night`, w41(L(one[k]), c(368, 76, lang, { night: true })))),
      ...['water', 'burn', 'empty'].map((k) => item(`276×51 ${k}`, w41(L(one[k]), c(276, 51, lang)))),
      ...['water', 'done'].map((k) => item(`simple ${k}`, w41(L(one[k]), c(368, 76, lang, { simple: true })))),
      item('simple dark', w41(L(one.wait), c(368, 76, lang, { simple: true, dark: true }))),
    ], 'wall');
    const LL = (list: TreeView[]) => list.map((v) => inLang(v, lang));
    frame(`42${sfx}`, `4×2 «Сегодня» (${lang})`, [
      item('4 дерева', w42(LL(today), c(368, 172, lang))),
      item('7 деревьев: +N', w42(LL(todayMany), c(368, 172, lang))),
      item('всё полито', w42(LL(todayDone), c(368, 172, lang))),
      item('ночь', w42(LL(today), c(368, 172, lang, { night: true }))),
      item('нет деревьев', w42([], c(368, 172, lang))),
      item('276×117 узкий, компактный', w42(LL(todayMany), c(276, 117, lang))),
      item('400×200', w42(LL(today), c(400, 200, lang))),
    ]);
    frame(`44${sfx}`, `4×4 «Мой лес» (${lang})`, [
      item('8 деревьев', w44(LL(forest), c(368, 364, lang))),
      item('ночь', w44(LL(forest), c(368, 364, lang, { night: true }))),
      item('1 дерево', w44(LL(forest.slice(0, 1)), c(368, 364, lang))),
      item('4 дерева', w44(LL(forest.slice(0, 4)), c(368, 364, lang))),
      item('276×249', w44(LL(forest), c(276, 249, lang))),
      item('нет деревьев', w44([], c(368, 364, lang))),
    ]);
  }
  // The four pictures of the widget list (спец 8, кадр 16): light, made-up data; RU for Russian phones.
  for (const lang of ['en', 'ru'] as Lang[]) {
    const sfx = lang === 'ru' ? '-ru' : '';
    const LL = (list: TreeView[]) => list.map((v) => inLang(v, lang));
    frame(`preview-tree${sfx}`, 'превью Tree', [html(w22(inLang(one.water!, lang), c(174, 172, lang)))]);
    frame(`preview-today${sfx}`, 'превью Today', [html(w42(LL(today), c(368, 172, lang)))]);
    frame(`preview-forest${sfx}`, 'превью Forest', [html(w44(LL(forest), c(368, 364, lang)))]);
    frame(`preview-row${sfx}`, 'превью Row', [html(w41(inLang(one.done!, lang), c(368, 76, lang)))]);
  }
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>Виджеты — OYUUR-39</title><style>
@font-face{font-family:Nunito_800ExtraBold;src:url(../../app/assets/widget/fonts/Nunito_800ExtraBold.ttf)}
@font-face{font-family:Nunito_900Black;src:url(../../app/assets/widget/fonts/Nunito_900Black.ttf)}
body{margin:0;background:#EFE3CF;font-family:Nunito_800ExtraBold,sans-serif;color:#1E1B16}
.fr{padding:18px 20px}.fr h2{font-family:Nunito_900Black;font-size:18px;margin:0 0 12px}
.row{display:flex;flex-wrap:wrap;gap:22px 18px;align-items:flex-start;padding:16px;border-radius:20px}
.row.dark{background:#24233F}.row.wall{background:linear-gradient(165deg,#DDE6CF,#93AB82)}
.dark .lb{color:#C9C8EE}.lb{font-size:12px;color:#6E6152;margin-top:6px}
body.one{background:transparent}body.one .fr{padding:0}body.one h2,body.one .lb{display:none}body.one .row{padding:0;background:none}
</style></head><body><script>const f=new URLSearchParams(location.search).get('f');</script>
${frames.map(([k, t, h]) => `<section class="fr" data-f="${k}"><h2>${t}</h2>${h}</section>`).join('\n')}
<script>if(f){document.body.classList.add('one');document.querySelectorAll('.fr').forEach(s=>{if(s.dataset.f!==f)s.remove()})}</script></body></html>`;
  fs.writeFileSync(`${out}/preview.html`, page);
});
