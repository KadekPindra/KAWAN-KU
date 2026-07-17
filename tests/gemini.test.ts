import { describe, it, expect } from 'vitest';
import {
  GeminiNeedParser,
  GeminiInviteComposer,
  GeminiClaimAcknowledger,
  GeminiScreeningQuestionComposer,
  passesNeedContract,
  passesScreeningContract,
  type GeminiClient,
} from '../src/adapters/llm/gemini';
import { parseNeedTemplate } from '../src/core/needParser';
import { needFramedTemplate } from '../src/core/inviteComposer';
import { TemplateClaimAcknowledger } from '../src/core/claimAcknowledger';
import { UCLA3_CANONICAL } from '../src/core/screeningQuestion';
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

describe('GeminiClaimAcknowledger', () => {
  it('tanpa client => identik dengan template', async () => {
    const text = await new GeminiClaimAcknowledger(null).acknowledge(need(), 'claimed');
    expect(text).toBe(await new TemplateClaimAcknowledger().acknowledge(need(), 'claimed'));
  });

  it('JSON valid => teks dari LLM dipakai apa adanya', async () => {
    const client = fakeClient(JSON.stringify({ text: 'Makasih banyak ya udah bantu isi slotnya!' }));
    const text = await new GeminiClaimAcknowledger(client).acknowledge(need(), 'claimed');
    expect(text).toBe('Makasih banyak ya udah bantu isi slotnya!');
  });

  it('JSON invalid => fallback template', async () => {
    const text = await new GeminiClaimAcknowledger(fakeClient('bukan json')).acknowledge(need(), 'declined');
    expect(text).toBe(await new TemplateClaimAcknowledger().acknowledge(need(), 'declined'));
  });

  it('client error => fallback template', async () => {
    const text = await new GeminiClaimAcknowledger(throwingClient()).acknowledge(need(), 'full');
    expect(text).toBe(await new TemplateClaimAcknowledger().acknowledge(need(), 'full'));
  });
});

describe('GeminiScreeningQuestionComposer', () => {
  const ctx = { lonelyStreak: 0, trend: 'new' as const };

  it('tanpa client => identik dengan template (3 konsep UCLA-3 asli, apa adanya)', async () => {
    const text = await new GeminiScreeningQuestionComposer(null).compose(2, ctx);
    expect(text).toBe(UCLA3_CANONICAL[2]);
  });

  it('JSON valid & lolos kontrak => teks dari LLM dipakai apa adanya', async () => {
    const client = fakeClient(JSON.stringify({ text: 'Belakangan ini gimana rasanya kumpul bareng temen-temen?' }));
    const text = await new GeminiScreeningQuestionComposer(client).compose(1, ctx);
    expect(text).toBe('Belakangan ini gimana rasanya kumpul bareng temen-temen?');
  });

  it('output menyebut kata klinis ("kesepian") langgar kontrak => fallback template', async () => {
    const client = fakeClient(JSON.stringify({ text: 'Apa kamu lagi merasa kesepian belakangan ini?' }));
    const text = await new GeminiScreeningQuestionComposer(client).compose(3, ctx);
    expect(text).toBe(UCLA3_CANONICAL[3]);
  });

  it('JSON invalid => fallback template', async () => {
    const text = await new GeminiScreeningQuestionComposer(fakeClient('bukan json')).compose(1, ctx);
    expect(text).toBe(UCLA3_CANONICAL[1]);
  });

  it('client error => fallback template', async () => {
    const text = await new GeminiScreeningQuestionComposer(throwingClient()).compose(2, ctx);
    expect(text).toBe(UCLA3_CANONICAL[2]);
  });
});

describe('passesScreeningContract', () => {
  it('menolak kata klinis/eksplisit, menerima kalimat santai', () => {
    expect(passesScreeningContract('Belakangan ini gimana kabarnya sama circle pertemanan?')).toBe(true);
    expect(passesScreeningContract('Ini bagian dari survei kesepian mingguan kami.')).toBe(false);
    expect(passesScreeningContract('Skrining UCLA menunjukkan kamu berisiko.')).toBe(false);
    expect(passesScreeningContract('')).toBe(false);
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
