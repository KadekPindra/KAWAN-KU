import { config, type Config } from '../config/index';
import type { Anchor, Cycle, Screening } from '../domain/types';
import type { Repository } from '../ports/repository';
import type { MessagingPort } from '../ports/messaging';
import { deriveDetection } from './detection';
import { nextDueAt } from './screenSchedule';

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

  async deliver(
    teamId: string,
    cycle: Cycle,
    now: Date = new Date(),
    cfg: Config = config,
  ): Promise<void> {
    for (const p of await this.repo.listPeople(teamId)) {
      if (!p.optedIn) continue;
      if (await this.repo.getScreening(teamId, p.id, cycle)) continue;
      if (!(await this.isDue(teamId, p.id, now, cfg))) continue;
      const s = blank(teamId, p.id, cycle, now);
      s.deliveredAt = now;
      await this.repo.saveScreening(s);
      await this.messaging.postScreening(p.id, cycle);
    }
  }

  async isDue(teamId: string, personId: string, now: Date, cfg: Config = config): Promise<boolean> {
    const history = (await this.repo.listScreeningsForPerson(teamId, personId)).sort((a, b) =>
      a.cycle < b.cycle ? -1 : a.cycle > b.cycle ? 1 : 0,
    );
    const delivered = history.filter((h) => h.deliveredAt !== null);
    if (delivered.length === 0) return true;

    const lastDelivered = delivered.reduce((max, h) =>
      (h.deliveredAt as Date) > (max.deliveredAt as Date) ? h : max,
    ).deliveredAt as Date;

    const answered = history.filter((h) => h.ucla3Score !== null);
    const streak = answered.length > 0 ? deriveDetection(answered, cfg).lonelyStreak : 0;
    const due = nextDueAt(lastDelivered, streak, personId, history.length, cfg);
    return now.getTime() >= due.getTime();
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
