import type { Invite } from '../domain/types';
import type { Repository } from '../ports/repository';

export type ClaimResult = 'claimed' | 'full';

export class OutcomeLog {
  constructor(private readonly repo: Repository) {}

  async record(invite: Invite, now: Date = new Date()): Promise<void> {
    await this.repo.saveOutcome({
      id: `outcome:${invite.id}`,
      inviteId: invite.id,
      personId: invite.personId,
      needId: invite.needId,
      showedUp: null,
      createdAt: now,
    });
  }
}

export class ClaimService {
  constructor(
    private readonly repo: Repository,
    private readonly outcomes: OutcomeLog,
  ) {}

  async claim(personId: string, needId: string, now: Date = new Date()): Promise<ClaimResult> {
    const remaining = await this.repo.claimSlot(needId);
    if (remaining === null) return 'full';

    const invite = await this.repo.findInvite(personId, needId);
    if (invite) {
      invite.state = 'claimed';
      invite.claimedAt = now;
      await this.repo.saveInvite(invite);
      await this.outcomes.record(invite, now);
    }
    return 'claimed';
  }
}
