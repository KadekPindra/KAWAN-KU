import { describe, it, expect } from 'vitest';
import { ScreeningService, scoreUcla3, isLonely } from '../src/core/screening';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';
import { InMemoryMessaging } from '../src/adapters/inMemory/messaging';
import { config } from '../src/config/index';
import type { Person } from '../src/domain/types';

function person(id: string, optedIn = true, riskConsent = false): Person {
  return {
    id,
    teamId: 'T',
    displayName: id,
    slackUserId: null,
    joinedAt: new Date('2026-01-01'),
    interests: [],
    optedIn,
    riskConsent,
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
  it('deliver hanya untuk opted-in dan cuma kirim 1 pertanyaan (q1) per interaksi', async () => {
    const repo = new InMemoryRepository();
    const msg = new InMemoryMessaging();
    await repo.savePerson(person('a', true));
    await repo.savePerson(person('b', false));
    const svc = new ScreeningService(repo, msg);

    await svc.deliver('T', '2026-01');

    expect(await repo.getScreening('T', 'a', '2026-01')).not.toBeNull();
    expect(await repo.getScreening('T', 'b', '2026-01')).toBeNull();
    expect(msg.postedQuestions).toHaveLength(1);
    expect(msg.postedQuestions[0]).toMatchObject({ personId: 'a', q: 1 });
  });

  it('pertanyaan berikutnya (q2) baru dikirim setelah dijawab DAN jeda hari terlewati — nggak pernah 2 sekaligus', async () => {
    const repo = new InMemoryRepository();
    const msg = new InMemoryMessaging();
    await repo.savePerson(person('a', true));
    const cfg = { ...config, SCREEN_QUESTION_GAP_DAYS: 1 };
    const svc = new ScreeningService(repo, msg);

    await svc.deliver('T', '2026-01', new Date('2026-01-01T08:00:00Z'), cfg);
    expect(msg.postedQuestions).toHaveLength(1);

    // belum dijawab -> tick berikutnya tetap nggak kirim apa-apa
    await svc.deliver('T', '2026-01', new Date('2026-01-02T08:00:00Z'), cfg);
    expect(msg.postedQuestions).toHaveLength(1);

    // dijawab, tapi jeda belum lewat (masih hari yang sama) -> belum kirim q2
    await svc.recordAnswer('T', 'a', '2026-01', 1, 3, new Date('2026-01-02T09:00:00Z'));
    await svc.deliver('T', '2026-01', new Date('2026-01-02T10:00:00Z'), cfg);
    expect(msg.postedQuestions).toHaveLength(1);

    // jeda 1 hari lewat -> q2 terkirim
    await svc.deliver('T', '2026-01', new Date('2026-01-03T10:00:00Z'), cfg);
    expect(msg.postedQuestions).toHaveLength(2);
    expect(msg.postedQuestions[1]).toMatchObject({ personId: 'a', q: 2 });
  });

  it('skor & lonely dihitung hanya setelah ketiga item terjawab; risk item cuma terkirim ke yang riskConsent', async () => {
    const repo = new InMemoryRepository();
    const msg = new InMemoryMessaging();
    await repo.savePerson(person('a', true, true));
    const svc = new ScreeningService(repo, msg);

    await svc.recordAnswer('T', 'a', '2026-01', 1, 3);
    await svc.recordAnswer('T', 'a', '2026-01', 2, 3);
    let s = await repo.getScreening('T', 'a', '2026-01');
    expect(s?.ucla3Score).toBeNull();
    expect(s?.answeredAt).toBeNull();
    expect(msg.riskItems).toHaveLength(0);

    await svc.recordAnswer('T', 'a', '2026-01', 3, 2);
    s = await repo.getScreening('T', 'a', '2026-01');
    expect(s?.ucla3Score).toBe(8);
    expect(s?.lonely).toBe(true);
    expect(s?.answeredAt).not.toBeNull();
    expect(msg.riskItems).toEqual(['a']);
  });

  it('cycle in-progress tetap dilanjutkan walau bulan kalender sudah berganti', async () => {
    const repo = new InMemoryRepository();
    const msg = new InMemoryMessaging();
    const cfg = { ...config, SCREEN_QUESTION_GAP_DAYS: 1 };
    const svc = new ScreeningService(repo, msg);
    await repo.savePerson(person('a', true));

    await svc.deliver('T', '2026-01', new Date('2026-01-31T08:00:00Z'), cfg);
    await svc.recordAnswer('T', 'a', '2026-01', 1, 3, new Date('2026-01-31T09:00:00Z'));

    // tick berikutnya sudah di bulan Februari (cycle baru harusnya "2026-02"),
    // tapi baseline "2026-01" yang belum kelar harus tetap dilanjutkan, bukan ditinggal.
    await svc.deliver('T', '2026-02', new Date('2026-02-01T09:30:00Z'), cfg);
    expect(msg.postedQuestions).toHaveLength(2);
    expect(msg.postedQuestions[1]).toMatchObject({ personId: 'a', cycle: '2026-01', q: 2 });
  });
});
