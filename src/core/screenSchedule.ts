import { config, type Config } from '../config/index';
import { mulberry32 } from './rng';

const DAY_MS = 24 * 60 * 60 * 1000;

export function intervalDays(lonelyStreak: number, cfg: Config = config): number {
  if (lonelyStreak <= 0) return cfg.SCREEN_INTERVAL_NEUTRAL_DAYS;
  if (lonelyStreak === 1) return cfg.SCREEN_INTERVAL_BASE_DAYS;
  return cfg.SCREEN_INTERVAL_ELEVATED_DAYS;
}

function seed(personId: string, cycleSeq: number): number {
  let h = 2166136261;
  for (let i = 0; i < personId.length; i++) {
    h ^= personId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h ^ cycleSeq) >>> 0;
}

export function jitterDays(personId: string, cycleSeq: number, cfg: Config = config): number {
  const r = mulberry32(seed(personId, cycleSeq))();
  return Math.round((r * 2 - 1) * cfg.SCREEN_JITTER_DAYS); // [-J, +J]
}

export function seededHour(personId: string, cycleSeq: number, cfg: Config = config): number {
  const [lo, hi] = cfg.SCREEN_SEND_HOUR_RANGE;
  const r = mulberry32(seed(personId, cycleSeq) ^ 0x9e3779b9)();
  return lo + Math.floor(r * (hi - lo + 1));
}

export function nextDueAt(
  lastDeliveredAt: Date,
  lonelyStreak: number,
  personId: string,
  cycleSeq: number,
  cfg: Config = config,
): Date {
  const days = intervalDays(lonelyStreak, cfg) + jitterDays(personId, cycleSeq, cfg);
  const d = new Date(lastDeliveredAt.getTime() + days * DAY_MS);
  d.setHours(seededHour(personId, cycleSeq, cfg), 0, 0, 0);
  return d;
}
