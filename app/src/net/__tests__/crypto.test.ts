// The chest's locks (OYUUR-31, design/oyuur-31/план.md): boxes and the chest open only with the
// right key and only as what they were sealed as; known AES-256-GCM vectors.
import { describe, expect, it, jest } from '@jest/globals';
import { gcm } from '@noble/ciphers/aes.js';
import { CryptoError, isCryptoError, kidOf, newDek, openVault, PAD, sealVault, unwrapDek, wrapDek } from '../crypto';
import { deriveKeys, fromBase64url, toBase64url } from '../kdf';

jest.mock('expo-crypto', () => ({ getRandomValues: (a: Uint8Array) => require('node:crypto').randomFillSync(a) }));

// Node's own crypto, to check against (the app never loads it).
declare function require(name: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
const node = require('node:crypto');
const hex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => parseInt(b, 16)));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const same = (a: Uint8Array, b: Uint8Array) => toHex(a) === toHex(b);
const rnd = (n: number) => new Uint8Array(node.randomBytes(n));
const problemOf = (run: () => unknown) => {
  try {
    run();
  } catch (e) {
    return e instanceof CryptoError ? e.problem : `other:${(e as Error).message}`;
  }
  return 'none';
};

const forest = {
  v: 1,
  trees: [{ id: 't1', lineageId: 'l1', name: 'Не курить', checkins: ['2026-10-01', '2026-10-02'], visibility: 'private' }],
  places: { l1: { dc: 0, dr: -1, at: '1' } },
  ledger: { 'w:t1:2026-10-01': 5 },
  tombs: {},
};

describe('AES-256-GCM (the library itself)', () => {
  it('matches the NIST/McGrew–Viega test case 16 (256-bit key, aad)', () => {
    const key = hex('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308');
    const iv = hex('cafebabefacedbaddecaf888');
    const pt = hex('d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39');
    const aad = hex('feedfacedeadbeeffeedfacedeadbeefabaddad2');
    const out = gcm(key, iv, aad).encrypt(pt);
    expect(toHex(out.subarray(0, pt.length))).toBe(
      '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662',
    );
    expect(toHex(out.subarray(pt.length))).toBe('76fc6ece0f4e1768cddf8853bb2d551b');
  });

  it('agrees with Node’s own AES-256-GCM on random data', () => {
    const key = rnd(32);
    const iv = rnd(12);
    const aad = rnd(20);
    const pt = rnd(1000);
    const c = node.createCipheriv('aes-256-gcm', key, iv);
    c.setAAD(aad);
    const want = new Uint8Array([...c.update(pt), ...c.final(), ...c.getAuthTag()]);
    expect(same(gcm(key, iv, aad).encrypt(pt), want)).toBe(true);
  });
});

describe('boxes (the data key locked by the password or the code)', () => {
  it('a box opens with the same key and gives the same data key', () => {
    const dek = newDek(rnd);
    const wk = rnd(32);
    const kid = kidOf(dek);
    const box = wrapDek(dek, wk, 'p', rnd);
    expect(same(unwrapDek(box, wk, 'p', kid), dek)).toBe(true);
  });

  it('two boxes of the same key never look the same (fresh nonce)', () => {
    const dek = newDek(rnd);
    const wk = rnd(32);
    expect(wrapDek(dek, wk, 'p', rnd)).not.toBe(wrapDek(dek, wk, 'p', rnd));
  });

  it('a wrong key, the other box’s label, another kid or a changed byte: bad_key, never garbage', () => {
    const dek = newDek(rnd);
    const wk = rnd(32);
    const kid = kidOf(dek);
    const box = wrapDek(dek, wk, 'p', rnd);
    expect(problemOf(() => unwrapDek(box, rnd(32), 'p', kid))).toBe('bad_key');
    expect(problemOf(() => unwrapDek(box, wk, 'r', kid))).toBe('bad_key');
    expect(problemOf(() => unwrapDek(box, wk, 'p', kidOf(rnd(32))))).toBe('bad_key');
    const bytes = fromBase64url(box);
    bytes[20] ^= 1;
    expect(problemOf(() => unwrapDek(toBase64url(bytes), wk, 'p', kid))).toBe('bad_key');
    expect(problemOf(() => unwrapDek('', wk, 'p', kid))).toBe('bad_key');
  });

  it('password → wrapKey → box → the same key on another device', async () => {
    const kdf = { alg: 'scrypt' as const, N: 2 ** 15, r: 8, p: 1, salt: toBase64url(rnd(16)) };
    const dek = newDek(rnd);
    const phone = await deriveKeys('пароль-123', kdf);
    const box = wrapDek(dek, phone.wrapKey, 'p', rnd);
    const browser = await deriveKeys('пароль-123', kdf);
    expect(same(unwrapDek(box, browser.wrapKey, 'p', kidOf(dek)), dek)).toBe(true);
    const wrong = await deriveKeys('пароль-124', kdf);
    expect(problemOf(() => unwrapDek(box, wrong.wrapKey, 'p', kidOf(dek)))).toBe('bad_key');
    // The sign-in key the server sees is not the box key.
    expect(phone.authKey).not.toBe(toBase64url(phone.wrapKey));
  });
});

describe('the chest', () => {
  const userId = 'u-1';

  it('seals and opens on another device; nothing readable inside the envelope', () => {
    const dek = newDek(rnd);
    const env = sealVault(forest, dek, { userId, seq: 3 }, rnd);
    expect(env).toMatchObject({ v: 1, kid: kidOf(dek), seq: 3 });
    const text = JSON.stringify(env);
    for (const secret of ['Не курить', 'курить', 'private', 'checkins', 'lineageId', '2026-10-0']) expect(text).not.toContain(secret);
    expect(openVault(env, Uint8Array.from(dek), { userId })).toEqual(forest);
  });

  it('is padded to 4 KB: one tree and thirty trees can weigh the same', () => {
    const dek = newDek(rnd);
    const one = sealVault(forest, dek, { userId, seq: 1 }, rnd);
    const many = sealVault({ ...forest, trees: Array.from({ length: 30 }, (_, i) => ({ ...forest.trees[0], id: `t${i}` })) }, dek, { userId, seq: 1 }, rnd);
    expect(fromBase64url(one.c).length).toBe(PAD + 16);
    expect(one.c.length).toBe(many.c.length);
  });

  it('a wrong key: wrong_kid; same kid but changed bytes, another account or another seq: broken', () => {
    const dek = newDek(rnd);
    const env = sealVault(forest, dek, { userId, seq: 2 }, rnd);
    expect(problemOf(() => openVault(env, newDek(rnd), { userId }))).toBe('wrong_kid');
    expect(problemOf(() => openVault(env, dek, { userId: 'u-2' }))).toBe('broken');
    expect(problemOf(() => openVault({ ...env, seq: 5 }, dek, { userId }))).toBe('broken');
    const c = fromBase64url(env.c);
    c[100] ^= 1;
    expect(problemOf(() => openVault({ ...env, c: toBase64url(c) }, dek, { userId }))).toBe('broken');
    expect(problemOf(() => openVault({ ...env, n: toBase64url(rnd(12)) }, dek, { userId }))).toBe('broken');
    expect(problemOf(() => openVault({ v: 2 }, dek, { userId }))).toBe('broken');
    expect(problemOf(() => openVault(null, dek, { userId }))).toBe('broken');
  });

  it('an older version than one already seen is refused (rollback)', () => {
    const dek = newDek(rnd);
    const env = sealVault(forest, dek, { userId, seq: 4 }, rnd);
    expect(problemOf(() => openVault(env, dek, { userId, minSeq: 5 }))).toBe('rollback');
    expect(openVault(env, dek, { userId, minSeq: 4 })).toEqual(forest);
  });

  it('isCryptoError tells the problem', () => {
    expect(isCryptoError(new CryptoError('broken'), 'broken')).toBe(true);
    expect(isCryptoError(new Error('broken'))).toBe(false);
  });

  it('a big forest (200 trees × a year) stays far under the server’s 1 MB', () => {
    const dek = newDek(rnd);
    const days = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
    const big = { ...forest, trees: Array.from({ length: 200 }, (_, i) => ({ ...forest.trees[0], id: `tree-${i}`, checkins: days })) };
    const env = sealVault(big, dek, { userId, seq: 1 }, rnd);
    expect(JSON.stringify(env).length).toBeLessThan(200 * 1024);
    expect(openVault(env, dek, { userId })).toEqual(big);
  });
});
