import type { InboundEvent } from '../ports/messaging';
import type { ScreeningService } from '../core/screening';
import type { NeedHarvester } from '../core/needHarvester';
import type { ClaimService } from '../core/claim';
import type { ClinicalRouter } from '../core/clinicalRouter';
import type { ReverseMatchService } from '../core/reverseMatch';

export interface ContinuousDeps {
  teamId: string;
  week: string;
  screening: ScreeningService;
  harvester: NeedHarvester;
  claim: ClaimService;
  clinical: ClinicalRouter;
  reverseMatch: ReverseMatchService;
}

export async function handleInbound(deps: ContinuousDeps, e: InboundEvent): Promise<void> {
  switch (e.kind) {
    case 'screenAnswer': {
      const s = await deps.screening.recordAnswer(deps.teamId, e.personId, e.cycle, e.q, e.value);
      if (s.ucla3Score !== null) await deps.reverseMatch.offerAfterScreening(deps.teamId, deps.week, e.personId);
      return;
    }
    case 'need':
      await deps.harvester.collect(deps.teamId, 'member', e.text, deps.week, {
        authorPersonId: e.personId,
        sourceUrl: e.sourceUrl,
      });
      return;
    case 'claim':
      await deps.claim.claim(e.personId, e.needId);
      return;
    case 'decline':
      await deps.claim.decline(e.personId, e.needId);
      return;
    case 'riskItem':
      if (e.positive) await deps.clinical.handle(e.personId, 'risk_item');
      return;
    case 'selfReferral':
      await deps.clinical.handle(e.personId, 'self_referral');
      return;
  }
}
