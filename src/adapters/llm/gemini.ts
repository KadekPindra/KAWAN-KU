import type { Schema } from '@google/genai';
import type { Effort, Need, ParsedNeed } from '../../domain/types';
import type { ClaimOutcome } from '../../ports/messaging';
import { NeedParser, TemplateNeedParser } from '../../core/needParser';
import { InviteComposer, InviteCopy, TemplateInviteComposer } from '../../core/inviteComposer';
import { ClaimAcknowledger, TemplateClaimAcknowledger } from '../../core/claimAcknowledger';

const MODEL = 'gemini-2.5-flash';

export interface GenerateRequest {
  system: string;
  prompt: string;
  responseSchema?: Record<string, unknown>;
}

export interface GeminiClient {
  generate(req: GenerateRequest): Promise<string>;
}

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
  'location: nama tempat singkat kalau disebutkan di teks (boleh kosong).',
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
    location: { type: 'STRING' },
    effort: { type: 'STRING', enum: ['low', 'medium', 'high'] },
  },
  required: ['activity', 'skill', 'slots', 'when', 'location', 'effort'],
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
  const location = typeof o.location === 'string' ? o.location.trim() : '';
  return { activity, skill, slots, when, location, effort };
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
  'Kamu menulis DUA kalimat untuk mengisi slot kegiatan tim, dalam Bahasa Indonesia.',
  'problem: kalimat pembuka yang menyampaikan fakta ada kebutuhan baru (mis. "Ada yang baru butuh tambahan orang buat futsal sore ini.").',
  'needFramed: PERNYATAAN KEBUTUHAN inti: tim kekurangan orang untuk sebuah peran.',
  'KEDUA kalimat WAJIB framing KEBUTUHAN. DILARANG KERAS framing ajakan atau simpati: tanpa "yuk", "ayo", "ikutan", "gabung yuk", "biar nggak sendirian", tanpa iba.',
  'Jangan sebut kesepian, skrining, atau kondisi personal siapa pun.',
  'Keluarkan JSON: problem, needFramed, dan claimLabel (teks tombol singkat untuk mengambil slot).',
].join(' ');

const INVITE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    problem: { type: 'STRING' },
    needFramed: { type: 'STRING' },
    claimLabel: { type: 'STRING' },
  },
  required: ['problem', 'needFramed', 'claimLabel'],
};

const INVITATION_MARKERS = /\b(yuk|ayo|ikutan|gabung|join|mari|kuy)\b/i;
const SYMPATHY_MARKERS = /(sendirian|kesepian|kasihan|iba|jangan sedih|biar\s+nggak\s+sendiri)/i;

export function passesNeedContract(text: string): boolean {
  return text.trim().length > 0 && !INVITATION_MARKERS.test(text) && !SYMPATHY_MARKERS.test(text);
}

function coerceInviteCopy(raw: unknown): InviteCopy | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const problem = typeof o.problem === 'string' ? o.problem.trim() : '';
  const needFramed = typeof o.needFramed === 'string' ? o.needFramed.trim() : '';
  const claimLabel = typeof o.claimLabel === 'string' && o.claimLabel.trim() ? o.claimLabel.trim() : 'Saya isi slotnya';
  if (!problem || !needFramed) return null;
  return { problem, needFramed, claimLabel };
}

function describeNeed(need: Need): string {
  const p = need.parsed;
  if (!p) return need.rawText;
  return `activity=${p.activity}; slots=${need.slotsOpen || p.slots}; when=${p.when || '-'}; location=${p.location || '-'}; skill=${p.skill}; effort=${p.effort}`;
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
        if (copy && passesNeedContract(copy.problem) && passesNeedContract(copy.needFramed)) return copy;
      } catch {
        // jatuh ke template
      }
    }
    return this.fallback.compose(need);
  }
}

const ACK_SYSTEM = [
  'Kamu menulis SATU kalimat singkat dalam Bahasa Indonesia, santai, untuk seseorang yang baru saja merespons tawaran slot sebuah aktivitas tim.',
  'outcome="claimed": ucapkan apresiasi/terima kasih karena sudah bersedia mengisi kebutuhan tim.',
  'outcome="declined": tanggapi santai dan tidak menghakimi, terima keputusannya tanpa memaksa.',
  'outcome="full": beri tahu dengan ramah bahwa slotnya sudah keburu penuh duluan.',
  'Jangan sebut kesepian, skrining, atau kondisi personal siapa pun.',
  'Keluarkan JSON: { "text": "..." }.',
].join(' ');

const ACK_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: { text: { type: 'STRING' } },
  required: ['text'],
};

export class GeminiClaimAcknowledger implements ClaimAcknowledger {
  constructor(
    private readonly client: GeminiClient | null,
    private readonly fallback: ClaimAcknowledger = new TemplateClaimAcknowledger(),
  ) {}

  async acknowledge(need: Need, outcome: ClaimOutcome): Promise<string> {
    if (this.client) {
      try {
        const out = await this.client.generate({
          system: ACK_SYSTEM,
          prompt: `outcome=${outcome}; ${describeNeed(need)}`,
          responseSchema: ACK_SCHEMA,
        });
        const parsed = JSON.parse(out) as { text?: unknown };
        const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
        if (text) return text;
      } catch {
        // jatuh ke template
      }
    }
    return this.fallback.acknowledge(need, outcome);
  }
}
