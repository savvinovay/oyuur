// How the name show splits a name into letters (wave 4 spec, section 4). Pure, tested.
// A "letter" is what a reader sees as one: a base with its accents ("й" typed as и + ˘),
// never a lone mark. Scripts written right to left, or whose letters join or stack
// (Arabic, Hebrew, Devanagari, Thai…), are not split at all: popped apart they would
// stand backwards or lose their joins, so such a name comes in whole.

const MARK = /^[\p{M}\u200C\u200D\uFE00-\uFE0F]$/u;

/** The name's letters as a reader sees them (grapheme clusters). */
export function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  // Without Intl.Segmenter (older engines): marks and joiners stay with the character before them.
  const out: string[] = [];
  for (const ch of Array.from(text)) {
    if (out.length > 0 && MARK.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

// Right-to-left scripts (Hebrew, Arabic, Syriac, Thaana, N'Ko, Samaritan, Mandaic and their
// presentation forms) and scripts with joined or stacked letters (the Indic family,
// Sinhala, Thai, Lao, Tibetan, Myanmar, Khmer, Mongolian).
const WHOLE = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u0900-\u0DFF\u0E00-\u0FFF\u1000-\u109F\u1780-\u18AF\uA8E0-\uA8FF\uA9E0-\uA9FF\uAA60-\uAA7F]/u;

/** False: the name comes in whole (one soft fade), not letter by letter. */
export function lettersApart(text: string): boolean {
  return !WHOLE.test(text);
}
