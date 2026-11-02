import { describe, expect, it, jest } from '@jest/globals';
import { scrypt } from '@noble/hashes/scrypt.js';
import { CODE_ABC, deriveKeys, fromBase64url, isKdf, Kdf, newKdf, newRecoveryCode, normCode, toBase64url } from '../kdf';

jest.mock('expo-crypto', () => ({ getRandomValues: (a: Uint8Array) => require('node:crypto').randomFillSync(a) }));

// Node's own crypto, to check against (the app never loads it).
declare function require(name: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
const { createHmac, hkdfSync, randomBytes: nodeRandom, scryptSync } = require('node:crypto');
const { Buffer } = require('node:buffer');
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

describe('kdf', () => {
  it('scrypt gives the RFC 7914 test vector', () => {
    const out = scrypt('password', 'NaCl', { N: 1024, r: 8, p: 16, dkLen: 64 });
    expect(hex(out)).toBe(
      'fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b3731622eaf30d92e22a3886ff109279d9830dac727afb94a83ee6d8360cbdfa2cc0640',
    );
  });

  it('keys match node:crypto (scryptSync + hkdfSync)', async () => {
    const salt = toBase64url(new Uint8Array(nodeRandom(16)));
    const kdf: Kdf = { alg: 'scrypt', N: 2 ** 15, r: 8, p: 1, salt };
    const keys = await deriveKeys('пароль é', kdf);
    const master = scryptSync(Buffer.from('пароль é', 'utf8'), Buffer.from(fromBase64url(salt)), 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const auth = new Uint8Array(hkdfSync('sha256', master, Buffer.from(fromBase64url(salt)), 'oyuur/auth/v1', 32));
    const wrap = new Uint8Array(hkdfSync('sha256', master, Buffer.from(fromBase64url(salt)), 'oyuur/wrap/v1', 32));
    expect(keys.authKey).toBe(Buffer.from(auth).toString('base64url'));
    expect(keys.authKey).toHaveLength(43);
    expect(hex(keys.wrapKey)).toBe(hex(wrap));
    expect(keys.authKey).not.toBe(toBase64url(keys.wrapKey));
  });

  it('base64url round-trips like Buffer', () => {
    for (const n of [0, 1, 2, 3, 16, 31, 32]) {
      const b = new Uint8Array(nodeRandom(n));
      expect(toBase64url(b)).toBe(Buffer.from(b).toString('base64url'));
      expect(hex(fromBase64url(toBase64url(b)))).toBe(hex(b));
    }
    // A salt the server makes from a nick (HMAC) decodes too.
    const s = createHmac('sha256', 'k').update('nick').digest().subarray(0, 16).toString('base64url');
    expect(fromBase64url(s)).toHaveLength(16);
  });

  it('new parameters: N 2^15, 16 bytes of salt', () => {
    const k = newKdf();
    expect(isKdf(k)).toBe(true);
    expect(k.N).toBe(2 ** 15);
    expect(fromBase64url(k.salt)).toHaveLength(16);
    expect(newKdf().salt).not.toBe(k.salt);
  });

  it('refuses parameters out of range', () => {
    expect(isKdf({ alg: 'scrypt', N: 2 ** 12, r: 8, p: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA' })).toBe(false);
    // Cheaper than the phone's own N: a server asking for it would make guessing faster.
    expect(isKdf({ alg: 'scrypt', N: 2 ** 13, r: 8, p: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA' })).toBe(false);
    expect(isKdf({ alg: 'scrypt', N: 2 ** 14, r: 8, p: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA' })).toBe(false);
    expect(isKdf({ alg: 'scrypt', N: 2 ** 15, r: 8, p: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA' })).toBe(true);
    expect(isKdf({ alg: 'scrypt', N: 3 * 2 ** 13, r: 8, p: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA' })).toBe(false);
    expect(isKdf(null)).toBe(false);
    return expect(deriveKeys('x', { alg: 'scrypt', N: 2 ** 20, r: 8, p: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA' })).rejects.toThrow('bad_kdf');
  });

  it('recovery code: 12 letters of the alphabet, no bias', () => {
    const code = newRecoveryCode();
    expect(code).toMatch(new RegExp(`^[${CODE_ABC}]{12}$`));
    // Bytes 248..255 are thrown away: all-255 bytes then all-0 bytes give "aaaa…".
    let calls = 0;
    const fake = (n: number) => new Uint8Array(n).fill(calls++ === 0 ? 255 : 0);
    expect(newRecoveryCode(fake)).toBe('a'.repeat(12));
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) for (const ch of newRecoveryCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(CODE_ABC.length);
  });

  it('a code typed in any case, with spaces or hyphens, is the same code', () => {
    expect(normCode('ABCD-efgh jkmn')).toBe('abcdefghjkmn');
  });
});
