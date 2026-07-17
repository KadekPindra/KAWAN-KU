import { describe, it, expect } from 'vitest';
import type { App } from '@slack/bolt';
import type { KnownBlock } from '@slack/types';
import {
  SlackAdapter,
  parseAction,
  questionBlocks,
  poolBlocks,
  welcomeBlocks,
  markQuestionAnswered,
} from '../src/adapters/slack/slackAdapter';
import { PortalAdapter } from '../src/adapters/portal/portalAdapter';
import type { SlackDirectory } from '../src/adapters/slack/directory';
import type { InboundEvent } from '../src/ports/messaging';
import type { Need } from '../src/domain/types';

type ActionBody = {
  user?: { id?: string };
  channel?: { id?: string };
  message?: { ts?: string; blocks?: KnownBlock[]; attachments?: { color?: string; blocks?: KnownBlock[] }[] };
};

type ActionHandler = (args: {
  ack: () => Promise<void>;
  action: { action_id?: string; value?: string };
  body: ActionBody;
}) => Promise<void>;

function fakeApp(realName = 'Dewi') {
  const posts: Array<{ channel?: string; blocks?: unknown[]; attachments?: { blocks?: unknown[] }[] }> = [];
  const updates: Array<{ channel?: string; ts?: string; blocks?: unknown[]; attachments?: { blocks?: unknown[] }[] }> = [];
  let handler: ActionHandler | undefined;
  const app = {
    action: (_m: RegExp, h: ActionHandler) => {
      handler = h;
    },
    client: {
      users: {
        info: async () => ({ ok: true, user: { profile: { real_name: realName } } }),
      },
      chat: {
        postMessage: async (m: { channel?: string; blocks?: unknown[] }) => {
          posts.push(m);
          return { ok: true };
        },
        update: async (m: { channel?: string; ts?: string; blocks?: unknown[] }) => {
          updates.push(m);
          return { ok: true };
        },
      },
    },
  } as unknown as App;
  return { app, posts, updates, fire: (a: Parameters<ActionHandler>[0]) => handler!(a) };
}

const RECIPIENTS = [
  { personId: 'p1', slackUserId: 'U1', riskConsent: true },
  { personId: 'p2', slackUserId: 'U2', riskConsent: false },
];
const directory: SlackDirectory = {
  recipients: async () => RECIPIENTS,
  recipientFor: async (pid) => RECIPIENTS.find((r) => r.personId === pid) ?? null,
  slackIdFor: async (pid) => (pid === 'p1' ? 'U1' : pid === 'p2' ? 'U2' : null),
  personIdFor: async (sid) => (sid === 'U1' ? 'p1' : null),
};

describe('parseAction', () => {
  it('screen_<q>_<v> + cycle di value => screenAnswer', () => {
    expect(parseAction('screen_2_3', '2026-06', 'p1')).toEqual({
      kind: 'screenAnswer',
      personId: 'p1',
      cycle: '2026-06',
      q: 2,
      value: 3,
    });
  });
  it('screen tanpa cycle => null', () => {
    expect(parseAction('screen_1_1', '', 'p1')).toBeNull();
  });
  it('claim butuh needId di value', () => {
    expect(parseAction('claim', 'need-x', 'p1')).toEqual({ kind: 'claim', personId: 'p1', needId: 'need-x' });
    expect(parseAction('claim', undefined, 'p1')).toBeNull();
  });
  it('risk_yes/no + self_referral', () => {
    expect(parseAction('risk_yes', undefined, 'p1')).toEqual({ kind: 'riskItem', personId: 'p1', positive: true });
    expect(parseAction('risk_no', undefined, 'p1')).toEqual({ kind: 'riskItem', personId: 'p1', positive: false });
    expect(parseAction('self_referral', undefined, 'p1')).toEqual({ kind: 'selfReferral', personId: 'p1' });
  });
  it('action tak dikenal => null', () => {
    expect(parseAction('bogus', 'x', 'p1')).toBeNull();
  });
});

describe('block builders', () => {
  it('welcomeBlocks menyapa pakai nama + institusi', () => {
    const blocks = JSON.stringify(welcomeBlocks('Dewi', 'Garuda Corp'));
    expect(blocks).toContain('Dewi');
    expect(blocks).toContain('Garuda Corp');
  });
  it('poolBlocks pakai copy + action claim/decline membawa needId', () => {
    const need = { parsed: { location: 'GOR', when: 'sore ini' } } as Need;
    const blocks = JSON.stringify(
      poolBlocks(need, { problem: 'Ada yang butuh 1 orang.', needFramed: 'Tim futsal kurang 1 orang.', claimLabel: 'Isi slot' }, 'need-x'),
    );
    expect(blocks).toContain('Tim futsal kurang 1 orang.');
    expect(blocks).toContain('Isi slot');
    expect(blocks).toContain('need-x');
  });

  it('poolBlocks menyertakan link sumber kalau need.sourceUrl ada', () => {
    const need = { parsed: null, sourceUrl: 'https://slack.com/archives/C1/p1' } as Need;
    const blocks = JSON.stringify(
      poolBlocks(need, { problem: 'p', needFramed: 'n', claimLabel: 'Isi' }, 'need-x'),
    );
    expect(blocks).toContain('https://slack.com/archives/C1/p1');
    expect(blocks).toContain('Lihat percakapan aslinya');
  });

  it('poolBlocks tak menyertakan baris link kalau sourceUrl kosong', () => {
    const need = { parsed: null } as Need;
    const blocks = JSON.stringify(
      poolBlocks(need, { problem: 'p', needFramed: 'n', claimLabel: 'Isi' }, 'need-x'),
    );
    expect(blocks).not.toContain('Lihat percakapan aslinya');
  });

  it('markQuestionAnswered mengganti baris tombol pertanyaan itu jadi teks terkunci', () => {
    const blocks = questionBlocks('2026-06', 1, 'Gimana kabarnya belakangan ini?');
    const locked = markQuestionAnswered(blocks, 1, 3);
    const actions = JSON.stringify(locked[1]);
    expect(actions).not.toContain('screen_1_');
    expect(actions).toContain('Often');
  });
});

describe('SlackAdapter', () => {
  it('aksi tombol -> InboundEvent lewat receiveResponse (map slack id -> person id)', async () => {
    const { app, fire } = fakeApp();
    const adapter = new SlackAdapter(app, directory);
    await fire({ ack: async () => {}, action: { action_id: 'claim', value: 'need-x' }, body: { user: { id: 'U1' } } });

    const it = adapter.receiveResponse()[Symbol.asyncIterator]();
    const { value } = await it.next();
    expect(value).toEqual<InboundEvent>({ kind: 'claim', personId: 'p1', needId: 'need-x' });
  });

  it('aksi dari slack id tak dikenal diabaikan', async () => {
    const { app, fire } = fakeApp();
    const adapter = new SlackAdapter(app, directory);
    await fire({ ack: async () => {}, action: { action_id: 'self_referral' }, body: { user: { id: 'U99' } } });
    adapter.emit({ kind: 'selfReferral', personId: 'sentinel' });

    const it = adapter.receiveResponse()[Symbol.asyncIterator]();
    const { value } = await it.next();
    expect(value).toEqual<InboundEvent>({ kind: 'selfReferral', personId: 'sentinel' });
  });

  it('sendWelcome DM satu orang, ambil nama asli dari Slack profile', async () => {
    const { app, posts } = fakeApp('Dewi Anjani');
    const adapter = new SlackAdapter(app, directory);
    await adapter.sendWelcome('p1');
    await adapter.sendWelcome('pX'); // tak dikenal → tak ada DM

    expect(posts).toHaveLength(1);
    expect(posts[0].channel).toBe('U1');
    expect(JSON.stringify(posts[0].blocks)).toContain('Dewi Anjani');
  });

  it('postScreeningQuestion DM 1 pertanyaan ke satu orang (per orang, bukan broadcast), blocks dibungkus attachment hijau', async () => {
    const { app, posts } = fakeApp();
    const adapter = new SlackAdapter(app, directory);
    await adapter.postScreeningQuestion('p1', '2026-06', 1, 'Gimana kabarnya belakangan ini?');
    await adapter.postScreeningQuestion('p2', '2026-06', 1, 'Gimana kabarnya belakangan ini?');
    await adapter.postScreeningQuestion('pX', '2026-06', 1, 'Gimana kabarnya belakangan ini?'); // tak dikenal → tak ada DM
    expect(posts.map((p) => p.channel)).toEqual(['U1', 'U2']);
    expect(posts[0].attachments?.[0]?.blocks).toBeDefined();
    expect(posts[0].blocks).toBeUndefined();
  });

  it('postRiskItem cuma ke yang riskConsent', async () => {
    const { app, posts } = fakeApp();
    const adapter = new SlackAdapter(app, directory);
    await adapter.postRiskItem('p1'); // riskConsent: true
    await adapter.postRiskItem('p2'); // riskConsent: false -> tak ada DM
    await adapter.postRiskItem('pX'); // tak dikenal -> tak ada DM
    expect(posts.map((p) => p.channel)).toEqual(['U1']);
  });

  it('menjawab pertanyaan (attachments-wrapped) mengunci tombol lewat chat.update', async () => {
    const { app, fire, updates } = fakeApp();
    const adapter = new SlackAdapter(app, directory);
    const blocks = questionBlocks('2026-06', 1, 'Gimana kabarnya belakangan ini?');

    await fire({
      ack: async () => {},
      action: { action_id: 'screen_1_3', value: '2026-06' },
      body: {
        user: { id: 'U1' },
        channel: { id: 'U1' },
        message: { ts: '111.222', attachments: [{ color: '#2EB67D', blocks }] },
      },
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ channel: 'U1', ts: '111.222' });
    const updatedBlocks = JSON.stringify(updates[0].attachments?.[0]?.blocks);
    expect(updatedBlocks).not.toContain('screen_1_');
    expect(updatedBlocks).toContain('Often');
  });

  it('deliverPool lewati orang tanpa slack id', async () => {
    const { app, posts } = fakeApp();
    const adapter = new SlackAdapter(app, directory);
    await adapter.deliverPool({ id: 'need-x' } as Need, ['p1', 'p2', 'pX'], {
      problem: 'Ada yang butuh 1 orang.',
      needFramed: 'Tim kurang 1',
      claimLabel: 'Isi',
    });
    expect(posts.map((p) => p.channel)).toEqual(['U1', 'U2']);
  });

  it('klik claim mengunci tombol pool lewat chat.update', async () => {
    const { app, fire, updates } = fakeApp();
    const adapter = new SlackAdapter(app, directory);
    const blocks = poolBlocks({ id: 'need-x' } as Need, { problem: 'p', needFramed: 'n', claimLabel: 'Isi' }, 'need-x');

    await fire({
      ack: async () => {},
      action: { action_id: 'claim', value: 'need-x' },
      body: {
        user: { id: 'U1' },
        channel: { id: 'U1' },
        message: { ts: '222.333', attachments: [{ color: '#2EB67D', blocks }] },
      },
    });

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ channel: 'U1', ts: '222.333' });
    const updatedBlocks = JSON.stringify(updates[0].attachments?.[0]?.blocks);
    expect(updatedBlocks).not.toContain('"action_id":"claim"');
    expect(updatedBlocks).toContain('Kamu ambil slot ini');
  });

  it('sendClaimAck DM teks ke satu orang', async () => {
    const { app, posts } = fakeApp();
    const adapter = new SlackAdapter(app, directory);
    await adapter.sendClaimAck('p1', { id: 'need-x' } as Need, 'claimed', 'Makasih ya!');
    await adapter.sendClaimAck('pX', { id: 'need-x' } as Need, 'claimed', 'Makasih ya!'); // tak dikenal → tak ada DM

    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ channel: 'U1', text: 'Makasih ya!' });
  });
});

describe('PortalAdapter (stub)', () => {
  it('semua method throw NotImplemented', async () => {
    const portal = new PortalAdapter();
    await expect(portal.sendWelcome('p1')).rejects.toThrow('NotImplemented');
    await expect(portal.postScreeningQuestion('T', '2026-06', 1, 'x')).rejects.toThrow('NotImplemented');
    await expect(portal.postRiskItem('p1')).rejects.toThrow('NotImplemented');
    await expect(
      portal.deliverPool({ id: 'n' } as Need, ['p1'], { problem: 'p', needFramed: 'x', claimLabel: 'y' }),
    ).rejects.toThrow('NotImplemented');
    await expect(portal.openClinicalDoor('p1')).rejects.toThrow('NotImplemented');
    expect(() => portal.receiveResponse()).toThrow('NotImplemented');
  });
});
