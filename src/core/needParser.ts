import type { Effort, ParsedNeed } from '../domain/types';

export interface NeedParser {
  parse(rawText: string): Promise<ParsedNeed>;
}

const ACTIVITIES = [
  'futsal', 'basket', 'badminton', 'voli', 'board game', 'boardgame',
  'desain', 'ngoding', 'musik', 'film', 'baca', 'lari', 'kopi',
];

const DAYS = /\b(senin|selasa|rabu|kamis|jumat|sabtu|minggu)\b/;
const TIME_OF_DAY = /\b(pagi|siang|sore|malam)\b/;
const CLOCK = /jam\s*\d+/;

export function parseNeedTemplate(rawText: string): ParsedNeed {
  const t = rawText.toLowerCase();

  let activity = 'kegiatan';
  for (const a of ACTIVITIES) {
    if (t.includes(a)) {
      activity = a === 'board game' ? 'boardgame' : a;
      break;
    }
  }

  const num = t.match(/(\d+)\s*(?:orang|lagi)/);
  const slots = num ? Math.max(1, Number(num[1])) : 1;

  const serious = /(serius|kompetitif|lomba|turnamen)/.test(t);
  const casual = /(santai|casual|yang penting|gpp|nyantai)/.test(t);
  const effort: Effort = serious ? 'high' : casual ? 'low' : 'medium';
  const skill = serious ? 'competitive' : 'casual';

  return { activity, skill, slots, when: extractWhen(t), effort };
}

function extractWhen(t: string): string {
  if (t.includes('malam ini')) return 'malam ini';
  if (t.includes('sore ini')) return 'sore ini';
  const parts = [DAYS.exec(t)?.[0], CLOCK.exec(t)?.[0], TIME_OF_DAY.exec(t)?.[0]].filter(Boolean);
  return parts.join(' ').trim();
}

export class TemplateNeedParser implements NeedParser {
  async parse(rawText: string): Promise<ParsedNeed> {
    return parseNeedTemplate(rawText);
  }
}
