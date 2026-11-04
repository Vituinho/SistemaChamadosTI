import { readJson, writeJson } from "@/lib/storage";
import { isAccessKey, isProtocol } from "@/lib/tracking-link";

/**
 * Tickets opened on this computer, so the employee can return to them without
 * keeping the link. Holds the same data as the browser history entry of the
 * tracking page; the employee can remove any entry.
 */
export interface SavedTicket {
  protocol: string;
  accessKey: string;
  title: string;
  createdAt: string;
}

const KEY = "givova.savedTickets.v1";
const LIMIT = 10;

export function listSavedTickets(): SavedTicket[] {
  const items = readJson<unknown>(KEY, []);
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item): item is SavedTicket =>
      typeof item === "object" && item !== null &&
      isProtocol(String((item as SavedTicket).protocol)) && isAccessKey(String((item as SavedTicket).accessKey)) &&
      typeof (item as SavedTicket).title === "string" && typeof (item as SavedTicket).createdAt === "string",
  );
}

export function saveTicket(ticket: SavedTicket) {
  const rest = listSavedTickets().filter(item => item.protocol !== ticket.protocol);
  writeJson(KEY, [ticket, ...rest].slice(0, LIMIT));
}

export function forgetTicket(protocol: string) {
  writeJson(KEY, listSavedTickets().filter(item => item.protocol !== protocol));
}
