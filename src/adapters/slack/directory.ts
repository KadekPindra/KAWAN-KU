import type { Repository } from '../../ports/repository';

export interface SlackRecipient {
  personId: string;
  slackUserId: string;
  riskConsent: boolean;
}

export interface SlackDirectory {
  recipients(teamId: string): Promise<SlackRecipient[]>;
  recipientFor(personId: string): Promise<SlackRecipient | null>;
  slackIdFor(personId: string): Promise<string | null>;
  personIdFor(slackUserId: string): Promise<string | null>;
}

export class RepoSlackDirectory implements SlackDirectory {
  constructor(
    private readonly repo: Repository,
    private readonly teamId: string,
  ) {}

  async recipients(teamId: string): Promise<SlackRecipient[]> {
    const people = await this.repo.listPeople(teamId);
    return people
      .filter((p) => p.optedIn && p.slackUserId)
      .map((p) => ({ personId: p.id, slackUserId: p.slackUserId as string, riskConsent: p.riskConsent }));
  }

  async recipientFor(personId: string): Promise<SlackRecipient | null> {
    const p = (await this.repo.listPeople(this.teamId)).find((x) => x.id === personId);
    if (!p || !p.optedIn || !p.slackUserId) return null;
    return { personId: p.id, slackUserId: p.slackUserId, riskConsent: p.riskConsent };
  }

  async slackIdFor(personId: string): Promise<string | null> {
    const people = await this.repo.listPeople(this.teamId);
    return people.find((p) => p.id === personId)?.slackUserId ?? null;
  }

  async personIdFor(slackUserId: string): Promise<string | null> {
    const people = await this.repo.listPeople(this.teamId);
    return people.find((p) => p.slackUserId === slackUserId)?.id ?? null;
  }
}
