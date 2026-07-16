import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresRepository } from './repository';
import { DEMO_TEAM_ID, seedDemoNeeds, seedDemoTeam } from '../../seed/demoTeam';

const dir = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(dir, 'schema.sql'), 'utf8');

const repo = new PostgresRepository();
await repo.exec(schema);
await seedDemoTeam(repo);
await seedDemoNeeds(repo);

const people = await repo.listPeople(DEMO_TEAM_ID);
console.log(`Postgres siap: skema dibuat, ${people.length} orang + need demo di-seed ke ${DEMO_TEAM_ID}.`);
await repo.close();
