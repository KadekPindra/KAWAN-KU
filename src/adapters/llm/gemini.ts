import type { Schema } from '@google/genai';
import type { Effort, Need, ParsedNeed } from '../../domain/types';
import { NeedParser, TemplateNeedParser } from '../../core/needParser';
import { InviteComposer, InviteCopy, TemplateInviteComposer } from '../../core/inviteComposer';

const MODEL = 'gemini-2.5-flash';

export interface GenerateRequest {
  system: string;
  prompt: string;
  responseSchema?: Record<string, unknown>;
}

export interface GeminiClient {
  generate(req: GenerateRequest): Promise<string>;
}

// Lazy: SDK hanya di-load saat call pertama, jadi jalur tanpa key tak menyentuh paket.
class SdkGeminiClient implements GeminiClient {
  private ai: import('@google/genai').GoogleGenAI | null = null;

  constructor(private readonly apiKey: string) {}

  async generate(req: GenerateRequest): Promise<string> {
    if (!this.ai) {
      const { GoogleGenAI } = await import('@google/genai');
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    }
    const res = await this.ai.models.generateContent({
      model: MODEL,
      contents: req.prompt,
      config: {
        systemInstruction: req.system,
        temperature: 0,
        ...(req.responseSchema
          ? { responseMimeType: 'application/json', responseSchema: req.responseSchema as Schema }
          : {}),
      },
    });
    return res.text ?? '';
  }
}

export function createGeminiClient(apiKey = process.env.GEMINI_API_KEY): GeminiClient | null {
  const forced = process.env.KAWAN_LLM?.trim().toLowerCase();
  if (forced === 'template' || forced === 'off') return null;
  const key = apiKey?.trim();
  if (!key || key.startsWith('...')) return null;
  return new SdkGeminiClient(key);
}

const NEED_SYSTEM = [
  'Ekstrak kebutuhan aktivitas dari teks Bahasa Indonesia menjadi JSON.',
  'activity: nama kegiatan singkat (mis. "futsal", "boardgame").',
  'skill: "casual" atau "competitive".',
  'slots: jumlah orang yang dibutuhkan, bilangan bulat >= 1.',
  'when: waktu apa adanya dari teks (boleh kosong).',
  'effort: "low" | "medium" | "high".',
  'Jangan mengarang; kalau tak jelas pakai default wajar.',
].join(' ');

const NEED_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    activity: { type: 'STRING' },
    skill: { type: 'STRING' },
    slots: { type: 'INTEGER' },
    when: { type: 'STRING' },
    effort: { type: 'STRING', enum: ['low', 'medium', 'high'] },
  },
  required: ['activity', 'skill', 'slots', 'when', 'effort'],
};

function coerceParsedNeed(raw: unknown): ParsedNeed | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const activity = typeof o.activity === 'string' ? o.activity.trim().toLowerCase() : '';
  if (!activity) return null;
  const slotsNum = Number(o.slots);
  const slots = Number.isFinite(slotsNum) ? Math.max(1, Math.floor(slotsNum)) : 1;
  const effort: Effort = o.effort === 'low' || o.effort === 'high' ? o.effort : 'medium';
  const skill = typeof o.skill === 'string' && o.skill.trim() ? o.skill.trim().toLowerCase() : 'casual';
  const when = typeof o.when === 'string' ? o.when.trim() : '';
  return { activity, skill, slots, when, effort };
}

export class GeminiNeedParser implements NeedParser {
  constructor(
    private readonly client: GeminiClient | null,
    private readonly fallback: NeedParser = new TemplateNeedParser(),
  ) {}

  async parse(rawText: string): Promise<ParsedNeed> {
    if (this.client) {
      try {
        const out = await this.client.generate({ system: NEED_SYSTEM, prompt: rawText, responseSchema: NEED_SCHEMA });
        const parsed = coerceParsedNeed(JSON.parse(out));
        if (parsed) return parsed;
      } catch {
        // jatuh ke template
      }
    }
    return this.fallback.parse(rawText);
  }
}

const INVITE_SYSTEM = [
  'Kamu menulis SATU kalimat untuk mengisi slot kegiatan tim, dalam Bahasa Indonesia.',
  'WAJIB berupa PERNYATAAN KEBUTUHAN: tim kekurangan orang untuk sebuah peran.',
  'DILARANG KERAS framing ajakan atau simpati: tanpa "yuk", "ayo", "ikutan", "gabung yuk", "biar nggak sendirian", tanpa iba.',
  'Jangan sebut kesepian, skrining, atau kondisi personal siapa pun.',
  'Keluarkan JSON: needFramed (kalimat kebutuhan) dan claimLabel (teks tombol singkat untuk mengambil slot).',
].join(' ');

const INVITE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    needFramed: { type: 'STRING' },
    claimLabel: { type: 'STRING' },
  },
  required: ['needFramed', 'claimLabel'],
};

const INVITATION_MARKERS = /\b(yuk|ayo|ikutan|gabung|join|mari|kuy)\b/i;
const SYMPATHY_MARKERS = /(sendirian|kesepian|kasihan|iba|jangan sedih|biar\s+nggak\s+sendiri)/i;

// Guard kontrak ❌/✅ — walau prompt melarang, output tetap diverifikasi deterministik.
export function passesNeedContract(text: string): boolean {
  return text.trim().length > 0 && !INVITATION_MARKERS.test(text) && !SYMPATHY_MARKERS.test(text);
}

function coerceInviteCopy(raw: unknown): InviteCopy | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const needFramed = typeof o.needFramed === 'string' ? o.needFramed.trim() : '';
  const claimLabel = typeof o.claimLabel === 'string' && o.claimLabel.trim() ? o.claimLabel.trim() : 'Saya isi slotnya';
  if (!needFramed) return null;
  return { needFramed, claimLabel };
}

function describeNeed(need: Need): string {
  const p = need.parsed;
  if (!p) return need.rawText;
  return `activity=${p.activity}; slots=${need.slotsOpen || p.slots}; when=${p.when || '-'}; skill=${p.skill}; effort=${p.effort}`;
}

export class GeminiInviteComposer implements InviteComposer {
  constructor(
    private readonly client: GeminiClient | null,
    private readonly fallback: InviteComposer = new TemplateInviteComposer(),
  ) {}

  async compose(need: Need): Promise<InviteCopy> {
    if (this.client) {
      try {
        const out = await this.client.generate({
          system: INVITE_SYSTEM,
          prompt: describeNeed(need),
          responseSchema: INVITE_SCHEMA,
        });
        const copy = coerceInviteCopy(JSON.parse(out));
        if (copy && passesNeedContract(copy.needFramed)) return copy;
      } catch {
        // jatuh ke template
      }
    }
    return this.fallback.compose(need);
  }
}
