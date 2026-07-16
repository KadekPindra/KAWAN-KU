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
} from '../domain/types';

export interface Repository {
  getPerson(id: string): Promise<Person | null>;
  listPeople(teamId: string): Promise<Person[]>;
  savePerson(person: Person): Promise<void>;

  getScreening(teamId: string, personId: string, cycle: Cycle): Promise<Screening | null>;
  listScreenings(teamId: string, cycle: Cycle): Promise<Screening[]>;
  listScreeningsForPerson(teamId: string, personId: string): Promise<Screening[]>;
  saveScreening(screening: Screening): Promise<void>;

  getDetectionState(teamId: string, personId: string, cycle: Cycle): Promise<DetectionState | null>;
  listDetectionStates(teamId: string, cycle: Cycle): Promise<DetectionState[]>;
  saveDetectionState(state: DetectionState): Promise<void>;

  getNeed(id: string): Promise<Need | null>;
  listNeeds(teamId: string, week: Week): Promise<Need[]>;
  listOpenNeeds(teamId: string, week: Week): Promise<Need[]>;
  saveNeed(need: Need): Promise<void>;
  claimSlot(needId: string): Promise<number | null>;

  getPool(id: string): Promise<Pool | null>;
  listPoolsByWeek(week: Week): Promise<Pool[]>;
  savePool(pool: Pool): Promise<void>;

  getInvite(id: string): Promise<Invite | null>;
  findInvite(personId: string, needId: string): Promise<Invite | null>;
  listInvitesForPool(poolId: string): Promise<Invite[]>;
  listInvitesForNeed(needId: string): Promise<Invite[]>;
  saveInvite(invite: Invite): Promise<void>;

  saveOutcome(outcome: Outcome): Promise<void>;
  saveRiskEvent(event: RiskEvent): Promise<void>;

  getMetrics(teamId: string, period: string): Promise<InstitutionMetrics | null>;
  saveMetrics(metrics: InstitutionMetrics): Promise<void>;
}
