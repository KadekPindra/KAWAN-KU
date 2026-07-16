import { describe, it, expect } from 'vitest';
import {
  rowToPerson,
  rowToScreening,
  rowToNeed,
  rowToPool,
  rowToInvite,
  rowToMetrics,
} from '../src/adapters/postgres/repository';

// Mapper murni: pg sudah mem-parse jsonb & timestamptz, jadi tak butuh DB live.
describe('postgres row mappers', () => {
  it('rowToPerson: interests jsonb terparse, slack null aman', () => {
    const p = rowToPerson({
      id: 'p1',
      team_id: 'T',
      display_name: 'Dewi',
      slack_user_id: null,
      joined_at: new Date('2026-01-01'),
      interests: ['futsal', 'musik'],
      opted_in: true,
      risk_consent: false,
    });
    expect(p).toEqual({
      id: 'p1',
      teamId: 'T',
      displayName: 'Dewi',
      slackUserId: null,
      joinedAt: new Date('2026-01-01'),
      interests: ['futsal', 'musik'],
      optedIn: true,
      riskConsent: false,
    });
  });

  it('rowToScreening: non-response (answered null, score null)', () => {
    const s = rowToScreening({
      id: 'T:p1:2026-06',
      team_id: 'T',
      person_id: 'p1',
      cycle: '2026-06',
      q1: null,
      q2: null,
      q3: null,
      ucla3_score: null,
      lonely: null,
      delivered_at: new Date('2026-06-01'),
      answered_at: null,
      created_at: new Date('2026-06-01'),
    });
    expect(s.ucla3Score).toBeNull();
    expect(s.answeredAt).toBeNull();
    expect(s.deliveredAt).toEqual(new Date('2026-06-01'));
  });

  it('rowToNeed: parsed jsonb -> ParsedNeed, null aman', () => {
    const parsed = { activity: 'futsal', skill: 'casual', slots: 1, when: 'sore', effort: 'low' };
    expect(rowToNeed({ id: 'n', team_id: 'T', source: 'member', raw_text: 'x', parsed, slots_total: 1, slots_open: 1, week: 'W', status: 'open', created_at: new Date() }).parsed).toEqual(parsed);
    expect(rowToNeed({ id: 'n', team_id: 'T', source: 'member', raw_text: 'x', parsed: null, slots_total: 1, slots_open: 1, week: 'W', status: 'open', created_at: new Date() }).parsed).toBeNull();
  });

  it('rowToPool: member_ids/skewed_ids jsonb array', () => {
    const p = rowToPool({ id: 'pool', need_id: 'n', week: 'W', member_ids: ['a', 'b'], skewed_ids: ['b'] });
    expect(p.memberIds).toEqual(['a', 'b']);
    expect(p.skewedIds).toEqual(['b']);
  });

  it('rowToInvite: state + claimed null', () => {
    const i = rowToInvite({ id: 'i', pool_id: 'pool', person_id: 'p1', need_id: 'n', delivered_at: new Date(), state: 'shown', claimed_at: null });
    expect(i.state).toBe('shown');
    expect(i.claimedAt).toBeNull();
  });

  it('rowToMetrics: baris disuppress (null) terpetakan apa adanya', () => {
    const m = rowToMetrics({ team_id: 'T', period: '2026-06', responded_count: null, lonely_count: null, invites_sent: null, claim_rate: null, avg_ucla3: null });
    expect(m).toEqual({
      teamId: 'T',
      period: '2026-06',
      respondedCount: null,
      lonelyCount: null,
      invitesSent: null,
      claimRate: null,
      avgUcla3: null,
    });
  });
});
