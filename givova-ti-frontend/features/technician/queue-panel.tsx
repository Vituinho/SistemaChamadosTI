"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, Inbox, MapPin, Search, SearchX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { Avatar, Badge, EmptyState, Kbd, Skeleton } from "@/components/ui/primitives";
import type { Catalog, Dashboard, TicketPage, TicketSummary } from "@/lib/api/types";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OverdueBadge, PriorityBadge, StatusBadge } from "@/features/tickets/badges";
import { displayDepartment, isOverdue, PRIORITY_META, STATUS_META } from "@/features/tickets/meta";
import { PAGE_SIZE, SORT_LABELS, type QueueFilters, type QueueView } from "./queue-views";

const FILTER_FIELDS = [
  { key: "priority", label: "Prioridade" },
  { key: "department", label: "Setor" },
  { key: "state", label: "Estado" },
  { key: "category", label: "Categoria" },
  { key: "affected_system", label: "Sistema" },
] as const;

function filterOptions(catalog: Catalog | undefined, key: (typeof FILTER_FIELDS)[number]["key"]) {
  if (!catalog) return [];
  switch (key) {
    case "priority": return catalog.priorities.map(value => ({ value, label: PRIORITY_META[value].label }));
    case "department": return catalog.departments.map(value => ({ value, label: displayDepartment(value) }));
    case "state": return catalog.states.map(value => ({ value, label: value }));
    case "category": return catalog.categories.map(value => ({ value, label: value }));
    case "affected_system": return catalog.systems.map(value => ({ value, label: value }));
  }
}

export function QueuePanel({
  filters, setFilters, views, catalog, dashboard, page, loading, fetching, error, onRetry, selectedId, onSelect, sortable,
}: {
  filters: QueueFilters;
  setFilters: (update: Partial<QueueFilters>) => void;
  views: QueueView[];
  catalog?: Catalog;
  dashboard?: Dashboard;
  page?: TicketPage;
  loading: boolean;
  fetching: boolean;
  error?: string;
  onRetry: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
  sortable: boolean;
}) {
  const [search, setSearch] = useState(filters.q);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const activeView = views.find(v => v.id === filters.view) ?? views[0];

  // Debounced search (one request per pause in typing).
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => setFilters({ q: search, offset: 0 }), 300);
    return () => clearTimeout(timer);
  }, [search, filters.q, setFilters]);

  // "/" focuses the search box (unless typing in a field).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !target.isContentEditable) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeFilters = FILTER_FIELDS.filter(field => filters[field.key]);
  const items = page?.items ?? [];
  const total = page?.total ?? 0;
  const sla = dashboard?.sla_first_response_minutes ?? catalog?.sla_first_response_minutes;

  function moveFocus(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-ticket]") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

  return (
    <section aria-labelledby="queue-title" className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-card">
      <div className="space-y-3 border-b border-slate-100 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id="queue-title" className="text-base font-semibold text-slate-950">Fila de chamados</h2>
          <span className="text-xs text-slate-600 tabular-nums" aria-live="polite">
            {fetching && !loading ? "Atualizando…" : `${total} ${total === 1 ? "chamado" : "chamados"}`}
          </span>
        </div>

        <div role="group" aria-label="Visões da fila" className="flex flex-wrap gap-1">
          {views.map(view => {
            const count = dashboard && view.count ? view.count(dashboard) : undefined;
            const selected = view.id === activeView.id;
            return (
              <button
                key={view.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilters({ view: view.id, offset: 0 })}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors",
                  selected ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                {view.label}
                {count !== undefined && count > 0 && (
                  <span className={cn("rounded-full px-1.5 text-[11px] tabular-nums", selected ? "bg-white/20" : "bg-slate-200 text-slate-700")}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              maxLength={160}
              placeholder="Buscar protocolo, nome, local…"
              aria-label="Buscar chamados"
              className="h-10 w-full rounded-lg border border-slate-300 bg-white pr-9 pl-9 text-sm placeholder:text-slate-500 focus-visible:border-brand-600 focus-visible:ring-3 focus-visible:ring-brand-600/20 focus-visible:outline-none"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 sm:block"><Kbd>/</Kbd></span>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 shrink-0" aria-label={`Filtros${activeFilters.length ? ` (${activeFilters.length} ativos)` : ""}`}>
                <Filter />
                <span className="hidden sm:inline">Filtros</span>
                {activeFilters.length > 0 && <span className="rounded-full bg-brand-700 px-1.5 text-[11px] text-white">{activeFilters.length}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">Filtrar fila</p>
              {FILTER_FIELDS.map(field => (
                <div key={field.key} className="space-y-1">
                  <Label htmlFor={`filter-${field.key}`} className="text-xs">{field.label}</Label>
                  <Select id={`filter-${field.key}`} value={filters[field.key]} onChange={event => setFilters({ [field.key]: event.target.value, offset: 0 })} className="h-9 text-sm">
                    <option value="">Todos</option>
                    {filterOptions(catalog, field.key).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </Select>
                </div>
              ))}
              {sortable && (
                <div className="space-y-1 border-t border-slate-100 pt-3">
                  <Label htmlFor="filter-sort" className="text-xs">Ordenar por</Label>
                  <Select id="filter-sort" value={filters.sort} onChange={event => setFilters({ sort: event.target.value as QueueFilters["sort"], offset: 0 })} className="h-9 text-sm">
                    {Object.entries(SORT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </Select>
                </div>
              )}
              {activeFilters.length > 0 && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setFilters(Object.fromEntries(FILTER_FIELDS.map(f => [f.key, ""])) as Partial<QueueFilters>)}>
                  Limpar filtros
                </Button>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {(activeFilters.length > 0 || (sortable && filters.sort !== "oldest")) && (
          <div className="flex flex-wrap gap-1.5">
            {activeFilters.map(field => (
              <button
                key={field.key}
                type="button"
                onClick={() => setFilters({ [field.key]: "", offset: 0 })}
                className="inline-flex h-7 items-center gap-1 rounded-full bg-slate-100 pr-1.5 pl-2.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                aria-label={`Remover filtro ${field.label}: ${filters[field.key]}`}
              >
                {field.label}: {field.key === "priority" ? PRIORITY_META[filters.priority as keyof typeof PRIORITY_META]?.label : field.key === "department" ? displayDepartment(filters.department) : filters[field.key]}
                <X className="size-3.5" aria-hidden="true" />
              </button>
            ))}
            {sortable && filters.sort !== "oldest" && <Badge className="bg-white text-slate-600 ring-slate-200">{SORT_LABELS[filters.sort]}</Badge>}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={loading}>
        {error ? (
          <EmptyState icon={SearchX} title="Não foi possível carregar a fila" action={<Button variant="outline" onClick={onRetry}>Tentar novamente</Button>}>{error}</EmptyState>
        ) : loading ? (
          <div className="space-y-px p-2" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="m-1 h-[104px]" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={filters.q || activeFilters.length ? SearchX : Inbox}
            title={filters.q || activeFilters.length ? "Nenhum chamado com esses filtros" : activeView.id === "open" || activeView.id === "new" ? "Fila em dia" : "Nada por aqui"}
            action={(filters.q || activeFilters.length > 0) && (
              <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFilters({ q: "", priority: "", department: "", state: "", category: "", affected_system: "", offset: 0 }); }}>
                Limpar busca e filtros
              </Button>
            )}
          >
            {filters.q || activeFilters.length ? "Tente outros termos ou remova filtros." : "Novos chamados aparecem aqui automaticamente."}
          </EmptyState>
        ) : (
          <ul ref={listRef} onKeyDown={moveFocus} className={cn("divide-y divide-slate-100 transition-opacity", fetching && "opacity-80")} aria-label="Chamados">
            {items.map(ticket => (
              <QueueItem key={ticket.id} ticket={ticket} selected={ticket.id === selectedId} overdue={isOverdue(ticket, sla)} onSelect={() => onSelect(ticket.id)} />
            ))}
          </ul>
        )}
      </div>

      {total > PAGE_SIZE && (
        <nav aria-label="Paginação" className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5">
          <Button variant="ghost" size="sm" disabled={filters.offset === 0} onClick={() => setFilters({ offset: Math.max(0, filters.offset - PAGE_SIZE) })}>
            <ChevronLeft /> Anterior
          </Button>
          <span className="text-xs text-slate-600 tabular-nums">
            {filters.offset + 1}–{Math.min(total, filters.offset + PAGE_SIZE)} de {total}
          </span>
          <Button variant="ghost" size="sm" disabled={filters.offset + PAGE_SIZE >= total} onClick={() => setFilters({ offset: filters.offset + PAGE_SIZE })}>
            Próxima <ChevronRight />
          </Button>
        </nav>
      )}
    </section>
  );
}

function QueueItem({ ticket, selected, overdue, onSelect }: { ticket: TicketSummary; selected: boolean; overdue: boolean; onSelect: () => void }) {
  const meta = STATUS_META[ticket.status];
  return (
    <li>
      <button
        type="button"
        data-ticket={ticket.id}
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "group relative block w-full px-4 py-3.5 text-left transition-colors focus-visible:z-10 focus-visible:outline-offset-[-2px]",
          selected ? "bg-brand-50/70" : "hover:bg-slate-50",
        )}
      >
        <span aria-hidden="true" className={cn("absolute inset-y-2 left-0 w-1 rounded-r-full", selected ? "bg-brand-600" : meta.dot, !selected && ticket.status !== "NOVO" && "opacity-40")} />
        <span className="flex items-center gap-2 text-xs text-slate-600">
          <span className="font-mono font-semibold text-slate-700">{ticket.protocol}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={ticket.created_at} title={formatDateTime(ticket.created_at)}>{formatRelative(ticket.created_at)}</time>
          <span className="ml-auto flex items-center gap-1.5">
            {overdue && <OverdueBadge />}
            <PriorityBadge priority={ticket.priority} hideNormal />
          </span>
        </span>
        <span className={cn("mt-1 line-clamp-2 block text-[15px] leading-snug font-semibold break-words", selected ? "text-brand-950" : "text-slate-950")}>{ticket.title}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1 text-[13px] text-slate-600">
          <span className="truncate">{ticket.name} · {displayDepartment(ticket.department)}</span>
          {(ticket.location || ticket.state) && (
            <span className="flex min-w-0 shrink items-center gap-0.5 truncate">
              <MapPin className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{[ticket.location, ticket.state].filter(Boolean).join(" · ")}</span>
            </span>
          )}
        </span>
        <span className="mt-2.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5">
            <StatusBadge status={ticket.status} />
            <span className="truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">{ticket.affected_system || ticket.category}</span>
          </span>
          {ticket.technician ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-700">
              <Avatar name={ticket.technician} className="size-5 text-[9px]" />
              <span className="max-w-24 truncate">{ticket.technician}</span>
            </span>
          ) : (
            <span className="shrink-0 text-xs text-slate-500">Sem responsável</span>
          )}
        </span>
      </button>
    </li>
  );
}
