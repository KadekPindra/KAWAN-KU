import { describe, it, expect } from 'vitest';
import { MetricsAggregator } from '../src/core/metrics';
import { config } from '../src/config/index';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';
import type { Screening } from '../src/domain/types';

function answered(personId: string, score: number): Screening {
  return {
    id: `T:${personId}:2026-06`,
    teamId: 'T',
    personId,
    cycle: '2026-06',
    q1: 1,
    q2: 1,
    q3: 1,
    ucla3Score: score,
    lonely: score >= config.LONELY_THRESHOLD,
    deliveredAt: new Date('2026-06-01'),
    lastSentAt: new Date('2026-06-01'),
    lastAnsweredAt: new Date('2026-06-03'),
    answeredAt: new Date('2026-06-03'),
    createdAt: new Date('2026-06-01'),
  };
}

async function seedScores(scores: number[]) {
  const repo = new InMemoryRepository();
  for (let i = 0; i < scores.length; i++) await repo.saveScreening(answered(`p${i}`, scores[i]));
  return repo;
}

describe('MetricsAggregator — k-anonymity', () => {
  it('di bawah K_ANON responder => semua angka disuppress (null)', async () => {
    const repo = await seedScores([6, 6, 3, 3, 9, 3]);
    const m = await new MetricsAggregator(repo).rollup('T', '2026-06', '2026-W29');
    expect(m.respondedCount).toBeNull();
    expect(m.lonelyCount).toBeNull();
    expect(m.avgUcla3).toBeNull();
  });

  it('di atas ambang => agregat terhitung, tanpa data per-orang', async () => {
    const repo = await seedScores([6, 6, 3, 3, 9, 3]);
    const m = await new MetricsAggregator(repo).rollup('T', '2026-06', '2026-W29', {
      ...config,
      K_ANON: 5,
    });
    expect(m.respondedCount).toBe(6);
    expect(m.lonelyCount).toBe(3);
    expect(m.avgUcla3).toBe(5);
    expect(Object.keys(m)).not.toContain('personId');
  });
});
