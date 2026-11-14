import type { Priority, Status } from '../common/catalog';

export interface TicketRow {
  id: number;
  access_hash: string;
  name: string;
  department: string;
  state: string;
  location: string;
  category: string;
  affected_system: string;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  technician_id: number | null;
  technician: string | null;
  created_at: Date;
  assigned_at: Date | null;
  resolved_at: Date | null;
  solution: string | null;
  has_attachment: boolean;
  last_activity_at: Date | null;
}

export interface HistoryRow {
  id: number;
  message: string;
  created_at: Date;
  kind: 'event' | 'note';
  author_name: string | null;
}

/** List item. Field names and formats are the public contract (legacy compatible + additive fields). */
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
  technician_id: number | null;
  created_at: string | null;
  assigned_at: string | null;
  resolved_at: string | null;
  last_activity_at: string | null;
}

export interface HistoryEntry {
  id: number;
  message: string;
  created_at: string | null;
  kind: 'event' | 'note';
  author: string | null;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  solution: string | null;
  has_attachment: boolean;
  history: HistoryEntry[];
}

export type Actor = { id: number; name: string };
