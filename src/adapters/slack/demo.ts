import { App } from '@slack/bolt';
import type { Person } from '../../domain/types';
import { config } from '../../config/index';
import { createRepository } from '../repositoryFactory';
import { createGeminiClient, GeminiInviteComposer, GeminiNeedParser } from '../llm/gemini';
import { ScreeningService } from '../../core/screening';
import { NeedHarvester } from '../../core/needHarvester';
import { ClaimService, OutcomeLog } from '../../core/claim';
import { ClinicalRouter } from '../../core/clinicalRouter';
import { ReverseMatchService } from '../../core/reverseMatch';
import { handleInbound } from '../../pipelines/continuous';
import { runWeekly } from '../../pipelines/weekly';
import { cycleOf } from '../../pipelines/scheduler';
import { DEMO_TEAM_ID, DEMO_WEEK } from '../../seed/demoTeam';
import { RepoSlackDirectory } from './directory';
import {
  SlackAdapter,
  questionBlocks,
  welcomeBlocks,
  resolveDisplayName,
  SCREEN_ACCENT_COLOR,
} from './slackAdapter';

const { SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET } = process.env;
if (!SLACK_BOT_TOKEN || !SLACK_APP_TOKEN) {
  console.error('Butuh SLACK_BOT_TOKEN + SLACK_APP_TOKEN (Socket Mode). Isi .env dulu.');
  process.exit(1);
}

const repo = await createRepository();

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
const reverseMatch = new ReverseMatchService(repo, messaging, parser, composer);

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
    text: 'Weekly Vibe Check',
    attachments: [{ color: SCREEN_ACCENT_COLOR, blocks: questionBlocks(cycle, 1, true) }],
  });
});

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

  if (!(await directory.personIdFor(body.user_id))) {
    const displayName = await resolveDisplayName(client, body.user_id);
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

  // Demo tak punya scheduler mingguan: simulasikan "route tick sudah jalan" begitu need masuk,
  // lewat runWeekly yang sama persis dipakai produksi — supaya benar batch-match ke roster lain,
  // bukan echo balik ke pengirim.
  await harvester.collect(DEMO_TEAM_ID, 'member', text, DEMO_WEEK);
  await runWeekly({ repo, messaging, parser, composer }, DEMO_TEAM_ID, DEMO_WEEK, cycleOf(new Date()));
});

void (async () => {
  for await (const event of messaging.receiveResponse()) {
    await handleInbound({ teamId: DEMO_TEAM_ID, week: DEMO_WEEK, screening, harvester, claim, clinical, reverseMatch }, event);
  }
})();

await app.start();
console.log(
  'KAWAN DEMO jalan (Socket Mode). /kawanku: sambutan → 1 pertanyaan. /butuh <teks>: ajukan kebutuhan nyata → LLM parse+compose → ditawarkan ke roster lain yang match.',
);
