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
  week: string;
}

export interface SchedulerIntervals {
  screenTickMs: number;
  routeTickMs: number;
}

export function cycleOf(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export class Scheduler {
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(
    private readonly deps: SchedulerDeps,
    private readonly target: SchedulerTarget,
    private readonly intervals: SchedulerIntervals,
  ) {}

  async screenTick(now: Date = new Date()): Promise<void> {
    const cycle = cycleOf(now);
    console.log(`[scheduler] screenTick @ ${now.toISOString()} (cycle ${cycle})`);
    await this.deps.screening.deliver(this.target.teamId, cycle, now);
    await runMonthly(this.deps, this.target.teamId, cycle);
  }

  async routeTick(now: Date = new Date()): Promise<void> {
    console.log(`[scheduler] routeTick @ ${now.toISOString()}`);
    await runWeekly(this.deps, this.target.teamId, this.target.week, cycleOf(now), now);
  }

  async openClinicalDoors(): Promise<void> {
    for (const p of await this.deps.repo.listPeople(this.target.teamId)) {
      await this.deps.messaging.openClinicalDoor(p.id);
    }
  }

  start(): void {
    this.timers.push(
      setInterval(() => {
        this.screenTick().catch((err) => console.error('[scheduler] screenTick error:', err));
      }, this.intervals.screenTickMs),
    );
    this.timers.push(
      setInterval(() => {
        this.routeTick().catch((err) => console.error('[scheduler] routeTick error:', err));
      }, this.intervals.routeTickMs),
    );
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }
}
