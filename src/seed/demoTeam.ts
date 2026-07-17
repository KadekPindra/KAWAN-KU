import type { Anchor, Need, NeedSource, Person, Screening } from '../domain/types';
import { isLonely } from '../core/screening';
import type { Repository } from '../ports/repository';

export const DEMO_TEAM_ID = 'garuda-demo';
export const DEMO_CYCLES = ['2026-04', '2026-05', '2026-06'] as const;
export const DEMO_WEEK = '2026-W29';

interface Spec {
  id: string;
  name: string;
  interests: string[];
  scores: (number | null)[]; 
  riskConsent: boolean;
}

const SPECS: Spec[] = [
  { id: 'dewi', name: 'Dewi', interests: ['futsal', 'lari'], scores: [5, 6, 8], riskConsent: true },
  { id: 'rangga', name: 'Rangga', interests: ['basket', 'ngoding'], scores: [6, 7, 8], riskConsent: true },
  { id: 'sari', name: 'Sari', interests: ['desain', 'kopi'], scores: [4, 5, 7], riskConsent: true },
  { id: 'bagus', name: 'Bagus', interests: ['musik', 'film'], scores: [8, 7, 6], riskConsent: true },
  { id: 'putu', name: 'Putu', interests: ['boardgame', 'kopi'], scores: [4, 5, null], riskConsent: false },
  { id: 'kadek', name: 'Kadek', interests: ['lari', 'futsal'], scores: [null, null, null], riskConsent: false },
  { id: 'wayan', name: 'Wayan', interests: ['futsal', 'basket'], scores: [3, 4, 3], riskConsent: false },
  { id: 'made', name: 'Made', interests: ['ngoding', 'boardgame'], scores: [4, 3, 4], riskConsent: false },
  { id: 'komang', name: 'Komang', interests: ['musik', 'kopi'], scores: [5, 4, 4], riskConsent: true },
  { id: 'gede', name: 'Gede', interests: ['film', 'baca'], scores: [3, 3, 3], riskConsent: false },
  { id: 'ayu', name: 'Ayu', interests: ['desain', 'musik'], scores: [4, 5, 4], riskConsent: true },
  { id: 'intan', name: 'Intan', interests: ['lari', 'kopi'], scores: [3, 4, 5], riskConsent: false },
  { id: 'yoga', name: 'Yoga', interests: ['futsal', 'ngoding'], scores: [4, 4, 4], riskConsent: true },
  { id: 'nadia', name: 'Nadia', interests: ['baca', 'film'], scores: [5, 5, 4], riskConsent: false },
  { id: 'rizky', name: 'Rizky', interests: ['basket', 'boardgame'], scores: [3, 4, 4], riskConsent: true },
];

function anchorsFor(score: number): [Anchor, Anchor, Anchor] {
  const a = [1, 1, 1];
  let rem = score - 3;
  for (let i = 0; i < 3 && rem > 0; i++) {
    const add = Math.min(2, rem);
    a[i] += add;
    rem -= add;
  }
  return [a[0] as Anchor, a[1] as Anchor, a[2] as Anchor];
}

function cycleDates(cycle: string): { delivered: Date; answered: Date } {
  const [y, m] = cycle.split('-').map(Number);
  return { delivered: new Date(Date.UTC(y, m - 1, 1)), answered: new Date(Date.UTC(y, m - 1, 3)) };
}

export async function seedDemoTeam(repo: Repository): Promise<void> {
  for (const spec of SPECS) {
    const person: Person = {
      id: spec.id,
      teamId: DEMO_TEAM_ID,
      displayName: spec.name,
      slackUserId: `U_${spec.id}`,
      joinedAt: new Date('2026-03-01'),
      interests: spec.interests,
      optedIn: true,
      riskConsent: spec.riskConsent,
    };
    await repo.savePerson(person);

    for (let i = 0; i < DEMO_CYCLES.length; i++) {
      const cycle = DEMO_CYCLES[i];
      const score = spec.scores[i] ?? null;
      const { delivered, answered } = cycleDates(cycle);

      let q1: Anchor | null = null;
      let q2: Anchor | null = null;
      let q3: Anchor | null = null;
      if (score !== null) [q1, q2, q3] = anchorsFor(score);

      const s: Screening = {
        id: `${DEMO_TEAM_ID}:${spec.id}:${cycle}`,
        teamId: DEMO_TEAM_ID,
        personId: spec.id,
        cycle,
        q1,
        q2,
        q3,
        ucla3Score: score,
        lonely: score !== null ? isLonely(score) : null,
        deliveredAt: delivered,
        lastSentAt: delivered,
        lastAnsweredAt: score !== null ? answered : null,
        answeredAt: score !== null ? answered : null,
        createdAt: delivered,
      };
      await repo.saveScreening(s);
    }
  }
}

export async function seedDemoNeeds(repo: Repository, week: string = DEMO_WEEK): Promise<void> {
  const raw: { id: string; text: string; slots: number; source: NeedSource }[] = [
    { id: 'need-futsal', text: 'butuh 1 lagi buat futsal jam 5 sore, yang penting bisa lari', slots: 1, source: 'member' },
    { id: 'need-basket', text: 'cari 2 orang buat main basket sabtu pagi', slots: 2, source: 'member' },
    { id: 'need-boardgame', text: 'tim board game kurang 1 buat malam ini', slots: 1, source: 'community' },
    { id: 'need-desain', text: 'butuh reviewer desain buat demo day, santai aja', slots: 1, source: 'member' },
  ];

  for (const n of raw) {
    const need: Need = {
      id: n.id,
      teamId: DEMO_TEAM_ID,
      source: n.source,
      rawText: n.text,
      parsed: null,
      slotsTotal: n.slots,
      slotsOpen: n.slots,
      week,
      status: 'open',
      createdAt: new Date('2026-07-15'),
    };
    await repo.saveNeed(need);
  }
}
