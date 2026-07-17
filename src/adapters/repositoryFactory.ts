import type { Repository } from '../ports/repository';
import { InMemoryRepository } from './inMemory/repository';

export async function createRepository(): Promise<Repository> {
  if (process.env.KAWAN_REPO?.trim().toLowerCase() === 'postgres') {
    const { PostgresRepository } = await import('./postgres/repository');
    return new PostgresRepository();
  }
  return new InMemoryRepository();
}
