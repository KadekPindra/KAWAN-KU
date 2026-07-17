import pg from 'pg';
import type { Pool } from 'pg';
import type { Repository } from '../../ports/repository';
import type {
  Cycle,
  DetectionState,
  InstitutionMetrics,
  Invite,
  Need,
  Outcome,
  ParsedNeed,
  Person,
  Pool as PoolEntity,
  RiskEvent,
  Screening,
  Trend,
  Week,
} from '../../domain/types';

const j = (v: unknown): string | null => (v === null || v === undefined ? null : JSON.stringify(v));

export function rowToPerson(r: Record<string, unknown>): Person {
  return {
    id: r.id as string,
    teamId: r.team_id as string,
    displayName: r.display_name as string,
    slackUserId: (r.slack_user_id as string | null) ?? null,
    joinedAt: r.joined_at as Date,
    interests: (r.interests as string[]) ?? [],
    optedIn: r.opted_in as boolean,
    riskConsent: r.risk_consent as boolean,
  };
}

export function rowToScreening(r: Record<string, unknown>): Screening {
  return {
    id: r.id as string,
    teamId: r.team_id as string,
    personId: r.person_id as string,
    cycle: r.cycle as string,
    q1: (r.q1 as Screening['q1']) ?? null,
    q2: (r.q2 as Screening['q2']) ?? null,
    q3: (r.q3 as Screening['q3']) ?? null,
    ucla3Score: (r.ucla3_score as number | null) ?? null,
    lonely: (r.lonely as boolean | null) ?? null,
    deliveredAt: (r.delivered_at as Date | null) ?? null,
    lastSentAt: (r.last_sent_at as Date | null) ?? null,
    lastAnsweredAt: (r.last_answered_at as Date | null) ?? null,
    answeredAt: (r.answered_at as Date | null) ?? null,
    createdAt: r.created_at as Date,
  };
}

export function rowToDetection(r: Record<string, unknown>): DetectionState {
  return {
    teamId: r.team_id as string,
    personId: r.person_id as string,
    cycle: r.cycle as string,
    lonely: r.lonely as boolean,
    lonelyStreak: r.lonely_streak as number,
    trend: r.trend as Trend,
    flagged: r.flagged as boolean,
    clinicalSuggest: r.clinical_suggest as boolean,
  };
}

export function rowToNeed(r: Record<string, unknown>): Need {
  return {
    id: r.id as string,
    teamId: r.team_id as string,
    source: r.source as Need['source'],
    rawText: r.raw_text as string,
    parsed: (r.parsed as ParsedNeed | null) ?? null,
    slotsTotal: r.slots_total as number,
    slotsOpen: r.slots_open as number,
    week: r.week as string,
    status: r.status as Need['status'],
    createdAt: r.created_at as Date,
    authorPersonId: (r.author_person_id as string | null) ?? undefined,
    sourceUrl: (r.source_url as string | null) ?? undefined,
  };
}

export function rowToPool(r: Record<string, unknown>): PoolEntity {
  return {
    id: r.id as string,
    needId: r.need_id as string,
    week: r.week as string,
    memberIds: (r.member_ids as string[]) ?? [],
    skewedIds: (r.skewed_ids as string[]) ?? [],
  };
}

export function rowToInvite(r: Record<string, unknown>): Invite {
  return {
    id: r.id as string,
    poolId: r.pool_id as string,
    personId: r.person_id as string,
    needId: r.need_id as string,
    deliveredAt: (r.delivered_at as Date | null) ?? null,
    state: r.state as Invite['state'],
    claimedAt: (r.claimed_at as Date | null) ?? null,
  };
}

export function rowToMetrics(r: Record<string, unknown>): InstitutionMetrics {
  return {
    teamId: r.team_id as string,
    period: r.period as string,
    respondedCount: (r.responded_count as number | null) ?? null,
    lonelyCount: (r.lonely_count as number | null) ?? null,
    invitesSent: (r.invites_sent as number | null) ?? null,
    claimRate: (r.claim_rate as number | null) ?? null,
    avgUcla3: (r.avg_ucla3 as number | null) ?? null,
  };
}

export class PostgresRepository implements Repository {
  private readonly pool: Pool;

  constructor(connectionString = process.env.DATABASE_URL) {
    this.pool = new pg.Pool({ connectionString });
  }

  private async rows(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
    const res = await this.pool.query(sql, params);
    return res.rows as Record<string, unknown>[];
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getPerson(id: string): Promise<Person | null> {
    const rows = await this.rows('select * from people where id = $1', [id]);
    return rows[0] ? rowToPerson(rows[0]) : null;
  }
  async listPeople(teamId: string): Promise<Person[]> {
    return (await this.rows('select * from people where team_id = $1', [teamId])).map(rowToPerson);
  }
  async savePerson(p: Person): Promise<void> {
    await this.pool.query(
      `insert into people (id, team_id, display_name, slack_user_id, joined_at, interests, opted_in, risk_consent)
       values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)
       on conflict (id) do update set
         team_id=excluded.team_id, display_name=excluded.display_name, slack_user_id=excluded.slack_user_id,
         joined_at=excluded.joined_at, interests=excluded.interests, opted_in=excluded.opted_in, risk_consent=excluded.risk_consent`,
      [p.id, p.teamId, p.displayName, p.slackUserId, p.joinedAt, j(p.interests), p.optedIn, p.riskConsent],
    );
  }

  async getScreening(teamId: string, personId: string, cycle: Cycle): Promise<Screening | null> {
    const rows = await this.rows(
      'select * from screenings where team_id=$1 and person_id=$2 and cycle=$3',
      [teamId, personId, cycle],
    );
    return rows[0] ? rowToScreening(rows[0]) : null;
  }
  async listScreenings(teamId: string, cycle: Cycle): Promise<Screening[]> {
    return (await this.rows('select * from screenings where team_id=$1 and cycle=$2', [teamId, cycle])).map(
      rowToScreening,
    );
  }
  async listScreeningsForPerson(teamId: string, personId: string): Promise<Screening[]> {
    return (
      await this.rows('select * from screenings where team_id=$1 and person_id=$2 order by cycle', [teamId, personId])
    ).map(rowToScreening);
  }
  async saveScreening(s: Screening): Promise<void> {
    await this.pool.query(
      `insert into screenings (id, team_id, person_id, cycle, q1, q2, q3, ucla3_score, lonely, delivered_at, last_sent_at, last_answered_at, answered_at, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (id) do update set
         q1=excluded.q1, q2=excluded.q2, q3=excluded.q3, ucla3_score=excluded.ucla3_score, lonely=excluded.lonely,
         delivered_at=excluded.delivered_at, last_sent_at=excluded.last_sent_at, last_answered_at=excluded.last_answered_at,
         answered_at=excluded.answered_at`,
      [
        s.id, s.teamId, s.personId, s.cycle, s.q1, s.q2, s.q3, s.ucla3Score, s.lonely,
        s.deliveredAt, s.lastSentAt, s.lastAnsweredAt, s.answeredAt, s.createdAt,
      ],
    );
  }

  async getDetectionState(teamId: string, personId: string, cycle: Cycle): Promise<DetectionState | null> {
    const rows = await this.rows(
      'select * from detection_state where team_id=$1 and person_id=$2 and cycle=$3',
      [teamId, personId, cycle],
    );
    return rows[0] ? rowToDetection(rows[0]) : null;
  }
  async listDetectionStates(teamId: string, cycle: Cycle): Promise<DetectionState[]> {
    return (await this.rows('select * from detection_state where team_id=$1 and cycle=$2', [teamId, cycle])).map(
      rowToDetection,
    );
  }
  async saveDetectionState(d: DetectionState): Promise<void> {
    await this.pool.query(
      `insert into detection_state (team_id, person_id, cycle, lonely, lonely_streak, trend, flagged, clinical_suggest)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (team_id, person_id, cycle) do update set
         lonely=excluded.lonely, lonely_streak=excluded.lonely_streak, trend=excluded.trend,
         flagged=excluded.flagged, clinical_suggest=excluded.clinical_suggest`,
      [d.teamId, d.personId, d.cycle, d.lonely, d.lonelyStreak, d.trend, d.flagged, d.clinicalSuggest],
    );
  }

  async getNeed(id: string): Promise<Need | null> {
    const rows = await this.rows('select * from needs where id=$1', [id]);
    return rows[0] ? rowToNeed(rows[0]) : null;
  }
  async listNeeds(teamId: string, week: Week): Promise<Need[]> {
    return (await this.rows('select * from needs where team_id=$1 and week=$2', [teamId, week])).map(rowToNeed);
  }
  async listOpenNeeds(teamId: string, week: Week): Promise<Need[]> {
    return (
      await this.rows("select * from needs where team_id=$1 and week=$2 and status='open'", [teamId, week])
    ).map(rowToNeed);
  }
  async saveNeed(n: Need): Promise<void> {
    await this.pool.query(
      `insert into needs (id, team_id, source, raw_text, parsed, slots_total, slots_open, week, status, created_at, author_person_id, source_url)
       values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12)
       on conflict (id) do update set
         source=excluded.source, raw_text=excluded.raw_text, parsed=excluded.parsed,
         slots_total=excluded.slots_total, slots_open=excluded.slots_open, status=excluded.status`,
      [
        n.id, n.teamId, n.source, n.rawText, j(n.parsed), n.slotsTotal, n.slotsOpen, n.week, n.status, n.createdAt,
        n.authorPersonId ?? null, n.sourceUrl ?? null,
      ],
    );
  }
  // Atomik §5.3 — pemenang tunggal walau banyak klaim serempak.
  async claimSlot(needId: string): Promise<number | null> {
    const rows = await this.rows(
      `update needs set
         slots_open = slots_open - 1,
         status = case when slots_open - 1 <= 0 then 'filled' else status end
       where id = $1 and slots_open > 0
       returning slots_open`,
      [needId],
    );
    return rows[0] ? (rows[0].slots_open as number) : null;
  }

  async getPool(id: string): Promise<PoolEntity | null> {
    const rows = await this.rows('select * from pools where id=$1', [id]);
    return rows[0] ? rowToPool(rows[0]) : null;
  }
  async listPoolsByWeek(week: Week): Promise<PoolEntity[]> {
    return (await this.rows('select * from pools where week=$1', [week])).map(rowToPool);
  }
  async savePool(p: PoolEntity): Promise<void> {
    await this.pool.query(
      `insert into pools (id, need_id, week, member_ids, skewed_ids)
       values ($1,$2,$3,$4::jsonb,$5::jsonb)
       on conflict (id) do update set need_id=excluded.need_id, week=excluded.week,
         member_ids=excluded.member_ids, skewed_ids=excluded.skewed_ids`,
      [p.id, p.needId, p.week, j(p.memberIds), j(p.skewedIds)],
    );
  }

  async getInvite(id: string): Promise<Invite | null> {
    const rows = await this.rows('select * from invites where id=$1', [id]);
    return rows[0] ? rowToInvite(rows[0]) : null;
  }
  async findInvite(personId: string, needId: string): Promise<Invite | null> {
    const rows = await this.rows('select * from invites where person_id=$1 and need_id=$2 limit 1', [personId, needId]);
    return rows[0] ? rowToInvite(rows[0]) : null;
  }
  async listInvitesForPool(poolId: string): Promise<Invite[]> {
    return (await this.rows('select * from invites where pool_id=$1', [poolId])).map(rowToInvite);
  }
  async listInvitesForNeed(needId: string): Promise<Invite[]> {
    return (await this.rows('select * from invites where need_id=$1', [needId])).map(rowToInvite);
  }
  async saveInvite(i: Invite): Promise<void> {
    await this.pool.query(
      `insert into invites (id, pool_id, person_id, need_id, delivered_at, state, claimed_at)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (id) do update set state=excluded.state, delivered_at=excluded.delivered_at, claimed_at=excluded.claimed_at`,
      [i.id, i.poolId, i.personId, i.needId, i.deliveredAt, i.state, i.claimedAt],
    );
  }

  async saveOutcome(o: Outcome): Promise<void> {
    await this.pool.query(
      `insert into outcomes (id, invite_id, person_id, need_id, showed_up, created_at)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do update set showed_up=excluded.showed_up`,
      [o.id, o.inviteId, o.personId, o.needId, o.showedUp, o.createdAt],
    );
  }
  async saveRiskEvent(e: RiskEvent): Promise<void> {
    await this.pool.query(
      `insert into risk_events (id, person_id, cycle, source, handed_off_at, created_at)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (id) do nothing`,
      [e.id, e.personId, e.cycle, e.source, e.handedOffAt, e.createdAt],
    );
  }

  async getMetrics(teamId: string, period: string): Promise<InstitutionMetrics | null> {
    const rows = await this.rows('select * from institution_metrics where team_id=$1 and period=$2', [teamId, period]);
    return rows[0] ? rowToMetrics(rows[0]) : null;
  }
  async saveMetrics(m: InstitutionMetrics): Promise<void> {
    await this.pool.query(
      `insert into institution_metrics (team_id, period, responded_count, lonely_count, invites_sent, claim_rate, avg_ucla3)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (team_id, period) do update set
         responded_count=excluded.responded_count, lonely_count=excluded.lonely_count,
         invites_sent=excluded.invites_sent, claim_rate=excluded.claim_rate, avg_ucla3=excluded.avg_ucla3`,
      [m.teamId, m.period, m.respondedCount, m.lonelyCount, m.invitesSent, m.claimRate, m.avgUcla3],
    );
  }
}
