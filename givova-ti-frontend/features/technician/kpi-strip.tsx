"use client";

import { AlarmClock, CheckCheck, Clock3, Gauge, Hourglass, Inbox, Timer, Wrench } from "lucide-react";
import { Avatar, Skeleton } from "@/components/ui/primitives";
import { Tooltip } from "@/components/ui/overlay";
import type { Dashboard } from "@/lib/api/types";
import { formatDuration, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Kpi {
  id: string;
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: React.ReactNode;
  tone?: "brand" | "danger";
  view?: string;
  tooltip?: string;
}

export function KpiStrip({ dashboard, onSelectView, activeView, v2 }: { dashboard?: Dashboard; onSelectView: (view: string) => void; activeView: string; v2: boolean }) {
  if (!dashboard) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-[92px] rounded-xl" />)}
      </div>
    );
  }
  // null/undefined = no SLA configured (or legacy API): show no overdue information.
  const overdue = dashboard.overdue;
  const metrics = dashboard.metrics;
  const kpis: Kpi[] = [
    ...(v2 ? [{ id: "open", label: "Abertos", value: dashboard.open ?? 0, icon: Inbox, view: "open", sub: dashboard.opened_today !== undefined ? `${dashboard.opened_today} hoje` : undefined } satisfies Kpi] : []),
    {
      id: "new", label: "Novos", value: dashboard.new, icon: Clock3, view: "new", tone: dashboard.new ? "brand" : undefined,
      sub: typeof overdue === "number" ? (overdue > 0 ? <span className="font-semibold text-red-700">{plural(overdue, "atrasado", "atrasados")}</span> : "nenhum atrasado") : "aguardando a TI",
    },
    { id: "active", label: "Em atendimento", value: dashboard.active, icon: Wrench, view: v2 ? undefined : "active" },
    { id: "pending", label: "Aguardando", value: dashboard.pending, icon: Hourglass, view: v2 ? "waiting" : "waiting-user", sub: "colaborador ou fornecedor" },
    { id: "resolved", label: "Resolvidos hoje", value: dashboard.resolved_today, icon: CheckCheck, view: "resolved" },
    ...(metrics
      ? ([
          {
            id: "first", label: "1º atendimento", value: formatDuration(metrics.first_response_avg_minutes), icon: Timer,
            sub: metrics.first_response_count ? `média · ${plural(metrics.first_response_count, "chamado", "chamados")} em ${metrics.window_days} dias` : `sem dados em ${metrics.window_days} dias`,
            tooltip: "Tempo médio entre a abertura e o momento em que um técnico assumiu.",
          },
          {
            id: "resolution", label: "Resolução", value: formatDuration(metrics.resolution_avg_minutes), icon: Gauge,
            sub: metrics.resolution_count ? `média · ${plural(metrics.resolution_count, "chamado", "chamados")} em ${metrics.window_days} dias` : `sem dados em ${metrics.window_days} dias`,
            tooltip: "Tempo médio entre a abertura e a resolução.",
          },
        ] satisfies Kpi[])
      : []),
  ];

  return (
    <section aria-label="Indicadores" className={cn("grid grid-cols-3 gap-2 sm:gap-2.5 md:grid-cols-4", kpis.length > 5 ? "lg:grid-cols-7" : "lg:grid-cols-5")}>
      {kpis.map(kpi => {
        const content = (
          <>
            <span className="flex items-center justify-between gap-2 text-xs font-medium text-slate-600 sm:text-[13px]">
              {kpi.label}
              <kpi.icon className={cn("hidden size-4 shrink-0 sm:block", kpi.tone === "brand" ? "text-brand-600" : "text-slate-400")} aria-hidden="true" />
            </span>
            <span className={cn("mt-1 block text-xl font-bold tracking-tight tabular-nums sm:mt-1.5 sm:text-2xl", kpi.tone === "brand" ? "text-brand-800" : "text-slate-950")}>{kpi.value}</span>
            {kpi.sub && <span className="mt-0.5 hidden truncate text-xs text-slate-600 sm:block">{kpi.sub}</span>}
          </>
        );
        const base = "block w-full min-w-0 rounded-xl border bg-white px-3 py-2.5 text-left shadow-card transition-[border-color,box-shadow] sm:px-3.5 sm:py-3";
        const card = kpi.view ? (
          <button
            key={kpi.id}
            type="button"
            onClick={() => onSelectView(kpi.view!)}
            aria-pressed={activeView === kpi.view}
            className={cn(base, "hover:border-brand-300 hover:shadow-raised", activeView === kpi.view ? "border-brand-600 ring-1 ring-brand-600" : "border-slate-200")}
          >
            {content}
          </button>
        ) : (
          <div key={kpi.id} className={cn(base, "border-slate-200")}>{content}</div>
        );
        return kpi.tooltip ? <Tooltip key={kpi.id} content={kpi.tooltip}>{card}</Tooltip> : card;
      })}
    </section>
  );
}

export function TeamLoad({ dashboard }: { dashboard?: Dashboard }) {
  if (!dashboard?.workload) return null;
  const max = Math.max(1, ...dashboard.workload.map(item => item.active));
  return (
    <section aria-label="Carga da equipe" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <span className="text-xs font-semibold tracking-wide text-slate-600 uppercase">Carga da equipe</span>
      {dashboard.workload.length === 0 && <span className="text-slate-600">Nenhum chamado em andamento.</span>}
      {dashboard.workload.map(item => (
        <span key={item.technician_id} className="flex items-center gap-2">
          <Avatar name={item.name} className="size-6 text-[10px]" />
          <span className="font-medium text-slate-800">{item.name}</span>
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
            <span className="block h-full rounded-full bg-violet-500" style={{ width: `${(item.active / max) * 100}%` }} />
          </span>
          <span className="text-slate-600 tabular-nums">{plural(item.active, "ativo", "ativos")}</span>
        </span>
      ))}
      {(dashboard.overdue ?? 0) > 0 && (
        <span className="flex items-center gap-1.5 font-medium text-red-700">
          <AlarmClock className="size-4" aria-hidden="true" /> {plural(dashboard.overdue!, "chamado passou", "chamados passaram")} do tempo de 1º atendimento
        </span>
      )}
    </section>
  );
}
