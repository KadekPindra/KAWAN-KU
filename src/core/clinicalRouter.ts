import type { Cycle, RiskSource } from '../domain/types';
import type { Repository } from '../ports/repository';
import type { MessagingPort } from '../ports/messaging';

export const CRISIS_RESOURCES = [
  'Kemenkes SEJIWA — 119 ext 8',
  'Into The Light Indonesia — intothelightid.org',
  'Konselor kampus — (isi kontak fakultas)',
];

export class ClinicalRouter {
  constructor(
    private readonly repo: Repository,
    private readonly messaging: MessagingPort,
  ) {}

  async handle(
    personId: string,
    source: RiskSource,
    cycle: Cycle = '',
    now: Date = new Date(),
  ): Promise<string[]> {
    await this.repo.saveRiskEvent({
      id: `risk:${personId}:${now.getTime()}`,
      personId,
      cycle,
      source,
      handedOffAt: now,
      createdAt: now,
    });
    return CRISIS_RESOURCES;
  }

  async softNudge(personId: string): Promise<void> {
    await this.messaging.openClinicalDoor(personId);
  }
}
