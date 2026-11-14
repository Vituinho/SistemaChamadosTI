import { formatProtocol } from '../common/protocol';
import type { HistoryEntry, HistoryRow, TicketDetail, TicketRow, TicketSummary } from './ticket.types';

export function isoUtc(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function toSummary(row: TicketRow): TicketSummary {
  return {
    id: row.id,
    protocol: formatProtocol(row.id),
    name: row.name,
    department: row.department,
    state: row.state,
    location: row.location,
    category: row.category,
    affected_system: row.affected_system,
    title: row.title,
    status: row.status,
    priority: row.priority,
    technician: row.technician ?? null,
    technician_id: row.technician_id ?? null,
    created_at: isoUtc(row.created_at),
    assigned_at: isoUtc(row.assigned_at),
    resolved_at: isoUtc(row.resolved_at),
    last_activity_at: isoUtc(row.last_activity_at ?? row.created_at),
  };
}

export function toHistoryEntry(row: HistoryRow): HistoryEntry {
  return {
    id: row.id,
    message: row.message,
    created_at: isoUtc(row.created_at),
    kind: row.kind === 'note' ? 'note' : 'event',
    author: row.author_name ?? null,
  };
}

export function toDetail(row: TicketRow, history: HistoryRow[]): TicketDetail {
  return {
    ...toSummary(row),
    description: row.description,
    solution: row.solution,
    has_attachment: Boolean(row.has_attachment),
    history: history.map(toHistoryEntry),
  };
}
