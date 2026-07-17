import type { Cycle, RiskSource } from '../domain/types';
import type { Repository } from '../ports/repository';
import type { MessagingPort } from '../ports/messaging';

export interface HelpOption {
  name: string;
  what: string;
  url: string | null;
}

/** Cuma layanan yang benar-benar ada dan bisa dicek. Tidak ada psikolog individual
 *  di sini: kita tak punya cara memverifikasi nama, jadwal, atau ketersediaannya. */
export const PSYCHOLOGIST_OPTIONS: HelpOption[] = [
  {
    name: 'HIMPSI',
    what: 'Official directory of licensed psychologists across Indonesia',
    url: 'https://himpsi.or.id',
  },
  {
    name: 'Into The Light Indonesia',
    what: 'Mental health community — resources and referrals',
    url: 'https://intothelightid.org',
  },
];

/** Jalur darurat. Psikolog dengan jam praktik bukan pengganti ini. */
export const CRISIS_LINE = 'Kemenkes SEJIWA — 119 ext 8';

/** Dipakai ClinicalRouter.handle() sebagai catatan hand-off. */
export const CRISIS_RESOURCES = [CRISIS_LINE, ...PSYCHOLOGIST_OPTIONS.map((o) => `${o.name} — ${o.url ?? '-'}`)];

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
