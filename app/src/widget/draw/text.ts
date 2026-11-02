// Words on a widget never get cut in the middle (спец 7.1): a name first loses 1 dp of size, then whole
// words with "…". The widget is a picture drawn without a text engine at hand, so the width is estimated
// from Nunito's letter widths (a little generous: a guess too wide only drops a word early). Pure.
import type { Lang } from '@/i18n';

// Advance widths of Nunito Black, in em, by kind of letter (measured on the font, rounded up).
const NARROW = new Set("iljtfrI!|.,:;'’ ·()[]-");
const WIDE = new Set('mwMWмшщжюыШЩЖЮМЫФфQ@%');
function charEm(ch: string): number {
  if (ch === ' ' || ch === ' ' || ch === ' ') return 0.26;
  if (ch === '…') return 0.82;
  if (NARROW.has(ch)) return 0.3;
  if (WIDE.has(ch)) return 0.86;
  if (/[0-9]/.test(ch)) return 0.6;
  if (/[A-ZА-ЯЁ]/.test(ch)) return 0.7;
  return 0.58;
}

/** The width of a line in dp at a font size; 800 is a little narrower than 900. */
export function textWidth(text: string, size: number, weight: 800 | 900 = 900): number {
  let em = 0;
  for (const ch of text) em += charEm(ch);
  return em * size * (weight === 800 ? 0.97 : 1);
}

/** Cut a line to whole words that fit, with "…"; a single word longer than the line is cut by letters (no other way). */
function cutWords(text: string, maxW: number, size: number, weight: 800 | 900): string {
  if (textWidth(text, size, weight) <= maxW) return text;
  const words = text.split(' ');
  for (let n = words.length - 1; n >= 1; n--) {
    const line = `${words.slice(0, n).join(' ').replace(/[\s,.:;·-]+$/, '')}…`;
    if (textWidth(line, size, weight) <= maxW) return line;
  }
  let out = text;
  while (out.length > 1 && textWidth(`${out}…`, size, weight) > maxW) out = out.slice(0, -1);
  return `${out}…`;
}

/** Greedy wrap into lines of whole words. */
function wrap(text: string, maxW: number, size: number, weight: 800 | 900): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (!line || textWidth(next, size, weight) <= maxW) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * A habit's name in a place `maxW` wide (спец 7.1, 3): one line or up to two; first the size goes down by 1 dp,
 * then whole words go with "…". Returns the lines and the size to draw them at.
 */
export function fitName(text: string, maxW: number, size: number, lines: 1 | 2 = 1, weight: 800 | 900 = 800): { lines: string[]; size: number } {
  const clean = text.replace(/\s+/g, ' ').trim();
  for (const s of [size, size - 1]) {
    const w = wrap(clean, maxW, s, weight);
    if (w.length <= lines && w.every((l) => textWidth(l, s, weight) <= maxW)) return { lines: w, size: s };
  }
  const s = size - 1;
  if (lines === 1) return { lines: [cutWords(clean, maxW, s, weight)], size: s };
  const w = wrap(clean, maxW, s, weight);
  const first = textWidth(w[0], s, weight) <= maxW ? w[0] : cutWords(w[0], maxW, s, weight);
  const rest = clean.slice(clean.indexOf(w[0]) + w[0].length).trim();
  return { lines: rest ? [first, cutWords(rest, maxW, s, weight)] : [first], size: s };
}

/** Numbers without shortening up to 99 999 (RU "1 284" with a narrow space, EN "1,284"); then "100 тыс." / "100K" (спец 7.1). */
export function formatNumber(n: number, lang: Lang, thousands: string): string {
  if (n >= 100_000) return thousands.replace('{n}', String(Math.floor(n / 1000)));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'ru' ? ' ' : ',');
}
