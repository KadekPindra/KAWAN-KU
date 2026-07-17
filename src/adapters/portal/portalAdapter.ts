import type { Cycle, InviteCopy, Need } from '../../domain/types';
import type { ClaimOutcome, InboundEvent, MessagingPort } from '../../ports/messaging';

export class PortalAdapter implements MessagingPort {
  async sendWelcome(_personId: string): Promise<void> {
    throw new Error('NotImplemented: PortalAdapter.sendWelcome');
  }

  async postScreeningQuestion(_personId: string, _cycle: Cycle, _q: 1 | 2 | 3, _text: string): Promise<void> {
    throw new Error('NotImplemented: PortalAdapter.postScreeningQuestion');
  }

  async postRiskItem(_personId: string): Promise<void> {
    throw new Error('NotImplemented: PortalAdapter.postRiskItem');
  }

  async deliverPool(_need: Need, _userIds: string[], _copy: InviteCopy): Promise<void> {
    throw new Error('NotImplemented: PortalAdapter.deliverPool');
  }

  async sendClaimAck(_personId: string, _need: Need, _outcome: ClaimOutcome, _text: string): Promise<void> {
    throw new Error('NotImplemented: PortalAdapter.sendClaimAck');
  }

  async openClinicalDoor(_userId: string): Promise<void> {
    throw new Error('NotImplemented: PortalAdapter.openClinicalDoor');
  }

  receiveResponse(): AsyncIterable<InboundEvent> {
    throw new Error('NotImplemented: PortalAdapter.receiveResponse');
  }
}
