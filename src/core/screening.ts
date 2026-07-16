import { config, type Config } from '../config/index';
import type { Anchor, Cycle, Screening } from '../domain/types';
import type { Repository } from '../ports/repository';
import type { MessagingPort } from '../ports/messaging';

export function scoreUcla3(q1: Anchor, q2: Anchor, q3: Anchor): number {
  return q1 + q2 + q3;
}

export function isLonely(score: number, cfg: Config = config): boolean {
  return score >= cfg.LONELY_THRESHOLD;
}

function blank(teamId: string, personId: string, cycle: Cycle, now: Date): Screening {
  return {
    id: `${teamId}:${personId}:${cycle}`,
    teamId,
    personId,
    cycle,
    q1: null,
    q2: null,
    q3: null,
    ucla3Score: null,
    lonely: null,
    deliveredAt: null,
    answeredAt: null,
    createdAt: now,
  };
}

export class ScreeningService {
  constructor(
    private readonly repo: Repository,
    private readonly messaging: MessagingPort,
  ) {}

  async deliver(teamId: string, cycle: Cycle, now: Date = new Date()): Promise<void> {
    for (const p of await this.repo.listPeople(teamId)) {
      if (!p.optedIn) continue;
      if (await this.repo.getScreening(teamId, p.id, cycle)) continue;
      const s = blank(teamId, p.id, cycle, now);
      s.deliveredAt = now;
      await this.repo.saveScreening(s);
    }
    await this.messaging.postScreening(teamId, cycle);
  }

  async recordAnswer(
    teamId: string,
    personId: string,
    cycle: Cycle,
    q: 1 | 2 | 3,
    value: Anchor,
    now: Date = new Date(),
  ): Promise<Screening> {
    const s = (await this.repo.getScreening(teamId, personId, cycle)) ?? blank(teamId, personId, cycle, now);
    if (q === 1) s.q1 = value;
    else if (q === 2) s.q2 = value;
    else s.q3 = value;

    if (s.q1 !== null && s.q2 !== null && s.q3 !== null) {
      s.ucla3Score = scoreUcla3(s.q1, s.q2, s.q3);
      s.lonely = isLonely(s.ucla3Score);
      s.answeredAt = now;
    }
    await this.repo.saveScreening(s);
    return s;
  }
}
