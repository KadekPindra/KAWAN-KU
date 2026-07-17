import type { Anchor, Cycle, InviteCopy, Need } from '../domain/types';

export type InboundEvent =
  | { kind: 'screenAnswer'; personId: string; cycle: Cycle; q: 1 | 2 | 3; value: Anchor }
  | { kind: 'need'; personId: string; text: string }
  | { kind: 'claim'; personId: string; needId: string }
  | { kind: 'riskItem'; personId: string; positive: boolean }
  | { kind: 'selfReferral'; personId: string };

export interface MessagingPort {
  postScreening(personId: string, cycle: Cycle): Promise<void>; 

  deliverPool(need: Need, userIds: string[], copy: InviteCopy): Promise<void>;
  openClinicalDoor(userId: string): Promise<void>;
  receiveResponse(): AsyncIterable<InboundEvent>;
}
