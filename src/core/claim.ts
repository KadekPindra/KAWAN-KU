import type { Invite } from '../domain/types';
import type { Repository } from '../ports/repository';
import type { MessagingPort } from '../ports/messaging';
import type { ClaimAcknowledger } from './claimAcknowledger';

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
    private readonly messaging?: MessagingPort,
    private readonly acknowledger?: ClaimAcknowledger,
  ) {}

  async claim(personId: string, needId: string, now: Date = new Date()): Promise<ClaimResult> {
    const remaining = await this.repo.claimSlot(needId);
    if (remaining === null) {
      await this.notify(personId, needId, 'full');
      return 'full';
    }

    const invite = await this.repo.findInvite(personId, needId);
    if (invite) {
      invite.state = 'claimed';
      invite.claimedAt = now;
      await this.repo.saveInvite(invite);
      await this.outcomes.record(invite, now);
    }
    await this.notify(personId, needId, 'claimed');
    return 'claimed';
  }

  async decline(personId: string, needId: string): Promise<void> {
    const invite = await this.repo.findInvite(personId, needId);
    if (!invite || invite.state !== 'shown') return;
    invite.state = 'declined';
    await this.repo.saveInvite(invite);
    await this.notify(personId, needId, 'declined');
  }

  private async notify(personId: string, needId: string, outcome: 'claimed' | 'full' | 'declined'): Promise<void> {
    if (!this.messaging || !this.acknowledger) return;
    const need = await this.repo.getNeed(needId);
    if (!need) return;
    const text = await this.acknowledger.acknowledge(need, outcome);
    await this.messaging.sendClaimAck(personId, need, outcome, text);
  }
}
