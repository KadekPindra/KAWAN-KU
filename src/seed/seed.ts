import { InMemoryRepository } from '../adapters/inMemory/repository';
import { DetectionService } from '../core/detection';
import { DEMO_CYCLES, DEMO_TEAM_ID, seedDemoNeeds, seedDemoTeam } from './demoTeam';

const repo = new InMemoryRepository();
await seedDemoTeam(repo);
await seedDemoNeeds(repo);

const latest = DEMO_CYCLES[DEMO_CYCLES.length - 1];
const roster = await repo.listPeople(DEMO_TEAM_ID);
const states = await new DetectionService(repo).run(DEMO_TEAM_ID, latest);
const screenings = await repo.listScreenings(DEMO_TEAM_ID, latest);

const flagged = states.filter((s) => s.flagged);
const clinical = states.filter((s) => s.clinicalSuggest);
const silent = screenings.filter((s) => s.ucla3Score === null);
const needs = await repo.listOpenNeeds(DEMO_TEAM_ID, '2026-W29');

const name = (id: string): string => roster.find((p) => p.id === id)?.displayName ?? id;

console.log(`\nSEED ${DEMO_TEAM_ID} — ${roster.length} orang, siklus ${DEMO_CYCLES.join(', ')}`);
console.log(`Siklus terakhir: ${latest}\n`);

console.table(
  states.map((s) => ({
    orang: name(s.personId),
    skor: screenings.find((x) => x.personId === s.personId)?.ucla3Score,
    lonely: s.lonely,
    streak: s.lonelyStreak,
    trend: s.trend,
    flagged: s.flagged,
    klinis: s.clinicalSuggest,
  })),
);

console.log(`\nflagged (${flagged.length}): ${flagged.map((s) => name(s.personId)).join(', ')}`);
console.log(`clinical_suggest (${clinical.length}): ${clinical.map((s) => name(s.personId)).join(', ')}`);
console.log(`non-response ${latest}: ${silent.map((s) => name(s.personId)).join(', ')}`);
console.log(`open needs: ${needs.length} (${needs.map((n) => n.id).join(', ')})\n`);
