// Small color math for the design system: mixing (muted glyphs) and WCAG contrast.

type Rgba = [number, number, number, number];

/** Reads '#RGB', '#RRGGBB' and 'rgb(a)(r, g, b[, a])'. */
export function parseColor(color: string): Rgba {
  const c = color.trim();
  if (c.startsWith('#')) {
    const hex = c.length === 4 ? c.slice(1).split('').map((x) => x + x).join('') : c.slice(1, 7);
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Unknown color ${color}`);
  const [r, g, b, a = 1] = m[1].split(',').map((x) => Number(x));
  return [r, g, b, a];
}

const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/** `a` moved toward `b` by `t` (0 — a, 1 — b). Keeps `a`'s alpha. */
export function mixColor(a: string, b: string, t: number): string {
  const [ar, ag, ab, aa] = parseColor(a);
  const [br, bg, bb] = parseColor(b);
  const r = ar + (br - ar) * t;
  const g = ag + (bg - ag) * t;
  const bl = ab + (bb - ab) * t;
  return aa < 1 ? `rgba(${Math.round(r)},${Math.round(g)},${Math.round(bl)},${aa})` : `#${hex2(r)}${hex2(g)}${hex2(bl)}`;
}

/** `color` with its alpha replaced. */
export function withAlpha(color: string, alpha: number): string {
  const [r, g, b] = parseColor(color);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** A see-through color laid over an opaque one. */
export function over(top: string, bottom: string): string {
  const [tr, tg, tb, ta] = parseColor(top);
  const [br, bg, bb] = parseColor(bottom);
  return `#${hex2(tr * ta + br * (1 - ta))}${hex2(tg * ta + bg * (1 - ta))}${hex2(tb * ta + bb * (1 - ta))}`;
}

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (color: string) => {
  const [r, g, b] = parseColor(color);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** WCAG contrast ratio of two opaque colors, 1…21. */
export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (la + 0.05) / (lb + 0.05);
}
