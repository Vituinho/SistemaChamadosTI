"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, CheckCircle2, CircleDashed, ClipboardCopy, Clock3, Hourglass, MapPin, MessageSquareText, PartyPopper, Plus, RefreshCw, Share2, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, Avatar, Card, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/client";
import type { Ticket } from "@/lib/api/types";
import { REFRESH } from "@/lib/env";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useEventStream, usePageVisible } from "@/lib/live-updates";
import { isAccessKey, isProtocol, trackingUrl } from "@/lib/tracking-link";
import { cn } from "@/lib/utils";
import { AttachmentPreview } from "@/features/tickets/attachment-preview";
import { StatusBadge } from "@/features/tickets/badges";
import { displayDepartment, employeeHeadline, isNote } from "@/features/tickets/meta";
import { Timeline } from "@/features/tickets/timeline";
import { JUST_CREATED_KEY } from "@/features/new-ticket/new-ticket-form";
import { PasteTrackingLink, RecentTickets } from "./recent-tickets";
import { hasDeviceConsent } from "@/lib/device-memory";
import { saveTicket } from "./saved-tickets";

function useAccessKey(): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setKey(window.location.hash.replace(/^#/, ""));
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return key;
}

export function TrackingView() {
  const params = useSearchParams();
  const protocol = params.get("protocol") ?? "";
  const accessKey = useAccessKey();
  if (accessKey === null) return <TrackingSkeleton />;
  if (!isProtocol(protocol) || !isAccessKey(accessKey)) return <FindTicket hadProtocol={Boolean(protocol)} />;
  return <TicketTracking key={`${protocol}#${accessKey}`} protocol={protocol} accessKey={accessKey} />;
}

function FindTicket({ hadProtocol }: { hadProtocol: boolean }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <p className="text-sm font-semibold text-brand-700">Acompanhamento</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">Acompanhar um chamado</h1>
        <p className="mt-2 text-slate-600">Por segurança, cada chamado só pode ser aberto com o link completo recebido ao registrá-lo.</p>
      </header>
      {hadProtocol && (
        <Alert tone="warning" title="Link incompleto">
          Falta a chave de acesso (a parte depois de <code className="font-mono">#</code>). Abra o link exatamente como foi copiado.
        </Alert>
      )}
      <Card className="p-5 sm:p-6">
        <PasteTrackingLink autoFocus={!hadProtocol} />
      </Card>
      <RecentTickets limit={10} />
      <p className="text-sm text-slate-600">
        Perdeu o link? A TI pode gerar um novo para você. Ou{" "}
        <Link href="/chamado/" className="font-semibold text-brand-700 underline underline-offset-2">abra um novo chamado</Link>.
      </p>
    </div>
  );
}

function TicketTracking({ protocol, accessKey }: { protocol: string; accessKey: string }) {
  const client = useQueryClient();
  const visible = usePageVisible();
  const queryKey = ["tracking", protocol, accessKey];
  const headers = { "X-Ticket-Key": accessKey };
  const [justCreated, setJustCreated] = useState(false);
  const [remembered, setRemembered] = useState(false);

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.tracking(protocol, accessKey, signal),
    refetchInterval: visible ? REFRESH.tracking : false,
    retry: (count, error) => !isApiError(error, 404) && count < 2,
  });
  const refresh = useCallback(() => void client.invalidateQueries({ queryKey: ["tracking", protocol] }), [client, protocol]);
  const live = useEventStream(`/tracking/${encodeURIComponent(protocol)}/events`, refresh, headers);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(JUST_CREATED_KEY) === protocol) {
        sessionStorage.removeItem(JUST_CREATED_KEY);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setJustCreated(true);
        setRemembered(hasDeviceConsent());
      }
    } catch {
      // sessionStorage unavailable
    }
  }, [protocol]);

  const ticket = query.data;
  useEffect(() => {
    // Refreshes the saved entry only when the employee opted in on this computer (no-op otherwise).
    if (ticket) saveTicket({ protocol: ticket.protocol, accessKey, title: ticket.title, createdAt: ticket.created_at });
  }, [ticket, accessKey]);

  if (query.isPending) return <TrackingSkeleton />;
  if (query.isError && !ticket) {
    const notFound = isApiError(query.error, 404);
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-12 sm:px-6">
        <Alert
          tone={notFound ? "warning" : "error"}
          title={notFound ? "Chamado não encontrado" : "Não foi possível carregar"}
          action={!notFound && <Button variant="outline" onClick={() => query.refetch()}><RefreshCw /> Tentar novamente</Button>}
        >
          {notFound ? "Este link não é válido ou foi substituído por um novo link enviado pela TI." : errorMessage(query.error)}
        </Alert>
        <Card className="p-5"><PasteTrackingLink /></Card>
      </div>
    );
  }
  if (!ticket) return null;

  const headline = employeeHeadline(ticket.status, ticket.technician);
  const notes = ticket.history.filter(isNote);

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-8 sm:px-6 sm:py-12">
      {justCreated && (
        <div role="status" className="animate-slide-up flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <PartyPopper className="mt-0.5 size-5 shrink-0 text-emerald-700" aria-hidden="true" />
          <div>
            <p className="font-semibold">Chamado enviado! Seu protocolo é {ticket.protocol}.</p>
            <p className="text-sm">
              {remembered
                ? "A TI já foi avisada. Este chamado ficou salvo neste computador; você também pode copiar o link abaixo."
                : "A TI já foi avisada. Para acompanhar depois, copie o link abaixo — nada foi salvo neste computador."}
            </p>
          </div>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5 sm:p-7" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-700">{ticket.protocol}</span>
            <StatusBadge status={ticket.status} />
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">{headline.title}</h1>
          <p className="mt-2 max-w-2xl text-base leading-7 text-slate-600">{headline.text}</p>
          {ticket.status !== "CANCELADO" && <Progress ticket={ticket} />}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 px-5 py-3 text-xs text-slate-600 sm:px-7">
          <span className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", query.isError ? "bg-amber-500" : "bg-emerald-500", live && "animate-pulse")} aria-hidden="true" />
            {query.isError ? "Sem conexão no momento — tentaremos de novo." : `Atualizado às ${new Date(query.dataUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · atualiza sozinho`}
          </span>
          <Button variant="ghost" size="sm" onClick={() => query.refetch()} loading={query.isFetching}>
            {!query.isFetching && <RefreshCw />} Atualizar
          </Button>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {ticket.technician && ticket.status !== "NOVO" && (
            <Card className="flex items-center gap-4 p-5">
              <Avatar name={ticket.technician} className="size-11 bg-brand-700 text-sm" />
              <div className="min-w-0">
                <p className="text-sm text-slate-600">Técnico responsável</p>
                <p className="font-semibold text-slate-950">{ticket.technician}</p>
                {ticket.assigned_at && <p className="text-xs text-slate-600">Assumiu {formatRelative(ticket.assigned_at)}</p>}
              </div>
            </Card>
          )}

          {ticket.solution && (
            <Card className="border-emerald-200 bg-emerald-50/60 p-5 sm:p-6">
              <h2 className="flex items-center gap-2 font-semibold text-emerald-900"><CheckCircle2 className="size-5" aria-hidden="true" /> O que foi feito</h2>
              <p className="mt-2 leading-7 whitespace-pre-wrap break-words text-slate-900">{ticket.solution}</p>
              {ticket.resolved_at && <p className="mt-3 text-xs text-emerald-900/80">Resolvido em {formatDateTime(ticket.resolved_at)}</p>}
            </Card>
          )}

          {notes.length > 0 && (
            <Card className="p-5 sm:p-6">
              <h2 className="flex items-center gap-2 font-semibold text-slate-950"><MessageSquareText className="size-5 text-brand-700" aria-hidden="true" /> Mensagens da TI</h2>
              <ul className="mt-4 space-y-3">
                {[...notes].reverse().map(note => (
                  <li key={note.id} className="rounded-xl rounded-tl-sm border border-brand-200 bg-brand-50 px-4 py-3">
                    <p className="text-xs font-semibold text-brand-900">{note.author ?? "TI"} · {formatRelative(note.created_at)}</p>
                    <p className="mt-1 leading-6 whitespace-pre-wrap break-words text-slate-900">{note.message}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-5 sm:p-6">
            <h2 className="font-semibold text-slate-950">Seu pedido</h2>
            <p className="mt-3 text-lg font-semibold break-words text-slate-900">{ticket.title}</p>
            {ticket.description && <p className="mt-2 leading-7 whitespace-pre-wrap break-words text-slate-700">{ticket.description}</p>}
            <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Info label="Tipo" value={ticket.affected_system ? `${ticket.category} · ${ticket.affected_system}` : ticket.category} />
              <Info label="Aberto em" value={formatDateTime(ticket.created_at)} />
              <Info label="Solicitante" value={`${ticket.name} · ${displayDepartment(ticket.department)}`} />
              <Info label="Local" value={[ticket.location, ticket.state].filter(Boolean).join(" · ") || "—"} icon={<MapPin className="size-3.5" aria-hidden="true" />} />
            </dl>
            {ticket.has_attachment && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-slate-700">Imagem enviada</p>
                <AttachmentPreview path={`/tracking/${encodeURIComponent(ticket.protocol)}/attachment`} headers={headers} />
              </div>
            )}
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="font-semibold text-slate-950">Histórico</h2>
            <div className="mt-4"><Timeline entries={ticket.history} newestFirst /></div>
          </Card>
        </div>

        <aside className="space-y-5">
          <ShareCard protocol={ticket.protocol} accessKey={accessKey} />
          <Card className="space-y-3 p-5">
            <h2 className="text-sm font-semibold text-slate-950">Precisa de outra coisa?</h2>
            <Button asChild variant="outline" className="w-full">
              <Link href="/chamado/"><Plus /> Abrir outro chamado</Link>
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-600">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-1 font-medium break-words text-slate-900">{icon}{value}</dd>
    </div>
  );
}

const STEPS = [
  { label: "Recebido", icon: Check },
  { label: "Em atendimento", icon: Wrench },
  { label: "Resolvido", icon: CheckCircle2 },
];

function Progress({ ticket }: { ticket: Ticket }) {
  const current = ticket.status === "NOVO" ? 0 : ticket.status === "RESOLVIDO" ? 2 : 1;
  const waiting = ticket.status === "AGUARDANDO_USUARIO" || ticket.status === "AGUARDANDO_TERCEIRO";
  return (
    <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Etapas do atendimento">
      {STEPS.map((step, index) => {
        const done = index < current || (index === current && ticket.status === "RESOLVIDO");
        const active = index === current && !done;
        const Icon = active ? (waiting ? Hourglass : index === 0 ? Clock3 : step.icon) : done ? step.icon : CircleDashed;
        return (
          <li key={step.label} aria-current={active ? "step" : undefined} className="flex flex-col gap-2">
            <span className={cn("h-1.5 rounded-full", done ? "bg-emerald-500" : active ? (waiting ? "bg-amber-500" : "bg-brand-600") : "bg-slate-200")} />
            <span className={cn("flex items-center gap-1.5 text-xs font-semibold sm:text-sm", done ? "text-emerald-800" : active ? "text-slate-950" : "text-slate-500")}>
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {step.label}
              <span className="sr-only">{done ? " (concluído)" : active ? " (etapa atual)" : " (próxima etapa)"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ShareCard({ protocol, accessKey }: { protocol: string; accessKey: string }) {
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanShare(typeof navigator.share === "function");
  }, []);
  const url = () => trackingUrl(window.location.origin, protocol, accessKey);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      toast.success("Link copiado", { description: "Guarde-o para acompanhar o chamado em outro aparelho." });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar", { description: "Copie o endereço completo da barra do navegador." });
    }
  }
  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-sm font-semibold text-slate-950">Link de acompanhamento</h2>
      <p className="text-sm leading-6 text-slate-600">Este link é a chave do seu chamado. Não compartilhe com outras pessoas.</p>
      <Button onClick={copy} variant="secondary" className="w-full">
        {copied ? <Check /> : <ClipboardCopy />} {copied ? "Copiado!" : "Copiar link"}
      </Button>
      {canShare && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigator.share({ title: `Chamado ${protocol} — Givova TI`, url: url() }).catch(() => undefined)}
        >
          <Share2 /> Enviar para meu celular
        </Button>
      )}
    </Card>
  );
}

function TrackingSkeleton() {
  return (
    <div role="status" aria-label="Carregando chamado" className="mx-auto max-w-4xl space-y-5 px-4 py-12 sm:px-6">
      <Card className="space-y-4 p-7">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <div className="grid grid-cols-3 gap-2 pt-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-8" />)}</div>
      </Card>
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

