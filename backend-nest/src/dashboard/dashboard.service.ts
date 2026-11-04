import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { OPEN_STATUSES } from '../common/catalog';
import { DatabaseService } from '../database/database.service';

export interface DashboardResponse {
  // Legacy contract
  new: number;
  active: number;
  pending: number;
  resolved_today: number;
  latest_id: number;
  // Additive fields (API v2)
  revision: number;
  open: number;
  overdue: number;
  opened_today: number;
  metrics: {
    window_days: number;
    first_response_avg_minutes: number | null;
    first_response_count: number;
    resolution_avg_minutes: number | null;
    resolution_count: number;
  };
  workload: { technician_id: number; name: string; active: number }[];
  sla_first_response_minutes: AppConfig['slaFirstResponseMinutes'];
}

const WINDOW_DAYS = 7;

/** Indicators computed from real ticket timestamps; nothing is estimated or invented. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly db: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async summary(): Promise<DashboardResponse> {
    const sla = this.config.slaFirstResponseMinutes;
    const tz = this.config.timezone;
    const [counts, totals, metrics, workload] = await Promise.all([
      this.db.query<{ status: string; count: number }>('SELECT status, COUNT(*)::int AS count FROM tickets GROUP BY status'),
      this.db.query<{ resolved_today: number; opened_today: number; latest_id: number; revision: number; overdue: number }>(
        `WITH today AS (SELECT (date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1) AS start)
         SELECT
           (SELECT COUNT(*)::int FROM tickets, today WHERE status = 'RESOLVIDO' AND resolved_at >= today.start) AS resolved_today,
           (SELECT COUNT(*)::int FROM tickets, today WHERE created_at >= today.start) AS opened_today,
           (SELECT COALESCE(MAX(id), 0)::int FROM tickets) AS latest_id,
           (SELECT COALESCE(MAX(id), 0)::int FROM ticket_history) AS revision,
           (SELECT COUNT(*)::int FROM tickets WHERE status = 'NOVO' AND created_at < now() - make_interval(mins =>
              CASE priority WHEN 'URGENTE' THEN $2::int WHEN 'ALTA' THEN $3::int WHEN 'NORMAL' THEN $4::int ELSE $5::int END)) AS overdue`,
        [tz, sla.URGENTE, sla.ALTA, sla.NORMAL, sla.BAIXA],
      ),
      this.db.query<{ fr_avg: number | null; fr_count: number; res_avg: number | null; res_count: number }>(
        `SELECT
           ROUND(AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)) / 60) FILTER (WHERE assigned_at >= now() - make_interval(days => $1)))::int AS fr_avg,
           COUNT(*) FILTER (WHERE assigned_at >= now() - make_interval(days => $1))::int AS fr_count,
           ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60) FILTER (WHERE status = 'RESOLVIDO' AND resolved_at >= now() - make_interval(days => $1)))::int AS res_avg,
           COUNT(*) FILTER (WHERE status = 'RESOLVIDO' AND resolved_at >= now() - make_interval(days => $1))::int AS res_count
         FROM tickets`,
        [WINDOW_DAYS],
      ),
      this.db.query<{ technician_id: number; name: string; active: number }>(
        `SELECT u.id AS technician_id, u.name, COUNT(t.id)::int AS active
         FROM technicians u JOIN tickets t ON t.technician_id = u.id AND t.status = ANY($1)
         GROUP BY u.id, u.name ORDER BY active DESC, u.name`,
        [OPEN_STATUSES],
      ),
    ]);
    const byStatus = Object.fromEntries(counts.rows.map(row => [row.status, row.count])) as Record<string, number>;
    const t = totals.rows[0];
    const m = metrics.rows[0];
    return {
      new: byStatus.NOVO ?? 0,
      active: byStatus.EM_ATENDIMENTO ?? 0,
      pending: (byStatus.AGUARDANDO_USUARIO ?? 0) + (byStatus.AGUARDANDO_TERCEIRO ?? 0),
      resolved_today: t.resolved_today,
      latest_id: t.latest_id,
      revision: t.revision,
      open: OPEN_STATUSES.reduce((sum, status) => sum + (byStatus[status] ?? 0), 0),
      overdue: t.overdue,
      opened_today: t.opened_today,
      metrics: {
        window_days: WINDOW_DAYS,
        first_response_avg_minutes: m.fr_count ? m.fr_avg : null,
        first_response_count: m.fr_count,
        resolution_avg_minutes: m.res_count ? m.res_avg : null,
        resolution_count: m.res_count,
      },
      workload: workload.rows,
      sla_first_response_minutes: sla,
    };
  }
}
