import type { Cycle, InviteCopy, Need } from '../../domain/types';
import type { InboundEvent, MessagingPort } from '../../ports/messaging';

export class PortalAdapter implements MessagingPort {
  async sendWelcome(_personId: string): Promise<void> {
    throw new Error('NotImplemented: PortalAdapter.sendWelcome');
  }

  async postScreening(_personId: string, _cycle: Cycle): Promise<void> {
    throw new Error('NotImplemented: PortalAdapter.postScreening');
  }

  async deliverPool(_need: Need, _userIds: string[], _copy: InviteCopy): Promise<void> {
    throw new Error('NotImplemented: PortalAdapter.deliverPool');
  }

  async openClinicalDoor(_userId: string): Promise<void> {
    throw new Error('NotImplemented: PortalAdapter.openClinicalDoor');
  }

  receiveResponse(): AsyncIterable<InboundEvent> {
    throw new Error('NotImplemented: PortalAdapter.receiveResponse');
  }
}
