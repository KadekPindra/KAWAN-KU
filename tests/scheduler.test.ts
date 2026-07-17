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
  it('screenTick mengirim 1 pertanyaan (q1) ke orang yang jatuh tempo — per orang, bukan broadcast', async () => {
    const { repo, messaging, scheduler } = await build();
    await scheduler.screenTick(new Date('2027-01-01')); // jauh di masa depan → semua yang punya histori lengkap jatuh tempo
    const roster = await repo.listPeople(DEMO_TEAM_ID);
    // putu & kadek: siklus terakhir mereka di seed data adalah non-response (nggak pernah kejawab) —
    // itu berarti masih "nunggu jawaban pertanyaan sebelumnya", bukan jatuh tempo buat siklus baru.
    const stillWaiting = 2;
    expect(messaging.postedQuestions.length).toBe(roster.length - stillWaiting);
    expect(messaging.postedQuestions.every((p) => p.cycle === '2027-01' && p.q === 1)).toBe(true);
  });

  it('screenTick belum jatuh tempo => nggak ada yang dikirim, walau cycle string kebetulan sama dengan yang sudah ter-seed', async () => {
    const { messaging, scheduler } = await build();
    // 2 hari setelah pengiriman terakhir (2026-06-01) — jauh di bawah interval adaptif tercepat (14-5=9 hari),
    // jadi semua orang dengan histori lengkap belum due; putu/kadek tetap nunggu jawaban lama.
    await scheduler.screenTick(new Date('2026-06-03'));
    expect(messaging.postedQuestions.length).toBe(0);
  });

  it('routeTick mengirim pool need-framed', async () => {
    const { messaging, scheduler } = await build();
    await scheduler.routeTick();
    expect(messaging.deliveredPools.length).toBeGreaterThan(0);
  });

  it('start/stop tidak meninggalkan timer menggantung', async () => {
    const { scheduler } = await build();
    scheduler.start();
    scheduler.stop();
  });
});
