// What a tree's name may hold (wave 4 spec, 3.5): 1–20 letters of any script, numbers,
// spaces, hyphens, apostrophes and dots. No emoji, no link characters. Pure, no imports:
// both tree.ts (cleaning saved data) and naming.ts use it.

export const NAME_MAX = 20;

const ALLOWED = /^[\p{L}\p{N} '’.-]$/u;
const MARK = /^\p{M}$/u;

/** Live filter while typing: drops what is not allowed, no leading space, no double spaces, at most 20. */
export function cleanTyping(raw: string): { value: string; dropped: boolean } {
  const out: string[] = [];
  let dropped = false;
  // A mark (an accent typed apart, an emoji's variation selector) belongs to the character
  // before it: kept with a kept one, cut silently with one cut by the length, dropped otherwise.
  let before: 'kept' | 'cut' | 'none' = 'none';
  for (const ch of Array.from(raw.replace(/[\t\n\r]/g, ' '))) {
    if (MARK.test(ch)) {
      if (before === 'kept' && out.length < NAME_MAX) out.push(ch);
      else if (before === 'none') dropped = true;
      continue;
    }
    if (!ALLOWED.test(ch)) {
      dropped = true;
      before = 'none';
      continue;
    }
    if (ch === ' ' && (out.length === 0 || out[out.length - 1] === ' ')) {
      before = 'none';
      continue;
    }
    if (out.length >= NAME_MAX) {
      before = 'cut';
      continue;
    }
    out.push(ch);
    before = 'kept';
  }
  return { value: out.join(''), dropped };
}

/** On save: trimmed and checked; '' → null. */
export function finalName(value: string): string | null {
  const v = cleanTyping(value).value.trim();
  return v ? v : null;
}
