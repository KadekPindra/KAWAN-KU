import { config, type Config } from '../config/index';
import type { Need, Person, Pool, Week } from '../domain/types';
import { mulberry32, shuffle, type Rng } from './rng';

export interface MatchInput {
  needs: Need[];
  roster: Person[];
  flagged: ReadonlySet<string>;
  week: Week;
  rng?: Rng;
  cfg?: Config;
}

export interface MatchResult {
  pools: Pool[];
  skippedFlagged: string[];
}

function affinityScore(need: Need, p: Person, cfg: Config): number {
  const parsed = need.parsed;
  if (!parsed) return 0;
  const interests = p.interests.map((x) => x.toLowerCase());
  let a = 0;
  if (interests.includes(parsed.activity.toLowerCase())) a += 1;
  if (interests.includes(parsed.skill.toLowerCase())) a += 0.5;
  return cfg.affinityWeights.affinity * a;
}

export function batchMatch(input: MatchInput): MatchResult {
  const cfg = input.cfg ?? config;
  const rng = input.rng ?? mulberry32(1);
  const poolsPerPerson = new Map<string, number>();
  const placedFlagged = new Set<string>();
  const pools: Pool[] = [];

  const ordered = [...input.needs].sort(
    (a, b) => a.slotsOpen - b.slotsOpen || a.id.localeCompare(b.id),
  );

  for (const need of ordered) {
    const eligible = input.roster.filter(
      (p) => p.teamId === need.teamId && (poolsPerPerson.get(p.id) ?? 0) < cfg.MAX_POOLS_PER_WEEK,
    );

    const ranked = shuffle(eligible, rng)
      .map((p) => ({ id: p.id, score: affinityScore(need, p, cfg) }))
      .sort((a, b) => b.score - a.score);

    const flaggedRanked = ranked
      .filter((r) => input.flagged.has(r.id))
      .sort((a, b) => Number(placedFlagged.has(a.id)) - Number(placedFlagged.has(b.id)));
    const generalRanked = ranked.filter((r) => !input.flagged.has(r.id));

    const target = Math.min(cfg.POOL_SIZE, ranked.length);
    const maxSkew = Math.floor(target * cfg.MAX_SKEW_RATIO);

    const skewed = flaggedRanked.slice(0, maxSkew).map((r) => r.id);
    const general = generalRanked.slice(0, target - skewed.length).map((r) => r.id);

    let memberIds = [...skewed, ...general];
    let skewedIds = [...skewed];
    while (
      skewedIds.length > Math.floor(memberIds.length * cfg.MAX_SKEW_RATIO) &&
      skewedIds.length > 0
    ) {
      const drop = skewedIds[skewedIds.length - 1];
      skewedIds = skewedIds.slice(0, -1);
      memberIds = memberIds.filter((id) => id !== drop);
    }

    if (memberIds.length === 0) continue;

    for (const id of memberIds) poolsPerPerson.set(id, (poolsPerPerson.get(id) ?? 0) + 1);
    for (const id of skewedIds) placedFlagged.add(id);

    pools.push({
      id: `pool:${need.id}:${input.week}`,
      needId: need.id,
      week: input.week,
      memberIds: shuffle(memberIds, rng),
      skewedIds,
    });
  }

  const skippedFlagged = [...input.flagged].filter((id) => (poolsPerPerson.get(id) ?? 0) === 0);
  return { pools, skippedFlagged };
}
