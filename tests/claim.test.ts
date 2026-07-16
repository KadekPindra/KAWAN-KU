import { describe, it, expect } from 'vitest';
import { ClaimService, OutcomeLog } from '../src/core/claim';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';
import type { Invite, Need } from '../src/domain/types';

async function setup() {
  const repo = new InMemoryRepository();
  const need: Need = {
    id: 'n',
    teamId: 'T',
    source: 'member',
    rawText: 'raw',
    parsed: null,
    slotsTotal: 1,
    slotsOpen: 1,
    week: '2026-W29',
    status: 'open',
    createdAt: new Date(),
  };
  await repo.saveNeed(need);
  for (const personId of ['a', 'b']) {
    const invite: Invite = {
      id: `invite:p:${personId}`,
      poolId: 'p',
      personId,
      needId: 'n',
      deliveredAt: new Date(),
      state: 'shown',
      claimedAt: null,
    };
    await repo.saveInvite(invite);
  }
  return { repo, svc: new ClaimService(repo, new OutcomeLog(repo)) };
}

describe('ClaimService — atomic first-come', () => {
  it('pemenang pertama claimed, sisanya full', async () => {
    const { repo, svc } = await setup();
    expect(await svc.claim('a', 'n')).toBe('claimed');
    expect(await svc.claim('b', 'n')).toBe('full');

    const invA = await repo.findInvite('a', 'n');
    expect(invA?.state).toBe('claimed');
    expect(invA?.claimedAt).not.toBeNull();
    const invB = await repo.findInvite('b', 'n');
    expect(invB?.state).toBe('shown');
  });

  it('claim menulis outcome (label pending null) untuk pemenang', async () => {
    const { repo, svc } = await setup();
    await svc.claim('a', 'n');
    const invB = await repo.findInvite('b', 'n');
    expect(invB?.state).toBe('shown');
    expect((await repo.getNeed('n'))?.status).toBe('filled');
  });
});
