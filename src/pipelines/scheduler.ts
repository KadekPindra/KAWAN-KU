import type { Repository } from '../ports/repository';
import type { MessagingPort } from '../ports/messaging';
import type { NeedParser } from '../core/needParser';
import type { InviteComposer } from '../core/inviteComposer';
import type { ScreeningService } from '../core/screening';
import type { Rng } from '../core/rng';
import { runMonthly } from './monthly';
import { runWeekly } from './weekly';

export interface SchedulerDeps {
  repo: Repository;
  messaging: MessagingPort;
  parser: NeedParser;
  composer: InviteComposer;
  screening: ScreeningService;
  rng?: Rng;
}

export interface SchedulerTarget {
  teamId: string;
  cycle: string;
  week: string;
}

export interface SchedulerIntervals {
  screenTickMs: number;
  routeTickMs: number;
}

// Pemicu proaktif: sistem mendatangi orang, tak ada command yang bisa diketik peserta.
// Fase A masih memakai satu cycle/week target. Fase B melapisi next_due_at + jitter per orang (§5.1.1).
export class Scheduler {
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(
    private readonly deps: SchedulerDeps,
    private readonly target: SchedulerTarget,
    private readonly intervals: SchedulerIntervals,
  ) {}

  async screenTick(now: Date = new Date()): Promise<void> {
    await this.deps.screening.deliver(this.target.teamId, this.target.cycle, now);
    await runMonthly(this.deps, this.target.teamId, this.target.cycle);
  }

  async routeTick(now: Date = new Date()): Promise<void> {
    await runWeekly(this.deps, this.target.teamId, this.target.week, this.target.cycle, now);
  }

  async openClinicalDoors(): Promise<void> {
    for (const p of await this.deps.repo.listPeople(this.target.teamId)) {
      await this.deps.messaging.openClinicalDoor(p.id);
    }
  }

  start(): void {
    this.timers.push(setInterval(() => void this.screenTick(), this.intervals.screenTickMs));
    this.timers.push(setInterval(() => void this.routeTick(), this.intervals.routeTickMs));
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
