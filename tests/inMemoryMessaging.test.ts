import { describe, it, expect } from 'vitest';
import { InMemoryMessaging } from '../src/adapters/inMemory/messaging';
import type { InboundEvent } from '../src/ports/messaging';

describe('InMemoryMessaging', () => {
  it('mencatat outbound: screening, pool, pintu klinis', async () => {
    const m = new InMemoryMessaging();
    await m.postScreening('T', '2026-01');
    await m.openClinicalDoor('u1');

    expect(m.postedScreenings).toEqual([{ teamId: 'T', cycle: '2026-01' }]);
    expect(m.clinicalDoors).toEqual(['u1']);
  });

  it('receiveResponse mengalirkan event terurut lalu berhenti saat close', async () => {
    const m = new InMemoryMessaging();
    m.emit({ kind: 'need', personId: 'u1', text: 'futsal' });
    m.emit({ kind: 'claim', personId: 'u2', needId: 'n1' });

    const seen: InboundEvent['kind'][] = [];
    const consumer = (async () => {
      for await (const e of m.receiveResponse()) {
        seen.push(e.kind);
        if (seen.length === 3) m.close();
      }
    })();

    m.emit({ kind: 'selfReferral', personId: 'u3' });
    await consumer;

    expect(seen).toEqual(['need', 'claim', 'selfReferral']);
  });
});
