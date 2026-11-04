"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DropdownMenu } from "radix-ui";
import { ArrowRight, BellRing, ChevronDown, ExternalLink, LogOut, MousePointerClick, X } from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Dialog, SheetContent } from "@/components/ui/overlay";
import { Avatar, EmptyState } from "@/components/ui/primitives";
import { api, hasFeature } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import type { Technician, TicketSummary } from "@/lib/api/types";
import { POLLING_ONLY } from "@/lib/env";
import { readJson, writeJson } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { displayDepartment } from "@/features/tickets/meta";
import { KpiStrip, TeamLoad } from "./kpi-strip";
import { NotificationSettings } from "./notification-settings";
import { NotificationSound, restorePush, type PushState } from "./notifications";
import { QueuePanel } from "./queue-panel";
import { buildQuery, DEFAULT_FILTERS, queueViews, type QueueFilters } from "./queue-views";
import { TicketPanel } from "./ticket-panel";
import { ME_KEY, useMediaQuery, useWorkspaceData } from "./use-workspace";

const PREFS_KEY = "givova.ti.prefs.v1";
type Prefs = { view?: string; sort?: QueueFilters["sort"]; sound?: boolean };

function readSelectedFromUrl(): number | null {
  const id = Number(new URLSearchParams(window.location.search).get("ticket"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function Workspace({ technician }: { technician: Technician }) {
  const client = useQueryClient();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [filters, setFiltersState] = useState<QueueFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [alert, setAlert] = useState<{ ticket: TicketSummary; count: number } | null>(null);
  const [push, setPush] = useState<PushState | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const sound = useRef<NotificationSound | null>(null);
  const desktopNotification = useRef<Notification | null>(null);

  // Restore preferences, deep link (?ticket=ID from push notifications) and push state.
  useEffect(() => {
    const prefs = readJson<Prefs>(PREFS_KEY, {});
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFiltersState(current => ({ ...current, view: prefs.view ?? "", sort: prefs.sort ?? "oldest" }));
    setSelectedId(readSelectedFromUrl());
    if (prefs.sound) setSoundBlocked(true);
    restorePush().then(setPush, () => setPush("off"));
    return () => {
      sound.current?.dispose();
      desktopNotification.current?.close();
    };
  }, []);

  const setFilters = useCallback((update: Partial<QueueFilters>) => {
    setFiltersState(current => {
      const next = { ...current, ...update };
      if (update.view !== undefined || update.sort !== undefined) {
        writeJson(PREFS_KEY, { ...readJson<Prefs>(PREFS_KEY, {}), view: next.view, sort: next.sort });
      }
      return next;
    });
  }, []);

  const select = useCallback((id: number | null) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("ticket", String(id));
    else url.searchParams.delete("ticket");
    window.history.replaceState(null, "", url);
  }, []);

  const onNewTicket = useCallback((ticket: TicketSummary, count: number) => {
    setAlert({ ticket, count });
    sound.current?.play();
    // Fallback OS notification when Web Push is not active and the tab is in background.
    if (push !== "on" && document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
      try {
        desktopNotification.current?.close();
        const notification = new Notification(`Novo chamado — ${displayDepartment(ticket.department)}`, { body: `${ticket.name}: ${ticket.title}`, tag: ticket.protocol, icon: "/icons/icon-192.png" });
        notification.onclick = () => {
          window.focus();
          select(ticket.id);
          notification.close();
        };
        desktopNotification.current = notification;
      } catch {
        // Some browsers require a service worker for notifications; the in-app alert remains.
      }
    }
  }, [push, select]);

  // Catalog first (it advertises the API features), then the queue query.
  const catalogQuery = useQuery({ queryKey: ["catalog"], queryFn: ({ signal }) => api.catalog(signal), staleTime: Infinity });
  const catalog = catalogQuery.data;
  const views = useMemo(() => queueViews(catalog), [catalog]);
  const effectiveFilters = useMemo(
    () => (views.some(v => v.id === filters.view) ? filters : { ...filters, view: views[0].id }),
    [filters, views],
  );
  const query = useMemo(() => (catalog ? buildQuery(effectiveFilters, views, catalog) : null), [catalog, effectiveFilters, views]);
  const { queue, detail, dashboard, live } = useWorkspaceData({ query, selectedId, onNewTicket, catalog });

  const logout = useMutation({
    mutationFn: api.logout,
    onSettled: () => {
      client.setQueryData(ME_KEY, null);
      client.removeQueries({ predicate: q => q.queryKey[0] !== "auth" && q.queryKey[0] !== "catalog" });
    },
  });

  async function toggleSound(enabled: boolean) {
    writeJson(PREFS_KEY, { ...readJson<Prefs>(PREFS_KEY, {}), sound: enabled });
    setSoundBlocked(false);
    if (!enabled) {
      sound.current?.dispose();
      sound.current = null;
      setSoundOn(false);
      return;
    }
    try {
      sound.current ??= new NotificationSound();
      await sound.current.enable();
      sound.current.play();
      setSoundOn(true);
    } catch (error) {
      setSoundOn(false);
      toast.error("Som indisponível", { description: errorMessage(error) });
    }
  }

  const ticket = detail.data;
  const sla = dashboard.data?.sla_first_response_minutes ?? catalog?.sla_first_response_minutes;
  const panelFeatures = { notes: hasFeature(catalog, "notes"), trackingLink: hasFeature(catalog, "tracking_link") };
  const panel = selectedId !== null && (
    <TicketPanel
      key={selectedId}
      ticket={ticket?.id === selectedId ? ticket : undefined}
      loading={detail.isFetching}
      error={detail.error}
      onRetry={() => detail.refetch()}
      onClose={() => select(null)}
      catalog={catalog}
      sla={sla}
      features={panelFeatures}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <a href="#fila" className="sr-only rounded-md bg-white px-3 py-2 font-semibold focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50">Pular para a fila</a>
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="rounded-lg" aria-label="Givova TI — site dos colaboradores"><Logo subtitle="Painel da TI" /></Link>
          <span className={cn("ml-2 hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex", dashboard.isError ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800")} role="status">
            <span className={cn("size-1.5 rounded-full", dashboard.isError ? "bg-amber-500" : "bg-emerald-500", live && "animate-pulse")} aria-hidden="true" />
            {dashboard.isError ? "Reconectando…" : live ? "Ao vivo" : POLLING_ONLY ? "Atualiza a cada 15 s" : "Atualização automática"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <NotificationSettings
              push={push}
              setPush={setPush}
              sound={soundOn}
              onToggleSound={value => void toggleSound(value)}
              onTestSound={() => sound.current?.play()}
            />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="ghost" size="sm" className="h-9 gap-2 pl-1.5" aria-label={`Conta de ${technician.name}`}>
                  <Avatar name={technician.name} className="size-7 bg-brand-700 text-[11px]" />
                  <span className="hidden max-w-36 truncate md:inline">{technician.name}</span>
                  <ChevronDown className="text-slate-500" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-raised data-[state=open]:animate-scale-in">
                  <div className="px-2.5 py-2">
                    <p className="text-sm font-semibold text-slate-950">{technician.name}</p>
                    <p className="text-xs text-slate-600">Equipe de TI</p>
                  </div>
                  <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />
                  <DropdownMenu.Item asChild className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-800 outline-none data-[highlighted]:bg-slate-100">
                    <a href="/chamado/" target="_blank" rel="noopener"><ExternalLink className="size-4" aria-hidden="true" /> Abrir chamado em nome de alguém</a>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => logout.mutate()} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-800 outline-none data-[highlighted]:bg-slate-100">
                    <LogOut className="size-4" aria-hidden="true" /> Sair
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
      </header>

      {soundBlocked && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm text-amber-950 sm:px-6">
            <span>O navegador pausou o som de alerta ao recarregar a página.</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void toggleSound(true)}><BellRing /> Reativar som</Button>
              <Button size="sm" variant="ghost" onClick={() => setSoundBlocked(false)} aria-label="Dispensar aviso"><X /></Button>
            </div>
          </div>
        </div>
      )}

      <main id="fila" className="mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <h1 className="sr-only">Painel da TI — fila de chamados</h1>
        <KpiStrip dashboard={dashboard.data} onSelectView={view => setFilters({ view, offset: 0 })} activeView={effectiveFilters.view} v2={hasFeature(catalog, "metrics")} />
        <TeamLoad dashboard={dashboard.data} />
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(380px,460px)_1fr]">
          <QueuePanel
            filters={effectiveFilters}
            setFilters={setFilters}
            views={views}
            catalog={catalog}
            dashboard={dashboard.data}
            page={queue.data}
            loading={!queue.data && (queue.isPending || catalogQuery.isPending)}
            fetching={queue.isFetching}
            error={queue.isError && !queue.data ? errorMessage(queue.error) : undefined}
            onRetry={() => queue.refetch()}
            selectedId={selectedId}
            onSelect={select}
            sortable={hasFeature(catalog, "sort")}
          />
          {isDesktop && (
            <section aria-label="Detalhes do chamado" className="hidden min-h-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card lg:block">
              {panel || (
                <EmptyState icon={MousePointerClick} title="Selecione um chamado" className="h-full justify-center">
                  Escolha um chamado na fila para ver detalhes, assumir e registrar a solução. Use as setas ↑ ↓ para navegar.
                </EmptyState>
              )}
            </section>
          )}
        </div>
      </main>

      {!isDesktop && (
        <Dialog open={selectedId !== null} onOpenChange={open => !open && select(null)}>
          <SheetContent title="Detalhes do chamado">{panel}</SheetContent>
        </Dialog>
      )}

      {alert && (
        <aside
          aria-label="Novo chamado"
          className="fixed right-4 bottom-4 left-4 z-40 mx-auto max-w-sm animate-slide-up rounded-2xl border border-brand-200 bg-white p-4 shadow-raised sm:right-6 sm:left-auto"
        >
          <div role="alert" aria-atomic="true">
            <div className="flex items-start justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-bold text-brand-800">
                <span className="relative flex size-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-brand-500 opacity-60" /><span className="relative size-2.5 rounded-full bg-brand-600" /></span>
                {alert.count > 1 ? `${alert.count} novos chamados` : "Novo chamado"}
              </p>
              <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1" onClick={() => setAlert(null)} aria-label="Dispensar aviso de novo chamado"><X /></Button>
            </div>
            <p className="mt-2 line-clamp-2 font-semibold break-words text-slate-950">{alert.ticket.title}</p>
            <p className="mt-0.5 text-sm text-slate-600">{alert.ticket.name} · {displayDepartment(alert.ticket.department)}{alert.ticket.location ? ` · ${alert.ticket.location}` : ""}</p>
            <p className="mt-1 font-mono text-xs text-slate-500">{alert.ticket.protocol} · {alert.ticket.affected_system || alert.ticket.category}</p>
          </div>
          <Button
            className="mt-3 w-full"
            onClick={() => {
              select(alert.ticket.id);
              setAlert(null);
            }}
          >
            Ver chamado <ArrowRight />
          </Button>
        </aside>
      )}
    </div>
  );
}

