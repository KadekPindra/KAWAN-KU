import type { Invite } from '../domain/types';
import type { Repository } from '../ports/repository';
import type { MessagingPort } from '../ports/messaging';
import type { NeedParser } from './needParser';
import type { InviteComposer } from './inviteComposer';
import { bestMatch } from './batchMatcher';

// Nempel di alur survey: begitu screening seseorang selesai (3/3 terjawab), cek ada need
// terbuka yang cocok di timnya dan tawarkan langsung — di luar jadwal weekly route tick,
// yang tetap jalan seperti biasa untuk sisa roster. Silent kalau tak ada yang cocok atau
// sudah pernah ditawari need itu (tak ada re-nudge).
export class ReverseMatchService {
  constructor(
    private readonly repo: Repository,
    private readonly messaging: MessagingPort,
    private readonly parser: NeedParser,
    private readonly composer: InviteComposer,
  ) {}

  async offerAfterScreening(teamId: string, week: string, personId: string, now: Date = new Date()): Promise<void> {
    const person = await this.repo.getPerson(personId);
    if (!person) return;

    const needs = await this.repo.listOpenNeeds(teamId, week);
    const need = bestMatch(person, needs);
    if (!need) return;

    if (await this.repo.findInvite(personId, need.id)) return;

    if (!need.parsed) {
      need.parsed = await this.parser.parse(need.rawText);
      await this.repo.saveNeed(need);
    }

    const invite: Invite = {
      id: `invite:reverse:${need.id}:${personId}`,
      poolId: `pool:reverse:${need.id}`,
      personId,
      needId: need.id,
      deliveredAt: now,
      state: 'shown',
      claimedAt: null,
    };
    await this.repo.saveInvite(invite);

    const copy = await this.composer.compose(need);
    await this.messaging.deliverPool(need, [personId], copy);
  }
}
