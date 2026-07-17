import { describe, it, expect } from 'vitest';
import { config } from '../src/config/index';

describe('config §9', () => {
  it('memuat default tunable sesuai tech-spec', () => {
    expect(config.LONELY_THRESHOLD).toBe(6);
    expect(config.CLINICAL_CYCLES).toBe(3);
    expect(config.SCREEN_CADENCE).toBe('monthly');
    expect(config.SCREEN_INTERVAL_NEUTRAL_DAYS).toBe(42);
    expect(config.SCREEN_INTERVAL_BASE_DAYS).toBe(28);
    expect(config.SCREEN_INTERVAL_ELEVATED_DAYS).toBe(14);
    expect(config.SCREEN_JITTER_DAYS).toBe(5);
    expect(config.SCREEN_SEND_HOUR_RANGE).toEqual([8, 19]);
    expect(config.ROUTE_CADENCE).toBe('weekly');
    expect(config.POOL_SIZE).toBe(6);
    expect(config.MAX_SKEW_RATIO).toBeCloseTo(1 / 3);
    expect(config.MAX_POOLS_PER_WEEK).toBe(2);
    expect(config.K_ANON).toBe(20);
  });

  it('dilusi terjaga: MAX_SKEW_RATIO <= 1/3', () => {
    expect(config.MAX_SKEW_RATIO).toBeLessThanOrEqual(1 / 3 + 1e-9);
  });

  it('bobot affinity ada keempatnya', () => {
    const w = config.affinityWeights;
    expect([w.affinity, w.effort, w.novelty, w.timing].every((x) => x >= 0)).toBe(true);
  });
});
