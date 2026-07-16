import { config } from '../config/index';
import { createRepository } from '../adapters/repositoryFactory';
import { InMemoryMessaging } from '../adapters/inMemory/messaging';
import { TemplateNeedParser } from '../core/needParser';
import { TemplateInviteComposer } from '../core/inviteComposer';
import { MetricsAggregator } from '../core/metrics';
import { mulberry32 } from '../core/rng';
import { runMonthly } from '../pipelines/monthly';
import { runWeekly } from '../pipelines/weekly';
import { DEMO_CYCLES, DEMO_TEAM_ID, DEMO_WEEK, seedDemoNeeds, seedDemoTeam } from '../seed/demoTeam';
import { InstitutionView, metricsReaderOf } from './institutionView';

const cycle = DEMO_CYCLES[DEMO_CYCLES.length - 1];
const repo = await createRepository();

if (process.env.KAWAN_REPO?.trim().toLowerCase() !== 'postgres') {
  const messaging = new InMemoryMessaging();
  await seedDemoTeam(repo);
  await seedDemoNeeds(repo);
  await runMonthly({ repo, messaging }, DEMO_TEAM_ID, cycle);
  await runWeekly(
    { repo, messaging, parser: new TemplateNeedParser(), composer: new TemplateInviteComposer(), rng: mulberry32(2026) },
    DEMO_TEAM_ID,
    DEMO_WEEK,
    cycle,
  );
}

const metrics = new MetricsAggregator(repo);
const view = new InstitutionView(metricsReaderOf(repo));

const responders = (await repo.listScreenings(DEMO_TEAM_ID, cycle)).filter((s) => s.answeredAt !== null).length;

await metrics.rollup(DEMO_TEAM_ID, cycle, DEMO_WEEK);
console.log(`\nK_ANON=${config.K_ANON} (tim demo ${responders} responder):`);
console.log(await view.show(DEMO_TEAM_ID, cycle));

await metrics.rollup(DEMO_TEAM_ID, cycle, DEMO_WEEK, { ...config, K_ANON: 5 });
console.log(`\nBila tim cukup besar (K_ANON=5) — institusi lihat agregat, tetap tanpa individu:`);
console.log(await view.show(DEMO_TEAM_ID, cycle));

if ('close' in repo && typeof (repo as { close?: unknown }).close === 'function') {
  await (repo as { close(): Promise<void> }).close();
}
