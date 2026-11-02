// The chest of hidden trees in the account (OYUUR-31, design/oyuur-31/план.md; design/oyuur-29/спец.md
// Т4.4). Pure functions over the sync's bookkeeping (`Meta`), used by state/sync.tsx:
// - written only with this device's data key, and only when it is the account's key (`m.kid`);
// - "changed" is the hash of the OPEN content (`sent.vault`): the lock is new every time (nonce);
// - a chest that doesn't open is never written over (`vaultBroken`), and is looked at afresh every
//   round (readFrom, noteChestGone); an older version than one already seen (`rollback`) is never
//   taken — ours, newer, is written over it.
// Nothing here logs: what is inside never reaches a console, analytics or an error message.
import { isCryptoError, isEnvelope, openVault, sealVault } from '@/net/crypto';
import type { StoredDek } from '@/net/dekStore';
import type { SyncWrite } from '@/net/api';
import { canonChest, Chest, chestContent, ChestContent, DELETED, Forest, hashBody, isEmptyChest, Meta, parseChest, SyncRecord } from './records';

/** This device may lock the chest: it has the account's key, and the account's chest isn't damaged. */
export const canSeal = (m: Meta, key: StoredDek | null): key is StoredDek => !!key && m.kid === key.kid && !m.vaultBroken;

/** The account keeps a live chest (as far as this device knows). */
export const accountHasChest = (m: Meta) => m.revs.vault !== undefined && m.sent.vault !== DELETED;

/** Versions are counted per key: a new key starts from 0. */
export const seenSeq = (m: Meta, kid: string) => (m.seqKid === kid ? m.vaultSeq : 0);

/**
 * The chest differs from what the account has: its content and the hash of it. Nothing to send:
 * null. An empty chest only empties one the account keeps (the last hidden tree went).
 */
export function vaultChange(f: Forest, m: Meta): { content: ChestContent; hash: string } | null {
  const content = chestContent(f);
  const hash = hashBody(content);
  if (hash === m.sent.vault) return null;
  if (isEmptyChest(content) && !accountHasChest(m)) return null;
  return { content, hash };
}

/** The chest locked as its next version, to send: or null (nothing changed, or this device may not). */
export function vaultWrite(f: Forest, m: Meta, key: StoredDek | null, userId: string): (SyncWrite & { hash: string; seq: number }) | null {
  if (!canSeal(m, key)) return null;
  const change = vaultChange(f, m);
  if (!change) return null;
  const seq = seenSeq(m, key.kid) + 1;
  return { key: 'vault', base: m.revs.vault ?? 0, body: sealVault(change.content, key.dek, { userId, seq }), hash: change.hash, seq };
}

/** The chest was saved as version `seq`: what the account has now. */
export function noteVaultSaved(m: Meta, rev: number, hash: string, seq: number, kid: string): void {
  m.revs.vault = rev;
  m.sent.vault = hash;
  m.vaultSeq = Math.max(seenSeq(m, kid), seq);
  m.seqKid = kid;
}

/**
 * The account's chest record, as it came (`noteRecord` has already run): opened when this device
 * has its key. Returns what it holds, or null — a tombstone, not ours to open (another key: the
 * device is "locked"), an older version (ours goes over it), or damaged (`vaultBroken`: never
 * written over, the forest here is not touched).
 */
export function takeVault(m: Meta, r: SyncRecord, key: StoredDek | null, userId: string): Chest | null {
  if (r.key !== 'vault') return null;
  if (r.deleted || r.body === null) {
    // No chest any more (a new key on another device, an erase): nothing damaged to keep away from.
    m.vaultBroken = false;
    return null;
  }
  if (!isEnvelope(r.body)) {
    if (key) m.vaultBroken = true;
    return null;
  }
  if (!key || r.body.kid !== key.kid) return null;
  let chest: Chest | null = null;
  try {
    chest = parseChest(openVault(r.body, key.dek, { userId, minSeq: seenSeq(m, key.kid) }));
  } catch (e) {
    if (isCryptoError(e, 'rollback')) return null;
    m.vaultBroken = true;
    return null;
  }
  if (!chest) {
    m.vaultBroken = true;
    return null;
  }
  m.vaultBroken = false;
  m.vaultSeq = Math.max(seenSeq(m, key.kid), r.body.seq);
  m.seqKid = key.kid;
  m.sent.vault = hashBody(canonChest(chest));
  return chest;
}

/**
 * Where a round reads the account from. A chest that didn't open is looked at afresh every round
 * ("Try again", every start): the whole account again — its record may have been removed, fixed or
 * replaced by a version that opens. Merging twice changes nothing.
 */
export const readFrom = (m: Meta): number => (m.vaultBroken ? 0 : m.lastRev);

/**
 * After a whole re-read (readFrom 0) for a damaged chest: no chest record at all means it is gone
 * from the account — nothing damaged to keep away from, and the next chest starts anew. A record
 * that came is judged by takeVault (opens — the flag goes; damaged — it stays, never written over).
 */
export function noteChestGone(m: Meta, records: SyncRecord[], whole: boolean): void {
  if (!whole || !m.vaultBroken || records.some((r) => r.key === 'vault')) return;
  m.vaultBroken = false;
  delete m.revs.vault;
  delete m.sent.vault;
}

/** The chests among records (later ones last), opened and put together into one. */
export function takeVaults(m: Meta, records: SyncRecord[], key: StoredDek | null, userId: string): Chest | null {
  let out: Chest | null = null;
  for (const r of records) {
    if (r.key !== 'vault') continue;
    const chest = takeVault(m, r, key, userId);
    // A later record of the key is the account's chest now; an earlier one adds nothing it lacks
    // (merging is a union), so taking the latest that opened is enough.
    if (chest) out = chest;
  }
  return out;
}
