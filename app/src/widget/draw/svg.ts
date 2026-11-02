// Everything on a widget except the trees and the words, drawn as SVG (design/oyuur-37/макет.html: G, spark,
// scene(), soil, rootGlow, bubble; numbers and colors from спец 2.0). On the phone react-native-android-widget
// draws it with androidsvg, in the browser preview — as is. androidsvg is old-fashioned about colors, so every
// rgba() becomes a hex color plus an opacity attribute (`paint`).

/** "rgba(255,255,255,.55)" → ["#FFFFFF", 0.55]; hex stays. */
export function splitColor(c: string): [string, number] {
  const m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(c);
  if (!m) return [c, 1];
  const hex = (v: string) => Math.round(Number(v)).toString(16).padStart(2, '0').toUpperCase();
  return [`#${hex(m[1])}${hex(m[2])}${hex(m[3])}`, Number(m[4])];
}

/** `fill="…"` (or stroke / stop-color) with its opacity, for androidsvg. */
export function paint(attr: 'fill' | 'stroke' | 'stop-color', c: string): string {
  const [hex, a] = splitColor(c);
  const op = attr === 'stop-color' ? 'stop-opacity' : `${attr}-opacity`;
  return a < 1 ? `${attr}="${hex}" ${op}="${a}"` : `${attr}="${hex}"`;
}

/** The same for a whole fragment written with rgba() (the glyphs are copied from the app as they are). */
export const fixColors = (s: string) =>
  s.replace(/(fill|stroke|stop-color)="(rgba\([^"]+\))"/g, (_, attr: 'fill' | 'stroke' | 'stop-color', c: string) => paint(attr, c));

const n1 = (v: number) => (Math.round(v * 10) / 10).toString();

// ---- Glyphs (viewBox 24), copied from app/src/ui/ds/glyphs.tsx via the mockup ----
const G = {
  rings: '<circle cx="12" cy="12" r="11" fill="#7A4E26"/><circle cx="12" cy="12" r="9.2" fill="#F3CF92"/><circle cx="11.6" cy="12.3" r="6.4" fill="none" stroke="#B57A3E" stroke-width="1.8"/><circle cx="11.35" cy="12.45" r="3.4" fill="none" stroke="#B57A3E" stroke-width="1.8"/><circle cx="11" cy="12.7" r="1.2" fill="#9A6230"/>',
  drop: '<path d="M12 2.5 C12 2.5 4.5 11 4.5 15 A7.5 7.5 0 0 0 19.5 15 C19.5 11 12 2.5 12 2.5Z" fill="#3FA2DE" stroke="#2A80BC" stroke-width="1.3" stroke-linejoin="round"/><path d="M8.6 15.2 A3.6 3.6 0 0 0 11.4 18.6" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" fill="none" opacity=".85"/>',
  dropWhite: '<path d="M12 3.2 C12 3.2 5.4 10.8 5.4 14.6 A6.6 6.6 0 0 0 18.6 14.6 C18.6 10.8 12 3.2 12 3.2Z" fill="#FFFFFF"/><path d="M9.2 14.8 A3 3 0 0 0 11.6 17.6" stroke="#2A80BC" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
  check: '<circle cx="12" cy="12" r="10.5" fill="#4CC764" stroke="#34A64D" stroke-width="1.3"/><path d="M7.2 12.4 L10.4 15.5 L16.8 8.9" stroke="#FFFFFF" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  clock: '<circle cx="12" cy="12" r="10.5" fill="#FFCF4D" stroke="#D99A1E" stroke-width="1.3"/><circle cx="12" cy="12" r="7.3" fill="#FFF8E6"/><path d="M3.6 8.9 A9 9 0 0 1 7.5 4.2" stroke="#FFF3C4" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".9"/><circle cx="12" cy="6.2" r=".85" fill="#E3B04A"/><circle cx="17.8" cy="12" r=".85" fill="#E3B04A"/><circle cx="12" cy="17.8" r=".85" fill="#E3B04A"/><circle cx="6.2" cy="12" r=".85" fill="#E3B04A"/><path d="M12 7.9 V12 L14.9 13.7" stroke="#5A3A0E" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="1.25" fill="#5A3A0E"/>',
  heart: '<path d="M12 20.5 C5.2 15.2 2.5 12 2.5 8.3 A4.8 4.8 0 0 1 12 6.2 A4.8 4.8 0 0 1 21.5 8.3 C21.5 12 18.8 15.2 12 20.5Z" fill="#E0485F" stroke="#A82A3F" stroke-width="1.3" stroke-linejoin="round"/><path d="M6.2 8.4 A2.4 2.4 0 0 1 8.6 6.1" stroke="#FFFFFF" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".7"/>',
  heartEmpty: '<path d="M12 20.5 C5.2 15.2 2.5 12 2.5 8.3 A4.8 4.8 0 0 1 12 6.2 A4.8 4.8 0 0 1 21.5 8.3 C21.5 12 18.8 15.2 12 20.5Z" fill="rgba(255,255,255,.35)" stroke="#A82A3F" stroke-width="1.6" stroke-linejoin="round"/>',
  seed: '<ellipse cx="12" cy="20.6" rx="7" ry="2" fill="#C99A60"/><ellipse cx="10.6" cy="15.6" rx="5.2" ry="3.6" transform="rotate(-20 10.6 15.6)" fill="#9A6634" stroke="#6B4320" stroke-width="1.2"/><ellipse cx="9.2" cy="14.6" rx="2" ry="1" transform="rotate(-20 9.2 14.6)" fill="#C99060"/><path d="M14.4 13 C15.2 9.8 17 8 19.8 7.4" stroke="#5E9A2C" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M17.4 8.2 C17.2 5.8 18.6 4.2 20.8 4 C21 6.4 19.6 7.8 17.4 8.2Z" fill="#8BC34A" stroke="#4E8A2A" stroke-width="1"/>',
  tombstone: '<path d="M6 21 V10 A6 6 0 0 1 18 10 V21Z" fill="#C3C6CE" stroke="#6F7380" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.2 10.6 A4 4 0 0 1 11 7.2" stroke="#FFFFFF" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".7"/><path d="M9.5 12 H14.5 M9.5 15 H14.5 M9.5 18 H13" stroke="#6F7380" stroke-width="1.4" stroke-linecap="round"/><path d="M3 21.3 H21" stroke="#5E9A2C" stroke-width="2.4" stroke-linecap="round"/>',
  plus: '<circle cx="12" cy="12" r="10.5" fill="#FFFFFF"/><path d="M12 7 V17 M7 12 H17" stroke="#2B8A40" stroke-width="2.6" stroke-linecap="round"/>',
  spark: '<path d="M12 1 Q13 11 23 12 Q13 13 12 23 Q11 13 1 12 Q11 11 12 1Z" fill="#FFE39A" stroke="rgba(217,154,30,.55)" stroke-width="1"/>',
};
export type GlyphName = keyof typeof G;
const GLYPHS = Object.fromEntries(Object.entries(G).map(([k, v]) => [k, fixColors(v)])) as Record<GlyphName, string>;

/** A glyph with its top-left corner at (x, y), `s` dp wide. */
export const glyph = (name: GlyphName, x: number, y: number, s: number) =>
  `<g transform="translate(${n1(x)} ${n1(y)}) scale(${(s / 24).toFixed(4)})">${GLYPHS[name]}</g>`;

/** The SVG of one layer of the widget: W×H dp, clipped to the widget's rounded corners (28 dp, спец 2.0). */
export function svgDoc(W: number, H: number, id: string, body: string, radius = 28): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><clipPath id="${id}c"><rect width="${W}" height="${H}" rx="${radius}" ry="${radius}"/></clipPath></defs><g clip-path="url(#${id}c)">${body}</g></svg>`;
}

// ---- The little scene: sky + far hills + meadow hill (макет scene()) ----

/** The same "random" numbers every time for the same seed (stars, tufts). */
export function rnd(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}
const inBox = (x: number, y: number, boxes: number[][]) => boxes.some(([a, b, c, d]) => x > a && x < c && y > b && y < d);

export interface SceneOpts {
  night?: boolean;
  /** The quiet grey sky of a dead tree. */
  muted?: boolean;
  /** The tree wants water: a light warm haze on the horizon. */
  warm?: boolean;
  hill?: number;
  /** Sun / moon: 'glow' — only the soft glow in the corner; 'disc' — with the disc. */
  sun?: 'glow' | 'disc' | false;
  sunX?: number;
  sunY?: number;
  sunR?: number;
  clouds?: [number, number, number][] | 0;
  seed?: number;
  /** Stars never above this line (the top band). */
  starTop?: number;
  avoid?: number[][];
  /** x ranges kept free of tufts (next to the tree). */
  clear?: [number, number][];
  grassBottom?: number;
  flat?: boolean;
  flowers?: boolean;
}

export function scene(w: number, h: number, id: string, o: SceneOpts = {}): string {
  const N = !!o.night, Mu = !!o.muted, Wa = !!o.warm && !Mu;
  const hy = o.hill ?? h * 0.7;
  const sky = Mu ? (N ? ['#1E2142', '#2B2E55', '#45486E'] : ['#BFCCD5', '#D5DEE4', '#ECF0F2'])
    : Wa ? (N ? ['#1B1F5C', '#30307A', '#6E5C9E'] : ['#A7DDEF', '#D4EEF0', '#FFEBD0'])
    : (N ? ['#191E5E', '#2B2F7A', '#5357A8'] : ['#9FE1F5', '#C9F0FA', '#EAFBFF']);
  const far = Mu ? (N ? '#353964' : '#C6D1D2') : (N ? '#3B3F8C' : '#B7DCE0');
  const far2 = Mu ? (N ? '#3E4370' : '#D3DCDC') : (N ? '#4A4F9E' : '#CFEAEA');
  const hil = Mu ? (N ? ['#2E3459', '#363C63'] : ['#B9C7BE', '#C9D3C9']) : (N ? ['#2C3A6E', '#34477A'] : ['#A3D3B7', '#B9E0C2']);
  const mead = Mu ? (N ? ['#3A4066', '#33395C'] : ['#CFD5B8', '#C3CAAA']) : (N ? ['#3D4C86', '#34406F'] : ['#CBE5A1', '#B7DA8A']);
  const grass = Mu ? (N ? '#454B70' : '#AEB898') : (N ? '#2F5233' : '#7DB24A');
  const grass2 = Mu ? (N ? '#3C4266' : '#BCC4A4') : (N ? '#3E6440' : '#9CCB5E');
  let s = `<defs>
<linearGradient id="${id}k" x1="0" y1="0" x2="0" y2="${n1(hy)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".62" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
<linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hil[0]}"/><stop offset="1" stop-color="${hil[1]}"/></linearGradient>
<linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mead[0]}"/><stop offset="1" stop-color="${mead[1]}"/></linearGradient>
<radialGradient id="${id}g"><stop offset="0" ${paint('stop-color', N ? 'rgba(201,199,255,.55)' : 'rgba(255,246,194,.9)')}/><stop offset=".45" ${paint('stop-color', N ? 'rgba(201,199,255,.16)' : 'rgba(255,241,168,.35)')}/><stop offset="1" ${paint('stop-color', 'rgba(255,241,168,0)')}/></radialGradient>
<radialGradient id="${id}s" cx=".38" cy=".35"><stop offset="0" stop-color="#FFF6BE"/><stop offset=".55" stop-color="#FBD84E"/><stop offset="1" stop-color="#F4BE34"/></radialGradient>
</defs><rect width="${w}" height="${h}" fill="url(#${id}k)"/>`;
  const sx = o.sunX ?? w - 26, sy = o.sunY ?? 24, sr = o.sunR ?? 13;
  if (!Mu && o.sun !== false) {
    s += `<circle cx="${n1(sx)}" cy="${n1(sy)}" r="${n1(sr * 5)}" fill="url(#${id}g)"/>`;
    if (o.sun === 'disc') s += disc(sx, sy, sr, N);
  }
  const r = rnd(o.seed ?? 7);
  if (N) {
    // Stars: white dots only (never gold sparkles — those mean "watered"), never in the top band.
    const top = o.starTop ?? 0, avoid = o.avoid ?? [];
    const count = Math.round((w * (hy - top)) / 1100);
    for (let i = 0; i < count; i++) {
      const x = r() * w, y = top + 4 + r() * Math.max(0, hy - top - 30), rad = 0.6 + r() * 0.8, op = (Mu ? 0.25 : 0.5) + r() * 0.45;
      if (inBox(x, y, avoid)) continue;
      if (o.sun === 'disc' && Math.hypot(x - sx, y - sy) < sr * 2.2) continue;
      s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${rad.toFixed(2)}" fill="#FFFFFF" fill-opacity="${op.toFixed(2)}"/>`;
    }
  } else if (o.clouds !== 0) {
    for (const [cx, cy, k] of o.clouds ?? [[w * 0.34, hy * 0.42, 1]]) s += cloud(cx, cy, k, Mu);
  }
  s += `<path d="M0 ${n1(hy - 16)} C${n1(w * 0.14)} ${n1(hy - 36)} ${n1(w * 0.3)} ${n1(hy - 32)} ${n1(w * 0.44)} ${n1(hy - 18)} C${n1(w * 0.58)} ${n1(hy - 40)} ${n1(w * 0.78)} ${n1(hy - 38)} ${w} ${n1(hy - 20)} V${h} H0Z" fill="${far}"/>`;
  s += `<path d="M0 ${n1(hy - 10)} C${n1(w * 0.1)} ${n1(hy - 22)} ${n1(w * 0.22)} ${n1(hy - 22)} ${n1(w * 0.34)} ${n1(hy - 12)} C${n1(w * 0.5)} ${n1(hy - 26)} ${n1(w * 0.66)} ${n1(hy - 22)} ${n1(w * 0.8)} ${n1(hy - 12)} C${n1(w * 0.9)} ${n1(hy - 20)} ${n1(w * 0.96)} ${n1(hy - 18)} ${w} ${n1(hy - 14)} V${h} H0Z" fill="${far2}" fill-opacity=".9"/>`;
  s += `<path d="M0 ${n1(hy - 2)} C${n1(w * 0.18)} ${n1(hy - 16)} ${n1(w * 0.34)} ${n1(hy - 14)} ${n1(w * 0.5)} ${n1(hy - 4)} C${n1(w * 0.66)} ${n1(hy - 14)} ${n1(w * 0.84)} ${n1(hy - 16)} ${w} ${n1(hy - 2)} V${h} H0Z" fill="url(#${id}h)"/>`;
  const bulge = o.flat ? 4 : 12;
  const arc = `M0 ${n1(hy + bulge * 0.6)} Q${n1(w / 2)} ${n1(hy - bulge)} ${w} ${n1(hy + bulge * 0.6)}`;
  s += `<path d="${arc} V${h} H0Z" fill="url(#${id}m)"/>`;
  s += `<path d="${arc}" fill="none" ${paint('stroke', N ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.55)')} stroke-width="1.5"/>`;
  const gb = o.grassBottom ?? h;
  for (let i = 0, tufts = Math.round(w / 26); i < tufts; i++) {
    const x = 6 + r() * (w - 12), t = r();
    const y = hy + 10 + t * Math.max(0, gb - hy - 14);
    if (o.clear && o.clear.some(([a, b]) => x > a && x < b)) continue;
    s += tuft(x, y, 0.7 + r() * 0.6, i % 2 ? grass : grass2);
  }
  if (!N && !Mu && o.flowers !== false) {
    const fl = ['#FFFFFF', '#FFD84D', '#FF9FB8', '#B7A6FF'];
    for (let i = 0; i < Math.round(w / 60); i++) {
      const x = 8 + r() * (w - 16), y = hy + 14 + r() * Math.max(0, gb - hy - 20);
      s += `<circle cx="${n1(x)}" cy="${n1(y)}" r="1.6" fill="${fl[i % 4]}"/>`;
    }
  }
  return s;
}

export const tuft = (x: number, y: number, k: number, color: string) =>
  `<path d="M${n1(x - 3 * k)} ${n1(y)} Q${n1(x - 3.5 * k)} ${n1(y - 5 * k)} ${n1(x - 5 * k)} ${n1(y - 7 * k)} M${n1(x)} ${n1(y)} Q${n1(x)} ${n1(y - 6 * k)} ${n1(x + 0.5 * k)} ${n1(y - 9 * k)} M${n1(x + 3 * k)} ${n1(y)} Q${n1(x + 3.5 * k)} ${n1(y - 4 * k)} ${n1(x + 5.5 * k)} ${n1(y - 6 * k)}" stroke="${color}" stroke-width="${(1.3 * k).toFixed(2)}" fill="none" stroke-linecap="round"/>`;

export function cloud(cx: number, cy: number, k: number, muted = false): string {
  const c1 = muted ? '#F1F4F5' : '#FFFFFF', c2 = muted ? '#DCE3E7' : '#DDF1FA';
  return `<g opacity="${muted ? 0.7 : 0.95}"><ellipse cx="${n1(cx)}" cy="${n1(cy + 4 * k)}" rx="${n1(24 * k)}" ry="${n1(6 * k)}" fill="${c2}"/><circle cx="${n1(cx - 9 * k)}" cy="${n1(cy)}" r="${n1(8 * k)}" fill="${c1}"/><circle cx="${n1(cx + 3 * k)}" cy="${n1(cy - 4 * k)}" r="${n1(10 * k)}" fill="${c1}"/><circle cx="${n1(cx + 14 * k)}" cy="${n1(cy + k)}" r="${n1(7 * k)}" fill="${c1}"/><rect x="${n1(cx - 22 * k)}" y="${n1(cy)}" width="${n1(44 * k)}" height="${n1(6 * k)}" rx="${n1(3 * k)}" fill="${c1}"/></g>`;
}

/** The sun's or the moon's disc. */
export function disc(sx: number, sy: number, sr: number, night: boolean, gradId?: string): string {
  if (night) return `<circle cx="${n1(sx)}" cy="${n1(sy)}" r="${n1(sr * 0.85)}" fill="#EEEDFB"/><circle cx="${n1(sx - sr * 0.3)}" cy="${n1(sy - sr * 0.15)}" r="${n1(sr * 0.22)}" fill="#D4D1EE"/><circle cx="${n1(sx + sr * 0.3)}" cy="${n1(sy + sr * 0.28)}" r="${n1(sr * 0.15)}" fill="#D4D1EE"/>`;
  return gradId
    ? `<circle cx="${n1(sx)}" cy="${n1(sy)}" r="${n1(sr)}" fill="url(#${gradId})"/>`
    : `<circle cx="${n1(sx)}" cy="${n1(sy)}" r="${n1(sr)}" fill="#FBD84E" stroke="#F4BE34" stroke-width="1"/>`;
}

// ---- Earth, glow and signs around the tree ----

export type SoilKind = 'dry' | 'wet' | null;

/** Earth at the roots (спец 2.0 "Лунка"): thirsty — a dry patch with cracks; watered — dark moist earth with a shine. */
export function soil(cx: number, feet: number, w: number, kind: SoilKind, night: boolean): string {
  if (!kind) return '';
  const rx = Math.max(12, w / 2), ry = Math.max(4, rx * 0.26);
  const at = (dx: number, dy: number) => `${n1(cx + dx)} ${n1(feet + dy)}`;
  if (kind === 'dry') {
    const base = night ? '#6E5038' : '#C99A60', top = night ? '#8A6848' : '#E8C48A', cr = night ? '#3E2E22' : '#8A5E33';
    return `<ellipse cx="${n1(cx)}" cy="${n1(feet + ry * 0.25)}" rx="${n1(rx)}" ry="${n1(ry)}" fill="${base}"/><ellipse cx="${n1(cx)}" cy="${n1(feet)}" rx="${n1(rx * 0.92)}" ry="${n1(ry * 0.8)}" fill="${top}"/>`
      + `<path d="M${at(-rx * 0.78, -ry * 0.05)} L${at(-rx * 0.52, ry * 0.35)} L${at(-rx * 0.34, -ry * 0.2)} L${at(-rx * 0.16, ry * 0.3)} M${at(rx * 0.12, ry * 0.4)} L${at(rx * 0.32, -ry * 0.25)} L${at(rx * 0.5, ry * 0.25)} L${at(rx * 0.74, -ry * 0.1)}" stroke="${cr}" stroke-width="${n1(Math.max(1, rx / 18))}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  const base = night ? '#3A281B' : '#6E4A28', top = night ? '#4A3424' : '#8A5E33';
  return `<ellipse cx="${n1(cx)}" cy="${n1(feet + ry * 0.25)}" rx="${n1(rx)}" ry="${n1(ry)}" fill="${base}"/><ellipse cx="${n1(cx)}" cy="${n1(feet)}" rx="${n1(rx * 0.92)}" ry="${n1(ry * 0.78)}" fill="${top}"/><ellipse cx="${n1(cx - rx * 0.38)}" cy="${n1(feet - ry * 0.22)}" rx="${n1(rx * 0.22)}" ry="${n1(ry * 0.22)}" fill="#FFFFFF" fill-opacity=".28"/>`;
}

/** Watered at night: a soft glow at the roots and three fireflies (no gold sparkles at night). */
export function rootGlow(cx: number, feet: number, w: number, id: string): string {
  const fly = (x: number, y: number, r: number) =>
    `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r * 3.2)}" fill="url(#${id}f)"/><circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="#F4FFB8"/>`;
  return `<defs><radialGradient id="${id}r"><stop offset="0" ${paint('stop-color', 'rgba(250,255,200,.9)')}/><stop offset=".35" ${paint('stop-color', 'rgba(244,255,170,.55)')}/><stop offset=".65" ${paint('stop-color', 'rgba(233,255,138,.22)')}/><stop offset="1" ${paint('stop-color', 'rgba(233,255,138,0)')}/></radialGradient>`
    + `<radialGradient id="${id}f"><stop offset="0" ${paint('stop-color', 'rgba(244,255,184,.75)')}/><stop offset="1" ${paint('stop-color', 'rgba(244,255,184,0)')}/></radialGradient></defs>`
    + `<ellipse cx="${n1(cx)}" cy="${n1(feet - w * 0.12)}" rx="${n1(w * 0.75)}" ry="${n1(w * 0.36)}" fill="url(#${id}r)" opacity=".55"/>`
    + fly(cx - w * 0.62 + 1.5, feet - w * 0.7 + 1.5, 1.5) + fly(cx - w * 0.42 + 1.75, feet - w * 0.3 + 1.75, 1.75) + fly(cx + w * 0.36 + 1.5, feet - w * 0.46 + 1.5, 1.5);
}

/** The four-point gold sparkle of a watered tree, day only; (x, y) — its middle. */
export const spark = (x: number, y: number, s: number) => glyph('spark', x - s / 2, y - s / 2, s);

/** The bubble with a drop over the crown (спец 2.0): white, at night lilac; warm — an orange ring. */
export function bubble(x: number, y: number, s: number, warm: boolean, night: boolean, faceColor?: string): string {
  const r = s / 2, cx = x + r, cy = y + r;
  const face = faceColor ?? (night ? '#E9E8FF' : '#FFFFFF');
  const shadow = night ? 'rgba(5,4,26,.45)' : 'rgba(42,128,188,.35)';
  const tail = `M${n1(x + 4)} ${n1(y + s - 9)} L${n1(x + 2)} ${n1(y + s + 2)} L${n1(x + 13)} ${n1(y + s - 3)}Z`;
  let out = '';
  if (warm) out += `<circle cx="${n1(cx)}" cy="${n1(cy + 2)}" r="${n1(r + 3)}" fill="#E5873A"/><circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r + 3)}" fill="#FFB46B"/>`;
  else out += `<circle cx="${n1(cx)}" cy="${n1(cy + 2)}" r="${n1(r)}" ${paint('fill', shadow)}/>`;
  out += `<path d="${tail}" fill="${face}"/><circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(r)}" fill="${face}"/>`;
  const d = Math.round(s * 0.62);
  return out + glyph('drop', cx - d / 2, cy - d / 2, d);
}

/** A rounded box (stadium when r = h/2), optionally with a lip under it. */
export function pill(x: number, y: number, w: number, h: number, color: string, lip?: string, r = h / 2): string {
  return (lip ? `<rect x="${n1(x)}" y="${n1(y + 2)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(r)}" ${paint('fill', lip)}/>` : '')
    + `<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" rx="${n1(r)}" ${paint('fill', color)}/>`;
}

/** Three hearts, `s` dp each, 1 dp apart, starting at x. */
export const hearts = (n: number, x: number, y: number, s: number) =>
  [0, 1, 2].map((i) => glyph(i < n ? 'heart' : 'heartEmpty', x + i * (s + 1), y, s)).join('');
