import { App } from '@slack/bolt';
import type { KnownBlock } from '@slack/types';
import type { Person } from '../../domain/types';
import { config } from '../../config/index';
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

interface DemoPsychologist {
  name: string;
  location: string;
  time: string;
  photoUrl: string;
  detailUrl: string;
}

const PSYCHOLOGISTS: DemoPsychologist[] = [
  {
    name: "Dwi utari, Psikolog",
    location: "Tanggerang Selatan",
    time: "Tommorrow, 7:30 PM",
    photoUrl:
      "https://images.pexels.com/photos/32254667/pexels-photo-32254667.jpeg",
    detailUrl: "https://example.com/psychologist/yulizar-zaidar",
  },
  {
    name: "Yulizar Zaidar M.Psi, Psikolog",
    location: "Renon Square",
    time: "Today, 5:30 PM",
    photoUrl:
      "https://images.pexels.com/photos/14438785/pexels-photo-14438785.jpeg",
    detailUrl: "https://example.com/psychologist/yulizar-zaidar",
  },
];

function consultBlocks(): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Hi there. are you okay? it looks like the past few weeks have been a bit overwhelming.',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "There's an available slot with a great psychologist nearby. Want me to lock this in for you?",
      },
    },
  ];
  PSYCHOLOGISTS.forEach((p, i) => {
    blocks.push(
      { type: 'image', image_url: p.photoUrl, alt_text: p.name },
      { type: 'section', text: { type: 'mrkdwn', text: `<${p.detailUrl}|*${p.name}*>` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `📍 ${p.location}  |  ⏰ ${p.time}` }] },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'See Detail', emoji: true },
            style: 'primary',
            url: p.detailUrl,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Maybe next time', emoji: true },
            style: 'danger',
            action_id: `consult_decline_${i}`,
          },
        ],
      },
    );
  });
  return blocks;
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

  const questionText = await screeningQuestionComposer.compose(1, { lonelyStreak: 0, trend: 'new' });
  await client.chat.postMessage({
    channel,
    text: 'Weekly Vibe Check',
    attachments: [{ color: SCREEN_ACCENT_COLOR, blocks: questionBlocks(cycle, 1, questionText, true) }],
  });
});

async function submitNeed(client: App['client'], userId: string, text: string, echoChannelId?: string): Promise<void> {
  if (!(await directory.personIdFor(userId))) {
    const displayName = await resolveDisplayName(client, userId);
    const person: Person = {
      id: userId,
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

  const dmConfirm = `Dicatat: "${text}" — lagi dicocokkan ke tim, tunggu sebentar ya.`;
  let sourceUrl: string | undefined;
  if (echoChannelId) {
    try {
      const posted = await client.chat.postMessage({
        channel: echoChannelId,
        text: `📝 <@${userId}> ajukan kebutuhan: "${text}" — lagi dicocokkan ke tim.`,
      });
      // Link ke pesan asli — bukti buat sisi penerima reverse-match bahwa kebutuhan ini nyata.
      // Kalau gagal (scope kurang, dsb.) sourceUrl cukup diam-diam kosong, tak menghalangi alur.
      if (posted.channel && posted.ts) {
        try {
          const permalink = await client.chat.getPermalink({ channel: posted.channel, message_ts: posted.ts });
          sourceUrl = permalink.permalink;
        } catch {
          // tak apa, tawaran tetap jalan tanpa link
        }
      }
    } catch {
      await client.chat.postMessage({ channel: userId, text: dmConfirm });
    }
  } else {
    await client.chat.postMessage({ channel: userId, text: dmConfirm });
  }

  await harvester.collect(DEMO_TEAM_ID, 'member', text, DEMO_WEEK, { authorPersonId: userId, sourceUrl });
  const result = await runWeekly({ repo, messaging, parser, composer }, DEMO_TEAM_ID, DEMO_WEEK, cycleOf(new Date()));
  if (result.delivered.length === 0) {
    await client.chat.postMessage({
      channel: userId,
      text: 'Belum ada slot yang pas buat kebutuhan itu sekarang — coba lagi nanti.',
    });
  }
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

app.command('/konsultasi', async ({ ack, body, client }) => {
  await ack();
  await client.chat.postMessage({
    channel: body.user_id,
    text: ' ',
    attachments: [{ color: SCREEN_ACCENT_COLOR, blocks: consultBlocks() }],
  });
});

app.action(/^consult_decline_/, async ({ ack, body, client }) => {
  await ack();
  const userId = (body as { user?: { id?: string } }).user?.id;
  if (!userId) return;
  await client.chat.postMessage({
    channel: userId,
    text: "Okay — maybe next time. I'm here whenever you're ready.",
  });
});

void (async () => {
  for await (const event of messaging.receiveResponse()) {
    await handleInbound({ teamId: DEMO_TEAM_ID, week: DEMO_WEEK, screening, harvester, claim, clinical, reverseMatch }, event);
  }
})();

await app.start();
console.log(
  'KAWAN DEMO jalan (Socket Mode). /kawanku: sambutan → 1 pertanyaan. /butuh <teks>: ajukan kebutuhan nyata → LLM parse+compose → ditawarkan ke roster lain yang match. /konsultasi: kartu psikolog.',
);
