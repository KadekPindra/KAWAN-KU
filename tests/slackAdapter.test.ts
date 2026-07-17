import { describe, it, expect } from 'vitest';
import type { App } from '@slack/bolt';
import {
  SlackAdapter,
  parseAction,
  screeningBlocks,
  poolBlocks,
} from '../src/adapters/slack/slackAdapter';
import { PortalAdapter } from '../src/adapters/portal/portalAdapter';
import type { SlackDirectory } from '../src/adapters/slack/directory';
import type { InboundEvent } from '../src/ports/messaging';
import type { Need } from '../src/domain/types';

type ActionHandler = (args: {
  ack: () => Promise<void>;
  action: { action_id?: string; value?: string };
  body: { user?: { id?: string } };
}) => Promise<void>;

function fakeApp() {
  const posts: Array<{ channel?: string; blocks?: unknown[] }> = [];
  let handler: ActionHandler | undefined;
  const app = {
    action: (_m: RegExp, h: ActionHandler) => {
      handler = h;
    },
    client: {
      chat: {
        postMessage: async (m: { channel?: string; blocks?: unknown[] }) => {
          posts.push(m);
          return { ok: true };
        },
      },
    },
  } as unknown as App;
  return { app, posts, fire: (a: Parameters<ActionHandler>[0]) => handler!(a) };
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
  it('risk item hanya muncul saat consent', () => {
    const withConsent = JSON.stringify(screeningBlocks('2026-06', true));
    const without = JSON.stringify(screeningBlocks('2026-06', false));
    expect(withConsent).toContain('risk_yes');
    expect(without).not.toContain('risk_yes');
  });
  it('poolBlocks pakai copy + action claim membawa needId', () => {
    const blocks = JSON.stringify(poolBlocks({ needFramed: 'Tim futsal kurang 1 orang.', claimLabel: 'Isi slot' }, 'need-x'));
    expect(blocks).toContain('Tim futsal kurang 1 orang.');
    expect(blocks).toContain('Isi slot');
    expect(blocks).toContain('need-x');
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

  it('postScreening DM ke satu orang (per orang, bukan broadcast)', async () => {
    const { app, posts } = fakeApp();
    const adapter = new SlackAdapter(app, directory);
    await adapter.postScreening('p1', '2026-06');
    await adapter.postScreening('p2', '2026-06');
    await adapter.postScreening('pX', '2026-06'); // tak dikenal → tak ada DM
    expect(posts.map((p) => p.channel)).toEqual(['U1', 'U2']);
  });

  it('deliverPool lewati orang tanpa slack id', async () => {
    const { app, posts } = fakeApp();
    const adapter = new SlackAdapter(app, directory);
    await adapter.deliverPool({ id: 'need-x' } as Need, ['p1', 'p2', 'pX'], { needFramed: 'Tim kurang 1', claimLabel: 'Isi' });
    expect(posts.map((p) => p.channel)).toEqual(['U1', 'U2']);
  });
});

describe('PortalAdapter (stub)', () => {
  it('semua method throw NotImplemented', async () => {
    const portal = new PortalAdapter();
    await expect(portal.postScreening('T', '2026-06')).rejects.toThrow('NotImplemented');
    await expect(portal.deliverPool({ id: 'n' } as Need, ['p1'], { needFramed: 'x', claimLabel: 'y' })).rejects.toThrow(
      'NotImplemented',
    );
    await expect(portal.openClinicalDoor('p1')).rejects.toThrow('NotImplemented');
    expect(() => portal.receiveResponse()).toThrow('NotImplemented');
  });
});
