import { config, type Config } from '../config/index';
import type { Cycle, DetectionState, Screening, Trend } from '../domain/types';
import type { Repository } from '../ports/repository';

export interface Detection {
  lonely: boolean;
  lonelyStreak: number;
  trend: Trend;
  flagged: boolean;
  clinicalSuggest: boolean;
}

export function deriveDetection(answered: Screening[], cfg: Config = config): Detection {
  const current = answered[answered.length - 1];
  const score = current.ucla3Score ?? 0;
  const lonely = score >= cfg.LONELY_THRESHOLD;

  let lonelyStreak = 0;
  for (let i = answered.length - 1; i >= 0; i--) {
    if ((answered[i].ucla3Score ?? 0) >= cfg.LONELY_THRESHOLD) lonelyStreak++;
    else break;
  }

  let trend: Trend;
  if (answered.length < 2) {
    trend = 'new';
  } else {
    const prev = answered[answered.length - 2].ucla3Score ?? 0;
    if (score < prev) trend = 'improving';
    else if (score > prev) trend = 'worsening';
    else trend = 'flat';
  }

  const flagged = lonely;
  const clinicalSuggest = lonelyStreak >= cfg.CLINICAL_CYCLES && trend !== 'improving';
  return { lonely, lonelyStreak, trend, flagged, clinicalSuggest };
}

export class DetectionService {
  constructor(private readonly repo: Repository) {}

  async run(teamId: string, cycle: Cycle): Promise<DetectionState[]> {
    const thisCycle = await this.repo.listScreenings(teamId, cycle);
    const out: DetectionState[] = [];

    for (const s of thisCycle) {
      if (s.ucla3Score === null) continue; // non-response: tak ada state deteksi siklus ini
      const history = (await this.repo.listScreeningsForPerson(teamId, s.personId)).filter(
        (h) => h.ucla3Score !== null && h.cycle <= cycle,
      );
      if (history.length === 0) continue;

      const d = deriveDetection(history);
      const state: DetectionState = { teamId, personId: s.personId, cycle, ...d };
      await this.repo.saveDetectionState(state);
      out.push(state);
    }
    return out;
  }
}
