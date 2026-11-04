"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DropdownMenu } from "radix-ui";
import {
  Ban, Check, CheckCircle2, ClipboardCopy, Hand, Hourglass, Link2, MapPin, MessageSquarePlus, MoreHorizontal, RefreshCw, Send, UserRound, Wrench, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/overlay";
import { Alert, Avatar, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/client";
import type { Catalog, Priority, Status, Ticket } from "@/lib/api/types";
import { formatDateTime, formatDuration, formatRelative, minutesBetween } from "@/lib/format";
import { trackingUrl } from "@/lib/tracking-link";
import { cn } from "@/lib/utils";
import { AttachmentPreview } from "@/features/tickets/attachment-preview";
import { OverdueBadge, PriorityBadge, StatusBadge } from "@/features/tickets/badges";
import { displayDepartment, isClosed, isOverdue, PRIORITY_META, STATUS_META } from "@/features/tickets/meta";
import { Timeline } from "@/features/tickets/timeline";

const WORK_STATUSES: { status: Status; label: string; icon: React.ElementType }[] = [
  { status: "EM_ATENDIMENTO", label: "Em atendimento", icon: Wrench },
  { status: "AGUARDANDO_USUARIO", label: "Aguardando colaborador", icon: UserRound },
  { status: "AGUARDANDO_TERCEIRO", label: "Aguardando fornecedor", icon: Hourglass },
];

const QUICK_REPLIES = [
  "Estou a caminho.",
  "Pode reiniciar o computador e me avisar se o problema continua?",
  "Preciso que você esteja no computador para eu acessar remotamente.",
  "Abri um chamado com o fornecedor e aviso assim que tiver retorno.",
];

const SOLUTION_TEMPLATES = [
  "Equipamento reiniciado e funcionamento testado com o colaborador.",
  "Senha redefinida e acesso testado.",
  "Cabo/conexão ajustado e acesso à rede restabelecido.",
  "Configuração corrigida e problema validado com o colaborador.",
];

type Confirm = null | "assign" | "cancel" | "resolve" | "link";

export function TicketPanel({
  ticket, loading, error, onRetry, onClose, catalog, sla, features,
}: {
  ticket?: Ticket;
  loading: boolean;
  error?: unknown;
  onRetry: () => void;
  onClose?: () => void;
  catalog?: Catalog;
  sla?: Record<Priority, number> | null;
  features: { notes: boolean; trackingLink: boolean };
}) {
  const client = useQueryClient();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [solution, setSolution] = useState("");
  const [note, setNote] = useState("");
  const [composer, setComposer] = useState(false);
  const [newLink, setNewLink] = useState("");

  const mutation = useMutation({
    mutationFn: async (action: { type: "assign" } | { type: "update"; status?: Status; priority?: Priority } | { type: "resolve"; solution: string } | { type: "note"; message: string }) => {
      if (!ticket) throw new Error("Chamado não carregado");
      switch (action.type) {
        case "assign": return api.assign(ticket.id);
        case "update": return api.update(ticket.id, { status: action.status, priority: action.priority });
        case "resolve": return api.resolve(ticket.id, action.solution);
        case "note": return api.addNote(ticket.id, action.message);
      }
    },
    onSuccess: (updated, action) => {
      client.setQueryData(["ticket", updated.id], updated);
      void client.invalidateQueries({ queryKey: ["tickets"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      setConfirm(null);
      if (action.type === "assign") toast.success("Chamado assumido", { description: "O colaborador agora vê: “A TI está indo até você!”." });
      else if (action.type === "resolve") {
        setSolution("");
        toast.success("Chamado resolvido", { description: "A solução já aparece para o colaborador." });
      } else if (action.type === "note") {
        setNote("");
        setComposer(false);
        toast.success("Mensagem enviada ao colaborador");
      } else if (action.status === "CANCELADO") toast.success("Chamado cancelado");
      else toast.success("Chamado atualizado");
    },
    onError: error => {
      if (isApiError(error, 409)) {
        void client.invalidateQueries({ queryKey: ["ticket", ticket?.id] });
        void client.invalidateQueries({ queryKey: ["tickets"] });
      }
      setConfirm(null);
      toast.error("Não foi possível concluir", { description: errorMessage(error) });
    },
  });

  const linkMutation = useMutation({
    mutationFn: () => api.renewTrackingLink(ticket!.id),
    onSuccess: result => {
      setConfirm(null);
      setNewLink(trackingUrl(window.location.origin, result.protocol, result.access_key));
      void client.invalidateQueries({ queryKey: ["ticket", ticket?.id] });
    },
    onError: error => toast.error("Não foi possível gerar o link", { description: errorMessage(error) }),
  });

  if (loading && !ticket) return <PanelSkeleton />;
  if (!ticket) {
    return (
      <div className="p-6">
        <Alert tone="error" title="Não foi possível abrir o chamado" action={<Button variant="outline" onClick={onRetry}><RefreshCw /> Tentar novamente</Button>}>
          {errorMessage(error)}
        </Alert>
      </div>
    );
  }

  const closed = isClosed(ticket.status);
  const busy = mutation.isPending;
  const firstResponse = minutesBetween(ticket.created_at, ticket.assigned_at);
  const totalTime = minutesBetween(ticket.created_at, ticket.resolved_at);
  const priorities = catalog?.priorities ?? (["BAIXA", "NORMAL", "ALTA", "URGENTE"] as Priority[]);

  return (
    <article aria-labelledby="ticket-title" className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <header className="border-b border-slate-100 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-700">{ticket.protocol}</span>
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            {isOverdue(ticket, sla) && <OverdueBadge />}
          </div>
          <div className="flex items-center gap-1">
            {(loading || mutation.isPending) && <span className="text-xs text-slate-500" role="status">Atualizando…</span>}
            {!closed && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Mais ações"><MoreHorizontal /></Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-raised data-[state=open]:animate-scale-in">
                    {features.trackingLink && (
                      <DropdownMenu.Item onSelect={() => setConfirm("link")} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-800 outline-none data-[highlighted]:bg-slate-100">
                        <Link2 className="size-4" aria-hidden="true" /> Gerar novo link de acompanhamento
                      </DropdownMenu.Item>
                    )}
                    <DropdownMenu.Item onSelect={() => setConfirm("cancel")} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-red-700 outline-none data-[highlighted]:bg-red-50">
                      <Ban className="size-4" aria-hidden="true" /> Cancelar chamado
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}
            {onClose && <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar detalhes"><X /></Button>}
          </div>
        </div>
        <h2 id="ticket-title" className="mt-3 text-xl leading-snug font-bold tracking-tight break-words text-slate-950 sm:text-2xl">{ticket.title}</h2>
        <p className="mt-1.5 text-sm text-slate-600">
          Aberto <time dateTime={ticket.created_at} title={formatDateTime(ticket.created_at)}>{formatRelative(ticket.created_at)}</time> por{" "}
          <span className="font-medium text-slate-800">{ticket.name}</span> · {displayDepartment(ticket.department)}
        </p>

        {/* Primary workflow */}
        {!closed && (
          <div className="mt-5 space-y-3">
            {ticket.status === "NOVO" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="lg" onClick={() => setConfirm("assign")} disabled={busy}>
                  <Hand /> Assumir chamado
                </Button>
                <p className="text-xs text-slate-600">O colaborador verá que a TI está indo até ele.</p>
              </div>
            ) : (
              <>
                <div role="group" aria-label="Situação do atendimento" className="flex flex-wrap gap-1.5">
                  {WORK_STATUSES.map(item => {
                    const active = ticket.status === item.status;
                    return (
                      <button
                        key={item.status}
                        type="button"
                        aria-pressed={active}
                        disabled={busy || active}
                        onClick={() => mutation.mutate({ type: "update", status: item.status })}
                        className={cn(
                          "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors disabled:cursor-default",
                          active ? cn("border-transparent ring-1 ring-inset", STATUS_META[item.status].tone) : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60",
                        )}
                      >
                        <item.icon className="size-4" aria-hidden="true" /> {item.label}
                        {active && <Check className="size-3.5" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="success" onClick={() => setConfirm("resolve")} disabled={busy}>
                    <CheckCircle2 /> Resolver
                  </Button>
                  {features.notes && (
                    <Button variant="outline" onClick={() => setComposer(value => !value)} aria-expanded={composer} aria-controls="note-composer" disabled={busy}>
                      <MessageSquarePlus /> Mensagem ao colaborador
                    </Button>
                  )}
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <Label htmlFor="priority" className="text-[13px] font-medium text-slate-600">Prioridade</Label>
              <Select
                id="priority"
                value={ticket.priority}
                disabled={busy}
                onChange={event => mutation.mutate({ type: "update", priority: event.target.value as Priority })}
                className="h-9 w-40 text-sm"
              >
                {priorities.map(priority => <option key={priority} value={priority}>{PRIORITY_META[priority].label}</option>)}
              </Select>
            </div>
          </div>
        )}
        {closed && (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Atendimento encerrado. O histórico foi preservado e não pode ser alterado.</p>
        )}
      </header>

      {/* Body */}
      {/* Scrollable region: focusable so keyboard users can scroll long histories. */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 focus-visible:outline-offset-[-2px] sm:p-6" tabIndex={0} role="region" aria-label="Conteúdo do chamado">
        {composer && features.notes && !closed && (
          <form
            id="note-composer"
            className="animate-slide-up space-y-2 rounded-xl border border-brand-200 bg-brand-50/50 p-4"
            onSubmit={event => {
              event.preventDefault();
              if (note.trim().length >= 2) mutation.mutate({ type: "note", message: note.trim() });
            }}
          >
            <Label htmlFor="note-text">Mensagem ao colaborador</Label>
            <p className="text-xs text-slate-600">Aparece na página de acompanhamento do chamado.</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REPLIES.map(reply => (
                <button key={reply} type="button" onClick={() => setNote(reply)} className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-brand-400">
                  {reply}
                </button>
              ))}
            </div>
            <Textarea id="note-text" rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setComposer(false)}>Cancelar</Button>
              <Button type="submit" size="sm" loading={busy} disabled={note.trim().length < 2}><Send /> Enviar</Button>
            </div>
          </form>
        )}

        {ticket.solution && (
          <section className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-900"><CheckCircle2 className="size-4" aria-hidden="true" /> Solução aplicada</h3>
            <p className="mt-1.5 text-sm leading-6 whitespace-pre-wrap break-words text-slate-900">{ticket.solution}</p>
          </section>
        )}

        <section aria-labelledby="problem-heading">
          <h3 id="problem-heading" className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Problema</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{ticket.category}</span>
            {ticket.affected_system && <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{ticket.affected_system}</span>}
          </div>
          <p className={cn("mt-3 text-sm leading-6 whitespace-pre-wrap break-words", ticket.description ? "text-slate-800" : "text-slate-500 italic")}>
            {ticket.description || "Sem descrição adicional."}
          </p>
          {ticket.has_attachment && (
            <div className="mt-3"><AttachmentPreview path={`/tickets/${ticket.id}/attachment`} /></div>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <section aria-labelledby="requester-heading" className="rounded-xl border border-slate-200 p-4">
            <h3 id="requester-heading" className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Solicitante</h3>
            <p className="mt-2 font-semibold text-slate-950">{ticket.name}</p>
            <p className="text-sm text-slate-600">{displayDepartment(ticket.department)}</p>
            <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-800">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
              <span>{[ticket.location || "Local não informado", ticket.state].filter(Boolean).join(" · ")}</span>
            </p>
          </section>
          <section aria-labelledby="service-heading" className="rounded-xl border border-slate-200 p-4">
            <h3 id="service-heading" className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Atendimento</h3>
            {ticket.technician ? (
              <p className="mt-2 flex items-center gap-2 font-semibold text-slate-950"><Avatar name={ticket.technician} className="size-6 text-[10px]" /> {ticket.technician}</p>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Ninguém assumiu ainda.</p>
            )}
            <dl className="mt-2 space-y-1 text-sm">
              <Row label="1º atendimento" value={firstResponse !== null ? `${formatDuration(firstResponse)} após abertura` : "—"} />
              <Row label="Resolvido" value={ticket.resolved_at ? `${formatDateTime(ticket.resolved_at)} (${formatDuration(totalTime)})` : "—"} />
            </dl>
          </section>
        </div>

        <section aria-labelledby="history-heading">
          <h3 id="history-heading" className="mb-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Histórico</h3>
          <Timeline entries={ticket.history} newestFirst />
        </section>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        open={confirm === "assign"}
        onOpenChange={open => !open && setConfirm(null)}
        title={`Assumir ${ticket.protocol}?`}
        description={<>Você ficará responsável e <strong>{ticket.name}</strong> verá que a TI está a caminho de <strong>{ticket.location || "seu local"}</strong>.</>}
        confirmLabel="Assumir chamado"
        loading={busy}
        onConfirm={() => mutation.mutate({ type: "assign" })}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={open => !open && setConfirm(null)}
        title={`Cancelar ${ticket.protocol}?`}
        description="Use apenas para pedidos duplicados ou abertos por engano. Chamados cancelados não podem ser reabertos."
        confirmLabel="Cancelar chamado"
        tone="danger"
        loading={busy}
        onConfirm={() => mutation.mutate({ type: "update", status: "CANCELADO" })}
      />
      <ConfirmDialog
        open={confirm === "link"}
        onOpenChange={open => !open && setConfirm(null)}
        title="Gerar novo link de acompanhamento?"
        description="Use quando o colaborador perdeu o link. O link anterior deixará de funcionar imediatamente."
        confirmLabel="Gerar novo link"
        loading={linkMutation.isPending}
        onConfirm={() => linkMutation.mutate()}
      />
      <Dialog open={confirm === "resolve"} onOpenChange={open => !open && setConfirm(null)}>
        <DialogContent title={`Resolver ${ticket.protocol}`} description="Descreva o que foi feito. O colaborador verá esta solução.">
          <form
            className="space-y-3"
            onSubmit={event => {
              event.preventDefault();
              if (solution.trim().length >= 3) mutation.mutate({ type: "resolve", solution: solution.trim() });
            }}
          >
            <div className="flex flex-wrap gap-1.5">
              {SOLUTION_TEMPLATES.map(template => (
                <button key={template} type="button" onClick={() => setSolution(template)} className="rounded-full border border-slate-300 px-2.5 py-1 text-left text-xs text-slate-700 hover:border-brand-400">
                  {template}
                </button>
              ))}
            </div>
            <Label htmlFor="solution" className="sr-only">Solução aplicada</Label>
            <Textarea id="solution" rows={5} maxLength={3000} value={solution} onChange={event => setSolution(event.target.value)} placeholder="Ex.: troquei o cabo de rede e testei o acesso ao sistema." autoFocus />
            <p className="text-xs text-slate-500">{solution.trim().length < 3 ? "Mínimo de 3 caracteres." : `${solution.length}/3000`}</p>
            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setConfirm(null)}>Voltar</Button>
              <Button type="submit" variant="success" loading={busy} disabled={solution.trim().length < 3}><CheckCircle2 /> Confirmar resolução</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(newLink)} onOpenChange={open => !open && setNewLink("")}>
        <DialogContent title="Novo link gerado" description="Envie este link ao colaborador. O link anterior não funciona mais.">
          <div className="space-y-3">
            <p className="rounded-lg bg-slate-50 p-3 font-mono text-xs break-all text-slate-800 ring-1 ring-slate-200">{newLink}</p>
            <Button
              className="w-full"
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(newLink).then(() => toast.success("Link copiado"), () => toast.error("Copie o link manualmente."))}
            >
              <ClipboardCopy /> Copiar link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div role="status" aria-label="Carregando chamado" className="space-y-4 p-6">
      <Skeleton className="h-5 w-48" />
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
    </div>
  );
}
