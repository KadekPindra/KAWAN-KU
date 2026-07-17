import type { App } from '@slack/bolt';
import type { KnownBlock } from '@slack/types';
import type { Anchor, Cycle, InviteCopy, Need } from '../../domain/types';
import type { ClaimOutcome, InboundEvent, MessagingPort } from '../../ports/messaging';
import { CRISIS_RESOURCES } from '../../core/clinicalRouter';
import { config } from '../../config/index';
import type { SlackDirectory } from './directory';

export const UCLA3_ITEMS: Record<1 | 2 | 3, string> = {
  1: 'Time for a quick screen break! Just out of curiosity, how often do you feel that you lack companionship outside of work lately?',
  2: 'And how often do you feel left out or excluded by the people around you?',
  3: "Last one — how often do you feel distant from the people around you these days?",
};

export const UCLA3_ANCHORS: Record<Anchor, string> = { 1: 'Rarely', 2: 'Sometimes', 3: 'Often' };

export const SCREEN_GREETING = 'Weekly Vibe Check 🌿';

export const SCREEN_ACCENT_COLOR = '#2EB67D';

const RISK_ITEM = "In the past 2 weeks, is there anyone you've wanted to talk to about how you're feeling?";

function isAnchor(n: number): n is Anchor {
  return n === 1 || n === 2 || n === 3;
}

export function parseAction(actionId: string, value: string | undefined, personId: string): InboundEvent | null {
  if (actionId.startsWith('screen_')) {
    const [, q, v] = actionId.split('_');
    const qn = Number(q);
    const vn = Number(v);
    const cycle = value ?? '';
    if (!isAnchor(qn) || !isAnchor(vn) || !cycle) return null;
    return { kind: 'screenAnswer', personId, cycle, q: qn as 1 | 2 | 3, value: vn };
  }
  if (actionId === 'claim') return value ? { kind: 'claim', personId, needId: value } : null;
  if (actionId === 'decline') return value ? { kind: 'decline', personId, needId: value } : null;
  if (actionId === 'risk_yes') return { kind: 'riskItem', personId, positive: true };
  if (actionId === 'risk_no') return { kind: 'riskItem', personId, positive: false };
  if (actionId === 'self_referral') return { kind: 'selfReferral', personId };
  return null;
}

const ACTION_MATCH = /^(screen_[123]_[123]|claim|decline|risk_yes|risk_no|self_referral)$/;

class InboundQueue {
  private buffer: InboundEvent[] = [];
  private waiting: ((r: IteratorResult<InboundEvent>) => void)[] = [];
  private closed = false;

  push(event: InboundEvent): void {
    const w = this.waiting.shift();
    if (w) w({ value: event, done: false });
    else this.buffer.push(event);
  }

  close(): void {
    this.closed = true;
    for (const w of this.waiting.splice(0)) w({ value: undefined as never, done: true });
  }

  async *stream(): AsyncIterable<InboundEvent> {
    while (true) {
      const queued = this.buffer.shift();
      if (queued !== undefined) {
        yield queued;
        continue;
      }
      if (this.closed) return;
      const next = await new Promise<IteratorResult<InboundEvent>>((resolve) => this.waiting.push(resolve));
      if (next.done) return;
      yield next.value;
    }
  }
}

function textBtn(text: string, actionId: string, value?: string, style?: 'primary' | 'danger') {
  return {
    type: 'button' as const,
    text: { type: 'plain_text' as const, text, emoji: true },
    action_id: actionId,
    ...(value ? { value } : {}),
    ...(style ? { style } : {}),
  };
}

export function questionBlocks(cycle: Cycle, q: 1 | 2 | 3, withGreeting = false): KnownBlock[] {
  const blocks: KnownBlock[] = [];
  if (withGreeting) {
    blocks.push({ type: 'header', text: { type: 'plain_text', text: SCREEN_GREETING, emoji: true } });
  }
  blocks.push(
    { type: 'section', text: { type: 'mrkdwn', text: UCLA3_ITEMS[q] } },
    {
      type: 'actions',
      elements: ([1, 2, 3] as Anchor[]).map((v) => textBtn(UCLA3_ANCHORS[v], `screen_${q}_${v}`, cycle)),
    },
  );
  return blocks;
}

export function riskItemBlocks(): KnownBlock[] {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: RISK_ITEM } },
    { type: 'actions', elements: [textBtn('Yes', 'risk_yes'), textBtn('No', 'risk_no')] },
  ];
}

function isQuestionActionsBlock(b: KnownBlock, q: 1 | 2 | 3): boolean {
  return (
    b.type === 'actions' &&
    Array.isArray(b.elements) &&
    b.elements.some((el) => 'action_id' in el && typeof el.action_id === 'string' && el.action_id.startsWith(`screen_${q}_`))
  );
}

export function markQuestionAnswered(blocks: KnownBlock[], q: 1 | 2 | 3, chosen: Anchor): KnownBlock[] {
  return blocks.map((b) =>
    isQuestionActionsBlock(b, q)
      ? { type: 'context', elements: [{ type: 'mrkdwn', text: `✅ Jawaban kamu: *${UCLA3_ANCHORS[chosen]}*` }] }
      : b,
  );
}

function isPoolActionsBlock(b: KnownBlock): boolean {
  return (
    b.type === 'actions' &&
    Array.isArray(b.elements) &&
    b.elements.some((el) => 'action_id' in el && (el.action_id === 'claim' || el.action_id === 'decline'))
  );
}

export function markPoolAnswered(blocks: KnownBlock[], lockedText: string): KnownBlock[] {
  return blocks.map((b) =>
    isPoolActionsBlock(b) ? { type: 'context', elements: [{ type: 'mrkdwn', text: lockedText }] } : b,
  );
}

export const DECLINE_LABEL = 'Lain kali';

function contextLine(need: Need): KnownBlock | null {
  const parts: string[] = [];
  if (need.parsed?.location) parts.push(`📍 ${need.parsed.location}`);
  if (need.parsed?.when) parts.push(`⏰ ${need.parsed.when}`);
  if (!parts.length) return null;
  return { type: 'context', elements: [{ type: 'mrkdwn', text: parts.join('  |  ') }] };
}

export function poolBlocks(need: Need, copy: InviteCopy, needId: string): KnownBlock[] {
  const blocks: KnownBlock[] = [{ type: 'section', text: { type: 'mrkdwn', text: copy.problem } }];
  const context = contextLine(need);
  if (context) blocks.push(context);
  blocks.push(
    { type: 'section', text: { type: 'mrkdwn', text: copy.needFramed } },
    {
      type: 'actions',
      elements: [
        textBtn(copy.claimLabel, 'claim', needId, 'primary'),
        textBtn(DECLINE_LABEL, 'decline', needId, 'danger'),
      ],
    },
  );
  return blocks;
}

export function welcomeBlocks(displayName: string, institutionName: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `👋 Hi ${displayName}! welcome to *${institutionName}*, I'm Kawanku, your friendly little companion in this workspace.`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "I'm just here to help you settle in, share updates about office and community activities. feel free if you want to ask about the office and community activities!",
      },
    },
  ];
}

export async function resolveDisplayName(client: App['client'], slackUserId: string): Promise<string> {
  try {
    const info = await client.users.info({ user: slackUserId });
    return info.user?.profile?.real_name || info.user?.real_name || info.user?.name || 'Kamu';
  } catch {
    return 'Kamu';
  }
}

export function clinicalBlocks(): KnownBlock[] {
  const list = CRISIS_RESOURCES.map((r) => `• ${r}`).join('\n');
  return [
    { type: 'section', text: { type: 'mrkdwn', text: 'Kalau butuh bicara, ini pintu yang selalu terbuka:' } },
    { type: 'section', text: { type: 'mrkdwn', text: list } },
    { type: 'actions', elements: [textBtn('Bicara dengan seseorang', 'self_referral')] },
  ];
}

export class SlackAdapter implements MessagingPort {
  private readonly queue = new InboundQueue();

  constructor(
    private readonly app: App,
    private readonly directory: SlackDirectory,
  ) {
    this.registerActions();
  }

  private registerActions(): void {
    this.app.action(ACTION_MATCH, async ({ ack, action, body }) => {
      await ack();
      const a = action as { action_id?: string; value?: string };
      const b = body as {
        user?: { id?: string };
        channel?: { id?: string };
        message?: { ts?: string; blocks?: KnownBlock[]; attachments?: { color?: string; blocks?: KnownBlock[] }[] };
      };
      const slackUserId = b.user?.id;
      if (!a.action_id || !slackUserId) return;
      const personId = await this.directory.personIdFor(slackUserId);
      if (!personId) return;
      const event = parseAction(a.action_id, a.value, personId);
      if (event) this.queue.push(event);
      if (event?.kind === 'screenAnswer') {
        await this.lockAnsweredQuestion(b.channel?.id, b.message, event.q, event.value);
      }
      if (event?.kind === 'claim' || event?.kind === 'decline') {
        const lockedText = event.kind === 'claim' ? '✅ Kamu ambil slot ini.' : '👍 Oke, lain kali ya.';
        await this.lockPoolAction(b.channel?.id, b.message, lockedText);
      }
    });
  }

  private async lockAnsweredQuestion(
    channel: string | undefined,
    message: { ts?: string; blocks?: KnownBlock[]; attachments?: { color?: string; blocks?: KnownBlock[] }[] } | undefined,
    q: 1 | 2 | 3,
    chosen: Anchor,
  ): Promise<void> {
    if (!channel || !message?.ts) return;
    const attachment = message.attachments?.[0];
    if (attachment?.blocks) {
      await this.app.client.chat.update({
        channel,
        ts: message.ts,
        text: ' ',
        attachments: [{ color: attachment.color, blocks: markQuestionAnswered(attachment.blocks, q, chosen) }],
      });
      return;
    }
    if (message.blocks) {
      await this.app.client.chat.update({
        channel,
        ts: message.ts,
        blocks: markQuestionAnswered(message.blocks, q, chosen),
      });
    }
  }

  private async lockPoolAction(
    channel: string | undefined,
    message: { ts?: string; blocks?: KnownBlock[]; attachments?: { color?: string; blocks?: KnownBlock[] }[] } | undefined,
    lockedText: string,
  ): Promise<void> {
    if (!channel || !message?.ts) return;
    const attachment = message.attachments?.[0];
    if (attachment?.blocks) {
      await this.app.client.chat.update({
        channel,
        ts: message.ts,
        text: ' ',
        attachments: [{ color: attachment.color, blocks: markPoolAnswered(attachment.blocks, lockedText) }],
      });
      return;
    }
    if (message.blocks) {
      await this.app.client.chat.update({
        channel,
        ts: message.ts,
        blocks: markPoolAnswered(message.blocks, lockedText),
      });
    }
  }

  async sendWelcome(personId: string): Promise<void> {
    const slackUserId = await this.directory.slackIdFor(personId);
    if (!slackUserId) return;
    const displayName = await resolveDisplayName(this.app.client, slackUserId);
    await this.app.client.chat.postMessage({
      channel: slackUserId,
      text: 'Selamat datang',
      blocks: welcomeBlocks(displayName, config.INSTITUTION_NAME),
    });
  }

  async postScreening(personId: string, cycle: Cycle): Promise<void> {
    const r = await this.directory.recipientFor(personId);
    if (!r) return;
    for (const q of [1, 2, 3] as const) {
      await this.app.client.chat.postMessage({
        channel: r.slackUserId,
        text: UCLA3_ITEMS[q],
        attachments: [{ color: SCREEN_ACCENT_COLOR, blocks: questionBlocks(cycle, q, q === 1) }],
      });
    }
    if (r.riskConsent) {
      await this.app.client.chat.postMessage({
        channel: r.slackUserId,
        text: RISK_ITEM,
        attachments: [{ color: SCREEN_ACCENT_COLOR, blocks: riskItemBlocks() }],
      });
    }
  }

  async deliverPool(need: Need, userIds: string[], copy: InviteCopy): Promise<void> {
    for (const personId of userIds) {
      const slackUserId = await this.directory.slackIdFor(personId);
      if (!slackUserId) continue;
      await this.app.client.chat.postMessage({
        channel: slackUserId,
        text: copy.needFramed,
        attachments: [{ color: SCREEN_ACCENT_COLOR, blocks: poolBlocks(need, copy, need.id) }],
      });
    }
  }

  async sendClaimAck(personId: string, _need: Need, _outcome: ClaimOutcome, text: string): Promise<void> {
    const slackUserId = await this.directory.slackIdFor(personId);
    if (!slackUserId) return;
    await this.app.client.chat.postMessage({ channel: slackUserId, text });
  }

  async openClinicalDoor(userId: string): Promise<void> {
    const slackUserId = (await this.directory.slackIdFor(userId)) ?? userId;
    await this.app.client.chat.postMessage({
      channel: slackUserId,
      text: 'Pintu bantuan',
      blocks: clinicalBlocks(),
    });
  }

  receiveResponse(): AsyncIterable<InboundEvent> {
    return this.queue.stream();
  }

  emit(event: InboundEvent): void {
    this.queue.push(event);
  }

  close(): void {
    this.queue.close();
  }
}
