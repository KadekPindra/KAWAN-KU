import type { InstitutionMetrics } from '../domain/types';
import type { Repository } from '../ports/repository';

export interface MetricsReader {
  getMetrics(teamId: string, period: string): Promise<InstitutionMetrics | null>;
}

export function metricsReaderOf(repo: Repository): MetricsReader {
  return { getMetrics: (teamId, period) => repo.getMetrics(teamId, period) };
}

export function isSuppressed(m: InstitutionMetrics): boolean {
  return m.respondedCount === null;
}

export function renderInstitutionMetrics(teamId: string, period: string, m: InstitutionMetrics | null): string {
  const head = `INSTITUTION METRICS — ${teamId} / ${period}`;
  if (!m) return `${head}\n  (belum ada rollup untuk periode ini)`;
  if (isSuppressed(m)) {
    return `${head}\n  DISUPPRESS — responder < K_ANON. Tak ada angka, tak ada individu.`;
  }
  return [
    head,
    `  responder   : ${m.respondedCount}`,
    `  lonely      : ${m.lonelyCount}`,
    `  invites     : ${m.invitesSent}`,
    `  claim rate  : ${m.claimRate}`,
    `  rata UCLA-3 : ${m.avgUcla3}`,
  ].join('\n');
}

export class InstitutionView {
  constructor(private readonly reader: MetricsReader) {}

  async show(teamId: string, period: string): Promise<string> {
    const m = await this.reader.getMetrics(teamId, period);
    return renderInstitutionMetrics(teamId, period, m);
  }
}
