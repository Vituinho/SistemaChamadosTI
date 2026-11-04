import { readJson, removeKey, writeJson } from "@/lib/storage";

/**
 * Opt-in memory of this computer (shared computers are common in the company).
 *
 * Nothing about the employee — name, location or tracking keys — is persisted
 * unless they explicitly tick "Lembrar meus dados e chamados neste computador".
 * Unticking it (or "Esquecer este computador") wipes everything. Stored data
 * also expires: requester details after 90 days, saved tickets after 30 days.
 */
const CONSENT_KEY = "givova.deviceConsent.v1";
export const STORAGE_KEYS = { requester: "givova.requester.v1", tickets: "givova.savedTickets.v1" } as const;
export const REQUESTER_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const TICKETS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hasDeviceConsent(): boolean {
  const value = readJson<{ grantedAt?: unknown } | null>(CONSENT_KEY, null);
  return typeof value?.grantedAt === "string";
}

export function grantDeviceConsent() {
  writeJson(CONSENT_KEY, { grantedAt: new Date().toISOString() });
}

/** Removes every trace of the employee from this browser profile. */
export function forgetThisDevice() {
  removeKey(CONSENT_KEY);
  removeKey(STORAGE_KEYS.requester);
  removeKey(STORAGE_KEYS.tickets);
}

export function isExpired(savedAt: unknown, ttlMs: number, now = Date.now()): boolean {
  const time = typeof savedAt === "string" ? new Date(savedAt).getTime() : NaN;
  return !Number.isFinite(time) || now - time > ttlMs;
}
