import type { App } from '@slack/bolt';
import type { KnownBlock } from '@slack/types';
import type { Anchor, Cycle, InviteCopy, Need } from '../../domain/types';
import type { InboundEvent, MessagingPort } from '../../ports/messaging';
import { CRISIS_RESOURCES } from '../../core/clinicalRouter';
import { config } from '../../config/index';
import type { SlackDirectory } from './directory';

export const UCLA3_ITEMS: Record<1 | 2 | 3, string> = {
  1: 'Seberapa sering kamu merasa kurang punya teman untuk berbagi?',
  2: 'Seberapa sering kamu merasa tersisih dari orang-orang di sekitarmu?',
  3: 'Seberapa sering kamu merasa jauh dari orang lain?',
};

export const UCLA3_ANCHORS: Record<Anchor, string> = { 1: 'Jarang', 2: 'Kadang', 3: 'Sering' };

const RISK_ITEM = 'Dalam 2 minggu terakhir, apakah kamu ingin bicara dengan seseorang soal perasaanmu?';

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
  if (actionId === 'risk_yes') return { kind: 'riskItem', personId, positive: true };
  if (actionId === 'risk_no') return { kind: 'riskItem', personId, positive: false };
  if (actionId === 'self_referral') return { kind: 'selfReferral', personId };
  return null;
}

const ACTION_MATCH = /^(screen_[123]_[123]|claim|risk_yes|risk_no|self_referral)$/;

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

export function questionBlocks(cycle: Cycle, q: 1 | 2 | 3): KnownBlock[] {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: `*${q}.* ${UCLA3_ITEMS[q]}` } },
    {
      type: 'actions',
      elements: ([1, 2, 3] as Anchor[]).map((v) => textBtn(UCLA3_ANCHORS[v], `screen_${q}_${v}`, cycle)),
    },
  ];
}

export function screeningBlocks(cycle: Cycle, riskConsent: boolean): KnownBlock[] {
  const blocks: KnownBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: 'Cek singkat bulanan (3 pertanyaan, sekali tap):' } },
    ...questionBlocks(cycle, 1),
    ...questionBlocks(cycle, 2),
    ...questionBlocks(cycle, 3),
  ];
  if (riskConsent) {
    blocks.push(
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: RISK_ITEM } },
      { type: 'actions', elements: [textBtn('Ya', 'risk_yes'), textBtn('Tidak', 'risk_no')] },
    );
  }
  return blocks;
}

export function poolBlocks(copy: InviteCopy, needId: string): KnownBlock[] {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: copy.needFramed } },
    { type: 'actions', elements: [textBtn(copy.claimLabel, 'claim', needId, 'primary')] },
  ];
}

export function welcomeBlocks(displayName: string, institutionName: string): KnownBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `👋 Hai ${displayName}! Selamat datang di *${institutionName}*, aku Kawanku, teman kecilmu yang ramah di workspace ini.`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Aku di sini buat bantu kamu settle in, dan berbagi info kegiatan kantor maupun komunitas. Jangan sungkan kalau mau tanya-tanya soal kegiatan kantor dan komunitas!',
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
      const slackUserId = (body as { user?: { id?: string } }).user?.id;
      if (!a.action_id || !slackUserId) return;
      const personId = await this.directory.personIdFor(slackUserId);
      if (!personId) return;
      const event = parseAction(a.action_id, a.value, personId);
      if (event) this.queue.push(event);
    });
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
    await this.app.client.chat.postMessage({
      channel: r.slackUserId,
      text: 'Cek singkat',
      blocks: screeningBlocks(cycle, r.riskConsent),
    });
  }

  async deliverPool(need: Need, userIds: string[], copy: InviteCopy): Promise<void> {
    for (const personId of userIds) {
      const slackUserId = await this.directory.slackIdFor(personId);
      if (!slackUserId) continue;
      await this.app.client.chat.postMessage({
        channel: slackUserId,
        text: copy.needFramed,
        blocks: poolBlocks(copy, need.id),
      });
    }
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
