import { describe, it, expect } from 'vitest';
import { deriveDetection, DetectionService } from '../src/core/detection';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';
import type { Screening } from '../src/domain/types';

function scored(personId: string, cycle: string, score: number): Screening {
  return {
    id: `${personId}-${cycle}`,
    teamId: 'T',
    personId,
    cycle,
    q1: 1,
    q2: 1,
    q3: 1,
    ucla3Score: score,
    lonely: score >= 6,
    deliveredAt: new Date('2026-01-01'),
    answeredAt: new Date('2026-01-02'),
    createdAt: new Date('2026-01-01'),
  };
}

describe('deriveDetection', () => {
  it('siklus pertama => trend new', () => {
    const d = deriveDetection([scored('a', '2026-01', 7)]);
    expect(d.trend).toBe('new');
    expect(d.lonely).toBe(true);
    expect(d.flagged).toBe(true);
    expect(d.lonelyStreak).toBe(1);
  });

  it('skor turun => improving, skor naik => worsening, sama => flat', () => {
    expect(deriveDetection([scored('a', '01', 8), scored('a', '02', 6)]).trend).toBe('improving');
    expect(deriveDetection([scored('a', '01', 5), scored('a', '02', 7)]).trend).toBe('worsening');
    expect(deriveDetection([scored('a', '01', 7), scored('a', '02', 7)]).trend).toBe('flat');
  });

  it('lonely_streak hitung siklus lonely berturut dari akhir', () => {
    const d = deriveDetection([scored('a', '01', 4), scored('a', '02', 7), scored('a', '03', 8)]);
    expect(d.lonelyStreak).toBe(2);
  });

  it('streak putus bila satu siklus tak lonely', () => {
    const d = deriveDetection([scored('a', '01', 7), scored('a', '02', 4), scored('a', '03', 7)]);
    expect(d.lonelyStreak).toBe(1);
  });

  it('clinical_suggest butuh streak >= CLINICAL_CYCLES DAN trend != improving', () => {
    const worsening = deriveDetection([
      scored('a', '01', 6),
      scored('a', '02', 7),
      scored('a', '03', 8),
    ]);
    expect(worsening.clinicalSuggest).toBe(true);

    const improving = deriveDetection([
      scored('a', '01', 9),
      scored('a', '02', 8),
      scored('a', '03', 7),
    ]);
    expect(improving.lonelyStreak).toBe(3);
    expect(improving.trend).toBe('improving');
    expect(improving.clinicalSuggest).toBe(false);
  });
});

describe('DetectionService', () => {
  it('lewati non-responder (skor null), simpan state untuk yang terjawab', async () => {
    const repo = new InMemoryRepository();
    await repo.saveScreening(scored('a', '2026-01', 7));
    const silent: Screening = { ...scored('b', '2026-01', 0), ucla3Score: null, lonely: null, answeredAt: null };
    await repo.saveScreening(silent);

    const states = await new DetectionService(repo).run('T', '2026-01');
    expect(states.map((s) => s.personId)).toEqual(['a']);
    expect(await repo.getDetectionState('T', 'a', '2026-01')).not.toBeNull();
    expect(await repo.getDetectionState('T', 'b', '2026-01')).toBeNull();
  });
});
