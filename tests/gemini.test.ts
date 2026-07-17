import { describe, it, expect } from 'vitest';
import {
  GeminiNeedParser,
  GeminiInviteComposer,
  passesNeedContract,
  type GeminiClient,
} from '../src/adapters/llm/gemini';
import { parseNeedTemplate } from '../src/core/needParser';
import { needFramedTemplate } from '../src/core/inviteComposer';
import type { Need } from '../src/domain/types';

function need(): Need {
  return {
    id: 'n',
    teamId: 'T',
    source: 'member',
    rawText: 'butuh 1 lagi buat futsal jam 5 sore, yang penting bisa lari',
    parsed: { activity: 'futsal', skill: 'casual', slots: 1, when: 'jam 5 sore', location: '', effort: 'low' },
    slotsTotal: 1,
    slotsOpen: 1,
    week: '2026-W29',
    status: 'open',
    createdAt: new Date('2026-07-15'),
  };
}

function fakeClient(reply: string): GeminiClient {
  return { generate: async () => reply };
}

function throwingClient(): GeminiClient {
  return {
    generate: async () => {
      throw new Error('network down');
    },
  };
}

describe('GeminiNeedParser', () => {
  it('tanpa client => identik dengan template', async () => {
    const raw = 'cari 2 orang buat main basket sabtu pagi';
    const parsed = await new GeminiNeedParser(null).parse(raw);
    expect(parsed).toEqual(parseNeedTemplate(raw));
  });

  it('JSON valid => hasil terstruktur dari LLM', async () => {
    const client = fakeClient(
      JSON.stringify({ activity: 'Futsal', skill: 'casual', slots: 3, when: 'jam 5 sore', effort: 'low' }),
    );
    const parsed = await new GeminiNeedParser(client).parse('butuh 3 orang futsal');
    expect(parsed).toEqual({ activity: 'futsal', skill: 'casual', slots: 3, when: 'jam 5 sore', location: '', effort: 'low' });
  });

  it('JSON invalid => fallback template', async () => {
    const raw = 'tim board game kurang 1 buat malam ini';
    const parsed = await new GeminiNeedParser(fakeClient('bukan json')).parse(raw);
    expect(parsed).toEqual(parseNeedTemplate(raw));
  });

  it('client error => fallback template', async () => {
    const raw = 'butuh 1 lagi buat futsal jam 5 sore';
    const parsed = await new GeminiNeedParser(throwingClient()).parse(raw);
    expect(parsed).toEqual(parseNeedTemplate(raw));
  });
});

describe('GeminiInviteComposer', () => {
  it('tanpa client => identik dengan template', async () => {
    const copy = await new GeminiInviteComposer(null).compose(need());
    expect(copy.needFramed).toBe(needFramedTemplate(need()));
  });

  it('output kebutuhan valid => dipakai apa adanya', async () => {
    const client = fakeClient(
      JSON.stringify({
        problem: 'Ada yang baru butuh 1 orang buat futsal.',
        needFramed: 'Tim futsal kurang 1 orang buat sore ini.',
        claimLabel: 'Isi slot',
      }),
    );
    const copy = await new GeminiInviteComposer(client).compose(need());
    expect(copy.problem).toContain('butuh');
    expect(copy.needFramed).toContain('kurang');
    expect(copy.claimLabel).toBe('Isi slot');
  });

  it('output ber-ajakan ("yuk") langgar kontrak => fallback template', async () => {
    const client = fakeClient(
      JSON.stringify({
        problem: 'Ada yang baru butuh 1 orang buat futsal.',
        needFramed: 'Ada futsal sore ini, ikut yuk!',
        claimLabel: 'Ikut',
      }),
    );
    const copy = await new GeminiInviteComposer(client).compose(need());
    expect(copy.needFramed).toBe(needFramedTemplate(need()));
  });

  it('output kosong => fallback template', async () => {
    const client = fakeClient(JSON.stringify({ problem: 'Ada yang baru butuh 1 orang.', needFramed: '', claimLabel: 'x' }));
    const copy = await new GeminiInviteComposer(client).compose(need());
    expect(copy.needFramed).toBe(needFramedTemplate(need()));
  });
});

describe('passesNeedContract', () => {
  it('menolak ajakan & simpati, menerima pernyataan kebutuhan', () => {
    expect(passesNeedContract('Tim futsal kurang 1 orang buat sore ini.')).toBe(true);
    expect(passesNeedContract('Ada futsal, ikut yuk!')).toBe(false);
    expect(passesNeedContract('Biar nggak sendirian, gabung dong')).toBe(false);
    expect(passesNeedContract('')).toBe(false);
  });
});
