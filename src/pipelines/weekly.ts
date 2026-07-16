import type { Invite, Need, Pool } from '../domain/types';
import type { Repository } from '../ports/repository';
import type { MessagingPort } from '../ports/messaging';
import type { NeedParser } from '../core/needParser';
import type { InviteComposer, InviteCopy } from '../core/inviteComposer';
import { batchMatch } from '../core/batchMatcher';
import type { Rng } from '../core/rng';

export interface WeeklyDeps {
  repo: Repository;
  messaging: MessagingPort;
  parser: NeedParser;
  composer: InviteComposer;
  rng?: Rng;
}

export interface DeliveredPool {
  pool: Pool;
  need: Need;
  copy: InviteCopy;
}

export interface WeeklyResult {
  delivered: DeliveredPool[];
  skippedFlagged: string[];
}

export async function runWeekly(
  deps: WeeklyDeps,
  teamId: string,
  week: string,
  cycle: string,
  now: Date = new Date(),
): Promise<WeeklyResult> {
  for (const need of await deps.repo.listOpenNeeds(teamId, week)) {
    if (need.parsed) continue;
    need.parsed = await deps.parser.parse(need.rawText);
    if (need.slotsOpen === need.slotsTotal) {
      need.slotsTotal = need.parsed.slots;
      need.slotsOpen = need.parsed.slots;
    }
    await deps.repo.saveNeed(need);
  }

  const detStates = await deps.repo.listDetectionStates(teamId, cycle);
  const flagged = new Set(detStates.filter((d) => d.flagged).map((d) => d.personId));
  const roster = await deps.repo.listPeople(teamId);
  const needs = await deps.repo.listOpenNeeds(teamId, week);

  const { pools, skippedFlagged } = batchMatch({ needs, roster, flagged, week, rng: deps.rng });

  const delivered: DeliveredPool[] = [];
  for (const pool of pools) {
    await deps.repo.savePool(pool);
    const need = needs.find((n) => n.id === pool.needId);
    if (!need) continue;

    for (const personId of pool.memberIds) {
      const invite: Invite = {
        id: `invite:${pool.id}:${personId}`,
        poolId: pool.id,
        personId,
        needId: need.id,
        deliveredAt: now,
        state: 'shown',
        claimedAt: null,
      };
      await deps.repo.saveInvite(invite);
    }

    const copy = await deps.composer.compose(need);
    await deps.messaging.deliverPool(need, pool.memberIds);
    delivered.push({ pool, need, copy });
  }

  return { delivered, skippedFlagged };
}
