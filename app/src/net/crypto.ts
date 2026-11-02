// The chest of hidden trees (OYUUR-31, design/oyuur-31/план.md; design/oyuur-29/спец.md 3, Т4).
// - The data key (DEK, 32 random bytes) locks the chest: every "Only me" tree with its places, its
//   acorns and the deleted hidden habits. It is made once per account and never changes.
// - The server keeps the DEK only locked twice ("boxes"): wrapP with the key made from the password,
//   wrapR with the key made from the recovery code (net/kdf.ts: `wrapKey`, an HKDF label the server
//   never gets). So the server can let a person in, but can't open the chest.
// - Everything is AES-256-GCM (@noble/ciphers, audited) with a fresh random 12-byte nonce each time;
//   what a box or the chest belongs to is bound in the associated data (a box to its key id, the
//   chest to the account, its version `seq` and the key id), so nothing can be swapped unnoticed.
// - The chest is deflated (fflate) and padded with zeros to a multiple of 4 KB: its size doesn't
//   tell how many hidden trees there are.
// Nothing here logs: keys, trees and names never reach a console, analytics or a widget.
import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { deflateSync, inflateSync, strFromU8 } from 'fflate';
import { fromBase64url, randomBytes, toBase64url } from './kdf';

export const DEK_BYTES = 32;
const NONCE_BYTES = 12;
/** The chest is padded to a multiple of this. */
export const PAD = 4096;
/** The largest chest the server takes (1 MB of base64url): a bigger one is refused here. */
const MAX_PLAIN = 700 * 1024;

/**
 * What went wrong — never "garbage" instead of data:
 * 'bad_key'  — a box didn't open (wrong password or code, or a damaged box);
 * 'wrong_kid' — the chest is locked with another data key (a new one was made on another device);
 * 'broken'   — the chest is damaged or not ours;
 * 'rollback' — an older chest than one already seen (never taken);
 * 'too_big'  — the chest wouldn't fit on the server.
 */
export type CryptoProblem = 'bad_key' | 'wrong_kid' | 'broken' | 'rollback' | 'too_big';

export class CryptoError extends Error {
  constructor(readonly problem: CryptoProblem) {
    super(problem);
    this.name = 'CryptoError';
  }
}

export const isCryptoError = (e: unknown, problem?: CryptoProblem): e is CryptoError =>
  e instanceof CryptoError && (problem === undefined || e.problem === problem);

const utf8 = (text: string) => new TextEncoder().encode(text);

/** A new data key. */
export const newDek = (random: (n: number) => Uint8Array = randomBytes): Uint8Array => {
  const dek = random(DEK_BYTES);
  if (dek.length !== DEK_BYTES) throw new Error('bad_random');
  return dek;
};

/** Which data key: the first 8 bytes of its SHA-256 (it says nothing about the key itself). */
export const kidOf = (dek: Uint8Array): string => toBase64url(sha256(dek).subarray(0, 8));

function seal(key: Uint8Array, aad: Uint8Array, plain: Uint8Array, random: (n: number) => Uint8Array): Uint8Array {
  const nonce = random(NONCE_BYTES);
  if (nonce.length !== NONCE_BYTES) throw new Error('bad_random');
  const sealed = gcm(key, nonce, aad).encrypt(plain);
  const out = new Uint8Array(NONCE_BYTES + sealed.length);
  out.set(nonce);
  out.set(sealed, NONCE_BYTES);
  return out;
}

/** Opens what `seal` made; any change to the key, the nonce, the data or the aad throws. */
function unseal(key: Uint8Array, aad: Uint8Array, box: Uint8Array): Uint8Array {
  if (box.length < NONCE_BYTES + 16) throw new Error('short');
  return gcm(key, box.subarray(0, NONCE_BYTES), aad).decrypt(box.subarray(NONCE_BYTES));
}

// ---- Boxes ----

/** 'p' — opened by the password, 'r' — by the recovery code. */
export type Box = 'p' | 'r';
const boxAad = (which: Box, kid: string) => utf8(`oyuur/wrap/${which}/v1/${kid}`);

/** The data key locked with a key made from the password or the code (kdf.ts `wrapKey`). */
export function wrapDek(dek: Uint8Array, wrapKey: Uint8Array, which: Box, random: (n: number) => Uint8Array = randomBytes): string {
  if (dek.length !== DEK_BYTES || wrapKey.length !== 32) throw new Error('bad_key_length');
  return toBase64url(seal(wrapKey, boxAad(which, kidOf(dek)), dek, random));
}

/** The data key out of a box; `kid` is what the account says it is. Throws CryptoError('bad_key'). */
export function unwrapDek(wrap: string, wrapKey: Uint8Array, which: Box, kid: string): Uint8Array {
  let dek: Uint8Array;
  try {
    dek = unseal(wrapKey, boxAad(which, kid), fromBase64url(wrap));
  } catch {
    throw new CryptoError('bad_key');
  }
  if (dek.length !== DEK_BYTES || kidOf(dek) !== kid) throw new CryptoError('bad_key');
  return dek;
}

// ---- The chest ----

/** The chest as the server keeps it (the 'vault' record): opaque. */
export interface VaultEnvelope {
  v: 1;
  kid: string;
  seq: number;
  n: string;
  c: string;
}

const vaultAad = (userId: string, seq: number, kid: string) => utf8(`oyuur/vault/v1/${userId}/${seq}/${kid}`);

export const isEnvelope = (v: unknown): v is VaultEnvelope => {
  if (!v || typeof v !== 'object') return false;
  const e = v as Partial<VaultEnvelope>;
  return e.v === 1 && typeof e.kid === 'string' && Number.isInteger(e.seq) && (e.seq as number) >= 0 && typeof e.n === 'string' && typeof e.c === 'string';
};

/** Locks the chest's content (any JSON) as version `seq` of this account's chest. */
export function sealVault(
  content: unknown,
  dek: Uint8Array,
  { userId, seq }: { userId: string; seq: number },
  random: (n: number) => Uint8Array = randomBytes,
): VaultEnvelope {
  if (!userId || !Number.isInteger(seq) || seq < 0) throw new Error('bad_vault_args');
  const packed = deflateSync(utf8(JSON.stringify(content)), { level: 6 });
  if (packed.length > MAX_PLAIN) throw new CryptoError('too_big');
  const size = Math.ceil((4 + packed.length) / PAD) * PAD;
  const padded = new Uint8Array(size);
  new DataView(padded.buffer).setUint32(0, packed.length);
  padded.set(packed, 4);
  const kid = kidOf(dek);
  const box = seal(dek, vaultAad(userId, seq, kid), padded, random);
  return { v: 1, kid, seq, n: toBase64url(box.subarray(0, NONCE_BYTES)), c: toBase64url(box.subarray(NONCE_BYTES)) };
}

/**
 * Opens a chest of this account. `minSeq` — the highest version already seen here: an older one
 * is refused ('rollback'). Never returns something half-read: any doubt throws.
 */
export function openVault(env: unknown, dek: Uint8Array, { userId, minSeq = 0 }: { userId: string; minSeq?: number }): unknown {
  if (!isEnvelope(env)) throw new CryptoError('broken');
  if (env.kid !== kidOf(dek)) throw new CryptoError('wrong_kid');
  if (env.seq < minSeq) throw new CryptoError('rollback');
  let padded: Uint8Array;
  try {
    const n = fromBase64url(env.n);
    const c = fromBase64url(env.c);
    if (n.length !== NONCE_BYTES) throw new Error('nonce');
    const box = new Uint8Array(n.length + c.length);
    box.set(n);
    box.set(c, n.length);
    padded = unseal(dek, vaultAad(userId, env.seq, env.kid), box);
  } catch {
    throw new CryptoError('broken');
  }
  try {
    if (padded.length < 4 || padded.length % PAD !== 0) throw new Error('pad');
    const len = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(0);
    if (len > padded.length - 4) throw new Error('len');
    // fflate's own UTF-8 (Hermes may have no TextDecoder).
    const text = strFromU8(inflateSync(padded.subarray(4, 4 + len)));
    return JSON.parse(text);
  } catch {
    // Authentic but unreadable: written by a newer or broken app. Still never taken as empty.
    throw new CryptoError('broken');
  }
}
