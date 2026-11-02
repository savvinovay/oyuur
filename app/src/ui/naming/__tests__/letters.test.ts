import { describe, expect, it } from '@jest/globals';
import { graphemes, lettersApart } from '../letters';

describe('graphemes', () => {
  it('splits plain names letter by letter', () => {
    expect(graphemes('Дубок')).toEqual(['Д', 'у', 'б', 'о', 'к']);
    expect(graphemes('Oak II')).toEqual(['O', 'a', 'k', ' ', 'I', 'I']);
  });

  it('keeps an accent typed apart with its letter', () => {
    // и + combining breve, e + combining acute
    expect(graphemes('Ми\u0306ка')).toEqual(['М', 'и\u0306', 'к', 'а']);
    expect(graphemes('Rene\u0301')).toEqual(['R', 'e', 'n', 'e\u0301']);
  });

  it('keeps marks with their letter without Intl.Segmenter too', () => {
    const intl = Intl as unknown as { Segmenter?: unknown };
    const saved = intl.Segmenter;
    intl.Segmenter = undefined;
    try {
      expect(graphemes('Ми\u0306ка')).toEqual(['М', 'и\u0306', 'к', 'а']);
      expect(graphemes('Ze\u0301\u0301')).toEqual(['Z', 'e\u0301\u0301']);
      expect(graphemes('')).toEqual([]);
    } finally {
      intl.Segmenter = saved;
    }
  });
});

describe('lettersApart', () => {
  it('pops Latin, Cyrillic, Greek and CJK letters one by one', () => {
    expect(lettersApart('Дубок')).toBe(true);
    expect(lettersApart('Sakura')).toBe(true);
    expect(lettersApart('Δάφνη')).toBe(true);
    expect(lettersApart('桜')).toBe(true);
  });

  it('brings right-to-left and joined scripts in whole', () => {
    expect(lettersApart('زيتون')).toBe(false); // Arabic
    expect(lettersApart('אלון')).toBe(false); // Hebrew
    expect(lettersApart('बरगद')).toBe(false); // Devanagari
    expect(lettersApart('ต\u0E49นไม\u0E49')).toBe(false); // Thai
    expect(lettersApart('Oak زيتون')).toBe(false); // mixed: whole
  });
});
