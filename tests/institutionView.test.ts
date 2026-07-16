import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';
import { InMemoryMessaging } from '../src/adapters/inMemory/messaging';
import { TemplateNeedParser } from '../src/core/needParser';
import { TemplateInviteComposer } from '../src/core/inviteComposer';
import { MetricsAggregator } from '../src/core/metrics';
import { mulberry32 } from '../src/core/rng';
import { config } from '../src/config/index';
import { runMonthly } from '../src/pipelines/monthly';
import { runWeekly } from '../src/pipelines/weekly';
import { DEMO_TEAM_ID, DEMO_WEEK, seedDemoNeeds, seedDemoTeam } from '../src/seed/demoTeam';
import { InstitutionView, metricsReaderOf, renderInstitutionMetrics } from '../src/views/institutionView';
import type { InstitutionMetrics } from '../src/domain/types';

const suppressed: InstitutionMetrics = {
  teamId: 'T',
  period: '2026-06',
  respondedCount: null,
  lonelyCount: null,
  invitesSent: null,
  claimRate: null,
  avgUcla3: null,
};

describe('renderInstitutionMetrics', () => {
  it('baris disuppress: tak ada angka, ada penanda DISUPPRESS', () => {
    const out = renderInstitutionMetrics('T', '2026-06', suppressed);
    expect(out).toContain('DISUPPRESS');
    expect(out).not.toMatch(/responder\s*:/);
  });

  it('baris terisi: tampilkan agregat', () => {
    const out = renderInstitutionMetrics('T', '2026-06', { ...suppressed, respondedCount: 30, lonelyCount: 6, invitesSent: 10, claimRate: 0.4, avgUcla3: 4.9 });
    expect(out).toContain('responder   : 30');
    expect(out).toContain('lonely      : 6');
  });

  it('tanpa rollup => pesan kosong, bukan crash', () => {
    expect(renderInstitutionMetrics('T', '2026-06', null)).toContain('belum ada rollup');
  });
});

describe('InstitutionView end-to-end (baca institution_metrics saja)', () => {
  async function seeded() {
    const repo = new InMemoryRepository();
    const messaging = new InMemoryMessaging();
    await seedDemoTeam(repo);
    await seedDemoNeeds(repo);
    await runMonthly({ repo, messaging }, DEMO_TEAM_ID, '2026-06');
    await runWeekly(
      { repo, messaging, parser: new TemplateNeedParser(), composer: new TemplateInviteComposer(), rng: mulberry32(2026) },
      DEMO_TEAM_ID,
      DEMO_WEEK,
      '2026-06',
    );
    return repo;
  }

  it('K_ANON default (20) > 13 responder => view disuppress', async () => {
    const repo = await seeded();
    await new MetricsAggregator(repo).rollup(DEMO_TEAM_ID, '2026-06', DEMO_WEEK);
    const out = await new InstitutionView(metricsReaderOf(repo)).show(DEMO_TEAM_ID, '2026-06');
    expect(out).toContain('DISUPPRESS');
  });

  it('K_ANON=5 => view menampilkan agregat (tanpa individu)', async () => {
    const repo = await seeded();
    await new MetricsAggregator(repo).rollup(DEMO_TEAM_ID, '2026-06', DEMO_WEEK, { ...config, K_ANON: 5 });
    const out = await new InstitutionView(metricsReaderOf(repo)).show(DEMO_TEAM_ID, '2026-06');
    expect(out).toContain('responder   :');
    expect(out).not.toContain('DISUPPRESS');
  });

  it('reader sempit tak mengekspos jalan ke individu', () => {
    const reader = metricsReaderOf(new InMemoryRepository());
    expect(Object.keys(reader)).toEqual(['getMetrics']);
  });
});
