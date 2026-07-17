import type { Anchor, Cycle, InviteCopy, Need } from '../domain/types';

export type InboundEvent =
  | { kind: 'screenAnswer'; personId: string; cycle: Cycle; q: 1 | 2 | 3; value: Anchor }
  | { kind: 'need'; personId: string; text: string; sourceUrl?: string }
  | { kind: 'claim'; personId: string; needId: string }
  | { kind: 'decline'; personId: string; needId: string }
  | { kind: 'riskItem'; personId: string; positive: boolean }
  | { kind: 'selfReferral'; personId: string };

export type ClaimOutcome = 'claimed' | 'declined' | 'full';

export interface MessagingPort {
  sendWelcome(personId: string): Promise<void>;
  postScreeningQuestion(personId: string, cycle: Cycle, q: 1 | 2 | 3, text: string): Promise<void>;
  postRiskItem(personId: string): Promise<void>;

  deliverPool(need: Need, userIds: string[], copy: InviteCopy): Promise<void>;
  sendClaimAck(personId: string, need: Need, outcome: ClaimOutcome, text: string): Promise<void>;
  openClinicalDoor(userId: string): Promise<void>;
  receiveResponse(): AsyncIterable<InboundEvent>;
}
