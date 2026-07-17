import type { ClaimOutcome, MessagingPort, InboundEvent } from '../../ports/messaging';
import type { Cycle, InviteCopy, Need } from '../../domain/types';

type PostedQuestion = { personId: string; cycle: Cycle; q: 1 | 2 | 3; text: string };
type DeliveredPool = { need: Need; userIds: string[]; copy: InviteCopy };
type ClaimAck = { personId: string; need: Need; outcome: ClaimOutcome; text: string };

export class InMemoryMessaging implements MessagingPort {
  readonly welcomes: string[] = [];
  readonly postedQuestions: PostedQuestion[] = [];
  readonly riskItems: string[] = [];
  readonly deliveredPools: DeliveredPool[] = [];
  readonly claimAcks: ClaimAck[] = [];
  readonly clinicalDoors: string[] = [];

  private buffer: InboundEvent[] = [];
  private waiting: ((r: IteratorResult<InboundEvent>) => void)[] = [];
  private closed = false;

  async sendWelcome(personId: string): Promise<void> {
    this.welcomes.push(personId);
  }
  async postScreeningQuestion(personId: string, cycle: Cycle, q: 1 | 2 | 3, text: string): Promise<void> {
    this.postedQuestions.push({ personId, cycle, q, text });
  }
  async postRiskItem(personId: string): Promise<void> {
    this.riskItems.push(personId);
  }
  async deliverPool(need: Need, userIds: string[], copy: InviteCopy): Promise<void> {
    this.deliveredPools.push({ need, userIds, copy });
  }
  async sendClaimAck(personId: string, need: Need, outcome: ClaimOutcome, text: string): Promise<void> {
    this.claimAcks.push({ personId, need, outcome, text });
  }
  async openClinicalDoor(userId: string): Promise<void> {
    this.clinicalDoors.push(userId);
  }

  emit(event: InboundEvent): void {
    const w = this.waiting.shift();
    if (w) w({ value: event, done: false });
    else this.buffer.push(event);
  }
  close(): void {
    this.closed = true;
    for (const w of this.waiting.splice(0)) w({ value: undefined as never, done: true });
  }

  async *receiveResponse(): AsyncIterable<InboundEvent> {
    while (true) {
      const queued = this.buffer.shift();
      if (queued !== undefined) {
        yield queued;
        continue;
      }
      if (this.closed) return;
      const next = await new Promise<IteratorResult<InboundEvent>>((resolve) =>
        this.waiting.push(resolve),
      );
      if (next.done) return;
      yield next.value;
    }
  }
}
