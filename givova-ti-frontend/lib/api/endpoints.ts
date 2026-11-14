import { request } from "./client";
import type { Catalog, CreatedTicket, Dashboard, Feature, Priority, PushConfig, Status, Technician, Ticket, TicketPage } from "./types";

const key = (accessKey: string) => ({ "X-Ticket-Key": accessKey });

export interface QueueQuery {
  status?: Status | "";
  priority?: Priority | "";
  department?: string;
  state?: string;
  category?: string;
  affected_system?: string;
  q?: string;
  scope?: "open" | "waiting" | "closed" | "all" | "";
  assigned?: "me" | "none" | "";
  sort?: "oldest" | "newest" | "priority" | "activity" | "";
  offset?: number;
  limit?: number;
}

export function queueSearch(query: QueueQuery): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== "" && value !== null) params.set(name, String(value));
  }
  return params.toString();
}

export const api = {
  catalog: (signal?: AbortSignal) => request<Catalog>("/catalog", { signal }),
  createTicket: (form: FormData) => request<CreatedTicket>("/tickets", { method: "POST", form, timeoutMs: 45_000 }),
  tracking: (protocol: string, accessKey: string, signal?: AbortSignal) =>
    request<Ticket>(`/tracking/${encodeURIComponent(protocol)}`, { headers: key(accessKey), signal }),

  me: (signal?: AbortSignal) => request<Technician>("/auth/me", { signal }),
  login: (username: string, password: string) => request<Technician>("/auth/login", { method: "POST", json: { username, password } }),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  dashboard: (signal?: AbortSignal) => request<Dashboard>("/dashboard", { signal }),
  tickets: (query: QueueQuery, signal?: AbortSignal) => request<TicketPage>(`/tickets?${queueSearch(query)}`, { signal }),
  ticket: (id: number, signal?: AbortSignal) => request<Ticket>(`/tickets/${id}`, { signal }),
  assign: (id: number) => request<Ticket>(`/tickets/${id}/assign`, { method: "POST" }),
  update: (id: number, changes: { status?: Status; priority?: Priority }) => request<Ticket>(`/tickets/${id}`, { method: "PATCH", json: changes }),
  resolve: (id: number, solution: string) => request<Ticket>(`/tickets/${id}/resolve`, { method: "POST", json: { solution } }),
  addNote: (id: number, message: string) => request<Ticket>(`/tickets/${id}/notes`, { method: "POST", json: { message } }),
  renewTrackingLink: (id: number) => request<{ protocol: string; access_key: string }>(`/tickets/${id}/tracking-link`, { method: "POST" }),

  pushConfig: () => request<PushConfig>("/push/config"),
  pushSubscribe: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ ok: boolean }>("/push/subscribe", { method: "POST", json: subscription }),
  pushUnsubscribe: (endpoint: string) => request<{ ok: boolean }>("/push/unsubscribe", { method: "POST", json: { endpoint } }),
  pushTest: () => request<{ ok: boolean }>("/push/test", { method: "POST" }),
};

export function hasFeature(catalog: Catalog | undefined, feature: Feature): boolean {
  return Boolean(catalog?.features?.includes(feature));
}
