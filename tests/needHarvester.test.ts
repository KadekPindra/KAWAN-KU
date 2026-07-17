import { describe, it, expect } from 'vitest';
import { looksLikeNeed } from '../src/core/needHarvester';

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
