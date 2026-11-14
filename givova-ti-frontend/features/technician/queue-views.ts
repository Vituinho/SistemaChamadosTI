import type { QueueQuery } from "@/lib/api/endpoints";
import type { Catalog, Dashboard } from "@/lib/api/types";
import { hasFeature } from "@/lib/api/endpoints";

export interface QueueView {
  id: string;
  label: string;
  query: Partial<QueueQuery>;
  count?: (dashboard: Dashboard) => number | undefined;
}

/** v2 API: open work first. */
const V2_VIEWS: QueueView[] = [
  { id: "open", label: "Abertos", query: { scope: "open" }, count: d => d.open },
  { id: "new", label: "Novos", query: { status: "NOVO" }, count: d => d.new },
  { id: "mine", label: "Meus", query: { scope: "open", assigned: "me" } },
  { id: "waiting", label: "Aguardando", query: { scope: "waiting" }, count: d => d.pending },
  { id: "resolved", label: "Resolvidos", query: { status: "RESOLVIDO" } },
  { id: "all", label: "Todos", query: {} },
];

/** Legacy API (FastAPI): only single-status filters are available. */
const LEGACY_VIEWS: QueueView[] = [
  { id: "all", label: "Todos", query: {} },
  { id: "new", label: "Novos", query: { status: "NOVO" }, count: d => d.new },
  { id: "active", label: "Em atendimento", query: { status: "EM_ATENDIMENTO" }, count: d => d.active },
  { id: "waiting-user", label: "Aguardando colaborador", query: { status: "AGUARDANDO_USUARIO" } },
  { id: "resolved", label: "Resolvidos", query: { status: "RESOLVIDO" } },
];

export function queueViews(catalog: Catalog | undefined): QueueView[] {
  return hasFeature(catalog, "scope") && hasFeature(catalog, "assigned") ? V2_VIEWS : LEGACY_VIEWS;
}

export interface QueueFilters {
  view: string;
  q: string;
  priority: string;
  department: string;
  state: string;
  category: string;
  affected_system: string;
  sort: "oldest" | "newest" | "priority" | "activity";
  offset: number;
}

export const DEFAULT_FILTERS: QueueFilters = {
  view: "", q: "", priority: "", department: "", state: "", category: "", affected_system: "", sort: "oldest", offset: 0,
};

export const PAGE_SIZE = 30;

export function buildQuery(filters: QueueFilters, views: QueueView[], catalog: Catalog | undefined): QueueQuery {
  const view = views.find(v => v.id === filters.view) ?? views[0];
  return {
    ...view.query,
    q: filters.q.trim(),
    priority: filters.priority as QueueQuery["priority"],
    department: filters.department,
    state: filters.state,
    category: filters.category,
    affected_system: filters.affected_system,
    ...(hasFeature(catalog, "sort") ? { sort: filters.sort } : {}),
    offset: filters.offset,
    limit: PAGE_SIZE,
  };
}

export const SORT_LABELS: Record<QueueFilters["sort"], string> = {
  oldest: "Mais antigos primeiro",
  newest: "Mais recentes primeiro",
  priority: "Maior prioridade",
  activity: "Última atividade",
};
