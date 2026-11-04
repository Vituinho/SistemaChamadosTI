import { hasDeviceConsent, isExpired, STORAGE_KEYS, TICKETS_TTL_MS } from "@/lib/device-memory";
import { readJson, writeJson } from "@/lib/storage";
import { isAccessKey, isProtocol } from "@/lib/tracking-link";

/**
 * Tickets opened on this computer, so the employee can return to them without
 * keeping the link. The tracking key is a credential: entries are stored only
 * with the employee's consent (see lib/device-memory), expire after 30 days and
 * can be removed individually or all at once ("Esquecer este computador").
 */
export interface SavedTicket {
  protocol: string;
  accessKey: string;
  title: string;
  createdAt: string;
  savedAt?: string;
}

const LIMIT = 10;

function valid(item: unknown, now: number): item is SavedTicket {
  const t = item as SavedTicket;
  return (
    typeof item === "object" && item !== null &&
    isProtocol(String(t.protocol)) && isAccessKey(String(t.accessKey)) &&
    typeof t.title === "string" && typeof t.createdAt === "string" &&
    !isExpired(t.savedAt ?? t.createdAt, TICKETS_TTL_MS, now)
  );
}

export function listSavedTickets(now = Date.now()): SavedTicket[] {
  if (!hasDeviceConsent()) return [];
  const items = readJson<unknown>(STORAGE_KEYS.tickets, []);
  return Array.isArray(items) ? items.filter((item): item is SavedTicket => valid(item, now)) : [];
}

/** No-op without consent. */
export function saveTicket(ticket: Omit<SavedTicket, "savedAt">) {
  if (!hasDeviceConsent()) return;
  const rest = listSavedTickets().filter(item => item.protocol !== ticket.protocol);
  writeJson(STORAGE_KEYS.tickets, [{ ...ticket, savedAt: new Date().toISOString() }, ...rest].slice(0, LIMIT));
}

export function forgetTicket(protocol: string) {
  writeJson(STORAGE_KEYS.tickets, listSavedTickets().filter(item => item.protocol !== protocol));
}
