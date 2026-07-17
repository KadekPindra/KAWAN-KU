import 'dotenv/config';

export type Cadence = 'monthly' | 'weekly';

export interface AffinityWeights {
  affinity: number; 
  effort: number;
  novelty: number; 
  timing: number; 
}

export interface Config {
  INSTITUTION_NAME: string;
  LONELY_THRESHOLD: number;
  CLINICAL_CYCLES: number;
  SCREEN_CADENCE: Cadence;
  SCREEN_INTERVAL_NEUTRAL_DAYS: number;   
  SCREEN_INTERVAL_BASE_DAYS: number;      
  SCREEN_INTERVAL_ELEVATED_DAYS: number;  
  SCREEN_JITTER_DAYS: number;
  SCREEN_SEND_HOUR_RANGE: [number, number];
  SCREEN_QUESTION_GAP_DAYS: number;
  ROUTE_CADENCE: Cadence;
  POOL_SIZE: number;
  MAX_SKEW_RATIO: number;
  MAX_POOLS_PER_WEEK: number;
  SUPPLY_FLOOR: number;
  K_ANON: number;
  affinityWeights: AffinityWeights;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cadence(name: string, fallback: Cadence): Cadence {
  const raw = process.env[name]?.trim();
  return raw === 'monthly' || raw === 'weekly' ? raw : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();
  return raw ? raw : fallback;
}

export const config: Config = {
  INSTITUTION_NAME: str('INSTITUTION_NAME', 'kampus/kantor kamu'),
  LONELY_THRESHOLD: num('LONELY_THRESHOLD', 6),
  CLINICAL_CYCLES: num('CLINICAL_CYCLES', 3),
  SCREEN_CADENCE: cadence('SCREEN_CADENCE', 'monthly'),
  SCREEN_INTERVAL_NEUTRAL_DAYS: num('SCREEN_INTERVAL_NEUTRAL_DAYS', 42),
  SCREEN_INTERVAL_BASE_DAYS: num('SCREEN_INTERVAL_BASE_DAYS', 28),
  SCREEN_INTERVAL_ELEVATED_DAYS: num('SCREEN_INTERVAL_ELEVATED_DAYS', 14),
  SCREEN_JITTER_DAYS: num('SCREEN_JITTER_DAYS', 5),
  SCREEN_SEND_HOUR_RANGE: [num('SCREEN_SEND_HOUR_MIN', 8), num('SCREEN_SEND_HOUR_MAX', 19)],
  SCREEN_QUESTION_GAP_DAYS: num('SCREEN_QUESTION_GAP_DAYS', 1),
  ROUTE_CADENCE: cadence('ROUTE_CADENCE', 'weekly'),
  POOL_SIZE: num('POOL_SIZE', 6),
  MAX_SKEW_RATIO: num('MAX_SKEW_RATIO', 1 / 3),
  MAX_POOLS_PER_WEEK: num('MAX_POOLS_PER_WEEK', 2),
  SUPPLY_FLOOR: num('SUPPLY_FLOOR', 3),
  K_ANON: num('K_ANON', 20),
  affinityWeights: {
    affinity: num('W_AFFINITY', 0.5),
    effort: num('W_EFFORT', 0.2),
    novelty: num('W_NOVELTY', 0.15),
    timing: num('W_TIMING', 0.15),
  },
};
