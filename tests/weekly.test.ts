import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';
import { InMemoryMessaging } from '../src/adapters/inMemory/messaging';
import { TemplateNeedParser } from '../src/core/needParser';
import { TemplateInviteComposer } from '../src/core/inviteComposer';
import { mulberry32 } from '../src/core/rng';
import { config } from '../src/config/index';
import { runMonthly } from '../src/pipelines/monthly';
import { runWeekly } from '../src/pipelines/weekly';
import { DEMO_TEAM_ID, DEMO_WEEK, seedDemoNeeds, seedDemoTeam } from '../src/seed/demoTeam';

async function run() {
  const repo = new InMemoryRepository();
  const messaging = new InMemoryMessaging();
  await seedDemoTeam(repo);
  await seedDemoNeeds(repo);
  await runMonthly({ repo, messaging }, DEMO_TEAM_ID, '2026-06');
  const weekly = await runWeekly(
    { repo, messaging, parser: new TemplateNeedParser(), composer: new TemplateInviteComposer(), rng: mulberry32(2026) },
    DEMO_TEAM_ID,
    DEMO_WEEK,
    '2026-06',
  );
  return { repo, messaging, weekly };
}

describe('weekly pipeline end-to-end', () => {
  it('menghasilkan pool untuk tiap need dan mengirim ke messaging', async () => {
    const { messaging, weekly } = await run();
    expect(weekly.delivered.length).toBe(4);
    expect(messaging.deliveredPools.length).toBe(4);
  });

  it('dilusi terjaga di tiap pool (skew ≤ ⅓)', async () => {
    const { weekly } = await run();
    for (const d of weekly.delivered) {
      expect(d.pool.skewedIds.length / d.pool.memberIds.length).toBeLessThanOrEqual(config.MAX_SKEW_RATIO + 1e-9);
    }
  });

  it('need ter-parse dan invite dibuat status shown', async () => {
    const { repo, weekly } = await run();
    for (const d of weekly.delivered) {
      expect(d.need.parsed).not.toBeNull();
      const invites = await repo.listInvitesForNeed(d.need.id);
      expect(invites.length).toBe(d.pool.memberIds.length);
      expect(invites.every((i) => i.state === 'shown')).toBe(true);
    }
  });
});
