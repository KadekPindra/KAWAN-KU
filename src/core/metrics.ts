import { config, type Config } from '../config/index';
import type { Cycle, InstitutionMetrics } from '../domain/types';
import type { Repository } from '../ports/repository';

// institution_metrics TIDAK PERNAH join ke people. Rollup membaca screenings/invites
// hanya untuk agregasi; baris yang disimpan tak memuat data per-orang. Di bawah
// K_ANON responder, angka disuppress (null) — bukan diestimasi.
export class MetricsAggregator {
  constructor(private readonly repo: Repository) {}

  async rollup(
    teamId: string,
    cycle: Cycle,
    week: string,
    cfg: Config = config,
  ): Promise<InstitutionMetrics> {
    const screenings = await this.repo.listScreenings(teamId, cycle);
    const answered = screenings.filter((s) => s.answeredAt !== null && s.ucla3Score !== null);
    const respondedCount = answered.length;

    let metrics: InstitutionMetrics;
    if (respondedCount < cfg.K_ANON) {
      metrics = {
        teamId,
        period: cycle,
        respondedCount: null,
        lonelyCount: null,
        invitesSent: null,
        claimRate: null,
        avgUcla3: null,
      };
    } else {
      const lonelyCount = answered.filter((s) => s.lonely === true).length;
      const avg = answered.reduce((a, s) => a + (s.ucla3Score ?? 0), 0) / respondedCount;

      let invitesSent = 0;
      let claimed = 0;
      for (const need of await this.repo.listNeeds(teamId, week)) {
        const invites = await this.repo.listInvitesForNeed(need.id);
        invitesSent += invites.length;
        claimed += invites.filter((i) => i.state === 'claimed').length;
      }

      metrics = {
        teamId,
        period: cycle,
        respondedCount,
        lonelyCount,
        invitesSent,
        claimRate: invitesSent > 0 ? Number((claimed / invitesSent).toFixed(2)) : 0,
        avgUcla3: Number(avg.toFixed(2)),
      };
    }

    await this.repo.saveMetrics(metrics);
    return metrics;
  }
}
