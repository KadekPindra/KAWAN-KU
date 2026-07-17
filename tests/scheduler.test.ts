import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';
import { InMemoryMessaging } from '../src/adapters/inMemory/messaging';
import { ScreeningService } from '../src/core/screening';
import { TemplateNeedParser } from '../src/core/needParser';
import { TemplateInviteComposer } from '../src/core/inviteComposer';
import { mulberry32 } from '../src/core/rng';
import { Scheduler } from '../src/pipelines/scheduler';
import { DEMO_TEAM_ID, DEMO_WEEK, seedDemoNeeds, seedDemoTeam } from '../src/seed/demoTeam';

async function build() {
  const repo = new InMemoryRepository();
  const messaging = new InMemoryMessaging();
  await seedDemoTeam(repo);
  await seedDemoNeeds(repo);
  const screening = new ScreeningService(repo, messaging);
  const scheduler = new Scheduler(
    { repo, messaging, parser: new TemplateNeedParser(), composer: new TemplateInviteComposer(), screening, rng: mulberry32(2026) },
    { teamId: DEMO_TEAM_ID, week: DEMO_WEEK },
    { screenTickMs: 1_000, routeTickMs: 1_000 },
  );
  return { repo, messaging, scheduler };
}

describe('Scheduler (pemicu proaktif, tanpa command manual)', () => {
  it('screenTick mengirim skrining ke orang yang jatuh tempo — per orang, bukan broadcast', async () => {
    const { repo, messaging, scheduler } = await build();
    await scheduler.screenTick(new Date('2027-01-01')); // bulan belum ter-seed & jauh → semua jatuh tempo
    const roster = await repo.listPeople(DEMO_TEAM_ID);
    expect(messaging.postedScreenings.length).toBe(roster.length);
    expect(messaging.postedScreenings.every((p) => p.cycle === '2027-01')).toBe(true);
  });

  it('screenTick idempoten: bulan yang sudah ter-seed tak dikirim ulang', async () => {
    const { messaging, scheduler } = await build();
    await scheduler.screenTick(new Date('2026-06-15')); // cycle 2026-06 sudah ter-seed
    expect(messaging.postedScreenings.length).toBe(0);
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
