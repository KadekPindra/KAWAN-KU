import { describe, it, expect } from 'vitest';
import { looksLikeNeed, NeedHarvester } from '../src/core/needHarvester';
import { InMemoryRepository } from '../src/adapters/inMemory/repository';

describe('looksLikeNeed', () => {
  it('menerima kalimat dengan sinyal kebutuhan', () => {
    expect(looksLikeNeed('butuh 2 orang buat basket sore ini')).toBe(true);
    expect(looksLikeNeed('tim futsal kurang 1 orang')).toBe(true);
    expect(looksLikeNeed('cari reviewer desain buat demo day')).toBe(true);
  });

  it('menerima kalimat yang cuma menyebut nama aktivitas', () => {
    expect(looksLikeNeed('ada slot kosong buat boardgame malam ini')).toBe(true);
  });

  it('menolak obrolan yang tak menyebut kebutuhan/aktivitas apa pun', () => {
    expect(looksLikeNeed('halo, apa kabar?')).toBe(false);
    expect(looksLikeNeed('mantap sih fiturnya')).toBe(false);
    expect(looksLikeNeed('')).toBe(false);
    expect(looksLikeNeed('   ')).toBe(false);
  });
});

describe('NeedHarvester.collect', () => {
  it('menyimpan authorPersonId + sourceUrl kalau diberikan', async () => {
    const repo = new InMemoryRepository();
    const harvester = new NeedHarvester(repo);
    const need = await harvester.collect('T', 'member', 'butuh 1 orang', 'W', {
      authorPersonId: 'p1',
      sourceUrl: 'https://example.slack.com/archives/C1/p123',
    });

    expect(need.authorPersonId).toBe('p1');
    expect(need.sourceUrl).toBe('https://example.slack.com/archives/C1/p123');
    expect((await repo.getNeed(need.id))?.authorPersonId).toBe('p1');
  });

  it('authorPersonId/sourceUrl opsional (tetap jalan tanpa keduanya)', async () => {
    const repo = new InMemoryRepository();
    const harvester = new NeedHarvester(repo);
    const need = await harvester.collect('T', 'member', 'butuh 1 orang', 'W');

    expect(need.authorPersonId).toBeUndefined();
    expect(need.sourceUrl).toBeUndefined();
  });
});
