import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';
import { DetectionService } from '../src/core/detection';
import { DEMO_TEAM_ID, DEMO_WEEK, seedDemoNeeds, seedDemoTeam } from '../src/seed/demoTeam';

describe('seed demo team', () => {
  it('membuat 15 orang', async () => {
    const repo = new InMemoryRepository();
    await seedDemoTeam(repo);
    expect(await repo.listPeople(DEMO_TEAM_ID)).toHaveLength(15);
  });

  it('narasi deteksi siklus terakhir stabil: 4 flagged, rangga satu-satunya clinical_suggest', async () => {
    const repo = new InMemoryRepository();
    await seedDemoTeam(repo);
    const states = await new DetectionService(repo).run(DEMO_TEAM_ID, '2026-06');

    const flagged = states.filter((s) => s.flagged).map((s) => s.personId).sort();
    expect(flagged).toEqual(['bagus', 'dewi', 'rangga', 'sari']);

    const clinical = states.filter((s) => s.clinicalSuggest).map((s) => s.personId);
    expect(clinical).toEqual(['rangga']);

    const bagus = states.find((s) => s.personId === 'bagus');
    expect(bagus?.trend).toBe('improving');
    expect(bagus?.clinicalSuggest).toBe(false);
  });

  it('non-responder (putu, kadek) tak punya state deteksi', async () => {
    const repo = new InMemoryRepository();
    await seedDemoTeam(repo);
    const states = await new DetectionService(repo).run(DEMO_TEAM_ID, '2026-06');
    const ids = states.map((s) => s.personId);
    expect(ids).not.toContain('putu');
    expect(ids).not.toContain('kadek');
  });

  it('seedDemoNeeds membuat 4 open need pada minggu demo', async () => {
    const repo = new InMemoryRepository();
    await seedDemoNeeds(repo);
    const needs = await repo.listOpenNeeds(DEMO_TEAM_ID, DEMO_WEEK);
    expect(needs).toHaveLength(4);
  });
});
