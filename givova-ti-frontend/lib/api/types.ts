/** API contract shared by the NestJS API (v2) and the legacy FastAPI API (v1). v2-only fields are optional. */

export const STATUSES = ["NOVO", "EM_ATENDIMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_TERCEIRO", "RESOLVIDO", "CANCELADO"] as const;
export const PRIORITIES = ["BAIXA", "NORMAL", "ALTA", "URGENTE"] as const;
export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export type Feature = "sort" | "scope" | "assigned" | "metrics" | "revision" | "tracking_link" | "notes";

export interface Catalog {
  departments: string[];
  states: string[];
  categories: string[];
  systems: string[];
  statuses: Status[];
  priorities: Priority[];
  api_version?: number;
  features?: Feature[];
  sla_first_response_minutes?: Record<Priority, number>;
}

export interface HistoryEntry {
  id: number;
  message: string;
  created_at: string;
  kind?: "event" | "note";
  author?: string | null;
}

export interface TicketSummary {
  id: number;
  protocol: string;
  name: string;
  department: string;
  state: string;
  location: string;
  category: string;
  affected_system: string;
  title: string;
  status: Status;
  priority: Priority;
  technician: string | null;
  technician_id?: number | null;
  created_at: string;
  assigned_at: string | null;
  resolved_at: string | null;
  last_activity_at?: string | null;
}

export interface Ticket extends TicketSummary {
  description: string;
  solution: string | null;
  has_attachment: boolean;
  history: HistoryEntry[];
}

export interface CreatedTicket extends Ticket {
  access_key: string;
}

export interface TicketPage {
  items: TicketSummary[];
  total: number;
}

export interface Dashboard {
  new: number;
  active: number;
  pending: number;
  resolved_today: number;
  latest_id: number;
  revision?: number;
  open?: number;
  overdue?: number;
  opened_today?: number;
  metrics?: {
    window_days: number;
    first_response_avg_minutes: number | null;
    first_response_count: number;
    resolution_avg_minutes: number | null;
    resolution_count: number;
  };
  workload?: { technician_id: number; name: string; active: number }[];
  sla_first_response_minutes?: Record<Priority, number>;
}

export interface Technician {
  id: number;
  name: string;
}

export interface PushConfig {
  enabled: boolean;
  public_key: string;
}
