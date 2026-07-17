import { App } from '@slack/bolt';
import type { Person } from '../../domain/types';
import { createRepository } from '../repositoryFactory';
import {
  createGeminiClient,
  GeminiClaimAcknowledger,
  GeminiInviteComposer,
  GeminiNeedParser,
  GeminiScreeningQuestionComposer,
} from '../llm/gemini';
import { ScreeningService } from '../../core/screening';
import { NeedHarvester, looksLikeNeed } from '../../core/needHarvester';
import { ClaimService, OutcomeLog } from '../../core/claim';
import { ClinicalRouter } from '../../core/clinicalRouter';
import { ReverseMatchService } from '../../core/reverseMatch';
import { handleInbound } from '../../pipelines/continuous';
import { Scheduler } from '../../pipelines/scheduler';
import { DEMO_TEAM_ID, DEMO_WEEK } from '../../seed/demoTeam';
import { RepoSlackDirectory } from './directory';
import { SlackAdapter, resolveDisplayName } from './slackAdapter';

const { SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET } = process.env;
if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
  console.error('Butuh SLACK_BOT_TOKEN + SLACK_APP_TOKEN (Socket Mode). Isi .env dulu.');
  process.exit(1);
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;

const repo = await createRepository();

const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode: true,
});

const directory = new RepoSlackDirectory(repo, DEMO_TEAM_ID);
const messaging = new SlackAdapter(app, directory);

app.event('team_join', async ({ event }) => {
  const person: Person = {
    id: event.user.id,
    teamId: DEMO_TEAM_ID,
    displayName: event.user.profile?.real_name || event.user.real_name || event.user.name,
    slackUserId: event.user.id,
    joinedAt: new Date(),
    interests: [],
    optedIn: true,
    riskConsent: false,
  };
  await repo.savePerson(person);
  await messaging.sendWelcome(person.id);
});

// Dipakai baik oleh /butuh maupun pesan bebas ke DM bot — satu jalur intake, satu perilaku.
async function submitNeed(client: App['client'], userId: string, text: string, echoChannelId?: string): Promise<void> {
  let personId = await directory.personIdFor(userId);
  if (!personId) {
    const displayName = await resolveDisplayName(client, userId);
    personId = userId;
    const person: Person = {
      id: personId,
      teamId: DEMO_TEAM_ID,
      displayName,
      slackUserId: userId,
      joinedAt: new Date(),
      interests: [],
      optedIn: true,
      riskConsent: false,
    };
    await repo.savePerson(person);
  }

  const dmConfirm = 'Sip, dicatat! Bakal ikut proses pencocokan mingguan.';
  let sourceUrl: string | undefined;
  let echoed = false;
  if (echoChannelId) {
    // Echo ke channel asal (biar kelihatan sebagai chat, bukan cuma slash command yang lewat)
    // — fallback ke DM kalau bot belum jadi anggota channel itu (not_in_channel).
    try {
      const posted = await client.chat.postMessage({
        channel: echoChannelId,
        text: `📝 <@${userId}> ajukan kebutuhan: "${text}" — bakal ikut proses pencocokan mingguan.`,
      });
      echoed = true;
      // Link ke pesan asli — bukti buat sisi penerima reverse-match bahwa kebutuhan ini nyata.
      if (posted.channel && posted.ts) {
        try {
          const permalink = await client.chat.getPermalink({ channel: posted.channel, message_ts: posted.ts });
          sourceUrl = permalink.permalink;
        } catch {
          // tak apa, tawaran tetap jalan tanpa link
        }
      }
    } catch {
      // fallback ke DM di bawah
    }
  }
  if (!echoed) {
    await client.chat.postMessage({ channel: userId, text: dmConfirm });
  }

  messaging.emit({ kind: 'need', personId, text, sourceUrl });
}

app.command('/butuh', async ({ ack, body, client }) => {
  await ack();
  const text = body.text?.trim();
  if (!text) {
    await client.chat.postMessage({
      channel: body.user_id,
      text: 'Ketik kebutuhannya setelah /butuh, ya. Contoh: /butuh 1 lagi buat futsal sore ini di GOR Kampus.',
    });
    return;
  }
  await submitNeed(client, body.user_id, text, body.channel_id);
});

// Pesan bebas (bukan slash command) ke DM bot — hanya diproses kalau kelihatan seperti
// kebutuhan aktivitas nyata (looksLikeNeed); obrolan yang jelas melenceng diabaikan/ditegur.
app.message(async ({ message, client, say }) => {
  const m = message as { subtype?: string; channel_type?: string; user?: string; text?: string };
  if (m.subtype || m.channel_type !== 'im' || !m.user || !m.text) return;

  const text = m.text.trim();
  if (!looksLikeNeed(text)) {
    await say('Kalau ini kebutuhan aktivitas tim, sebutin kegiatan + jumlah orang ya (misal: "butuh 2 orang buat basket sore ini"). Atau pakai /butuh.');
    return;
  }
  await submitNeed(client, m.user, text);
});

const gemini = createGeminiClient();
const parser = new GeminiNeedParser(gemini);
const composer = new GeminiInviteComposer(gemini);
const acknowledger = new GeminiClaimAcknowledger(gemini);
const screeningQuestionComposer = new GeminiScreeningQuestionComposer(gemini);
const screening = new ScreeningService(repo, messaging, screeningQuestionComposer);
const harvester = new NeedHarvester(repo);
const claim = new ClaimService(repo, new OutcomeLog(repo), messaging, acknowledger);
const clinical = new ClinicalRouter(repo, messaging);
const reverseMatch = new ReverseMatchService(repo, messaging, parser, composer);

const scheduler = new Scheduler(
  { repo, messaging, parser, composer, screening },
  { teamId: DEMO_TEAM_ID, week: DEMO_WEEK },
  { screenTickMs: num('SCREEN_TICK_MS', HOUR), routeTickMs: num('ROUTE_TICK_MS', WEEK) },
);

void (async () => {
  for await (const event of messaging.receiveResponse()) {
    await handleInbound({ teamId: DEMO_TEAM_ID, week: DEMO_WEEK, screening, harvester, claim, clinical, reverseMatch }, event);
  }
})();

await app.start();

async function bootstrapRoster(): Promise<void> {
  let cursor: string | undefined;
  let added = 0;
  do {
    const res = await app.client.users.list({ cursor, limit: 200 });
    for (const m of res.members ?? []) {
      if (!m.id || m.is_bot || m.deleted || m.id === 'USLACKBOT') continue;
      if (await directory.personIdFor(m.id)) continue;
      const person: Person = {
        id: m.id,
        teamId: DEMO_TEAM_ID,
        displayName: m.profile?.real_name || m.real_name || m.name || m.id,
        slackUserId: m.id,
        joinedAt: new Date(),
        interests: [],
        optedIn: true,
        riskConsent: false,
      };
      await repo.savePerson(person);
      added++;
    }
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  console.log(`[bootstrap] roster terisi: ${added} member workspace didaftarkan`);
}

await bootstrapRoster();

await scheduler.screenTick();
scheduler.start();

console.log('KAWAN Slack adapter jalan (Socket Mode). Scheduler proaktif aktif — tak ada pemicu manual.');
