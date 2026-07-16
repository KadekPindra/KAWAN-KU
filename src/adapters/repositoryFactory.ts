import type { Repository } from '../ports/repository';
import { InMemoryRepository } from './inMemory/repository';

// Swap via env: KAWAN_REPO=postgres pakai Postgres (butuh DATABASE_URL), selain itu in-memory.
// Dynamic import supaya jalur in-memory tak memuat driver pg.
export async function createRepository(): Promise<Repository> {
  if (process.env.KAWAN_REPO?.trim().toLowerCase() === 'postgres') {
    const { PostgresRepository } = await import('./postgres/repository');
    return new PostgresRepository();
  }
  return new InMemoryRepository();
}
