import { App } from '@slack/bolt';
import { createRepository } from '../repositoryFactory';
import { createGeminiClient, GeminiInviteComposer, GeminiNeedParser } from '../llm/gemini';
import { ScreeningService } from '../../core/screening';
import { NeedHarvester } from '../../core/needHarvester';
import { ClaimService, OutcomeLog } from '../../core/claim';
import { ClinicalRouter } from '../../core/clinicalRouter';
import { runMonthly } from '../../pipelines/monthly';
import { runWeekly } from '../../pipelines/weekly';
import { handleInbound } from '../../pipelines/continuous';
import { DEMO_CYCLES, DEMO_TEAM_ID, DEMO_WEEK, seedDemoNeeds, seedDemoTeam } from '../../seed/demoTeam';
import { RepoSlackDirectory } from './directory';
import { SlackAdapter } from './slackAdapter';

const { SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET } = process.env;
if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
  console.error('Butuh SLACK_BOT_TOKEN + SLACK_APP_TOKEN (Socket Mode). Isi .env dulu.');
  process.exit(1);
}

const cycle = DEMO_CYCLES[DEMO_CYCLES.length - 1];

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

const gemini = createGeminiClient();
const parser = new GeminiNeedParser(gemini);
const composer = new GeminiInviteComposer(gemini);
const screening = new ScreeningService(repo, messaging);
const harvester = new NeedHarvester(repo);
const claim = new ClaimService(repo, new OutcomeLog(repo));
const clinical = new ClinicalRouter(repo, messaging);

app.command('/kawan-screen', async ({ ack, respond }) => {
  await ack();
  await screening.deliver(DEMO_TEAM_ID, cycle);
  await runMonthly({ repo, messaging }, DEMO_TEAM_ID, cycle);
  await respond('Skrining bulanan dikirim + deteksi dijalankan.');
});

app.command('/kawan-route', async ({ ack, respond }) => {
  await ack();
  const res = await runWeekly({ repo, messaging, parser, composer }, DEMO_TEAM_ID, DEMO_WEEK, cycle);
  await respond(`Routing mingguan: ${res.delivered.length} pool terkirim.`);
});

app.command('/kawan-clinical', async ({ ack, body }) => {
  await ack();
  await messaging.openClinicalDoor(body.user_id);
});

void (async () => {
  for await (const event of messaging.receiveResponse()) {
    await handleInbound({ teamId: DEMO_TEAM_ID, week: DEMO_WEEK, screening, harvester, claim, clinical }, event);
  }
})();

await app.start();
console.log('KAWAN Slack adapter jalan (Socket Mode). Slash: /kawan-screen /kawan-route /kawan-clinical');
