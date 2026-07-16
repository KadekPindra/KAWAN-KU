import { describe, it, expect } from 'vitest';
import { ScreeningService, scoreUcla3, isLonely } from '../src/core/screening';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';
import { InMemoryMessaging } from '../src/adapters/inMemory/messaging';
import type { Person } from '../src/domain/types';

function person(id: string, optedIn = true): Person {
  return {
    id,
    teamId: 'T',
    displayName: id,
    slackUserId: null,
    joinedAt: new Date('2026-01-01'),
    interests: [],
    optedIn,
    riskConsent: false,
  };
}

describe('UCLA-3 scoring', () => {
  it('skor = jumlah 3 jawaban (range 3..9)', () => {
    expect(scoreUcla3(1, 1, 1)).toBe(3);
    expect(scoreUcla3(3, 3, 3)).toBe(9);
    expect(scoreUcla3(2, 3, 1)).toBe(6);
  });

  it('lonely bila skor >= threshold default 6', () => {
    expect(isLonely(5)).toBe(false);
    expect(isLonely(6)).toBe(true);
  });
});

describe('ScreeningService', () => {
  it('deliver hanya untuk opted-in dan memanggil postScreening sekali', async () => {
    const repo = new InMemoryRepository();
    const msg = new InMemoryMessaging();
    await repo.savePerson(person('a', true));
    await repo.savePerson(person('b', false));
    const svc = new ScreeningService(repo, msg);

    await svc.deliver('T', '2026-01');

    expect(await repo.getScreening('T', 'a', '2026-01')).not.toBeNull();
    expect(await repo.getScreening('T', 'b', '2026-01')).toBeNull();
    expect(msg.postedScreenings).toHaveLength(1);
  });

  it('skor & lonely dihitung hanya setelah ketiga item terjawab', async () => {
    const repo = new InMemoryRepository();
    const svc = new ScreeningService(repo, new InMemoryMessaging());

    await svc.recordAnswer('T', 'a', '2026-01', 1, 3);
    await svc.recordAnswer('T', 'a', '2026-01', 2, 3);
    let s = await repo.getScreening('T', 'a', '2026-01');
    expect(s?.ucla3Score).toBeNull();
    expect(s?.answeredAt).toBeNull();

    await svc.recordAnswer('T', 'a', '2026-01', 3, 2);
    s = await repo.getScreening('T', 'a', '2026-01');
    expect(s?.ucla3Score).toBe(8);
    expect(s?.lonely).toBe(true);
    expect(s?.answeredAt).not.toBeNull();
  });
});
