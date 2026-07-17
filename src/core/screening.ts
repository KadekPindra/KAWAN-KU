import { config, type Config } from '../config/index';
import type { Anchor, Cycle, Screening } from '../domain/types';
import type { Repository } from '../ports/repository';
import type { MessagingPort } from '../ports/messaging';
import { deriveDetection } from './detection';
import { nextDueAt } from './screenSchedule';
import { QuestionContext, ScreeningQuestionComposer, TemplateScreeningQuestionComposer } from './screeningQuestion';

const DAY_MS = 24 * 60 * 60 * 1000;

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
    lastSentAt: null,
    lastAnsweredAt: null,
    answeredAt: null,
    createdAt: now,
  };
}

function nextQuestionNumber(s: Screening): 1 | 2 | 3 | null {
  if (s.q1 === null) return 1;
  if (s.q2 === null) return 2;
  if (s.q3 === null) return 3;
  return null;
}

export class ScreeningService {
  constructor(
    private readonly repo: Repository,
    private readonly messaging: MessagingPort,
    private readonly composer: ScreeningQuestionComposer = new TemplateScreeningQuestionComposer(),
  ) {}

  async deliver(
    teamId: string,
    cycle: Cycle,
    now: Date = new Date(),
    cfg: Config = config,
  ): Promise<void> {
    const people = await this.repo.listPeople(teamId);
    console.log(`[screening] deliver: ${people.length} orang di roster (teamId=${teamId})`);
    for (const p of people) {
      if (!p.optedIn) {
        console.log(`[screening] skip ${p.id} (${p.displayName}): belum opt-in`);
        continue;
      }

      const history = await this.repo.listScreeningsForPerson(teamId, p.id);
      const latest = history[history.length - 1];

      if (latest && latest.ucla3Score === null) {
        await this.advance(p.id, latest, now, cfg);
        continue;
      }

      if (!(await this.isDue(teamId, p.id, now, cfg))) {
        console.log(`[screening] skip ${p.id} (${p.displayName}): belum due`);
        continue;
      }

      const ctx = contextFrom(history);
      const freshCycle = await this.freshCycleId(teamId, p.id, cycle);
      const s = blank(teamId, p.id, freshCycle, now);
      s.deliveredAt = now;
      s.lastSentAt = now;
      await this.repo.saveScreening(s);
      await this.sendQuestion(p.id, s, 1, ctx);
    }
  }

  /** cycle=YYYY-MM bisa bentrok kalau interval adaptif jatuh tempo 2x dalam bulan kalender yang sama — disambiguasi biar nggak menimpa histori yang sudah lengkap. */
  private async freshCycleId(teamId: string, personId: string, cycle: Cycle): Promise<Cycle> {
    let candidate = cycle;
    let n = 2;
    while (await this.repo.getScreening(teamId, personId, candidate)) {
      candidate = `${cycle}#${n}`;
      n++;
    }
    return candidate;
  }

  private async advance(personId: string, s: Screening, now: Date, cfg: Config): Promise<void> {
    const pending = s.lastSentAt !== null && (s.lastAnsweredAt === null || s.lastAnsweredAt.getTime() < s.lastSentAt.getTime());
    if (pending) {
      console.log(`[screening] skip ${personId}: nunggu jawaban pertanyaan sebelumnya`);
      return;
    }
    const anchor = s.lastAnsweredAt ?? s.lastSentAt ?? s.deliveredAt ?? s.createdAt;
    const gapMs = cfg.SCREEN_QUESTION_GAP_DAYS * DAY_MS;
    if (now.getTime() - anchor.getTime() < gapMs) {
      console.log(`[screening] skip ${personId}: jeda pertanyaan berikutnya belum lewat`);
      return;
    }
    const q = nextQuestionNumber(s);
    if (q === null) return;

    const history = await this.repo.listScreeningsForPerson(s.teamId, personId);
    const ctx = contextFrom(history.filter((h) => h.id !== s.id));
    s.lastSentAt = now;
    await this.repo.saveScreening(s);
    await this.sendQuestion(personId, s, q, ctx);
  }

  private async sendQuestion(personId: string, s: Screening, q: 1 | 2 | 3, ctx: QuestionContext): Promise<void> {
    try {
      const text = await this.composer.compose(q, ctx);
      await this.messaging.postScreeningQuestion(personId, s.cycle, q, text);
      console.log(`[screening] SENT q${q} -> ${personId}`);
    } catch (err) {
      console.error(`[screening] GAGAL kirim q${q} -> ${personId}:`, err);
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
    s.lastAnsweredAt = now;

    if (s.q1 !== null && s.q2 !== null && s.q3 !== null) {
      s.ucla3Score = scoreUcla3(s.q1, s.q2, s.q3);
      s.lonely = isLonely(s.ucla3Score);
      s.answeredAt = now;
    }
    await this.repo.saveScreening(s);

    if (s.answeredAt !== null) {
      try {
        await this.messaging.postRiskItem(personId);
      } catch (err) {
        console.error(`[screening] GAGAL kirim risk item -> ${personId}:`, err);
      }
    }
    return s;
  }
}

function contextFrom(history: Screening[]): QuestionContext {
  const completed = history.filter((h) => h.ucla3Score !== null);
  if (completed.length === 0) return { lonelyStreak: 0, trend: 'new' };
  const d = deriveDetection(completed);
  return { lonelyStreak: d.lonelyStreak, trend: d.trend };
}
