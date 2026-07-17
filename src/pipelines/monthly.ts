import type { DetectionState } from '../domain/types';
import type { Repository } from '../ports/repository';
import type { MessagingPort } from '../ports/messaging';
import { DetectionService } from '../core/detection';
import { ClinicalRouter } from '../core/clinicalRouter';

export interface MonthlyDeps {
  repo: Repository;
  messaging: MessagingPort;
}

export interface MonthlyResult {
  states: DetectionState[];
  nudged: string[];
}

export async function runMonthly(
  deps: MonthlyDeps,
  teamId: string,
  cycle: string,
): Promise<MonthlyResult> {
  const states = await new DetectionService(deps.repo).run(teamId, cycle);

  const clinical = new ClinicalRouter(deps.repo, deps.messaging);
  const nudged: string[] = [];
  for (const s of states) {
    if (s.clinicalSuggest) {
      await clinical.softNudge(s.personId);
      nudged.push(s.personId);
    }
  }

  return { states, nudged };
}
