import { describe, it, expect } from 'vitest';
import { batchMatch } from '../src/core/batchMatcher';
import { mulberry32 } from '../src/core/rng';
import { config } from '../src/config/index';
import type { Need, Person } from '../src/domain/types';

function people(prefix: string, n: number): Person[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    teamId: 'T',
    displayName: `${prefix}${i}`,
    slackUserId: null,
    joinedAt: new Date('2026-01-01'),
    interests: [],
    optedIn: true,
    riskConsent: false,
  }));
}

function need(id: string, slots: number): Need {
  return {
    id,
    teamId: 'T',
    source: 'member',
    rawText: id,
    parsed: null,
    slotsTotal: slots,
    slotsOpen: slots,
    week: '2026-W01',
    status: 'open',
    createdAt: new Date('2026-01-01'),
  };
}

describe('BatchMatcher — dilusi (C1)', () => {
  it('flagged dalam pool tidak melebihi MAX_SKEW_RATIO', () => {
    const roster = [...people('f', 6), ...people('g', 6)];
    const flagged = new Set(people('f', 6).map((p) => p.id));

    const { pools } = batchMatch({
      needs: [need('n', 6)],
      roster,
      flagged,
      week: '2026-W01',
      rng: mulberry32(42),
    });

    expect(pools).toHaveLength(1);
    const pool = pools[0];
    expect(pool.memberIds.length).toBe(config.POOL_SIZE);
    expect(pool.skewedIds.length / pool.memberIds.length).toBeLessThanOrEqual(config.MAX_SKEW_RATIO + 1e-9);
    expect(pool.skewedIds.every((id) => flagged.has(id))).toBe(true);
  });
});

describe('BatchMatcher — anti-spam (C2)', () => {
  it('tak seorang pun masuk lebih dari MAX_POOLS_PER_WEEK pool', () => {
    const roster = people('p', 3);
    const needs = Array.from({ length: 5 }, (_, i) => need(`n${i}`, 6));

    const { pools } = batchMatch({
      needs,
      roster,
      flagged: new Set(),
      week: '2026-W01',
      rng: mulberry32(7),
    });

    const count = new Map<string, number>();
    for (const pool of pools) for (const id of pool.memberIds) count.set(id, (count.get(id) ?? 0) + 1);
    for (const c of count.values()) expect(c).toBeLessThanOrEqual(config.MAX_POOLS_PER_WEEK);
  });
});

describe('BatchMatcher — supply-risk (C3)', () => {
  it('supply kurang => sebagian flagged di-skip (bukan di-spam)', () => {
    const roster = [...people('f', 5), ...people('g', 10)];
    const flagged = new Set(people('f', 5).map((p) => p.id));

    const { skippedFlagged } = batchMatch({
      needs: [need('n', 6)],
      roster,
      flagged,
      week: '2026-W01',
      rng: mulberry32(1),
    });

    // 1 pool, cap skew = floor(6/3) = 2 → 3 flagged tak kebagian
    expect(skippedFlagged.length).toBe(3);
  });

  it('supply cukup => semua flagged kebagian minimal 1 pool', () => {
    const roster = [...people('f', 5), ...people('g', 10)];
    const flagged = new Set(people('f', 5).map((p) => p.id));

    const { skippedFlagged } = batchMatch({
      needs: [need('n0', 6), need('n1', 6), need('n2', 6)],
      roster,
      flagged,
      week: '2026-W01',
      rng: mulberry32(1),
    });

    expect(skippedFlagged).toHaveLength(0);
  });
});

describe('BatchMatcher — deterministik', () => {
  it('seed sama => hasil identik', () => {
    const roster = [...people('f', 4), ...people('g', 8)];
    const flagged = new Set(people('f', 4).map((p) => p.id));
    const args = { needs: [need('n', 6)], roster, flagged, week: '2026-W01' as const };

    const a = batchMatch({ ...args, rng: mulberry32(99) });
    const b = batchMatch({ ...args, rng: mulberry32(99) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
