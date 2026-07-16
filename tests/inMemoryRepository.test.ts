import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';
import type { Need, Person, Screening } from '../src/domain/types';

function person(id: string, teamId = 'T'): Person {
  return {
    id,
    teamId,
    displayName: id,
    slackUserId: null,
    joinedAt: new Date('2026-01-01'),
    interests: [],
    optedIn: true,
    riskConsent: false,
  };
}

function screening(personId: string, cycle: string, teamId = 'T'): Screening {
  return {
    id: `${personId}-${cycle}`,
    teamId,
    personId,
    cycle,
    q1: null,
    q2: null,
    q3: null,
    ucla3Score: null,
    lonely: null,
    deliveredAt: null,
    answeredAt: null,
    createdAt: new Date('2026-01-01'),
  };
}

function need(id: string, slots: number, teamId = 'T', week = '2026-W01'): Need {
  return {
    id,
    teamId,
    source: 'member',
    rawText: 'butuh 1 lagi futsal',
    parsed: null,
    slotsTotal: slots,
    slotsOpen: slots,
    week,
    status: 'open',
    createdAt: new Date('2026-01-01'),
  };
}

describe('InMemoryRepository', () => {
  it('person round-trip terisolasi dari mutasi pemanggil', async () => {
    const repo = new InMemoryRepository();
    const p = person('a');
    await repo.savePerson(p);
    p.displayName = 'diubah setelah save';

    const got = await repo.getPerson('a');
    expect(got?.displayName).toBe('a');
    expect(await repo.listPeople('T')).toHaveLength(1);
    expect(await repo.getPerson('tidak-ada')).toBeNull();
  });

  it('listScreeningsForPerson urut naik per cycle', async () => {
    const repo = new InMemoryRepository();
    await repo.saveScreening(screening('a', '2026-03'));
    await repo.saveScreening(screening('a', '2026-01'));
    await repo.saveScreening(screening('a', '2026-02'));

    const cycles = (await repo.listScreeningsForPerson('T', 'a')).map((s) => s.cycle);
    expect(cycles).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('claimSlot atomik: turun per klaim, penuh => null, status filled', async () => {
    const repo = new InMemoryRepository();
    await repo.saveNeed(need('n', 2));

    expect(await repo.claimSlot('n')).toBe(1);
    expect(await repo.claimSlot('n')).toBe(0);
    expect(await repo.claimSlot('n')).toBeNull();

    const after = await repo.getNeed('n');
    expect(after?.status).toBe('filled');
    expect(after?.slotsOpen).toBe(0);
  });

  it('listOpenNeeds hanya status open pada team & week yang cocok', async () => {
    const repo = new InMemoryRepository();
    await repo.saveNeed(need('open', 3));
    await repo.saveNeed({ ...need('filled', 1), status: 'filled' });
    await repo.saveNeed(need('lain-week', 3, 'T', '2026-W02'));

    const open = await repo.listOpenNeeds('T', '2026-W01');
    expect(open.map((n) => n.id)).toEqual(['open']);
  });
});
