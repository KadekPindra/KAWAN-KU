import { describe, it, expect } from 'vitest';
import { parseNeedTemplate } from '../src/core/needParser';

describe('parseNeedTemplate', () => {
  it('futsal jam 5 sore, santai', () => {
    const p = parseNeedTemplate('butuh 1 lagi buat futsal jam 5 sore, yang penting bisa lari');
    expect(p.activity).toBe('futsal');
    expect(p.slots).toBe(1);
    expect(p.when).toContain('sore');
    expect(p.effort).toBe('low');
  });

  it('basket sabtu pagi, 2 orang', () => {
    const p = parseNeedTemplate('cari 2 orang buat main basket sabtu pagi');
    expect(p.activity).toBe('basket');
    expect(p.slots).toBe(2);
    expect(p.when).toBe('sabtu pagi');
  });

  it('board game malam ini', () => {
    const p = parseNeedTemplate('tim board game kurang 1 buat malam ini');
    expect(p.activity).toBe('boardgame');
    expect(p.when).toBe('malam ini');
  });

  it('tanpa angka => default 1 slot', () => {
    expect(parseNeedTemplate('butuh reviewer desain buat demo day, santai aja').slots).toBe(1);
  });
});
