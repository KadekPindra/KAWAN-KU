import { config } from '../config/index';
import { InMemoryRepository } from '../adapters/inMemory/repository';
import { InMemoryMessaging } from '../adapters/inMemory/messaging';
import { invitationTemplate } from '../core/inviteComposer';
import { createGeminiClient, GeminiNeedParser, GeminiInviteComposer } from '../adapters/llm/gemini';
import { ClaimService, OutcomeLog } from '../core/claim';
import { ClinicalRouter } from '../core/clinicalRouter';
import { MetricsAggregator } from '../core/metrics';
import { mulberry32 } from '../core/rng';
import { runMonthly } from '../pipelines/monthly';
import { runWeekly } from '../pipelines/weekly';
import { DEMO_CYCLES, DEMO_TEAM_ID, DEMO_WEEK, seedDemoNeeds, seedDemoTeam } from '../seed/demoTeam';

function hr(title: string): void {
  console.log(`\n${'─'.repeat(66)}\n${title}\n${'─'.repeat(66)}`);
}

const repo = new InMemoryRepository();
const messaging = new InMemoryMessaging();
const gemini = createGeminiClient();
const parser = new GeminiNeedParser(gemini);
const composer = new GeminiInviteComposer(gemini);

await seedDemoTeam(repo);
await seedDemoNeeds(repo);

const roster = await repo.listPeople(DEMO_TEAM_ID);
const name = (id: string): string => roster.find((p) => p.id === id)?.displayName ?? id;
const cycle = DEMO_CYCLES[DEMO_CYCLES.length - 1];
const screenings = await repo.listScreenings(DEMO_TEAM_ID, cycle);
const scoreOf = (id: string): number | null =>
  screenings.find((s) => s.personId === id)?.ucla3Score ?? null;

hr('1) DETECT EARLY — UCLA-3 + deteksi deterministik (3 integer, tanpa ML)');
const { states, nudged } = await runMonthly({ repo, messaging }, DEMO_TEAM_ID, cycle);
console.table(
  states
    .filter((s) => s.flagged)
    .map((s) => ({
      orang: name(s.personId),
      skor: scoreOf(s.personId),
      streak: s.lonelyStreak,
      trend: s.trend,
      clinical_suggest: s.clinicalSuggest,
    })),
);
console.log(`soft-nudge klinis (streak≥${config.CLINICAL_CYCLES} & non-improving): ${nudged.map(name).join(', ') || '—'}`);

hr('2) ENABLE SUPPORT — routing komunitas: KEBUTUHAN, bukan ajakan');
const weekly = await runWeekly(
  { repo, messaging, parser, composer, rng: mulberry32(2026) },
  DEMO_TEAM_ID,
  DEMO_WEEK,
  cycle,
);
for (const d of weekly.delivered) {
  console.log(`\nNeed "${d.need.rawText}"`);
  console.log(`  parse → ${JSON.stringify(d.need.parsed)}`);
  console.log(`  ❌ ajakan    : ${invitationTemplate(d.need)}`);
  console.log(`  ✅ kebutuhan : ${d.copy.needFramed}`);
  console.log(
    `  pool ${d.pool.memberIds.length} orang (urut acak; dilusi ≤ ⅓, identitas skew tak pernah ditampilkan): ${d.pool.memberIds
      .map(name)
      .join(', ')}`,
  );
}
if (weekly.skippedFlagged.length > 0) {
  console.log(`\n⚠ supply-risk: ${weekly.skippedFlagged.map(name).join(', ')} belum kebagian — TIDAK di-spam.`);
}

hr('3) CLAIM — siapa cepat dia dapat (atomic, satu pemenang)');
const claimSvc = new ClaimService(repo, new OutcomeLog(repo));
const futsal = weekly.delivered.find((d) => d.need.id === 'need-futsal');
if (futsal) {
  const [first, second] = futsal.pool.memberIds;
  console.log(`${name(first)} klaim futsal → ${await claimSvc.claim(first, futsal.need.id)}`);
  if (second) console.log(`${name(second)} klaim futsal → ${await claimSvc.claim(second, futsal.need.id)} (slot sudah penuh)`);
}

hr('4) CLINICAL — jalur paralel, selalu aktif (bukan anak tangga)');
const clinical = new ClinicalRouter(repo, messaging);
console.log('Pintu self-referral always-on: terbuka untuk semua, tanpa syarat skor.');
const resources = await clinical.handle('gede', 'self_referral', cycle);
console.log(`Contoh self-referral (${name('gede')}) → sumber daya krisis langsung:`);
resources.forEach((r) => console.log(`  • ${r}`));

hr('5) INSTITUTION VIEW — agregat saja, k-anonymity gated');
const metrics = new MetricsAggregator(repo);
const gated = await metrics.rollup(DEMO_TEAM_ID, cycle, DEMO_WEEK);
console.log(`Default K_ANON=${config.K_ANON}, responder=${screenings.filter((s) => s.answeredAt !== null).length}:`);
console.log(`  ${gated.respondedCount === null ? 'DISUPPRESS (null) — buktinya: tak ada tempat melihat individu' : ''}`);
console.log(`  ${JSON.stringify(gated)}`);
const shown = await metrics.rollup(DEMO_TEAM_ID, cycle, DEMO_WEEK, { ...config, K_ANON: 5 });
console.log(`\nBila tim cukup besar (K_ANON=5) — yang dilihat institusi (tanpa data per-orang):`);
console.log(`  ${JSON.stringify(shown)}`);

console.log(
  '\n★ KAWAN: mengubah kesepian dari sesuatu yang harus diakui jadi tiga pertanyaan netral yang bisa ditindak — lalu menjawabnya dengan peran, bukan belas kasihan.\n',
);
