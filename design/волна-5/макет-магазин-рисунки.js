// Волна 5, макет магазина: рисунки.
// Этот файл — эскиз будущего кода Skia. Каждая функция здесь повторяет то, что разработчик
// пишет в app/src/ui/trees/*.tsx и app/src/ui/meadow/*: те же размеры (единицы холста 300×320,
// дерево стоит на (0, 0) и растёт вверх), те же цвета, то же случайное число rng(seed).
// Пути значков (G, AV) копируются в glyphs.tsx / avatars.tsx без изменений (viewBox 24 и 48).

/* ================= Общие кирпичики (повтор parts.tsx) ================= */

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}
const f1 = (n) => +n.toFixed(2);
const droop = (a, th = 0) => a + Math.sign(a) * 25 * th;
function hangDown(angle, th = 0) {
  const a = ((((angle + 180) % 360) + 360) % 360) - 180;
  const turn = Math.min(30 * th, 180 - Math.abs(a));
  return a + Math.sign(a || 1) * turn;
}

// Градиенты SVG живут в <defs>; одинаковые переиспользуются.
let DEFS = [], DEF_KEYS = new Map(), GID = 0;
function resetDefs() { DEFS = []; DEF_KEYS = new Map(); }
function linGrad(x1, y1, x2, y2, colors, positions) {
  const key = 'L' + [x1, y1, x2, y2].map(f1).join(',') + colors.join(',') + (positions || []).join(',');
  if (DEF_KEYS.has(key)) return DEF_KEYS.get(key);
  const id = 'g' + (++GID);
  const stops = colors.map((c, i) => `<stop offset="${positions ? positions[i] : i / (colors.length - 1)}" stop-color="${c}"/>`).join('');
  DEFS.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}">${stops}</linearGradient>`);
  DEF_KEYS.set(key, `url(#${id})`);
  return `url(#${id})`;
}
function radGrad(cx, cy, r, colors, positions) {
  const key = 'R' + [cx, cy, r].map(f1).join(',') + colors.join(',');
  if (DEF_KEYS.has(key)) return DEF_KEYS.get(key);
  const id = 'g' + (++GID);
  const stops = colors.map((c, i) => `<stop offset="${positions ? positions[i] : i / (colors.length - 1)}" stop-color="${c}"/>`).join('');
  DEFS.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}">${stops}</radialGradient>`);
  DEF_KEYS.set(key, `url(#${id})`);
  return `url(#${id})`;
}

const almond = (len, w) => `M0 0 C ${f1(w)} ${f1(-len * 0.22)}, ${f1(w)} ${f1(-len * 0.72)}, 0 ${f1(-len)} C ${f1(-w)} ${f1(-len * 0.72)}, ${f1(-w)} ${f1(-len * 0.22)}, 0 0 Z`;

/** Лист клёна: пять лопастей. Единичный рисунок (черешок в 0,0, кончик в 0,−1), масштаб len. */
const MAPLE = [[0, -0.16], [0.10, -0.22], [0.42, -0.20], [0.30, -0.30, 0.26, -0.38], [0.52, -0.60], [0.32, -0.58, 0.18, -0.62], [0, -1]];
// Правая половина листа; левая — её отражение (scale(-1, 1)).
function mapleHalf(len) {
  const s = (x) => f1(x * len);
  let d = `M0 ${s(-0.16)}`;
  for (const p of MAPLE.slice(1)) d += p.length === 4 ? ` Q ${s(p[0])} ${s(p[1])} ${s(p[2])} ${s(p[3])}` : ` L ${s(p[0])} ${s(p[1])}`;
  return d + ` L 0 ${s(-0.16)} Z`;
}

/** Лист: черешок в (x, y), направление angle (0 — вверх). shape: almond | maple. */
function Leaf({ x, y, angle, len, width, light, dark, vein, shape = 'almond' }) {
  const w = width / 2;
  const g = linGrad(-Math.max(w, len * 0.5), 0, Math.max(w, len * 0.5), 0, [dark, light]);
  let body;
  if (shape === 'maple') {
    const h = mapleHalf(len);
    body = `<path d="${h}" fill="${g}"/><path d="${h}" fill="${g}" transform="scale(-1 1)"/>` +
      `<path d="M0 0 L0 ${f1(-len * 0.16)}" stroke="${vein}" stroke-width="${f1(Math.max(0.8, len * 0.05))}" stroke-linecap="round"/>` +
      `<path d="M0 ${f1(-len * 0.18)} L0 ${f1(-len * 0.9)} M0 ${f1(-len * 0.2)} L${f1(len * 0.44)} ${f1(-len * 0.56)} M0 ${f1(-len * 0.2)} L${f1(-len * 0.44)} ${f1(-len * 0.56)}" stroke="${vein}" stroke-width="${f1(Math.max(0.6, len * 0.035))}" stroke-linecap="round" opacity="0.55" fill="none"/>`;
  } else {
    body = `<path d="${almond(len, w)}" fill="${g}"/><path d="M0 0 L0 ${f1(-len * 0.85)}" stroke="${vein}" stroke-width="${f1(Math.max(0.7, width * 0.05))}" stroke-linecap="round" opacity="0.6"/>`;
  }
  return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${f1(angle)})">${body}</g>`;
}

function Stem({ d, width, color, shadow }) {
  return `<path d="${d}" fill="none" stroke="${shadow}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="${f1(width * 0.55)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function Mound({ w, ground }) {
  const h = w * 0.13;
  return `<path d="M${-w / 2} 2 Q ${-w / 4} ${f1(-h)}, 0 ${f1(-h)} Q ${w / 4} ${f1(-h)}, ${w / 2} 2 Z" fill="${linGrad(0, -h, 0, 2, [mix(ground.shade, ground.trunkDark, 0.25), ground.shade])}"/>`;
}
function GroundShadow({ w, ground }) {
  return `<ellipse cx="0" cy="${f1(-w * 0.04 + w * 0.0325)}" rx="${f1(w / 2)}" ry="${f1(w * 0.0325)}" fill="${ground.shade}" opacity="0.75"/>`;
}
function Blob({ x, y, r, s }) {
  return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${radGrad(x - r * 0.35, y - r * 0.45, r * 1.4, [s.light, s.mid, s.dark], [0, 0.5, 1])}"/>`;
}
function crownBlobs(cx, cy, rx, ry, count, seed) {
  const rand = rng(seed);
  const r = Math.min(rx, ry) * 0.52;
  const blobs = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.3;
    const br = r * (0.72 + rand() * 0.34);
    blobs.push({ x: cx + Math.cos(a) * (rx - br * 1.2), y: cy + Math.sin(a) * (ry - br * 1.2), r: br });
  }
  const inner = Math.max(2, Math.round(count / 3));
  for (let i = 0; i < inner; i++) {
    const a = (i / inner) * Math.PI * 2 + 0.6;
    blobs.push({ x: cx + Math.cos(a) * rx * 0.3, y: cy + Math.sin(a) * ry * 0.25, r: r * 1.05 });
  }
  return blobs.sort((a, b) => a.y - b.y);
}
/** Крона. Новое по сравнению с parts.tsx: leafShape — форма листьев по краю и бликов (almond | maple). */
function Crown({ blobs, s, flecks, seed, fleckColor, thirst = 0, leafShape = 'almond', edgeScale = 1 }) {
  const rand = rng(seed + 7);
  const marks = Array.from({ length: flecks }, () => {
    const b = blobs[Math.floor(rand() * blobs.length)];
    const a = -Math.PI * (0.15 + rand() * 0.7);
    const d = b.r * (0.35 + rand() * 0.55);
    return { x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d, angle: -60 + rand() * 120, len: b.r * (0.22 + rand() * 0.12) };
  });
  const cx = blobs.reduce((t, b) => t + b.x, 0) / blobs.length;
  const cy = blobs.reduce((t, b) => t + b.y, 0) / blobs.length;
  const edge = blobs.flatMap((b) => {
    const out = Math.atan2(b.y - cy, b.x - cx);
    return [-0.7, -0.25, 0.2, 0.65].map((o) => {
      const a = out + o + (rand() - 0.5) * 0.3;
      return { x: b.x + Math.cos(a) * b.r * 0.86, y: b.y + Math.sin(a) * b.r * 0.86, angle: hangDown((a * 180) / Math.PI + 90, thirst), len: b.r * (0.3 + rand() * 0.1) * edgeScale };
    });
  });
  const wide = leafShape === 'maple' ? 1 : 0.7;
  return blobs.map((b) => `<circle cx="${f1(b.x + b.r * 0.05)}" cy="${f1(b.y + b.r * 0.14)}" r="${f1(b.r * 1.02)}" fill="${s.deep}"/>`).join('') +
    edge.map((m) => Leaf({ x: m.x, y: m.y, angle: m.angle, len: m.len, width: m.len * wide, light: s.mid, dark: s.dark, vein: s.dark, shape: leafShape })).join('') +
    blobs.map((b) => Blob({ x: b.x, y: b.y, r: b.r, s })).join('') +
    marks.map((m) => Leaf({ x: m.x, y: m.y, angle: m.angle, len: m.len * (leafShape === 'maple' ? 1.1 : 1), width: m.len * (leafShape === 'maple' ? 1 : 0.6), light: fleckColor || s.light, dark: s.mid, vein: s.mid, shape: leafShape })).join('');
}
function Trunk({ h, w, s, roots = false, lean = 0 }) {
  const top = w * 0.42;
  const flare = roots ? w * 0.45 : w * 0.1;
  const d = `M${f1(-w / 2 - flare)} 0 C ${f1(-w / 2)} ${f1(-h * 0.08)}, ${f1(-w / 2)} ${f1(-h * 0.25)}, ${f1(-w * 0.42 + lean * 0.4)} ${f1(-h * 0.5)} C ${f1(-w * 0.35 + lean * 0.7)} ${f1(-h * 0.75)}, ${f1(-top / 2 + lean)} ${f1(-h * 0.9)}, ${f1(-top / 2 + lean)} ${-h} L ${f1(top / 2 + lean)} ${-h} C ${f1(top / 2 + lean)} ${f1(-h * 0.9)}, ${f1(w * 0.35 + lean * 0.7)} ${f1(-h * 0.75)}, ${f1(w * 0.42 + lean * 0.4)} ${f1(-h * 0.5)} C ${f1(w / 2)} ${f1(-h * 0.25)}, ${f1(w / 2)} ${f1(-h * 0.08)}, ${f1(w / 2 + flare)} 0 Z`;
  return `<path d="${d}" fill="${linGrad(-w / 2, 0, w / 2, 0, [s.dark, s.light, s.mid, s.deep], [0, 0.3, 0.65, 1])}"/>` +
    `<path d="M${f1(-w * 0.15)} ${f1(-h * 0.08)} C ${f1(-w * 0.2)} ${f1(-h * 0.3)}, ${f1(-w * 0.08)} ${f1(-h * 0.45)}, ${f1(-w * 0.12)} ${f1(-h * 0.62)}" fill="none" stroke="${s.deep}" stroke-width="${f1(Math.max(1, w * 0.06))}" stroke-linecap="round" opacity="0.45"/>`;
}
function MeadowTufts({ w, ground, seed, flowers }) {
  const rand = rng(seed + 3);
  const tufts = Array.from({ length: 9 }, (_, i) => ({ x: -w / 2 + (w * (i + 0.5)) / 9 + (rand() - 0.5) * 10, h: 8 + rand() * 8 }));
  const dots = Array.from({ length: 10 }, () => ({ x: (rand() - 0.5) * w * 0.95, y: -3 - rand() * 10, c: flowers[Math.floor(rand() * flowers.length)] }));
  return tufts.map((t, i) => `<path d="M${f1(t.x - 5)} 0 Q ${f1(t.x - 4)} ${f1(-t.h * 0.6)}, ${f1(t.x - 7)} ${f1(-t.h)} Q ${f1(t.x - 1)} ${f1(-t.h * 0.5)}, ${f1(t.x)} ${f1(-t.h * 1.1)} Q ${f1(t.x + 1)} ${f1(-t.h * 0.5)}, ${f1(t.x + 7)} ${f1(-t.h * 0.9)} Q ${f1(t.x + 4)} ${f1(-t.h * 0.5)}, ${f1(t.x + 5)} 0 Z" fill="${i % 2 ? ground.leaf : ground.leafDark}"/>`).join('') +
    dots.map((d) => `<circle cx="${f1(d.x)}" cy="${f1(d.y)}" r="3.4" fill="${d.c}"/><circle cx="${f1(d.x)}" cy="${f1(d.y)}" r="1.3" fill="#FFF3B0"/>`).join('');
}

/* Краски земли под деревом (trees/colors.ts) + переопределения лугов. */
const GROUND = {
  day: { ground: '#F2C98F', shade: '#E3B274', trunkDark: '#6B5030', leaf: '#8BC34A', leafDark: '#5E9A2C' },
  night: { ground: '#6B4A33', shade: '#553925', trunkDark: '#523B22', leaf: '#5E8F25', leafDark: '#3F6A17' },
};

/* ================= Берёза ================= */
const birchLeaf = (n) => n ? { light: '#93B84C', mid: '#6E9A35', dark: '#4C7426', deep: '#31511A' } : { light: '#D6EC7A', mid: '#A8D45A', dark: '#74AA3A', deep: '#4E7F25' };
const birchBark = (n) => n ? { light: '#D9D8E8', mid: '#C8C6D6', dark: '#A19DB5', deep: '#6B6789', mark: '#1A1830' } : { light: '#FFFFFF', mid: '#F1EEE6', dark: '#CFC8BA', deep: '#8E8676', mark: '#2B2620' };
const CATKIN = { day: '#B58A4E', night: '#7E6450' };

/** Чёрточки на белой коре и тёмный низ ствола. Повторяет форму Trunk (сужение к 0.42w, наклон lean). */
function BirchMarks({ h, w, lean = 0, seed, s, roots = false }) {
  const rand = rng(seed + 21);
  const n = Math.max(3, Math.round(h / 12));
  let out = '';
  const hw0 = w / 2 + (roots ? w * 0.45 : w * 0.1) * 0.6;
  out += `<path d="M${f1(-hw0)} 0 L${f1(-w * 0.47)} ${f1(-h * 0.13)} Q 0 ${f1(-h * 0.17)} ${f1(w * 0.47)} ${f1(-h * 0.13)} L${f1(hw0)} 0 Z" fill="${s.mark}" opacity="0.32"/>`;
  for (let i = 0; i < n; i++) {
    const t = 0.1 + (0.84 * (i + rand() * 0.6)) / n;
    const cx = lean * Math.min(1, t * 1.1);
    const hw = (w / 2) * (1 - 0.58 * t);
    const len = hw * (0.55 + rand() * 0.7);
    const side = rand() < 0.5 ? -1 : 1;
    const x0 = Math.max(cx - hw, Math.min(cx + hw - len, cx + side * hw * 0.25 - len / 2));
    const y = -h * t;
    out += `<path d="M${f1(x0)} ${f1(y)} L${f1(x0 + len)} ${f1(y + (rand() - 0.5) * 1.4)}" stroke="${s.mark}" stroke-width="${f1(Math.max(1.1, w * 0.075))}" stroke-linecap="round" opacity="0.85"/>`;
  }
  return out;
}
/** Свисающая веточка с листиками (плакучая берёза). */
function Strand({ x, y, len, dx, s, seed, catkin }) {
  const rand = rng(seed);
  const cx = x + dx * 0.5, cy = y + len * 0.3, ex = x + dx, ey = y + len;
  let out = `<path d="M${f1(x)} ${f1(y)} Q ${f1(cx)} ${f1(cy)} ${f1(ex)} ${f1(ey)}" fill="none" stroke="${s.deep}" stroke-width="1.3" opacity="0.55" stroke-linecap="round"/>`;
  const k = Math.max(2, Math.floor(len / 8));
  for (let j = 1; j <= k; j++) {
    const t = j / k, u = 1 - t;
    const px = u * u * x + 2 * u * t * cx + t * t * ex;
    const py = u * u * y + 2 * u * t * cy + t * t * ey;
    const side = j % 2 ? 1 : -1;
    const l = 7 + rand() * 3;
    out += Leaf({ x: px, y: py, angle: 180 + side * (25 + rand() * 20), len: l, width: l * 0.75, light: j % 2 ? s.light : s.mid, dark: s.dark, vein: s.dark });
  }
  if (catkin) out += `<ellipse cx="${f1(ex)}" cy="${f1(ey + 5)}" rx="1.4" ry="4.2" fill="${catkin}"/>`;
  return out;
}
function strands(cx, cy, rx, ry, count, s, seed, catkins, night) {
  const rand = rng(seed + 33);
  let out = '';
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    const a = 0.25 + (i / count) * 0.5 + rand() * 0.1;
    const x = cx + side * rx * (0.35 + 0.5 * a);
    const y = cy + ry * (0.25 + 0.45 * (1 - a));
    out += Strand({ x, y, len: 22 + rand() * 18, dx: side * (3 + rand() * 6), s, seed: seed + i, catkin: i < catkins ? (night ? CATKIN.night : CATKIN.day) : null });
  }
  return out;
}

function Birch({ look, progress = 0.5, night, seed, thirst = 0, ground = true }) {
  const G = night ? GROUND.night : GROUND.day;
  const s = birchLeaf(night), b = birchBark(night);
  const low = 6 * thirst;
  const L = (x, y, a, len, light = true) => Leaf({ x, y, angle: droop(a, thirst), len, width: len * 0.72, light: light ? s.light : s.mid, dark: s.dark, vein: s.deep });
  switch (look) {
    case 'sprout':
      return Mound({ w: 40, ground: G }) + Stem({ d: 'M0 0 Q 2 -14, 0 -28', width: 3.5, color: mix(s.mid, b.dark, 0.3), shadow: s.dark }) +
        Leaf({ x: 0, y: -28, angle: droop(-58, thirst), len: 13, width: 10, light: s.light, dark: s.mid, vein: s.dark }) +
        Leaf({ x: 0, y: -28, angle: droop(58, thirst), len: 13, width: 10, light: s.light, dark: s.mid, vein: s.dark }) +
        (progress > 0.3 ? L(0, -28, 0, 10) : '');
    case 'seedling':
      return Mound({ w: 46, ground: G }) + Stem({ d: 'M0 0 C 4 -28, -4 -50, 0 -72', width: 4.5, color: b.mid, shadow: b.dark }) +
        [-16, -34, -52].map((y) => `<path d="M-1.4 ${y} L1.4 ${y + 0.4}" stroke="${b.mark}" stroke-width="1.1" stroke-linecap="round"/>`).join('') +
        [[-1, -24, -70, 20, false], [1, -36, 64, 20, true], [0, -50, -48, 18, true], [0, -60, 40, 17, false], [0, -72, -14, 15, true], [0, -72, 24, 14, false]].map(([x, y, a, l, li]) => L(x, y, a, l, li)).join('');
    case 'bush': {
      const st = [['M0 0 C -3 -40, -14 -64, -22 -92', 4.5], ['M0 0 C 3 -40, 14 -66, 22 -96', 4.5], ['M0 0 C -1 -44, 2 -80, 0 -112', 5]];
      const lv = [[-6, -34, -80, 20, 0], [6, -38, 82, 20, 1], [-12, -56, -64, 22, 1], [12, -58, 66, 22, 0], [-22, -92, -30, 20, 1], [-22, -92, -110, 18, 0], [-18, -78, -130, 18, 1],
        [22, -96, 32, 20, 1], [22, -96, 112, 18, 0], [18, -82, 132, 18, 1], [-1, -74, -36, 18, 0], [1, -86, 38, 18, 1], [0, -112, -20, 17, 1], [0, -112, 22, 16, 0],
        [-1, -100, -120, 16, 1], [1, -100, 124, 16, 0], [-26, -70, -150, 16, 0], [26, -74, 150, 16, 1]];
      return (ground ? GroundShadow({ w: 84, ground: G }) : '') + st.map(([d, w]) => Stem({ d, width: w, color: b.mid, shadow: b.dark })).join('') +
        [[-3, -30], [4, -46], [-1, -60]].map(([x, y]) => `<path d="M${x - 1.5} ${y} L${x + 1.5} ${y}" stroke="${b.mark}" stroke-width="1.1" stroke-linecap="round"/>`).join('') +
        lv.map(([x, y, a, l, li]) => L(x, y, a, l * (0.9 + 0.1 * progress), !!li)).join('');
    }
    case 'young':
      return (ground ? GroundShadow({ w: 76, ground: G }) : '') + Trunk({ h: 140, w: 10, s: b, lean: 2 }) + BirchMarks({ h: 140, w: 10, lean: 2, seed, s: b }) +
        Stem({ d: 'M1 -100 Q -14 -116, -28 -136', width: 3.5, color: b.mid, shadow: b.dark }) + Stem({ d: 'M1 -108 Q 16 -122, 30 -142', width: 3, color: b.mid, shadow: b.dark }) +
        Crown({ blobs: crownBlobs(2, low - 164, 46, 66, 8, seed), s, flecks: 16, seed, thirst, edgeScale: 0.8 }) + strands(2, low - 164, 46, 66, 5, s, seed, 0, night);
    case 'tree':
      return (ground ? GroundShadow({ w: 150, ground: G }) : '') +
        `<g transform="translate(12 0)">${Trunk({ h: 124, w: 11, s: b, lean: 12 })}${BirchMarks({ h: 124, w: 11, lean: 12, seed: seed + 1, s: b })}</g>` +
        Trunk({ h: 176, w: 18, s: b, roots: true, lean: -2 }) + BirchMarks({ h: 176, w: 18, lean: -2, seed, s: b, roots: true }) +
        Stem({ d: 'M-2 -120 Q -30 -146, -58 -180', width: 6, color: b.mid, shadow: b.dark }) + Stem({ d: 'M0 -134 Q 28 -156, 54 -192', width: 5, color: b.mid, shadow: b.dark }) +
        Crown({ blobs: crownBlobs(2, low - 200, 70, 98, 12, seed), s, flecks: 30, seed, thirst, edgeScale: 0.8 }) + strands(2, low - 200, 70, 98, 10, s, seed, 6, night);
    case 'grand':
      return (ground ? GroundShadow({ w: 210, ground: G }) : '') +
        `<g transform="translate(16 0)">${Trunk({ h: 160, w: 17, s: b, lean: 18 })}${BirchMarks({ h: 160, w: 17, lean: 18, seed: seed + 1, s: b })}</g>` +
        Trunk({ h: 190, w: 26, s: b, roots: true, lean: -4 }) + BirchMarks({ h: 190, w: 26, lean: -4, seed, s: b, roots: true }) +
        Stem({ d: 'M-4 -128 Q -44 -152, -86 -190', width: 9, color: b.mid, shadow: b.dark }) + Stem({ d: 'M2 -142 Q 44 -162, 88 -200', width: 8, color: b.mid, shadow: b.dark }) +
        Crown({ blobs: crownBlobs(6, low - 206, 100, 98, 15, seed), s, flecks: 44, seed, thirst, edgeScale: 0.8 }) + strands(6, low - 206, 100, 98, 14, s, seed, 10, night) +
        MeadowTufts({ w: 230, ground: G, seed, flowers: ['#FFFFFF', '#F7E36B', '#C9E8FF'] });
  }
  return '';
}

/* ================= Клён ================= */
const mapleLeaf = (n) => n ? { light: '#C98A46', mid: '#B45A2E', dark: '#8E3528', deep: '#5A1E1A' } : { light: '#FFB54D', mid: '#F07A2E', dark: '#D2452B', deep: '#8E2A1E' };
const mapleBark = (n) => n ? { light: '#7E6E80', mid: '#625266', dark: '#4A3C50', deep: '#2E2436' } : { light: '#9C8070', mid: '#7A5F50', dark: '#5E463A', deep: '#3E2C24' };
const MAPLE_FLECK = { day: '#FFD36B', night: '#D9A85A' };
const SAMARA = { day: ['#E9B65A', '#B5762E'], night: ['#A88A5A', '#7A5A3A'] };
const COTYLEDON = { day: { light: '#B9DE6C', mid: '#8BC34A', dark: '#5E9A2C' }, night: { light: '#7FAF3A', mid: '#5E8F25', dark: '#3F6A17' } };

function Samaras({ seed, count, cx, cy, rx, ry, night }) {
  const rand = rng(seed + 13);
  const [wing, nut] = night ? SAMARA.night : SAMARA.day;
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = Math.PI * (0.2 + (0.6 * (i + rand() * 0.6)) / count);
    const x = cx + Math.cos(a) * rx * 0.74, y = cy + Math.sin(a) * ry * 0.72;
    out += `<path d="M${f1(x)} ${f1(y - 3)} L${f1(x)} ${f1(y + 2)}" stroke="${nut}" stroke-width="1"/>` +
      `<g transform="translate(${f1(x)} ${f1(y + 2)})"><ellipse cx="-3.2" cy="5" rx="2.3" ry="6" transform="rotate(28 -3.2 5)" fill="${wing}"/><ellipse cx="3.2" cy="5" rx="2.3" ry="6" transform="rotate(-28 3.2 5)" fill="${wing}"/><circle cx="-1.3" cy="1.2" r="1.8" fill="${nut}"/><circle cx="1.3" cy="1.2" r="1.8" fill="${nut}"/></g>`;
  }
  return out;
}
function FallingLeaves({ seed, count, cx, cy, rx, ry, s, shape = 'maple' }) {
  const rand = rng(seed + 5);
  let out = '';
  for (let i = 0; i < count; i++) {
    const side = i % 2 ? 1 : -1;
    const x = cx + side * rx * (0.55 + rand() * 0.45), y = cy + ry * (0.6 + rand() * 1.3);
    const l = 7 + rand() * 3;
    out += Leaf({ x, y, angle: rand() * 360, len: l, width: l, light: s.light, dark: s.mid, vein: s.dark, shape });
  }
  return out;
}

function Maple({ look, progress = 0.5, night, seed, thirst = 0, ground = true }) {
  const G = night ? GROUND.night : GROUND.day;
  const s = mapleLeaf(night), b = mapleBark(night);
  const low = 6 * thirst;
  const ML = (x, y, a, len, light = true) => Leaf({ x, y, angle: droop(a, thirst), len, width: len, light: light ? s.light : s.mid, dark: s.dark, vein: s.deep, shape: 'maple' });
  const fleck = night ? MAPLE_FLECK.night : MAPLE_FLECK.day;
  switch (look) {
    case 'sprout': {
      const c = night ? COTYLEDON.night : COTYLEDON.day;
      return Mound({ w: 40, ground: G }) + Stem({ d: 'M0 0 Q -2 -14, 0 -26', width: 4, color: night ? '#7A4A36' : '#A0522D', shadow: night ? '#4E2E22' : '#6E3520' }) +
        Leaf({ x: 0, y: -24, angle: droop(-72, thirst), len: 15, width: 7, light: c.light, dark: c.mid, vein: c.dark }) +
        Leaf({ x: 0, y: -24, angle: droop(72, thirst), len: 15, width: 7, light: c.light, dark: c.mid, vein: c.dark }) +
        (progress > 0.3 ? ML(0, -26, 0, 13) : '');
    }
    case 'seedling':
      return Mound({ w: 48, ground: G }) + Stem({ d: 'M0 0 C -4 -30, 4 -52, 0 -70', width: 4.5, color: b.mid, shadow: b.dark }) +
        ML(0, -30, -62, 22, false) + ML(0, -30, 62, 22) + ML(0, -52, -46, 20) + ML(0, -52, 46, 20, false) + ML(0, -70, 0, 18);
    case 'bush': {
      const st = [['M0 0 C -4 -40, -18 -62, -28 -82', 5], ['M0 0 C 4 -40, 18 -66, 26 -86', 5], ['M0 0 C -2 -40, 3 -70, 0 -100', 6]];
      const lv = [[-8, -34, -88, 26, 0], [8, -38, 86, 26, 1], [-16, -58, -70, 28, 1], [16, -60, 70, 28, 0], [-28, -82, -44, 26, 1], [-28, -82, -84, 22, 0], [26, -86, 46, 26, 1], [26, -86, 84, 22, 0],
        [-1, -70, -30, 22, 0], [1, -78, 32, 22, 1], [0, -100, -26, 20, 1], [0, -100, 24, 20, 0], [0, -100, 0, 22, 1]];
      return (ground ? GroundShadow({ w: 92, ground: G }) : '') + st.map(([d, w]) => Stem({ d, width: w, color: b.mid, shadow: b.dark })).join('') +
        lv.map(([x, y, a, l, li]) => ML(x, y, a, l * (0.9 + 0.1 * progress), !!li)).join('');
    }
    case 'young':
      return (ground ? GroundShadow({ w: 84, ground: G }) : '') + Trunk({ h: 124, w: 11, s: b }) +
        Stem({ d: 'M0 -92 Q -18 -108, -34 -126', width: 5, color: b.mid, shadow: b.dark }) + Stem({ d: 'M0 -100 Q 16 -116, 32 -134', width: 4, color: b.mid, shadow: b.dark }) +
        Crown({ blobs: crownBlobs(0, low - 150, 72, 54, 7, seed), s, flecks: 14, seed, fleckColor: fleck, thirst, leafShape: 'maple', edgeScale: 1.25 }) +
        FallingLeaves({ seed, count: 3, cx: 0, cy: low - 150, rx: 72, ry: 54, s });
    case 'tree':
      return (ground ? GroundShadow({ w: 170, ground: G }) : '') + Trunk({ h: 150, w: 20, s: b, roots: true }) +
        Stem({ d: 'M-2 -96 Q -32 -126, -64 -160', width: 10, color: b.mid, shadow: b.dark }) + Stem({ d: 'M2 -110 Q 32 -134, 60 -172', width: 9, color: b.mid, shadow: b.dark }) +
        Crown({ blobs: crownBlobs(0, low - 186, 120, 80, 11, seed), s, flecks: 26, seed, fleckColor: fleck, thirst, leafShape: 'maple', edgeScale: 1.25 }) +
        Samaras({ seed, count: 4, cx: 0, cy: low - 186, rx: 120, ry: 80, night }) + FallingLeaves({ seed, count: 5, cx: 0, cy: low - 186, rx: 120, ry: 80, s });
    case 'grand':
      return (ground ? GroundShadow({ w: 240, ground: G }) : '') + Trunk({ h: 162, w: 32, s: b, roots: true }) +
        Stem({ d: 'M-4 -104 Q -44 -128, -92 -180', width: 15, color: b.mid, shadow: b.dark }) + Stem({ d: 'M4 -118 Q 48 -140, 96 -194', width: 13, color: b.mid, shadow: b.dark }) +
        Crown({ blobs: crownBlobs(0, low - 202, 146, 98, 14, seed), s, flecks: 40, seed, fleckColor: fleck, thirst, leafShape: 'maple', edgeScale: 1.25 }) +
        Samaras({ seed, count: 7, cx: 0, cy: low - 202, rx: 146, ry: 98, night }) + FallingLeaves({ seed, count: 8, cx: 0, cy: low - 202, rx: 146, ry: 98, s }) +
        MeadowTufts({ w: 270, ground: G, seed, flowers: [s.mid, s.light, s.dark] });
  }
  return '';
}

/* ================= Яблоня ================= */
const appleLeaf = (n) => n ? { light: '#6F9A44', mid: '#4C7F33', dark: '#2F5F2A', deep: '#1D3E1B' } : { light: '#A9D86A', mid: '#6FB24A', dark: '#3F8A35', deep: '#2A5E25' };
const appleBark = (n) => n ? { light: '#86708A', mid: '#6A5668', dark: '#4E3E4E', deep: '#30263A' } : { light: '#A88466', mid: '#876449', dark: '#684A34', deep: '#463020' };
const APPLE_BLOSSOM = { day: { light: '#FFFFFF', mid: '#FFD6E2' }, night: { light: '#D9D6EE', mid: '#C9AFC8' }, heart: '#F7D774' };
const APPLE = { day: ['#FF7A66', '#E0453A', '#B8302A'], night: ['#C65A5A', '#A23A3E', '#7A2832'], stem: '#6B4A2E', leaf: '#6FB24A' };

function AppleBlossom(x, y, r, night) {
  const s = night ? APPLE_BLOSSOM.night : APPLE_BLOSSOM.day;
  let out = '';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    out += `<circle cx="${f1(x + Math.cos(a) * r * 0.55)}" cy="${f1(y + Math.sin(a) * r * 0.55)}" r="${f1(r * 0.5)}" fill="${i % 2 ? s.light : s.mid}"/>`;
  }
  return out + `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.26)}" fill="${APPLE_BLOSSOM.heart}"/>`;
}
function Fruit(x, y, r, night) {
  const c = night ? APPLE.night : APPLE.day;
  return `<path d="M${f1(x)} ${f1(y - r + 1)} L${f1(x + 1.2)} ${f1(y - r - 3)}" stroke="${APPLE.stem}" stroke-width="1.3" stroke-linecap="round"/>` +
    `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${radGrad(x - r * 0.35, y - r * 0.4, r * 1.5, c, [0, 0.55, 1])}"/>` +
    `<circle cx="${f1(x - r * 0.35)}" cy="${f1(y - r * 0.35)}" r="${f1(r * 0.26)}" fill="#FFFFFF" opacity="${night ? 0.35 : 0.7}"/>` +
    Leaf({ x: x + 1, y: y - r - 2, angle: 55, len: 5.5, width: 3.4, light: night ? '#4C7F33' : APPLE.leaf, dark: night ? '#2F5F2A' : '#3F8A35', vein: '#2A5E25' });
}
function Fruits({ seed, count, cx, cy, rx, ry, night }) {
  const rand = rng(seed + 17);
  let out = '';
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, d = 0.35 + Math.sqrt(rand()) * 0.5;
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d * 0.9 + ry * 0.15;
    out += Fruit(x, y, 7 + rand() * 2, night);
  }
  return out;
}

function Apple({ look, progress = 0.5, night, seed, thirst = 0, ground = true }) {
  const G = night ? GROUND.night : GROUND.day;
  const s = appleLeaf(night), b = appleBark(night);
  const low = 6 * thirst;
  const L = (x, y, a, len, light = true) => Leaf({ x, y, angle: droop(a, thirst), len, width: len * 0.62, light: light ? s.light : s.mid, dark: s.dark, vein: s.deep });
  switch (look) {
    case 'sprout':
      return Mound({ w: 40, ground: G }) + Stem({ d: 'M0 0 Q 3 -14, 0 -26', width: 4, color: mix(s.mid, b.mid, 0.4), shadow: s.dark }) +
        L(0, -26, -60, 15) + L(0, -26, 60, 15, false) + (progress > 0.3 ? L(0, -26, 0, 11) : '');
    case 'seedling':
      return Mound({ w: 46, ground: G }) + Stem({ d: 'M0 0 C 5 -28, -4 -50, 0 -68', width: 4.5, color: b.mid, shadow: b.dark }) +
        [[1, -24, 72, 22, false], [-1, -34, -66, 22, true], [1, -46, 54, 20, true], [-1, -56, -44, 19, false], [0, -66, 20, 17, true], [0, -66, -18, 16, false]].map(([x, y, a, l, li]) => L(x, y, a, l, li)).join('') +
        AppleBlossom(0, -71, 6, night);
    case 'bush': {
      const st = [['M0 0 C -4 -40, -18 -60, -30 -80', 5], ['M0 0 C 4 -38, 18 -62, 28 -84', 5], ['M0 0 C -2 -40, 3 -68, 0 -96', 6]];
      const lv = [[-8, -34, -88, 26, 0], [8, -36, 86, 26, 1], [-16, -56, -70, 26, 1], [16, -58, 70, 26, 0], [-30, -80, -44, 24, 1], [-30, -80, -84, 22, 0], [28, -84, 46, 24, 1], [28, -84, 84, 22, 0],
        [-1, -68, -30, 22, 0], [1, -76, 32, 22, 1], [0, -96, -26, 20, 1], [0, -96, 24, 20, 0], [0, -96, 0, 22, 1]];
      return (ground ? GroundShadow({ w: 92, ground: G }) : '') + st.map(([d, w]) => Stem({ d, width: w, color: b.mid, shadow: b.dark })).join('') +
        lv.map(([x, y, a, l, li]) => L(x, y, a, l * (0.9 + 0.1 * progress), !!li)).join('') +
        [[-30, -86, 7], [28, -90, 7], [0, -102, 8], [-14, -68, 6], [16, -72, 6]].map(([x, y, r]) => AppleBlossom(x, y, r, night)).join('');
    }
    case 'young':
      return (ground ? GroundShadow({ w: 110, ground: G }) : '') + Trunk({ h: 96, w: 12, s: b, lean: -3 }) +
        Stem({ d: 'M-2 -70 Q -22 -90, -42 -112', width: 6, color: b.mid, shadow: b.dark }) + Stem({ d: 'M-1 -76 Q 22 -96, 42 -116', width: 5, color: b.mid, shadow: b.dark }) +
        Crown({ blobs: crownBlobs(0, low - 130, 86, 52, 8, seed), s, flecks: 12, seed, thirst }) +
        (() => { const r = rng(seed + 9); let o = ''; for (let i = 0; i < 10; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.82; o += AppleBlossom(Math.cos(a) * 86 * d, low - 130 + Math.sin(a) * 52 * d, 5 + r() * 2, night); } return o; })();
    case 'tree':
      return (ground ? GroundShadow({ w: 190, ground: G }) : '') + Trunk({ h: 110, w: 22, s: b, roots: true, lean: -5 }) +
        Stem({ d: 'M-3 -78 Q -40 -104, -78 -140', width: 11, color: b.mid, shadow: b.dark }) + Stem({ d: 'M2 -86 Q 40 -110, 80 -146', width: 10, color: b.mid, shadow: b.dark }) +
        Crown({ blobs: crownBlobs(0, low - 162, 128, 72, 12, seed), s, flecks: 24, seed, thirst }) + Fruits({ seed, count: 8, cx: 0, cy: low - 162, rx: 128, ry: 72, night });
    case 'grand':
      return (ground ? GroundShadow({ w: 250, ground: G }) : '') + Trunk({ h: 120, w: 32, s: b, roots: true, lean: -6 }) +
        Stem({ d: 'M-4 -84 Q -50 -112, -98 -156', width: 16, color: b.mid, shadow: b.dark }) + Stem({ d: 'M3 -92 Q 50 -118, 100 -162', width: 14, color: b.mid, shadow: b.dark }) +
        Crown({ blobs: crownBlobs(0, low - 180, 146, 90, 15, seed), s, flecks: 36, seed, thirst }) + Fruits({ seed, count: 11, cx: 0, cy: low - 180, rx: 146, ry: 90, night }) +
        Fruit(-62, -6, 7, night) + Fruit(50, -5, 6.5, night) + MeadowTufts({ w: 260, ground: G, seed, flowers: ['#FFFFFF', '#FFD6E2', '#F7E36B'] });
  }
  return '';
}

/* ================= Пальма ================= */
const palmLeaf = (n) => n ? { light: '#5E8F3C', mid: '#3E7432', dark: '#255A2C', deep: '#173D1E' } : { light: '#9FD45A', mid: '#5DAE3E', dark: '#2F7F34', deep: '#1E5A26' };
const palmBark = (n) => n ? { light: '#A08A86', mid: '#82685E', dark: '#5E4A48', deep: '#3E3036' } : { light: '#E2BC84', mid: '#C4975E', dark: '#9C7040', deep: '#6E4C28' };
const COCONUT = { day: ['#A87A4E', '#7A5230', '#5E3C1E'], night: ['#7A6050', '#5A4234', '#3E2C22'] };
const SAND = { day: ['#F2D9A4', '#E3C186'], night: ['#7A6A5A', '#655648'] };

/** Перо пальмы: изогнутая жилка + листочки по обе стороны. angle 0 — вверх, по часовой. */
function Frond({ x, y, angle, len, bend, s, seed, thirst = 0, leaflets = true }) {
  const rand = rng(seed);
  const n = 16;
  const sign = angle === 0 ? (rand() < 0.5 ? -1 : 1) : Math.sign(angle);
  const pts = [[x, y]];
  let px = x, py = y;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const a = ((angle + sign * (bend + 12 * thirst) * Math.pow(t, 1.5)) * Math.PI) / 180;
    px += Math.sin(a) * (len / n); py -= Math.cos(a) * (len / n);
    pts.push([px, py, (a * 180) / Math.PI]);
  }
  let out = '';
  if (leaflets) {
    for (let i = 2; i <= n; i++) {
      const t = i / n;
      const [lx, ly, la] = pts[i];
      const ll = len * 0.3 * (1 - 0.55 * t) + 3;
      for (const side of [-1, 1]) {
        const ang = la + side * (58 - 22 * t) + 18 * sign * side * 0 + 16 * thirst * side;
        out += Leaf({ x: lx, y: ly, angle: hangDown(ang, 0.35 + 0.4 * thirst), len: ll, width: ll * 0.24, light: (i + (side > 0 ? 1 : 0)) % 2 ? s.light : s.mid, dark: s.dark, vein: s.dark });
      }
    }
  }
  const d = 'M' + pts.map((p) => `${f1(p[0])} ${f1(p[1])}`).join(' L');
  out += `<path d="${d}" fill="none" stroke="${s.dark}" stroke-width="${f1(Math.max(1.2, len * 0.03))}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return out;
}
/** Изогнутый ствол с кольцами. Ось — квадратичная кривая (0,0) → (lean·0.05, −0.55h) → (lean, −h). */
function PalmTrunk({ h, w, lean, s }) {
  const P = (t) => {
    const u = 1 - t;
    return [2 * u * t * lean * 0.05 + t * t * lean, 2 * u * t * (-h * 0.55) + t * t * -h];
  };
  const T = (t) => { const dx = 2 * (1 - t) * lean * 0.05 + 2 * t * (lean - lean * 0.05); const dy = 2 * (1 - t) * (-h * 0.55) + 2 * t * (-h + h * 0.55); const l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
  const left = [], right = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n, [cx, cy] = P(t), [tx, ty] = T(t), hw = (w / 2) * (1 - 0.32 * t) * (i === 0 ? 1.25 : 1);
    left.push([cx + ty * hw, cy - tx * hw]); right.push([cx - ty * hw, cy + tx * hw]);
  }
  const body = 'M' + left.map((p) => `${f1(p[0])} ${f1(p[1])}`).join(' L') + ' L' + right.reverse().map((p) => `${f1(p[0])} ${f1(p[1])}`).join(' L') + ' Z';
  let out = `<path d="${body}" fill="${linGrad(-w / 2, 0, w / 2 + lean * 0.6, 0, [s.dark, s.light, s.mid, s.deep], [0, 0.3, 0.65, 1])}"/>`;
  const rings = Math.floor(h / 9);
  for (let i = 1; i < rings; i++) {
    const t = i / rings, [cx, cy] = P(t), [tx, ty] = T(t), hw = (w / 2) * (1 - 0.32 * t);
    const ax = cx + ty * hw, ay = cy - tx * hw, bx = cx - ty * hw, by = cy + tx * hw;
    out += `<path d="M${f1(ax)} ${f1(ay)} Q ${f1(cx + tx * -3)} ${f1(cy - ty * -3)} ${f1(bx)} ${f1(by)}" fill="none" stroke="${s.deep}" stroke-width="1.3" opacity="0.5"/>`;
    out += `<path d="M${f1(ax + tx * -2.4)} ${f1(ay + ty * -2.4)} Q ${f1(cx - ty * hw * 0.4)} ${f1(cy + tx * hw * 0.4 - 1)} ${f1(cx)} ${f1(cy - 2)}" fill="none" stroke="${s.light}" stroke-width="1.1" opacity="0.5" transform="translate(${f1(-tx * 2)} ${f1(-ty * 2)})"/>`;
  }
  return out;
}
function Coconuts(x, y, count, night) {
  const c = night ? COCONUT.night : COCONUT.day;
  const at = [[-6, 6], [6, 7], [0, 12], [-11, 12], [11, 13]].slice(0, count);
  return at.map(([dx, dy]) => `<circle cx="${f1(x + dx)}" cy="${f1(y + dy)}" r="6.6" fill="${radGrad(x + dx - 2.4, y + dy - 2.6, 10, c, [0, 0.5, 1])}"/><circle cx="${f1(x + dx - 2.2)}" cy="${f1(y + dy - 2.4)}" r="1.5" fill="#FFFFFF" opacity="0.3"/>`).join('');
}
function SandPatch(w, night) {
  const [a, b] = night ? SAND.night : SAND.day;
  return `<ellipse cx="0" cy="-1" rx="${w / 2}" ry="${f1(w * 0.07)}" fill="${linGrad(0, -w * 0.07, 0, w * 0.05, [a, b])}"/>`;
}
const FRONDS = (n) => Array.from({ length: n }, (_, i) => -100 + (200 * i) / (n - 1));

function Palm({ look, progress = 0.5, night, seed, thirst = 0, ground = true }) {
  const G = night ? GROUND.night : GROUND.day;
  const s = palmLeaf(night), b = palmBark(night);
  const crown = (x, y, n, len, bend) => {
    const order = FRONDS(n).map((a, i) => ({ a, i })).sort((p, q) => Math.abs(q.a) - Math.abs(p.a));
    return order.map(({ a, i }) => Frond({ x, y, angle: a * 0.95, len: len * (1 - 0.12 * Math.abs(a) / 100), bend: bend * (0.4 + Math.abs(a) / 100), s, seed: seed + i, thirst })).join('');
  };
  switch (look) {
    case 'sprout':
      return Mound({ w: 40, ground: G }) + Coconuts(0, -9, 1, night) +
        [-38, 0, 38].map((a, i) => Leaf({ x: 0, y: -12, angle: droop(a, thirst), len: i === 1 ? 20 : 17, width: 6, light: s.light, dark: s.mid, vein: s.dark })).join('') +
        (progress > 0.3 ? Leaf({ x: 0, y: -12, angle: droop(-14, thirst), len: 14, width: 5, light: s.light, dark: s.mid, vein: s.dark }) : '');
    case 'seedling':
      return Mound({ w: 50, ground: G }) + Coconuts(0, -9, 1, night) + Stem({ d: 'M0 -8 L0 -16', width: 4, color: b.mid, shadow: b.dark }) +
        [-70, -35, 0, 35, 70].map((a, i) => Frond({ x: 0, y: -16, angle: a, len: i === 2 ? 40 : 34, bend: 14, s, seed: seed + i, thirst })).join('');
    case 'bush':
      return (ground ? SandPatch(70, night) + GroundShadow({ w: 90, ground: G }) : '') + crown(0, -8, 7, 72, 22);
    case 'young':
      return (ground ? SandPatch(70, night) + GroundShadow({ w: 86, ground: G }) : '') + PalmTrunk({ h: 92, w: 12, lean: 12, s: b }) + crown(12, -92, 7, 72, 40);
    case 'tree':
      return (ground ? SandPatch(96, night) + GroundShadow({ w: 120, ground: G }) : '') + PalmTrunk({ h: 186, w: 18, lean: 24, s: b }) + crown(24, -186, 9, 96, 46) + Coconuts(24, -186, 3, night);
    case 'grand':
      return (ground ? SandPatch(120, night) + GroundShadow({ w: 150, ground: G }) : '') + PalmTrunk({ h: 196, w: 24, lean: 30, s: b }) + crown(30, -196, 11, 104, 50) + Coconuts(30, -196, 5, night) +
        MeadowTufts({ w: 200, ground: G, seed, flowers: ['#FF9FB8', '#FFD84D', '#FFFFFF'] });
  }
  return '';
}

/* ================= Размеры и масштаб (повтор layout.ts) ================= */
// Новые строки SIZES для layout.ts — измерены по рисункам выше (рамка getBBox, ширина — 2·max|x|).
const SIZES = {
  birch: { sprout: { w: 40, h: 38 }, seedling: { w: 46, h: 88 }, bush: { w: 84, h: 130 }, young: { w: 94, h: 228 }, tree: { w: 150, h: 298 }, grand: { w: 218, h: 302 } },
  maple: { sprout: { w: 40, h: 40 }, seedling: { w: 50, h: 88 }, bush: { w: 110, h: 122 }, young: { w: 148, h: 208 }, tree: { w: 248, h: 272 }, grand: { w: 304, h: 306 } },
  apple: { sprout: { w: 40, h: 38 }, seedling: { w: 48, h: 84 }, bush: { w: 104, h: 118 }, young: { w: 174, h: 182 }, tree: { w: 258, h: 236 }, grand: { w: 292, h: 270 } },
  palm: { sprout: { w: 40, h: 32 }, seedling: { w: 80, h: 64 }, bush: { w: 148, h: 92 }, young: { w: 176, h: 176 }, tree: { w: 246, h: 296 }, grand: { w: 274, h: 314 } },
};
const CURVE = [[0, 0.14], [2, 0.16], [3, 0.26], [6, 0.3], [7, 0.32], [20, 0.37], [21, 0.6], [49, 0.7], [50, 0.72], [99, 0.84], [100, 0.95], [365, 0.97]];
function heightShare(days) {
  if (days <= CURVE[0][0]) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) {
    const [d1, s1] = CURVE[i];
    if (days <= d1) { const [d0, s0] = CURVE[i - 1]; return s0 + ((s1 - s0) * (days - d0)) / (d1 - d0); }
  }
  return CURVE[CURVE.length - 1][1];
}
const STAGE_OF = (d) => (d >= 100 ? 'grand' : d >= 50 ? 'tree' : d >= 21 ? 'young' : d >= 7 ? 'bush' : d >= 3 ? 'seedling' : 'sprout');
const STAGE_DAYS = { sprout: 1, seedling: 4, bush: 12, young: 30, tree: 70, grand: 160 };
const KINDS = { birch: Birch, maple: Maple, apple: Apple, palm: Palm };

/** Дерево в рамке 300×320 (как TreeArt): масштаб по возрасту. Возвращает <svg>. */
function treeSVG(kind, look, { night = false, seed = 7, size = 150, fill = 0, thirst = 0, ground = true, days } = {}) {
  resetDefs();
  const d = days ?? STAGE_DAYS[look];
  const sz = SIZES[kind][look];
  let zoom = Math.min((heightShare(d) * 308) / sz.h, (300 * 0.97) / sz.w);
  if (fill > 0) {
    const share = (zoom * sz.h) / 320, low = (0.14 * 308) / 320, top = 308 / 320;
    const t = Math.min(1, Math.max(0, (share - low) / (top - low)));
    const want = fill + (top - fill) * t;
    zoom *= Math.max(1, Math.min(want / share, (300 * 0.97) / (zoom * sz.w)));
  }
  const body = KINDS[kind]({ look, night, seed, thirst, ground, progress: 0.6 });
  const h = (size * 320) / 300;
  return `<svg width="${size}" height="${f1(h)}" viewBox="0 0 300 320" xmlns="http://www.w3.org/2000/svg"><defs>${DEFS.join('')}</defs><g transform="translate(150 312) scale(${f1(zoom)})">${body}</g></svg>`;
}
/** Дерево без масштаба по возрасту (для замера рамки). */
function rawTreeSVG(kind, look, night = false) {
  resetDefs();
  const body = KINDS[kind]({ look, night, seed: 7, progress: 0.6 });
  return `<svg width="320" height="340" viewBox="-160 -330 320 340" xmlns="http://www.w3.org/2000/svg"><defs>${DEFS.join('')}</defs><g class="m">${body}</g></svg>`;
}

/* ================= Луга (themes.ts) ================= */
const THEMES = {
  summer: {
    sky: { day: { top: '#9FE1F5', mid: '#C9F0FA', horizon: '#EAFBFF', cloudTop: '#FFFFFF', cloudBottom: '#DDF1FA', cloudShadow: '#8CCBE0' },
      night: { top: '#191E5E', mid: '#2B2F7A', horizon: '#5357A8', cloudTop: '#5A5EB0', cloudBottom: '#2F3378', cloudShadow: '#151845' } },
    meadow: { day: { mountainsTop: '#B7DCE0', mountainsBottom: '#CFEAEA', hillsTop: '#A3D3B7', hillsBottom: '#B9E0C2', forest: '#93C9A6', bushes: '#8DC58F', meadow: ['#CBE5A1', '#DCE3A0', '#EED8A0', '#E8C68A'], haze: '#F2FCFF', grass: ['#9CCB5E', '#7DB24A'], frontGrass: ['#6A9F3C', '#7DB24A'], flowers: ['#FFFFFF', '#FFD84D', '#FF9FB8', '#B7A6FF'], soil: '#A07448' },
      night: { mountainsTop: '#3B3F8C', mountainsBottom: '#4A4F9E', hillsTop: '#2C3A6E', hillsBottom: '#34477A', forest: '#2A3B66', bushes: '#2D4766', meadow: ['#3D4C86', '#45507A', '#594B4A', '#4A3A2E'], haze: '#5357A8', grass: ['#3E6440', '#2F5233'], frontGrass: ['#24442E', '#2F5638'], flowers: ['#C9C2F0', '#E8E2FF', '#C9C2F0', '#E8E2FF'], soil: '#6B5340' } },
    weather: null, density: 1,
  },
  autumn: {
    sky: { day: { top: '#A8D4EC', mid: '#D3E8EE', horizon: '#FBEBD3', cloudTop: '#FFFFFF', cloudBottom: '#F3E2CF', cloudShadow: '#C9AE95' },
      night: { top: '#1D1B52', mid: '#33296F', horizon: '#6A4F8E', cloudTop: '#6A5AAE', cloudBottom: '#352C76', cloudShadow: '#181540' } },
    meadow: { day: { mountainsTop: '#C9D3D6', mountainsBottom: '#E3DCCF', hillsTop: '#E2A866', hillsBottom: '#EDBE7E', forest: '#D9823F', bushes: '#C9733A', meadow: ['#E8D592', '#EDCB86', '#E9B977', '#DDA466'], haze: '#FFF4E2', grass: ['#C9B45A', '#A99848'], frontGrass: ['#8E8A3A', '#A8A04A'], flowers: ['#FFFFFF', '#FFB347', '#E8643C', '#C98A3E'], soil: '#9A6A3E' },
      night: { mountainsTop: '#3E3A86', mountainsBottom: '#4C4796', hillsTop: '#4A3A6E', hillsBottom: '#56447A', forest: '#4A3460', bushes: '#553A5E', meadow: ['#4A4680', '#55497A', '#5E4A4A', '#4E3A2E'], haze: '#6A5AA0', grass: ['#5E5A3A', '#4C4830'], frontGrass: ['#3A3626', '#4A4630'], flowers: ['#E8C9A0', '#F0D8B8', '#E8C9A0', '#F0D8B8'], soil: '#6B4E38' } },
    weather: 'leaves', density: 0.6,
  },
  winter: {
    sky: { day: { top: '#8FC8EE', mid: '#C4E3F5', horizon: '#EEF6FB', cloudTop: '#FFFFFF', cloudBottom: '#DCE9F3', cloudShadow: '#9DB8CF' },
      night: { top: '#141A4E', mid: '#22306E', horizon: '#4A5AA0', cloudTop: '#5662A8', cloudBottom: '#2A3270', cloudShadow: '#121640' } },
    meadow: { day: { mountainsTop: '#D6E6F2', mountainsBottom: '#EAF2F8', hillsTop: '#E8F1F8', hillsBottom: '#F4F8FB', forest: '#6E9A9A', bushes: '#B8CFDA', meadow: ['#F2F7FB', '#EAF2F8', '#E3EDF5', '#D9E6F0'], haze: '#FFFFFF', grass: ['#C7D9E6', '#AFC6D6'], frontGrass: ['#9FB8C9', '#B9CEDC'], flowers: ['#FFFFFF', '#D7ECFF', '#E8434F', '#FFFFFF'], soil: '#8A6A50' },
      night: { mountainsTop: '#4A5BA0', mountainsBottom: '#5868AE', hillsTop: '#6070B4', hillsBottom: '#6C7CBC', forest: '#2E3E6E', bushes: '#5A6AAA', meadow: ['#6F7EC0', '#6878B8', '#6070AE', '#5666A2'], haze: '#7A88C8', grass: ['#5A6AA8', '#4E5E9C'], frontGrass: ['#3E4C88', '#4C5A96'], flowers: ['#E8EEFF', '#C9D4FF', '#E8EEFF', '#C9D4FF'], soil: '#5A4A48' } },
    weather: 'snow', density: 0.5,
  },
  bloom: {
    sky: { day: { top: '#9ED8F5', mid: '#D2EEFA', horizon: '#FFF1F4', cloudTop: '#FFFFFF', cloudBottom: '#F7E3EE', cloudShadow: '#D9AFC6' },
      night: { top: '#22195A', mid: '#3A2A7C', horizon: '#7A5AA8', cloudTop: '#7A62B8', cloudBottom: '#3E2F80', cloudShadow: '#1A1448' } },
    meadow: { day: { mountainsTop: '#C7DCEA', mountainsBottom: '#DCEBF0', hillsTop: '#9ED39A', hillsBottom: '#B6E2A8', forest: '#F2B3CF', bushes: '#E89BC0', meadow: ['#C8EBA0', '#D5EEA2', '#E6EBA6', '#DDE29A'], haze: '#FFF6FA', grass: ['#8ACB5A', '#6FB548'], frontGrass: ['#5E9F3A', '#78BC4A'], flowers: ['#FF8FB1', '#FFD84D', '#B7A6FF', '#FFFFFF'], soil: '#A07448' },
      night: { mountainsTop: '#463F92', mountainsBottom: '#544CA0', hillsTop: '#2F4A72', hillsBottom: '#38557E', forest: '#5A3F7E', bushes: '#62447E', meadow: ['#3E4E88', '#46547E', '#4E4E66', '#463E44'], haze: '#6A58AE', grass: ['#3E6648', '#33583C'], frontGrass: ['#264630', '#305A3C'], flowers: ['#E6B3D9', '#E8E2FF', '#C9C2F0', '#F2C9E6'], soil: '#6B5340' } },
    weather: 'petals', density: 2.2,
  },
};
const WEATHER = {
  leaves: { day: ['#E8643C', '#F2A33A', '#D9822B', '#B5552E'], night: ['#9A5A4E', '#A87A52', '#8E6A48', '#7A4A44'] },
  snow: { day: ['#FFFFFF'], night: ['#E8EEFF'] },
  petals: { day: ['#FFB3CB', '#FFD6E2', '#FFFFFF'], night: ['#D9B0D0', '#C9B6E6'] },
};
const GROUND_BY_MEADOW = {
  summer: { day: { ground: '#F2C98F', shade: '#E3B274' }, night: { ground: '#6B4A33', shade: '#553925' } },
  autumn: { day: { ground: '#E9B97A', shade: '#D49A5C' }, night: { ground: '#5E4230', shade: '#4A3222' } },
  winter: { day: { ground: '#F4F8FB', shade: '#D5E3EE' }, night: { ground: '#7C8AC6', shade: '#6474B0' } },
  bloom: { day: { ground: '#F2C98F', shade: '#E3B274' }, night: { ground: '#6B4A33', shade: '#553925' } },
};

const ridge = (x, waves) => waves.reduce((s, [a, p, ph]) => s + a * Math.sin((x / p) * Math.PI * 2 + ph), 0);
/** Мини-сцена луга (превью в магазине и кадры). W×H px, horizon — доля высоты. */
function sceneSVG(id, { W = 300, H = 200, night = false, horizon = 0.5, tree = '', treeX = 0.5, treeW = 0.6, seed = 5, sun = true, front = true, soil = true, weather = true, groundAt = 0.62 } = {}) {
  resetDefs();
  const th = THEMES[id], sk = night ? th.sky.night : th.sky.day, m = night ? th.meadow.night : th.meadow.day;
  const hy = H * horizon;
  const rand = rng(seed);
  let o = '';
  o += `<rect width="${W}" height="${f1(hy + 6)}" fill="${linGrad(0, 0, 0, hy, [sk.top, sk.mid, sk.horizon], [0, 0.6, 1])}"/>`;
  if (night) {
    for (let i = 0; i < Math.round(W * hy / 900); i++) o += `<circle cx="${f1(rand() * W)}" cy="${f1(rand() * hy * 0.85)}" r="${f1(0.6 + rand() * 1)}" fill="#FFFFFF" opacity="${f1(0.5 + rand() * 0.5)}"/>`;
  }
  if (sun) {
    const sx = W * 0.18, sy = hy * 0.26, r = Math.max(9, Math.min(W, H) * 0.07);
    o += night
      ? `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="${f1(r * 2.2)}" fill="${radGrad(sx, sy, r * 2.2, ['rgba(201,199,255,0.5)', 'rgba(201,199,255,0)'])}"/><circle cx="${f1(sx)}" cy="${f1(sy)}" r="${f1(r)}" fill="#EEEDFB"/><circle cx="${f1(sx + r * 0.3)}" cy="${f1(sy - r * 0.2)}" r="${f1(r * 0.22)}" fill="#D4D1EE"/>`
      : `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="${f1(r * 2.4)}" fill="${radGrad(sx, sy, r * 2.4, ['rgba(255,246,194,0.85)', 'rgba(255,241,168,0.3)', 'rgba(255,241,168,0)'])}"/><circle cx="${f1(sx)}" cy="${f1(sy)}" r="${f1(r)}" fill="${radGrad(sx - r * 0.3, sy - r * 0.3, r * 1.3, ['#FFF6BE', '#FBD84E', '#F4BE34'])}"/>`;
  }
  // облака
  [[0.62, 0.3, 1], [0.86, 0.55, 0.7], [0.32, 0.62, 0.8]].forEach(([cx, cy, k]) => {
    const x = W * cx, y = hy * cy, s = Math.min(W, H) * 0.09 * k;
    const g = linGrad(0, y - s, 0, y + s * 0.6, [sk.cloudTop, sk.cloudBottom]);
    o += `<g fill="${g}"><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(s * 1.6)}" ry="${f1(s * 0.55)}"/><circle cx="${f1(x - s * 0.5)}" cy="${f1(y - s * 0.3)}" r="${f1(s * 0.55)}"/><circle cx="${f1(x + s * 0.3)}" cy="${f1(y - s * 0.45)}" r="${f1(s * 0.75)}"/></g>`;
  });
  const sil = (base, waves, floor, fill) => {
    let d = `M0 ${f1(floor)}`;
    for (let x = 0; x <= W; x += 4) d += ` L${x} ${f1(base - ridge(x, waves))}`;
    return `<path d="${d} L${W} ${f1(floor)} Z" fill="${fill}"/>`;
  };
  const k = H / 812;
  const K = Math.max(0.55, k * 2);
  o += sil(hy - 8 * K, [[16 * K, 160, 0.4], [9 * K, 71, 1.3]], hy + 6, linGrad(0, hy - 50 * K, 0, hy, [m.mountainsTop, m.mountainsBottom]));
  if (id === 'winter' && !night) o += sil(hy - 8 * K, [[16 * K, 160, 0.4], [9 * K, 71, 1.3]], hy - 12 * K, '#FFFFFF').replace('<path', '<path opacity="0.7"');
  o += sil(hy + 2, [[7 * K, 110, 2.1], [4 * K, 47, 0.2]], hy + 8, linGrad(0, hy - 20 * K, 0, hy + 4, [m.hillsTop, m.hillsBottom]));
  // дальний лес
  for (let x = 6; x < W; x += 9 + rand() * 18) {
    const r = (3 + rand() * 4) * Math.min(K, 1.1);
    o += rand() < 0.4 ? `<path d="M${f1(x)} ${f1(hy + 3 - r * 2.6)} L${f1(x + r)} ${f1(hy + 4)} L${f1(x - r)} ${f1(hy + 4)} Z" fill="${m.forest}"/>` : `<circle cx="${f1(x)}" cy="${f1(hy + 3 - r * 0.6)}" r="${f1(r)}" fill="${m.forest}"/>`;
  }
  o += `<rect y="${f1(hy + 2)}" width="${W}" height="${f1(H - hy)}" fill="${linGrad(0, hy, 0, H, m.meadow, [0, 0.22, 0.5, 1])}"/>`;
  o += `<rect y="${f1(hy - 14)}" width="${W}" height="20" fill="${linGrad(0, hy - 14, 0, hy + 6, [m.haze + '00', m.haze + '8C'])}"/>`;
  // травинки и цветы
  const n = Math.round((W * (H - hy)) / 1100);
  for (let i = 0; i < n; i++) {
    const x = rand() * W, y = hy + 8 + Math.pow(rand(), 1.4) * (H - hy - 10), s = 0.6 + ((y - hy) / (H - hy)) * 1.6;
    o += `<path d="M${f1(x - 2 * s)} ${f1(y)} Q ${f1(x - 2 * s)} ${f1(y - 4 * s)} ${f1(x - 3 * s)} ${f1(y - 6 * s)} Q ${f1(x)} ${f1(y - 3 * s)} ${f1(x + 0.5)} ${f1(y - 7 * s)} Q ${f1(x + 1)} ${f1(y - 3 * s)} ${f1(x + 3 * s)} ${f1(y - 5 * s)} Q ${f1(x + 2 * s)} ${f1(y - 3 * s)} ${f1(x + 2 * s)} ${f1(y)} Z" fill="${m.grass[i % 2]}"/>`;
  }
  const nf = Math.round(n * 0.35 * th.density);
  for (let i = 0; i < nf; i++) {
    const x = rand() * W, y = hy + 10 + Math.pow(rand(), 1.2) * (H - hy - 14), s = 0.7 + ((y - hy) / (H - hy)) * 1.4;
    const c = m.flowers[Math.floor(rand() * 4)];
    if (id === 'autumn' && !night && rand() < 0.6) o += Leaf({ x, y, angle: rand() * 360, len: 5 * s, width: 5 * s, light: WEATHER.leaves.day[i % 4], dark: WEATHER.leaves.day[(i + 1) % 4], vein: '#8E2A1E', shape: 'maple' });
    else o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(1.6 * s)}" fill="${c}" opacity="${night ? 0.6 : 1}"/>` + (id === 'winter' ? '' : `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.6 * s)}" fill="#FFF3B0" opacity="${night ? 0.4 : 1}"/>`);
  }
  // дерево
  if (tree) {
    const tw = W * treeW, tx = W * treeX - tw / 2, groundY = hy + (H - hy) * groundAt, ty = groundY - (tw * 312) / 300;
    if (soil) {
      const gr = GROUND_BY_MEADOW[id][night ? 'night' : 'day'];
      o += `<ellipse cx="${f1(W * treeX)}" cy="${f1(groundY)}" rx="${f1(tw * 0.2)}" ry="${f1(tw * 0.035)}" fill="${gr.shade}"/>`;
    }
    o += `<g transform="translate(${f1(tx)} ${f1(ty)})">${tree.replace(/^<svg width="[^"]*" height="[^"]*"/, `<svg width="${f1(tw)}" height="${f1((tw * 320) / 300)}"`)}</g>`;
  }
  // передняя трава
  if (front) {
    let d = `M0 ${H}`;
    for (let x = 0; x <= W; x += 5) d += ` L${x} ${f1(H - 6 - rand() * 10 * Math.max(1, K))} L${x + 2.5} ${f1(H - 2)}`;
    o += `<path d="${d} L${W} ${H} Z" fill="${m.frontGrass[0]}"/>`;
  }
  // погода
  if (weather && th.weather) {
    const cols = WEATHER[th.weather][night ? 'night' : 'day'];
    const cnt = th.weather === 'snow' ? Math.round(W * H / 2600) : Math.round(W * H / 7000);
    for (let i = 0; i < cnt; i++) {
      const x = rand() * W, y = rand() * H * 0.92, c = cols[i % cols.length];
      if (th.weather === 'snow') o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(1 + rand() * 1.6)}" fill="${c}" opacity="${f1(0.75 + rand() * 0.25)}"/>`;
      else if (th.weather === 'leaves') o += Leaf({ x, y, angle: rand() * 360, len: 7 + rand() * 3, width: 8, light: c, dark: cols[(i + 2) % cols.length], vein: '#8E2A1E', shape: rand() < 0.5 ? 'maple' : 'almond' });
      else o += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="3.2" ry="1.9" transform="rotate(${f1(rand() * 180)} ${f1(x)} ${f1(y)})" fill="${c}"/>`;
    }
    if (th.weather === 'petals' && !night) {
      [[0.72, 0.62, '#FFD84D'], [0.2, 0.7, '#B7A6FF']].forEach(([bx, by, c]) => {
        const x = W * bx, y = H * by;
        o += `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(K)})"><ellipse cx="-3" cy="-1" rx="3.2" ry="2.4" fill="${c}" transform="rotate(-25 -3 -1)"/><ellipse cx="3" cy="-1" rx="3.2" ry="2.4" fill="${c}" transform="rotate(25 3 -1)"/><ellipse cx="-2" cy="2" rx="2" ry="1.5" fill="${c}"/><ellipse cx="2" cy="2" rx="2" ry="1.5" fill="${c}"/><path d="M0 -3 V3" stroke="#5A3A0E" stroke-width="1"/></g>`;
      });
    }
  }
  if (night) {
    for (let i = 0; i < Math.round(W / 60); i++) {
      const x = rand() * W, y = hy + 10 + rand() * (H - hy - 20);
      o += `<circle cx="${f1(x)}" cy="${f1(y)}" r="4" fill="rgba(233,255,138,0.18)"/><circle cx="${f1(x)}" cy="${f1(y)}" r="1.4" fill="#F4FFB8"/>`;
    }
  }
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><defs>${DEFS.join('')}</defs>${o}</svg>`;
}

/* ================= Значки (Glyph, viewBox 24) ================= */
// Новые: acorn, acornStack, basket, nameTag (новая бирка). Старые подставляются из glyphs.tsx (объект OLD ниже заполняет макет).
const G = {
  acorn: `<path d="M12 4.6 C12.1 3 12.8 1.9 14.1 1.4" fill="none" stroke="#5A3A17" stroke-width="1.6" stroke-linecap="round"/>
<path d="M5.7 10.9 C5.7 16.1 8.5 20.4 12 22.2 C15.5 20.4 18.3 16.1 18.3 10.9 Z" fill="#E0A24A" stroke="#A0662A" stroke-width="1.3" stroke-linejoin="round"/>
<path d="M8.5 13 C8.7 15.6 9.7 17.8 11.3 19.3" fill="none" stroke="#FFE7B0" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>
<path d="M3.8 10.8 C3.8 6.7 7.6 4.1 12 4.1 C16.4 4.1 20.2 6.7 20.2 10.8 C20.2 11.9 19.3 12.5 18.3 12.3 C14.1 11.5 9.9 11.5 5.7 12.3 C4.7 12.5 3.8 11.9 3.8 10.8 Z" fill="#8A5A2B" stroke="#5A3A17" stroke-width="1.3" stroke-linejoin="round"/>
<path d="M7 9.8 L9 7.8 M10.4 10.2 L13.4 7.2 M14.4 10 L16.8 7.6 M7.6 6.8 L9.8 9 M11.6 6.2 L14.4 9 M15.8 7 L17.4 8.6" fill="none" stroke="#6E4520" stroke-width="0.9" stroke-linecap="round" opacity="0.75"/>
<path d="M6.6 7.4 C7.9 6 9.6 5.3 11.4 5.2" fill="none" stroke="#B9874F" stroke-width="1.3" stroke-linecap="round"/>`,
  basket: `<path d="M6 10.4 C6.4 5.2 17.6 5.2 18 10.4" fill="none" stroke="#A0692F" stroke-width="1.8" stroke-linecap="round"/>
<g transform="translate(4.6 3.4) scale(0.42)"><path d="M12 4.6 C12.1 3 12.8 1.9 14.1 1.4" fill="none" stroke="#5A3A17" stroke-width="2.4" stroke-linecap="round"/><path d="M5.7 10.9 C5.7 16.1 8.5 20.4 12 22.2 C15.5 20.4 18.3 16.1 18.3 10.9 Z" fill="#E0A24A" stroke="#A0662A" stroke-width="2"/><path d="M3.8 10.8 C3.8 6.7 7.6 4.1 12 4.1 C16.4 4.1 20.2 6.7 20.2 10.8 C20.2 11.9 19.3 12.5 18.3 12.3 C14.1 11.5 9.9 11.5 5.7 12.3 C4.7 12.5 3.8 11.9 3.8 10.8 Z" fill="#8A5A2B" stroke="#5A3A17" stroke-width="2"/></g>
<g transform="translate(9.6 2.2) scale(0.42) rotate(14 12 12)"><path d="M5.7 10.9 C5.7 16.1 8.5 20.4 12 22.2 C15.5 20.4 18.3 16.1 18.3 10.9 Z" fill="#E0A24A" stroke="#A0662A" stroke-width="2"/><path d="M3.8 10.8 C3.8 6.7 7.6 4.1 12 4.1 C16.4 4.1 20.2 6.7 20.2 10.8 C20.2 11.9 19.3 12.5 18.3 12.3 C14.1 11.5 9.9 11.5 5.7 12.3 C4.7 12.5 3.8 11.9 3.8 10.8 Z" fill="#8A5A2B" stroke="#5A3A17" stroke-width="2"/></g>
<path d="M3 11 H21 L19.2 20 C19 21 18.2 21.6 17.2 21.6 H6.8 C5.8 21.6 5 21 4.8 20 Z" fill="#E7B46A" stroke="#A0692F" stroke-width="1.3" stroke-linejoin="round"/>
<path d="M4 14 H20 M4.6 17 H19.4 M8.4 11.4 L8.9 21.2 M12 11.4 V21.4 M15.6 11.4 L15.1 21.2" fill="none" stroke="#B9803F" stroke-width="1" opacity="0.8"/>
<path d="M2.4 10.2 H21.6 V12.2 H2.4 Z" fill="#C98A46" stroke="#A0692F" stroke-width="1.2" stroke-linejoin="round"/>
<path d="M4.6 10.9 H12" stroke="#FFE2A8" stroke-width="0.9" stroke-linecap="round" opacity="0.8"/>`,
  nameTag: `<path d="M3 4.6 Q12 2.6 21 4.6" fill="none" stroke="#7A4E26" stroke-width="2" stroke-linecap="round"/>
<path d="M18.2 4.1 C18 2.3 19.4 1.1 21.4 1.3 C21.4 3.3 20 4.3 18.2 4.1 Z" fill="#8BC34A" stroke="#4E8A2A" stroke-width="1" stroke-linejoin="round"/>
<path d="M7.4 4.1 L6.6 9.2 M16.6 4 L17.4 9.2" fill="none" stroke="#A0692F" stroke-width="1.2" stroke-linecap="round"/>
<rect x="3.2" y="8.6" width="17.6" height="11.6" rx="3" fill="#F2C27E" stroke="#A0692F" stroke-width="1.4"/>
<path d="M5.4 10.4 H18.6" stroke="#FFF3C4" stroke-width="1" stroke-linecap="round" opacity="0.75"/>
<circle cx="6.6" cy="10.2" r="0.85" fill="#7A4E26"/><circle cx="17.4" cy="10.2" r="0.85" fill="#7A4E26"/>
<path d="M6.4 15.6 C7.3 13.2 8.4 13 9 14.8 C9.6 16.6 10.7 16.6 11.5 14.2 C12.1 12.6 13.2 12.8 13.6 14.4 C14 16 15.1 16.2 15.9 14.8 L17.6 14.4" fill="none" stroke="#7A4E26" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
};

/* ================= Аватары (viewBox 48, рисуются поверх круга цвета фона) ================= */
const AV_BG = {
  day: ['#FFD3A8', '#BDEBC8', '#BFE6FA', '#D9CCFF', '#FFE79A', '#FFC2D1', '#CFE3B0', '#F3D9B5'],
  night: ['#C98F66', '#6FA884', '#6E9CC9', '#8E80CC', '#C9A84E', '#C9768E', '#86A26A', '#A88E6E'],
};
const AV = {
  fox: `<path d="M9 9 L18 18 L13 24 Z" fill="#F07A3A" stroke="#B4521E" stroke-width="1.6" stroke-linejoin="round"/><path d="M39 9 L30 18 L35 24 Z" fill="#F07A3A" stroke="#B4521E" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M11.5 12.5 L16 17 L13.4 20 Z M36.5 12.5 L32 17 L34.6 20 Z" fill="#5A3020"/>
<path d="M24 15 C33 15 39 21 39 28 C39 34 32 40 24 41 C16 40 9 34 9 28 C9 21 15 15 24 15 Z" fill="#F58A45" stroke="#B4521E" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M24 41 C17 40 11.5 35 10.6 30.4 C14 31.2 18 33.2 20.4 36 C21.6 33.6 22.6 32.6 24 32.4 C25.4 32.6 26.4 33.6 27.6 36 C30 33.2 34 31.2 37.4 30.4 C36.5 35 31 40 24 41 Z" fill="#FFF4E6"/>
<ellipse cx="18" cy="26.6" rx="2" ry="2.4" fill="#2B1A12"/><ellipse cx="30" cy="26.6" rx="2" ry="2.4" fill="#2B1A12"/><circle cx="18.7" cy="25.8" r="0.7" fill="#fff"/><circle cx="30.7" cy="25.8" r="0.7" fill="#fff"/>
<path d="M22 33 C22 31.8 26 31.8 26 33 C26 34 24.8 34.8 24 34.8 C23.2 34.8 22 34 22 33 Z" fill="#2B1A12"/>
<ellipse cx="14.5" cy="30.5" rx="2.2" ry="1.3" fill="#FF9E8A" opacity="0.6"/><ellipse cx="33.5" cy="30.5" rx="2.2" ry="1.3" fill="#FF9E8A" opacity="0.6"/>
<path d="M15 18.6 C17.6 16.8 20.6 16 23.4 16" fill="none" stroke="#FFC18F" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`,
  owl: `<path d="M12 12 L16 16 M36 12 L32 16" stroke="#6E4A2E" stroke-width="2.4" stroke-linecap="round"/>
<path d="M24 11 C34 11 39 18 39 27 C39 36 33 42 24 42 C15 42 9 36 9 27 C9 18 14 11 24 11 Z" fill="#B98A5A" stroke="#6E4A2E" stroke-width="1.6"/>
<path d="M24 30 C31 30 34 34 33 40 C30 41.6 27 42 24 42 C21 42 18 41.6 15 40 C14 34 17 30 24 30 Z" fill="#F3DDB8"/>
<path d="M19 34 L20 35.4 L21 34 M23 36 L24 37.4 L25 36 M27 34 L28 35.4 L29 34" fill="none" stroke="#C9A06E" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
<circle cx="18" cy="23" r="6.4" fill="#FFF7E6" stroke="#6E4A2E" stroke-width="1.4"/><circle cx="30" cy="23" r="6.4" fill="#FFF7E6" stroke="#6E4A2E" stroke-width="1.4"/>
<circle cx="18.6" cy="23.4" r="3.2" fill="#2B1A12"/><circle cx="29.4" cy="23.4" r="3.2" fill="#2B1A12"/><circle cx="19.6" cy="22.2" r="1.1" fill="#fff"/><circle cx="30.4" cy="22.2" r="1.1" fill="#fff"/>
<path d="M22.4 28 L24 31.4 L25.6 28 Z" fill="#F4B740" stroke="#B9801E" stroke-width="1" stroke-linejoin="round"/>
<path d="M14 15.6 C16.6 13.6 19.6 12.8 22.6 12.8" fill="none" stroke="#DDB585" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`,
  bear: `<circle cx="13" cy="14" r="5.4" fill="#A0724A" stroke="#6B4628" stroke-width="1.6"/><circle cx="35" cy="14" r="5.4" fill="#A0724A" stroke="#6B4628" stroke-width="1.6"/>
<circle cx="13" cy="14" r="2.6" fill="#E3B98A"/><circle cx="35" cy="14" r="2.6" fill="#E3B98A"/>
<path d="M24 12 C34 12 40 19 40 27.5 C40 36 33 41.5 24 41.5 C15 41.5 8 36 8 27.5 C8 19 14 12 24 12 Z" fill="#B3845A" stroke="#6B4628" stroke-width="1.6"/>
<ellipse cx="24" cy="32.5" rx="7.4" ry="5.8" fill="#EBCBA2"/>
<circle cx="17.6" cy="25.6" r="2.1" fill="#2B1A12"/><circle cx="30.4" cy="25.6" r="2.1" fill="#2B1A12"/><circle cx="18.3" cy="24.9" r="0.7" fill="#fff"/><circle cx="31.1" cy="24.9" r="0.7" fill="#fff"/>
<path d="M21.4 30.2 C21.4 28.8 26.6 28.8 26.6 30.2 C26.6 31.6 25 32.6 24 32.6 C23 32.6 21.4 31.6 21.4 30.2 Z" fill="#3A2416"/>
<path d="M24 32.6 V34.6 M21.6 35.6 C22.6 36.6 25.4 36.6 26.4 35.6" fill="none" stroke="#3A2416" stroke-width="1.3" stroke-linecap="round"/>
<path d="M14 18.4 C16.6 15.4 19.6 14 22.6 13.8" fill="none" stroke="#D2A678" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`,
  hedgehog: `<path d="M8 30 L5 24 L10 23 L8 17 L14 17.6 L14 11.4 L19.6 14 L22 8.4 L26 13 L30.6 9 L32 14.8 L37.6 13 L36.6 19 L42 19.6 L38.6 25 L43 28.6 L37.4 31 Z" fill="#8A6A4E" stroke="#5A4230" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M14 21 L16.4 18 M20 17.4 L21.6 14.4 M26.4 16.6 L27.6 13.4 M32.4 18.4 L34.6 15.8" stroke="#B49274" stroke-width="1.2" stroke-linecap="round"/>
<path d="M10.4 31 C10.4 24.6 16 21.6 23.6 21.6 C31.6 21.6 38 25 38 31 C38 37.4 31.6 41.6 24 41.6 C16.6 41.6 10.4 37.4 10.4 31 Z" fill="#F3D9B5" stroke="#B48A55" stroke-width="1.4"/>
<circle cx="19" cy="29" r="2" fill="#2B1A12"/><circle cx="29" cy="29" r="2" fill="#2B1A12"/><circle cx="19.6" cy="28.4" r="0.7" fill="#fff"/><circle cx="29.6" cy="28.4" r="0.7" fill="#fff"/>
<ellipse cx="24" cy="33.6" rx="2.4" ry="1.9" fill="#2B1A12"/><ellipse cx="15.4" cy="33.4" rx="2.2" ry="1.3" fill="#FF9E8A" opacity="0.6"/><ellipse cx="32.6" cy="33.4" rx="2.2" ry="1.3" fill="#FF9E8A" opacity="0.6"/>
<path d="M30.4 10.6 C31.8 8.6 34.4 8 36.4 9 C35.4 11 33 11.8 30.4 10.6 Z" fill="#E0485F" stroke="#A82A3F" stroke-width="1"/>`,
  rabbit: `<path d="M17.6 18 C14 12 14 4.6 17.4 4.2 C21 3.8 22 11 21.4 17.4" fill="#F4EEE8" stroke="#9A8A80" stroke-width="1.6" stroke-linejoin="round"/><path d="M30.4 18 C34 12 34 4.6 30.6 4.2 C27 3.8 26 11 26.6 17.4" fill="#F4EEE8" stroke="#9A8A80" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M18.2 15.6 C16.6 11.6 16.8 7.4 17.8 7 M29.8 15.6 C31.4 11.6 31.2 7.4 30.2 7" fill="none" stroke="#FFB3C4" stroke-width="2" stroke-linecap="round"/>
<path d="M24 16 C33 16 38.6 21.6 38.6 29 C38.6 36.4 32 41.6 24 41.6 C16 41.6 9.4 36.4 9.4 29 C9.4 21.6 15 16 24 16 Z" fill="#FBF7F2" stroke="#9A8A80" stroke-width="1.6"/>
<circle cx="18.2" cy="28" r="2.1" fill="#2B1A12"/><circle cx="29.8" cy="28" r="2.1" fill="#2B1A12"/><circle cx="18.9" cy="27.3" r="0.7" fill="#fff"/><circle cx="30.5" cy="27.3" r="0.7" fill="#fff"/>
<path d="M22.4 32 C22.4 31 25.6 31 25.6 32 C25.6 33 24.6 33.6 24 33.6 C23.4 33.6 22.4 33 22.4 32 Z" fill="#FF8FA6"/>
<path d="M24 33.6 V35 M21.8 36 C22.8 37 25.2 37 26.2 36" fill="none" stroke="#9A8A80" stroke-width="1.2" stroke-linecap="round"/>
<ellipse cx="14.6" cy="32.4" rx="2.2" ry="1.3" fill="#FFB3C4" opacity="0.7"/><ellipse cx="33.4" cy="32.4" rx="2.2" ry="1.3" fill="#FFB3C4" opacity="0.7"/>`,
  squirrel: `<path d="M33 41 C44 40 46 28 41 20 C37 13 29 14 30 21 C31 26 37 26 37 31 C37 35 34 37 31 38" fill="#D9824A" stroke="#9A5226" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M38 20 C40.4 23 41.4 27.6 40 31.6" fill="none" stroke="#F2B07A" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>
<path d="M12 15 L13.6 7.6 L18.6 13 Z M30 15 L28.4 7.6 L23.4 13 Z" fill="#C8703A" stroke="#9A5226" stroke-width="1.5" stroke-linejoin="round"/>
<path d="M21 12.6 C29 12.6 33.6 18.4 33.6 25.6 C33.6 33 28 38.4 21 38.4 C14 38.4 8.4 33 8.4 25.6 C8.4 18.4 13 12.6 21 12.6 Z" fill="#E08C50" stroke="#9A5226" stroke-width="1.6"/>
<path d="M21 38.4 C16.4 38.2 13.2 35.6 12.6 31.4 C15.2 30.6 18.2 31 21 33 C23.8 31 26.8 30.6 29.4 31.4 C28.8 35.6 25.6 38.2 21 38.4 Z" fill="#FFF0DC"/>
<circle cx="16" cy="24.6" r="2" fill="#2B1A12"/><circle cx="26" cy="24.6" r="2" fill="#2B1A12"/><circle cx="16.7" cy="23.9" r="0.7" fill="#fff"/><circle cx="26.7" cy="23.9" r="0.7" fill="#fff"/>
<ellipse cx="21" cy="29.6" rx="1.9" ry="1.4" fill="#2B1A12"/>
<g transform="translate(12.4 34.4) scale(0.36)"><path d="M5.7 10.9 C5.7 16.1 8.5 20.4 12 22.2 C15.5 20.4 18.3 16.1 18.3 10.9 Z" fill="#E0A24A" stroke="#A0662A" stroke-width="2.4"/><path d="M3.8 10.8 C3.8 6.7 7.6 4.1 12 4.1 C16.4 4.1 20.2 6.7 20.2 10.8 C20.2 11.9 19.3 12.5 18.3 12.3 C14.1 11.5 9.9 11.5 5.7 12.3 C4.7 12.5 3.8 11.9 3.8 10.8 Z" fill="#8A5A2B" stroke="#5A3A17" stroke-width="2.4"/></g>`,
  deer: `<path d="M16 14 C13 10 10.6 6 11.6 3.4 M13 8.6 L8.4 7 M14.4 11.4 L10.6 11.6 M32 14 C35 10 37.4 6 36.4 3.4 M35 8.6 L39.6 7 M33.6 11.4 L37.4 11.6" fill="none" stroke="#8A5A2E" stroke-width="2" stroke-linecap="round"/>
<path d="M12.4 18.6 C8 17.4 5.6 19.6 6.4 22 C9 23.6 12.4 22.6 14 21 Z M35.6 18.6 C40 17.4 42.4 19.6 41.6 22 C39 23.6 35.6 22.6 34 21 Z" fill="#C98A52" stroke="#8A5A2E" stroke-width="1.4" stroke-linejoin="round"/>
<path d="M24 13.6 C32 13.6 36 19 36 25.6 C36 32 31.6 41.6 24 41.6 C16.4 41.6 12 32 12 25.6 C12 19 16 13.6 24 13.6 Z" fill="#D69A5E" stroke="#8A5A2E" stroke-width="1.6"/>
<path d="M24 41.6 C19.4 41.6 17 37.6 17.4 33.6 C19.4 32.4 22 32 24 32 C26 32 28.6 32.4 30.6 33.6 C31 37.6 28.6 41.6 24 41.6 Z" fill="#F6DDBF"/>
<circle cx="19" cy="25.6" r="2.1" fill="#2B1A12"/><circle cx="29" cy="25.6" r="2.1" fill="#2B1A12"/><circle cx="19.7" cy="24.9" r="0.7" fill="#fff"/><circle cx="29.7" cy="24.9" r="0.7" fill="#fff"/>
<ellipse cx="24" cy="35" rx="2.4" ry="1.8" fill="#3A2416"/>
<circle cx="17" cy="19.6" r="1" fill="#FFF0DC"/><circle cx="31" cy="19.6" r="1" fill="#FFF0DC"/><circle cx="24" cy="17.4" r="1" fill="#FFF0DC"/>`,
  frog: `<circle cx="16" cy="15.6" r="6" fill="#7CC456" stroke="#3F7F2E" stroke-width="1.6"/><circle cx="32" cy="15.6" r="6" fill="#7CC456" stroke="#3F7F2E" stroke-width="1.6"/>
<circle cx="16" cy="15.4" r="3.6" fill="#FFFFFF"/><circle cx="32" cy="15.4" r="3.6" fill="#FFFFFF"/><circle cx="16.4" cy="15.8" r="2.2" fill="#2B1A12"/><circle cx="31.6" cy="15.8" r="2.2" fill="#2B1A12"/><circle cx="17" cy="15" r="0.7" fill="#fff"/><circle cx="32.2" cy="15" r="0.7" fill="#fff"/>
<path d="M24 18.6 C34 18.6 41 24 41 30.6 C41 37 33.6 41.4 24 41.4 C14.4 41.4 7 37 7 30.6 C7 24 14 18.6 24 18.6 Z" fill="#8CD263" stroke="#3F7F2E" stroke-width="1.6"/>
<path d="M14 31.6 C18 35.6 30 35.6 34 31.6" fill="none" stroke="#2F6A24" stroke-width="1.6" stroke-linecap="round"/>
<ellipse cx="12.4" cy="29" rx="2.4" ry="1.4" fill="#FF9E8A" opacity="0.6"/><ellipse cx="35.6" cy="29" rx="2.4" ry="1.4" fill="#FF9E8A" opacity="0.6"/>
<circle cx="21" cy="25" r="0.8" fill="#3F7F2E"/><circle cx="27" cy="25" r="0.8" fill="#3F7F2E"/>
<path d="M12 23.4 C14.4 21.4 17.6 20.4 20.6 20.2" fill="none" stroke="#C6EC9E" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>`,
  leaf: `<path d="M24 42 V31" stroke="#6B4A2E" stroke-width="2.2" stroke-linecap="round"/>
<path d="M24 34 C21 34 19 33.6 17.6 32.6 C18.6 31.2 19 30 18.6 28.6 C16.4 29 14 28.4 12.4 26.6 C14 25.4 14.8 24 14.6 22.4 C12.6 22 11 20.6 10.6 18.6 C12.6 18 14 16.6 14.2 14.8 C16.4 15.2 18.4 14.6 19.6 12.8 C20.6 14 21.6 14.4 22.6 14 C22.4 11.4 23 8.4 24 6 C25 8.4 25.6 11.4 25.4 14 C26.4 14.4 27.4 14 28.4 12.8 C29.6 14.6 31.6 15.2 33.8 14.8 C34 16.6 35.4 18 37.4 18.6 C37 20.6 35.4 22 33.4 22.4 C33.2 24 34 25.4 35.6 26.6 C34 28.4 31.6 29 29.4 28.6 C29 30 29.4 31.2 30.4 32.6 C29 33.6 27 34 24 34 Z" fill="#8BC34A" stroke="#4E8A2A" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M24 33 V10 M24 26 L17.6 21.6 M24 26 L30.4 21.6 M24 19.6 L19 15.6 M24 19.6 L29 15.6" fill="none" stroke="#4E8A2A" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>
<path d="M15.6 18 C16.6 16.6 18 15.8 19.6 15.4" fill="none" stroke="#D6EF9E" stroke-width="1.6" stroke-linecap="round"/>
<circle cx="20.4" cy="27.6" r="1.4" fill="#2B1A12"/><circle cx="27.6" cy="27.6" r="1.4" fill="#2B1A12"/><path d="M22.4 30.4 C23.4 31.4 24.6 31.4 25.6 30.4" fill="none" stroke="#2B1A12" stroke-width="1.2" stroke-linecap="round"/>`,
  acorn: `<path d="M24 9 C24.2 6 25.6 4 28 3" fill="none" stroke="#5A3A17" stroke-width="2.4" stroke-linecap="round"/>
<path d="M12.4 21.6 C12.4 32 18 40 24 43.6 C30 40 35.6 32 35.6 21.6 Z" fill="#E0A24A" stroke="#A0662A" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M8.6 21.4 C8.6 13.2 15.6 8.4 24 8.4 C32.4 8.4 39.4 13.2 39.4 21.4 C39.4 23.4 37.8 24.6 35.8 24.2 C28 22.8 20 22.8 12.2 24.2 C10.2 24.6 8.6 23.4 8.6 21.4 Z" fill="#8A5A2B" stroke="#5A3A17" stroke-width="1.8" stroke-linejoin="round"/>
<path d="M14 19.6 L18 15.6 M20.6 20.4 L26.6 14.4 M28.6 20 L33.4 15.2 M15.4 13.6 L19.6 17.8 M23.2 12.4 L28.8 18 M31.4 14 L34.6 17.2" fill="none" stroke="#6E4520" stroke-width="1.3" stroke-linecap="round" opacity="0.75"/>
<circle cx="19.6" cy="30" r="1.8" fill="#2B1A12"/><circle cx="28.4" cy="30" r="1.8" fill="#2B1A12"/><circle cx="20.2" cy="29.4" r="0.6" fill="#fff"/><circle cx="29" cy="29.4" r="0.6" fill="#fff"/>
<path d="M21.6 34 C22.8 35.4 25.2 35.4 26.4 34" fill="none" stroke="#5A3A17" stroke-width="1.4" stroke-linecap="round"/>
<ellipse cx="16.4" cy="33.4" rx="2" ry="1.2" fill="#FF8A6A" opacity="0.6"/><ellipse cx="31.6" cy="33.4" rx="2" ry="1.2" fill="#FF8A6A" opacity="0.6"/>
<path d="M16.8 26.6 C17.2 31.4 19 35.4 21.6 38.4" fill="none" stroke="#FFE7B0" stroke-width="1.8" stroke-linecap="round" opacity="0.7"/>`,
  mushroom: `<path d="M17.4 27 C17 33 16.6 37.6 18 41.4 C21.6 42.6 26.4 42.6 30 41.4 C31.4 37.6 31 33 30.6 27 Z" fill="#FFF4E2" stroke="#B48A55" stroke-width="1.6" stroke-linejoin="round"/>
<path d="M6.6 26.4 C6.6 15.6 14.4 8.4 24 8.4 C33.6 8.4 41.4 15.6 41.4 26.4 C41.4 28.4 39.8 29.4 37.6 29 C28.8 27.4 19.2 27.4 10.4 29 C8.2 29.4 6.6 28.4 6.6 26.4 Z" fill="#E8483E" stroke="#A82A2A" stroke-width="1.6" stroke-linejoin="round"/>
<circle cx="15" cy="18" r="2.6" fill="#FFFFFF"/><circle cx="24.6" cy="13.6" r="2.2" fill="#FFFFFF"/><circle cx="32.8" cy="19.6" r="3" fill="#FFFFFF"/><circle cx="22" cy="22.4" r="1.6" fill="#FFFFFF"/><circle cx="10.6" cy="24.4" r="1.4" fill="#FFFFFF"/>
<circle cx="21" cy="34" r="1.6" fill="#2B1A12"/><circle cx="27" cy="34" r="1.6" fill="#2B1A12"/><path d="M22.6 37.4 C23.4 38.2 24.6 38.2 25.4 37.4" fill="none" stroke="#2B1A12" stroke-width="1.2" stroke-linecap="round"/>
<path d="M11 15 C13 12 16 10.4 19.2 9.8" fill="none" stroke="#FF9A8A" stroke-width="1.8" stroke-linecap="round"/>`,
  flower: `<path d="M24 42 V30" stroke="#5E9A2C" stroke-width="2.4" stroke-linecap="round"/><path d="M24 38 C20 38 16.6 36 15.6 32.4 C19.6 32 22.6 34 24 38 Z" fill="#8BC34A" stroke="#4E8A2A" stroke-width="1.2" stroke-linejoin="round"/>
<g fill="#FFFFFF" stroke="#E0A6B8" stroke-width="1.4"><ellipse cx="24" cy="11.4" rx="5.4" ry="7"/><ellipse cx="24" cy="11.4" rx="5.4" ry="7" transform="rotate(72 24 20)"/><ellipse cx="24" cy="11.4" rx="5.4" ry="7" transform="rotate(144 24 20)"/><ellipse cx="24" cy="11.4" rx="5.4" ry="7" transform="rotate(216 24 20)"/><ellipse cx="24" cy="11.4" rx="5.4" ry="7" transform="rotate(288 24 20)"/></g>
<circle cx="24" cy="20" r="7" fill="#FFD84D" stroke="#D99A1E" stroke-width="1.4"/>
<circle cx="21.6" cy="19.4" r="1.3" fill="#2B1A12"/><circle cx="26.4" cy="19.4" r="1.3" fill="#2B1A12"/><path d="M22.2 22.4 C23.2 23.4 24.8 23.4 25.8 22.4" fill="none" stroke="#2B1A12" stroke-width="1.2" stroke-linecap="round"/>
<ellipse cx="19.6" cy="22" rx="1.4" ry="0.9" fill="#FF8A6A" opacity="0.6"/><ellipse cx="28.4" cy="22" rx="1.4" ry="0.9" fill="#FF8A6A" opacity="0.6"/>`,
};
