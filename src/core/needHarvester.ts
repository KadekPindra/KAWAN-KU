import { randomUUID } from 'node:crypto';
import type { Need, NeedSource } from '../domain/types';
import type { Repository } from '../ports/repository';
import { ACTIVITIES } from './needParser';

const NEED_SIGNAL = /\b(butuh|kurang|kekurangan|cari|nyari)\b/i;

export function looksLikeNeed(rawText: string): boolean {
  const t = rawText.trim().toLowerCase();
  if (!t) return false;
  if (NEED_SIGNAL.test(t)) return true;
  return ACTIVITIES.some((a) => t.includes(a));
}

export class NeedHarvester {
  constructor(private readonly repo: Repository) {}

  async collect(
    teamId: string,
    source: NeedSource,
    rawText: string,
    week: string,
    now: Date = new Date(),
  ): Promise<Need> {
    const need: Need = {
      id: `need:${randomUUID()}`,
      teamId,
      source,
      rawText,
      parsed: null,
      slotsTotal: 1,
      slotsOpen: 1,
      week,
      status: 'open',
      createdAt: now,
    };
    await this.repo.saveNeed(need);
    return need;
  }
}
