import { hasDeviceConsent, isExpired, REQUESTER_TTL_MS, STORAGE_KEYS } from "@/lib/device-memory";
import { readJson, writeJson } from "@/lib/storage";

/** Requester details remembered on this computer — only with the employee's consent (see lib/device-memory). */
export interface Requester {
  name: string;
  department: string;
  state: string;
  location: string;
}

export function loadRequester(now = Date.now()): Requester | null {
  if (!hasDeviceConsent()) return null;
  const value = readJson<(Partial<Requester> & { savedAt?: unknown }) | null>(STORAGE_KEYS.requester, null);
  if (!value || typeof value !== "object" || isExpired(value.savedAt, REQUESTER_TTL_MS, now)) return null;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  return { name: text(value.name, 120), department: text(value.department, 80), state: text(value.state, 2), location: text(value.location, 160) };
}

/** No-op without consent. */
export function saveRequester(value: Requester) {
  if (hasDeviceConsent()) writeJson(STORAGE_KEYS.requester, { ...value, savedAt: new Date().toISOString() });
}
