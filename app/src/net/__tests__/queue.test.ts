import { describe, expect, it } from '@jest/globals';
import { enqueue, failed, MAX_TRIES, ownedBy, settled, waiting } from '../queue';

const cheer = { kind: 'cheer' as const, nick: 'mei', day: '2026-10-28' };
const water = { kind: 'water' as const, treeId: 's1', day: '2026-10-28' };

describe('offline queue', () => {
  it('keeps order, no doubles', () => {
    let q = enqueue([], cheer, 1, 'me');
    q = enqueue(q, water, 2, 'me');
    q = enqueue(q, { ...cheer }, 3, 'me');
    expect(q.map((x) => x.action.kind)).toEqual(['cheer', 'water']);
    expect(waiting(q, cheer)).toBe(true);
  });

  it('done goes away; failures drop it after the limit', () => {
    let q = enqueue(enqueue([], cheer, 1, 'me'), water, 2, 'me');
    q = settled(q, cheer);
    expect(q.map((x) => x.action.kind)).toEqual(['water']);
    for (let i = 0; i < MAX_TRIES; i++) q = failed(q, water);
    expect(q).toEqual([]);
  });

  it('each account sends only its own', () => {
    const q = enqueue(enqueue([], cheer, 1, 'me'), water, 2, 'other');
    expect(ownedBy(q, 'me').map((x) => x.action.kind)).toEqual(['cheer']);
  });
});
