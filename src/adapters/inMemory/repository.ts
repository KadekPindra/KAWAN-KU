import type { Repository } from '../../ports/repository';
import type {
  Cycle,
  DetectionState,
  InstitutionMetrics,
  Invite,
  Need,
  Outcome,
  Person,
  Pool,
  RiskEvent,
  Screening,
  Week,
} from '../../domain/types';

const clone = <T>(x: T): T => structuredClone(x);
const key = (...parts: string[]): string => parts.join(':');

export class InMemoryRepository implements Repository {
  private people = new Map<string, Person>();
  private screenings = new Map<string, Screening>();
  private detection = new Map<string, DetectionState>();
  private needs = new Map<string, Need>();
  private pools = new Map<string, Pool>();
  private invites = new Map<string, Invite>();
  private outcomes: Outcome[] = [];
  private riskEvents: RiskEvent[] = [];
  private metrics = new Map<string, InstitutionMetrics>();

  async getPerson(id: string): Promise<Person | null> {
    const p = this.people.get(id);
    return p ? clone(p) : null;
  }
  async listPeople(teamId: string): Promise<Person[]> {
    return [...this.people.values()].filter((p) => p.teamId === teamId).map(clone);
  }
  async savePerson(person: Person): Promise<void> {
    this.people.set(person.id, clone(person));
  }

  async getScreening(teamId: string, personId: string, cycle: Cycle): Promise<Screening | null> {
    const s = this.screenings.get(key(teamId, personId, cycle));
    return s ? clone(s) : null;
  }
  async listScreenings(teamId: string, cycle: Cycle): Promise<Screening[]> {
    return [...this.screenings.values()]
      .filter((s) => s.teamId === teamId && s.cycle === cycle)
      .map(clone);
  }
  async listScreeningsForPerson(teamId: string, personId: string): Promise<Screening[]> {
    return [...this.screenings.values()]
      .filter((s) => s.teamId === teamId && s.personId === personId)
      .sort((a, b) => a.cycle.localeCompare(b.cycle))
      .map(clone);
  }
  async saveScreening(screening: Screening): Promise<void> {
    this.screenings.set(key(screening.teamId, screening.personId, screening.cycle), clone(screening));
  }

  async getDetectionState(
    teamId: string,
    personId: string,
    cycle: Cycle,
  ): Promise<DetectionState | null> {
    const d = this.detection.get(key(teamId, personId, cycle));
    return d ? clone(d) : null;
  }
  async listDetectionStates(teamId: string, cycle: Cycle): Promise<DetectionState[]> {
    return [...this.detection.values()]
      .filter((d) => d.teamId === teamId && d.cycle === cycle)
      .map(clone);
  }
  async saveDetectionState(state: DetectionState): Promise<void> {
    this.detection.set(key(state.teamId, state.personId, state.cycle), clone(state));
  }

  async getNeed(id: string): Promise<Need | null> {
    const n = this.needs.get(id);
    return n ? clone(n) : null;
  }
  async listNeeds(teamId: string, week: Week): Promise<Need[]> {
    return [...this.needs.values()].filter((n) => n.teamId === teamId && n.week === week).map(clone);
  }
  async listOpenNeeds(teamId: string, week: Week): Promise<Need[]> {
    return [...this.needs.values()]
      .filter((n) => n.teamId === teamId && n.week === week && n.status === 'open')
      .map(clone);
  }
  async saveNeed(need: Need): Promise<void> {
    this.needs.set(need.id, clone(need));
  }
  async claimSlot(needId: string): Promise<number | null> {
    const n = this.needs.get(needId);
    if (!n || n.slotsOpen <= 0) return null;
    n.slotsOpen -= 1;
    if (n.slotsOpen === 0) n.status = 'filled';
    return n.slotsOpen;
  }

  async getPool(id: string): Promise<Pool | null> {
    const p = this.pools.get(id);
    return p ? clone(p) : null;
  }
  async listPoolsByWeek(week: Week): Promise<Pool[]> {
    return [...this.pools.values()].filter((p) => p.week === week).map(clone);
  }
  async savePool(pool: Pool): Promise<void> {
    this.pools.set(pool.id, clone(pool));
  }

  async getInvite(id: string): Promise<Invite | null> {
    const i = this.invites.get(id);
    return i ? clone(i) : null;
  }
  async findInvite(personId: string, needId: string): Promise<Invite | null> {
    const i = [...this.invites.values()].find((x) => x.personId === personId && x.needId === needId);
    return i ? clone(i) : null;
  }
  async listInvitesForPool(poolId: string): Promise<Invite[]> {
    return [...this.invites.values()].filter((i) => i.poolId === poolId).map(clone);
  }
  async listInvitesForNeed(needId: string): Promise<Invite[]> {
    return [...this.invites.values()].filter((i) => i.needId === needId).map(clone);
  }
  async saveInvite(invite: Invite): Promise<void> {
    this.invites.set(invite.id, clone(invite));
  }

  async saveOutcome(outcome: Outcome): Promise<void> {
    this.outcomes.push(clone(outcome));
  }
  async saveRiskEvent(event: RiskEvent): Promise<void> {
    this.riskEvents.push(clone(event));
  }

  async getMetrics(teamId: string, period: string): Promise<InstitutionMetrics | null> {
    const m = this.metrics.get(key(teamId, period));
    return m ? clone(m) : null;
  }
  async saveMetrics(metrics: InstitutionMetrics): Promise<void> {
    this.metrics.set(key(metrics.teamId, metrics.period), clone(metrics));
  }
}
