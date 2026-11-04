import { readJson, removeKey, writeJson } from "@/lib/storage";

/** Requester details remembered on this computer (optional, employee-controlled). */
export interface Requester {
  name: string;
  department: string;
  state: string;
  location: string;
}

const KEY = "givova.requester.v1";

export function loadRequester(): Requester | null {
  const value = readJson<Partial<Requester> | null>(KEY, null);
  if (!value || typeof value !== "object") return null;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  return { name: text(value.name, 120), department: text(value.department, 80), state: text(value.state, 2), location: text(value.location, 160) };
}

export function saveRequester(value: Requester) {
  writeJson(KEY, value);
}

export function forgetRequester() {
  removeKey(KEY);
}
