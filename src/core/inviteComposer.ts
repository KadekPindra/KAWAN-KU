import type { Need } from '../domain/types';

export interface InviteCopy {
  needFramed: string;
  claimLabel: string;
}

export interface InviteComposer {
  compose(need: Need): Promise<InviteCopy>;
}

const DISPLAY: Record<string, string> = { boardgame: 'board game' };

function activityOf(need: Need): string {
  const a = need.parsed?.activity ?? 'kegiatan';
  return DISPLAY[a] ?? a;
}

// ✅ Kebutuhan — orang dibutuhkan, bukan diajak/dikasihani.
export function needFramedTemplate(need: Need): string {
  const slots = need.slotsOpen || need.parsed?.slots || 1;
  const when = need.parsed?.when ? ` buat ${need.parsed.when}` : '';
  return `Tim ${activityOf(need)} kurang ${slots} orang${when}.`;
}

// ❌ Ajakan — hanya untuk kontras di panggung; tidak pernah dikirim.
export function invitationTemplate(need: Need): string {
  const when = need.parsed?.when ? ` ${need.parsed.when}` : '';
  return `Ada ${activityOf(need)}${when}, ikut yuk!`;
}

export class TemplateInviteComposer implements InviteComposer {
  async compose(need: Need): Promise<InviteCopy> {
    return { needFramed: needFramedTemplate(need), claimLabel: 'Saya isi slotnya' };
  }
}
