import type { Need } from '../domain/types';
import type { ClaimOutcome } from '../ports/messaging';

export interface ClaimAcknowledger {
  acknowledge(need: Need, outcome: ClaimOutcome): Promise<string>;
}

function activityOf(need: Need): string {
  return need.parsed?.activity ?? 'kegiatan itu';
}

export class TemplateClaimAcknowledger implements ClaimAcknowledger {
  async acknowledge(need: Need, outcome: ClaimOutcome): Promise<string> {
    if (outcome === 'claimed') return `Mantap, makasih udah isi slot ${activityOf(need)}! 🙌`;
    if (outcome === 'full') return `Yah, slot ${activityOf(need)} udah penuh duluan — coba kebutuhan lain ya.`;
    return `Oke, gapapa — lain kali ya buat ${activityOf(need)}. 👍`;
  }
}
