import { App } from '@slack/bolt';
import type { Person } from '../../domain/types';
import { createRepository } from '../repositoryFactory';
import { createGeminiClient, GeminiInviteComposer, GeminiNeedParser } from '../llm/gemini';
import { ScreeningService } from '../../core/screening';
import { NeedHarvester } from '../../core/needHarvester';
import { ClaimService, OutcomeLog } from '../../core/claim';
import { ClinicalRouter } from '../../core/clinicalRouter';
import { ReverseMatchService } from '../../core/reverseMatch';
import { handleInbound } from '../../pipelines/continuous';
import { Scheduler } from '../../pipelines/scheduler';
import { DEMO_TEAM_ID, DEMO_WEEK, seedDemoNeeds, seedDemoTeam } from '../../seed/demoTeam';
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
if (process.env.KAWAN_REPO?.trim().toLowerCase() !== 'postgres') {
  await seedDemoTeam(repo);
  await seedDemoNeeds(repo);
}

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

// Intake needs nyata: /butuh <teks bebas> -> masuk NeedHarvester lewat pipeline weekly yang sudah ada.
app.command('/butuh', async ({ ack, body, client }) => {
  await ack();
  const text = body.text?.trim();
  if (!text) {
    // DM, bukan postEphemeral ke channel_id: /butuh bisa dipanggil dari channel mana pun yang
    // bot belum tentu jadi anggotanya (postEphemeral ke channel asing -> not_in_channel).
    await client.chat.postMessage({
      channel: body.user_id,
      text: 'Ketik kebutuhannya setelah /butuh, ya. Contoh: /butuh 1 lagi buat futsal sore ini di GOR Kampus.',
    });
    return;
  }

  let personId = await directory.personIdFor(body.user_id);
  if (!personId) {
    const displayName = await resolveDisplayName(client, body.user_id);
    personId = body.user_id;
    const person: Person = {
      id: personId,
      teamId: DEMO_TEAM_ID,
      displayName,
      slackUserId: body.user_id,
      joinedAt: new Date(),
      interests: [],
      optedIn: true,
      riskConsent: false,
    };
    await repo.savePerson(person);
  }

  messaging.emit({ kind: 'need', personId, text });
  await client.chat.postMessage({
    channel: body.user_id,
    text: 'Sip, dicatat! Bakal ikut proses pencocokan mingguan.',
  });
});

const gemini = createGeminiClient();
const parser = new GeminiNeedParser(gemini);
const composer = new GeminiInviteComposer(gemini);
const screening = new ScreeningService(repo, messaging);
const harvester = new NeedHarvester(repo);
const claim = new ClaimService(repo, new OutcomeLog(repo));
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

await scheduler.openClinicalDoors();
await scheduler.screenTick();
scheduler.start();

console.log('KAWAN Slack adapter jalan (Socket Mode). Scheduler proaktif aktif — tak ada pemicu manual.');
