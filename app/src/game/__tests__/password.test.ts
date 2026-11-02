import { describe, expect, it } from '@jest/globals';
import { passwordProblem } from '../password';

describe('new password', () => {
  it('needs 8 characters', () => {
    expect(passwordProblem('')).toBe('short');
    expect(passwordProblem('Kx7#pQ2')).toBe('short');
    expect(passwordProblem('Kx7#pQ2m')).toBeNull();
  });

  it('refuses the most common ones, any case', () => {
    for (const p of ['123456789', 'password', 'Qwerty123', 'iloveyou', '11111111', '1q2w3e4r', 'ЙЦУКЕНГШЩЗ', 'пароль123', 'qwertyuiop', 'zaq12wsx', 'Password2026!'])
      expect([p, passwordProblem(p)]).toEqual([p, 'common']);
  });

  it('refuses trivial patterns', () => {
    for (const p of ['aaaaaaaa', '12121212', 'abcabcabc', '12345678', '87654321', 'qwertyui', 'asdfghjk', 'фывапрол', 'zyxwvuts', '!!!!!!!!'])
      expect([p, passwordProblem(p)]).toEqual([p, 'common']);
  });

  it('refuses the nick itself', () => {
    expect(passwordProblem('sasha_t', 'sasha_t')).toBe('short');
    expect(passwordProblem('forest_owl', 'forest_owl')).toBe('common');
    expect(passwordProblem('forest_owl1987', '@forest_owl')).toBe('common');
    expect(passwordProblem('forest_owl1987', 'other')).toBeNull();
  });

  it('lets real passwords through', () => {
    for (const p of ['лес у реки 2026', 'correct horse battery', 'Kx7#pQ2mZ', 'дубок-и-клён', 'sasha1987tree'])
      expect([p, passwordProblem(p)]).toEqual([p, null]);
  });
});
