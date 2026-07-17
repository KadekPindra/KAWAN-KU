import { App } from '@slack/bolt';
import type { Need, Person } from '../../domain/types';
import { config } from '../../config/index';
import { createRepository } from '../repositoryFactory';
import { createGeminiClient, GeminiInviteComposer } from '../llm/gemini';
import { ScreeningService } from '../../core/screening';
import { NeedHarvester } from '../../core/needHarvester';
import { ClaimService, OutcomeLog } from '../../core/claim';
import { ClinicalRouter } from '../../core/clinicalRouter';
import { handleInbound } from '../../pipelines/continuous';
import { cycleOf } from '../../pipelines/scheduler';
import { DEMO_TEAM_ID, DEMO_WEEK, seedDemoNeeds, seedDemoTeam } from '../../seed/demoTeam';
import { RepoSlackDirectory } from './directory';
import { SlackAdapter, questionBlocks, poolBlocks, welcomeBlocks, resolveDisplayName } from './slackAdapter';

const { SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET } = process.env;
if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
  console.error('Butuh SLACK_BOT_TOKEN + SLACK_APP_TOKEN (Socket Mode). Isi .env dulu.');
  process.exit(1);
}

const repo = await createRepository();
if (process.env.KAWAN_REPO?.trim().toLowerCase() !== 'postgres') {
  await seedDemoTeam(repo);
  await seedDemoNeeds(repo);
}

const demoNeed: Need = {
  id: 'demo-futsal',
  teamId: DEMO_TEAM_ID,
  source: 'member',
  rawText: 'butuh 1 lagi buat futsal sore ini, yang penting bisa lari',
  parsed: { activity: 'futsal', skill: 'casual', slots: 1, when: 'sore ini', effort: 'low' },
  slotsTotal: 1,
  slotsOpen: 1,
  week: DEMO_WEEK,
  status: 'open',
  createdAt: new Date(),
};
await repo.saveNeed(demoNeed);

const app = new App({
  token: SLACK_BOT_TOKEN,
  appToken: SLACK_APP_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode: true,
});

const directory = new RepoSlackDirectory(repo, DEMO_TEAM_ID);
const messaging = new SlackAdapter(app, directory);
const composer = new GeminiInviteComposer(createGeminiClient());
const screening = new ScreeningService(repo, messaging);
const harvester = new NeedHarvester(repo);
const claim = new ClaimService(repo, new OutcomeLog(repo));
const clinical = new ClinicalRouter(repo, messaging);

app.command('/kawanku', async ({ ack, body, client }) => {
  await ack();
  const channel = body.user_id;
  const cycle = cycleOf(new Date());

  const displayName = await resolveDisplayName(client, body.user_id);

  if (!(await directory.personIdFor(body.user_id))) {
    const person: Person = {
      id: body.user_id,
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

  await client.chat.postMessage({
    channel,
    text: 'Selamat datang',
    blocks: welcomeBlocks(displayName, config.INSTITUTION_NAME),
  });

  await client.chat.postMessage({
    channel,
    text: 'Cek singkat (1 pertanyaan)',
    blocks: questionBlocks(cycle, 1),
  });
});

void (async () => {
  for await (const event of messaging.receiveResponse()) {
    await handleInbound({ teamId: DEMO_TEAM_ID, week: DEMO_WEEK, screening, harvester, claim, clinical }, event);
    if (event.kind === 'screenAnswer' && event.q === 1) {
      const copy = await composer.compose(demoNeed);
      await messaging.deliverPool(demoNeed, [event.personId], copy);
    }
  }
})();

await app.start();
console.log('KAWAN DEMO jalan (Socket Mode). Ketik /kawanku untuk: sambutan → 1 pertanyaan → langsung tawaran aktivitas.');
