import { describe, it, expect } from 'vitest';
import { intervalDays, jitterDays, seededHour, nextDueAt } from '../src/core/screenSchedule';
import { config } from '../src/config/index';

describe('screenSchedule §5.1.1 — interval adaptif + jitter', () => {
  it('interval mengecil saat streak naik, membesar saat streak 0 (survey berkurang saat membaik)', () => {
    expect(intervalDays(0)).toBe(config.SCREEN_INTERVAL_NEUTRAL_DAYS);
    expect(intervalDays(1)).toBe(config.SCREEN_INTERVAL_BASE_DAYS);
    expect(intervalDays(2)).toBe(config.SCREEN_INTERVAL_ELEVATED_DAYS);
    expect(intervalDays(5)).toBe(config.SCREEN_INTERVAL_ELEVATED_DAYS);
    expect(intervalDays(0)).toBeGreaterThan(intervalDays(2));
  });

  it('jitter deterministik (input sama → offset sama) dan dalam ±SCREEN_JITTER_DAYS', () => {
    expect(jitterDays('dewi', 3)).toBe(jitterDays('dewi', 3));
    for (const p of ['dewi', 'rangga', 'sari', 'bagus']) {
      expect(Math.abs(jitterDays(p, 2))).toBeLessThanOrEqual(config.SCREEN_JITTER_DAYS);
    }
  });

  it('offset berbeda antar orang → cadence tak bisa dibandingkan antar rekan', () => {
    const offsets = ['a', 'b', 'c', 'd', 'e', 'f'].map((p) => jitterDays(p, 1));
    expect(new Set(offsets).size).toBeGreaterThan(1);
  });

  it('seededHour selalu di dalam SCREEN_SEND_HOUR_RANGE', () => {
    const [lo, hi] = config.SCREEN_SEND_HOUR_RANGE;
    for (const p of ['a', 'b', 'c', 'd', 'e']) {
      const h = seededHour(p, 2);
      expect(h).toBeGreaterThanOrEqual(lo);
      expect(h).toBeLessThanOrEqual(hi);
    }
  });

  it('nextDueAt maju dari lastDelivered dan pakai jam ter-seed', () => {
    const last = new Date('2026-06-01T00:00:00Z');
    const [lo, hi] = config.SCREEN_SEND_HOUR_RANGE;
    const due = nextDueAt(last, 0, 'dewi', 3);
    expect(due.getTime()).toBeGreaterThan(last.getTime());
    expect(due.getHours()).toBeGreaterThanOrEqual(lo);
    expect(due.getHours()).toBeLessThanOrEqual(hi);
  });

  it('streak elevated jatuh tempo lebih cepat daripada neutral', () => {
    const last = new Date('2026-06-01T00:00:00Z');
    const elevated = nextDueAt(last, 3, 'x', 1);
    const neutral = nextDueAt(last, 0, 'x', 1);
    expect(elevated.getTime()).toBeLessThan(neutral.getTime());
  });
});
