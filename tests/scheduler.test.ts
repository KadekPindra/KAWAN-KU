import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';
import { InMemoryMessaging } from '../src/adapters/inMemory/messaging';
import { ScreeningService } from '../src/core/screening';
import { TemplateNeedParser } from '../src/core/needParser';
import { TemplateInviteComposer } from '../src/core/inviteComposer';
import { mulberry32 } from '../src/core/rng';
import { Scheduler } from '../src/pipelines/scheduler';
import { DEMO_CYCLES, DEMO_TEAM_ID, DEMO_WEEK, seedDemoNeeds, seedDemoTeam } from '../src/seed/demoTeam';

async function build() {
  const repo = new InMemoryRepository();
  const messaging = new InMemoryMessaging();
  await seedDemoTeam(repo);
  await seedDemoNeeds(repo);
  const screening = new ScreeningService(repo, messaging);
  const scheduler = new Scheduler(
    { repo, messaging, parser: new TemplateNeedParser(), composer: new TemplateInviteComposer(), screening, rng: mulberry32(2026) },
    { teamId: DEMO_TEAM_ID, cycle: DEMO_CYCLES[DEMO_CYCLES.length - 1], week: DEMO_WEEK },
    { screenTickMs: 1_000, routeTickMs: 1_000 },
  );
  return { repo, messaging, scheduler };
}

describe('Scheduler (pemicu proaktif, tanpa command manual)', () => {
  it('screenTick mengirim skrining + menjalankan deteksi', async () => {
    const { messaging, scheduler } = await build();
    await scheduler.screenTick();
    expect(messaging.postedScreenings.length).toBe(1);
  });

  it('routeTick mengirim pool need-framed', async () => {
    const { messaging, scheduler } = await build();
    await scheduler.routeTick();
    expect(messaging.deliveredPools.length).toBeGreaterThan(0);
  });

  it('openClinicalDoors membuka pintu untuk seluruh roster (always-on)', async () => {
    const { repo, messaging, scheduler } = await build();
    await scheduler.openClinicalDoors();
    const roster = await repo.listPeople(DEMO_TEAM_ID);
    expect(messaging.clinicalDoors.length).toBe(roster.length);
  });

  it('start/stop tidak meninggalkan timer menggantung', async () => {
    const { scheduler } = await build();
    scheduler.start();
    scheduler.stop();
  });
});
