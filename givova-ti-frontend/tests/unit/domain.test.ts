import { describe, expect, it } from "vitest";
import { formatDuration, formatRelative, initials, minutesBetween } from "@/lib/format";
import { isAccessKey, parseTrackingLink, trackingPath, trackingUrl } from "@/lib/tracking-link";
import { employeeHeadline, humanizeHistory, isOverdue } from "@/features/tickets/meta";
import { emptyDraft, toFormData, validateDraft, type TicketDraft } from "@/features/new-ticket/validation";
import { forgetTicket, listSavedTickets, saveTicket } from "@/features/tracking/saved-tickets";
import { loadRequester, saveRequester } from "@/features/new-ticket/requester";
import { buildQuery, DEFAULT_FILTERS, queueViews } from "@/features/technician/queue-views";
import { queueSearch } from "@/lib/api/endpoints";
import type { Catalog } from "@/lib/api/types";

const KEY = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

describe("tracking links", () => {
  it("builds links with the key only in the fragment", () => {
    expect(trackingPath("GV-000012", KEY)).toBe(`/acompanhar/?protocol=GV-000012#${KEY}`);
    expect(trackingUrl("https://suporte.exemplo.com.br/", "GV-000012", KEY)).toBe(`https://suporte.exemplo.com.br/acompanhar/?protocol=GV-000012#${KEY}`);
  });
  it("parses current and legacy formats", () => {
    expect(parseTrackingLink(`https://x.com/acompanhar/?protocol=GV-000012#${KEY}`)).toEqual({ protocol: "GV-000012", accessKey: KEY });
    expect(parseTrackingLink(`https://x.com/acompanhar?protocol=GV-1#${KEY}`)).toEqual({ protocol: "GV-1", accessKey: KEY });
    expect(parseTrackingLink(`https://old.vercel.app/chamado/GV-000034#${KEY}`)).toEqual({ protocol: "GV-000034", accessKey: KEY });
    expect(parseTrackingLink(`  /acompanhar/?protocol=GV-5#${KEY}  `)).toEqual({ protocol: "GV-5", accessKey: KEY });
  });
  it("rejects incomplete or malicious links", () => {
    expect(parseTrackingLink("https://x.com/acompanhar/?protocol=GV-000012")).toBeNull();
    expect(parseTrackingLink(`https://x.com/acompanhar/?protocol=GV-1%20OR%201#${KEY}`)).toBeNull();
    expect(parseTrackingLink(`javascript:alert(1)#${KEY}`)).toBeNull();
    expect(parseTrackingLink("")).toBeNull();
    expect(isAccessKey("short")).toBe(false);
    expect(isAccessKey("x".repeat(129))).toBe(false);
  });
});

describe("formatting", () => {
  const now = new Date("2026-11-04T15:00:00Z").getTime();
  it("relative times in Portuguese", () => {
    expect(formatRelative("2026-11-04T14:59:40Z", now)).toBe("agora");
    expect(formatRelative("2026-11-04T14:48:00Z", now)).toBe("há 12 min");
    expect(formatRelative("2026-11-04T12:00:00Z", now)).toBe("há 3 h");
    expect(formatRelative(null, now)).toBe("—");
  });
  it("durations and helpers", () => {
    expect(formatDuration(8)).toBe("8 min");
    expect(formatDuration(125)).toBe("2 h 05 min");
    expect(formatDuration(60 * 24 * 3 + 60 * 4)).toBe("3 d 4 h");
    expect(formatDuration(null)).toBe("—");
    expect(minutesBetween("2026-11-04T10:00:00Z", "2026-11-04T10:45:00Z")).toBe(45);
    expect(minutesBetween("2026-11-04T10:00:00Z", null)).toBeNull();
    expect(initials("ana maria souza")).toBe("AS");
  });
});

describe("ticket presentation", () => {
  it("humanizes technical codes in history", () => {
    expect(humanizeHistory("Ana: status EM_ATENDIMENTO → AGUARDANDO_USUARIO")).toBe("Ana: status Em atendimento → Aguardando colaborador");
    expect(humanizeHistory("Ana: prioridade NORMAL → URGENTE")).toBe("Ana: prioridade Normal → Urgente");
  });
  it("overdue only applies to new tickets beyond the priority target", () => {
    const now = new Date("2026-11-04T15:00:00Z").getTime();
    const base = { created_at: "2026-11-04T14:00:00Z" };
    expect(isOverdue({ ...base, status: "NOVO", priority: "URGENTE" }, undefined, now)).toBe(true);
    expect(isOverdue({ ...base, status: "NOVO", priority: "NORMAL" }, undefined, now)).toBe(false);
    expect(isOverdue({ ...base, status: "EM_ATENDIMENTO", priority: "URGENTE" }, undefined, now)).toBe(false);
    expect(isOverdue({ ...base, status: "NOVO", priority: "NORMAL" }, { URGENTE: 5, ALTA: 10, NORMAL: 30, BAIXA: 60 }, now)).toBe(true);
  });
  it("employee headline names the technician", () => {
    expect(employeeHeadline("EM_ATENDIMENTO", "Ana").title).toBe("A TI está indo até você!");
    expect(employeeHeadline("EM_ATENDIMENTO", "Ana").text).toContain("Ana");
  });
});

describe("ticket form validation", () => {
  const valid: TicketDraft = { ...emptyDraft(), name: "Ana", department: "Financeiro", state: "PR", location: "Sala 1", category: "Internet", title: "Sem internet" };
  it("accepts a complete draft", () => {
    expect(validateDraft(valid)).toEqual({});
  });
  it("requires the system for category Sistema and a summary", () => {
    expect(validateDraft({ ...valid, category: "Sistema" })).toHaveProperty("affected_system");
    expect(validateDraft({ ...valid, title: "ab" })).toHaveProperty("title");
    expect(Object.keys(validateDraft(emptyDraft())).sort()).toEqual(["category", "department", "location", "name", "state", "title"]);
  });
  it("validates attachments by type and size", () => {
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    expect(validateDraft({ ...valid, attachment: pdf }).attachment).toMatch(/PNG, JPG ou WEBP/);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.png", { type: "image/png" });
    expect(validateDraft({ ...valid, attachment: big }).attachment).toMatch(/5 MB/);
  });
  it("serializes only API fields (trimmed) and omits the system outside Sistema", () => {
    const form = toFormData({ ...valid, name: "  Ana  ", affected_system: "DBFrete" });
    expect(form.get("name")).toBe("Ana");
    expect(form.has("affected_system")).toBe(false);
    expect(form.has("attachment")).toBe(false);
    expect([...form.keys()].sort()).toEqual(["category", "department", "description", "location", "name", "state", "title"]);
  });
});

describe("local storage helpers", () => {
  it("keeps the 10 most recent tickets and ignores tampered entries", () => {
    for (let i = 1; i <= 12; i++) saveTicket({ protocol: `GV-${i}`, accessKey: KEY, title: `T${i}`, createdAt: "2026-11-04T10:00:00Z" });
    expect(listSavedTickets()).toHaveLength(10);
    expect(listSavedTickets()[0].protocol).toBe("GV-12");
    forgetTicket("GV-12");
    expect(listSavedTickets()[0].protocol).toBe("GV-11");
    localStorage.setItem("givova.savedTickets.v1", JSON.stringify([{ protocol: "<img>", accessKey: KEY, title: "x", createdAt: "" }]));
    expect(listSavedTickets()).toEqual([]);
    localStorage.setItem("givova.savedTickets.v1", "not json");
    expect(listSavedTickets()).toEqual([]);
  });
  it("remembers requester details with bounded lengths", () => {
    saveRequester({ name: "Ana", department: "Financeiro", state: "PR", location: "Sala 1" });
    expect(loadRequester()).toEqual({ name: "Ana", department: "Financeiro", state: "PR", location: "Sala 1" });
    localStorage.setItem("givova.requester.v1", JSON.stringify({ name: "x".repeat(500), state: 42 }));
    expect(loadRequester()).toEqual({ name: "x".repeat(120), department: "", state: "", location: "" });
  });
});

describe("technician queue views", () => {
  const legacy: Catalog = { departments: [], states: [], categories: [], systems: [], statuses: [], priorities: [] };
  const v2: Catalog = { ...legacy, api_version: 2, features: ["scope", "assigned", "sort", "revision", "metrics", "notes", "tracking_link"] };
  it("uses open-work views on the v2 API and status views on the legacy API", () => {
    expect(queueViews(v2)[0].id).toBe("open");
    expect(queueViews(legacy)[0].id).toBe("all");
    expect(queueViews(legacy).some(view => view.query.scope || view.query.assigned)).toBe(false);
  });
  it("only sends parameters the API understands", () => {
    const v2Query = buildQuery({ ...DEFAULT_FILTERS, view: "mine", q: " gv-1 ", sort: "priority" }, queueViews(v2), v2);
    expect(queueSearch(v2Query)).toBe("scope=open&assigned=me&q=gv-1&sort=priority&offset=0&limit=30");
    const legacyQuery = buildQuery({ ...DEFAULT_FILTERS, view: "new", sort: "priority", department: "Financeiro" }, queueViews(legacy), legacy);
    expect(queueSearch(legacyQuery)).toBe("status=NOVO&department=Financeiro&offset=0&limit=30");
  });
});
