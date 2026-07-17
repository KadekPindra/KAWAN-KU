import { describe, it, expect } from 'vitest';
import { TemplateInviteComposer, needFramedTemplate, invitationTemplate } from '../src/core/inviteComposer';
import type { Need } from '../src/domain/types';

function need(): Need {
  return {
    id: 'n',
    teamId: 'T',
    source: 'member',
    rawText: 'raw',
    parsed: { activity: 'futsal', skill: 'casual', slots: 1, when: 'jam 5 sore', location: '', effort: 'low' },
    slotsTotal: 1,
    slotsOpen: 1,
    week: '2026-W29',
    status: 'open',
    createdAt: new Date('2026-07-15'),
  };
}

describe('InviteComposer — kontrak ❌/✅', () => {
  it('need-framed menyatakan KEBUTUHAN ("kurang"), bukan ajakan ("yuk")', () => {
    const s = needFramedTemplate(need());
    expect(s).toContain('kurang');
    expect(s).toContain('futsal');
    expect(s.toLowerCase()).not.toContain('yuk');
  });

  it('template ajakan (hanya untuk kontras) memakai "yuk"', () => {
    expect(invitationTemplate(need()).toLowerCase()).toContain('yuk');
  });

  it('compose mengembalikan problem + copy kebutuhan + label klaim', async () => {
    const copy = await new TemplateInviteComposer().compose(need());
    expect(copy.problem.length).toBeGreaterThan(0);
    expect(copy.needFramed).toContain('kurang');
    expect(copy.claimLabel.length).toBeGreaterThan(0);
  });
});
