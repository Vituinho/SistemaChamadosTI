"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Building2, ClipboardList, History, UserRound, Wrench } from "lucide-react";
import { API, date, labels, type Ticket } from "@/lib/api";

export function Badge({ value }: { value: string }) {
  const tone = value === "NOVO" || value === "URGENTE" ? "bg-orange-100 text-orange-800" : value === "RESOLVIDO" ? "bg-emerald-100 text-emerald-800" : value === "CANCELADO" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-700";
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{labels[value] || value}</span>;
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-800">{value || "Não informado"}</dd></div>;
}

export function TicketDetails({ ticket, accessKey }: { ticket: Ticket; accessKey?: string }) {
  const [image, setImage] = useState("");
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    if (!ticket.has_attachment) return;
    const controller = new AbortController();
    let url = "";
    const path = accessKey ? `/tracking/${ticket.protocol}/attachment` : `/tickets/${ticket.id}/attachment`;
    void fetch(`${API}${path}`, { credentials: "include", headers: accessKey ? { "X-Ticket-Key": accessKey } : {}, signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
      .then(blob => { url = URL.createObjectURL(blob); setImage(url); })
      .catch(() => { if (!controller.signal.aborted) setImageError(true); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [ticket.id, ticket.protocol, ticket.has_attachment, accessKey]);

  return <div className="space-y-7">
    <div><p className="text-sm font-black text-orange-700">#{ticket.protocol}</p><h2 className="mt-2 break-words text-2xl font-black text-slate-950">{ticket.title}</h2><div className="mt-3 flex flex-wrap gap-2"><Badge value={ticket.status} /><Badge value={ticket.priority} /></div></div>
    <section aria-labelledby="ticket-info"><h3 id="ticket-info" className="mb-4 flex items-center gap-2 font-bold"><ClipboardList className="size-5 text-orange-600" /> Chamado</h3><dl className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2"><Info label="Categoria" value={ticket.category} /><Info label="Sistema afetado" value={ticket.affected_system} /><Info label="Prioridade" value={labels[ticket.priority]} /><Info label="Status" value={labels[ticket.status]} /><Info label="Aberto em" value={date(ticket.created_at)} /></dl></section>
    <section aria-labelledby="requester-info"><h3 id="requester-info" className="mb-4 flex items-center gap-2 font-bold"><UserRound className="size-5 text-orange-600" /> Solicitante</h3><dl className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"><Info label="Nome" value={ticket.name} /><Info label="Setor" value={ticket.department} /><Info label="Localização" value={ticket.location} /></dl></section>
    <section aria-labelledby="service-info"><h3 id="service-info" className="mb-4 flex items-center gap-2 font-bold"><Wrench className="size-5 text-orange-600" /> Atendimento</h3><dl className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2"><Info label="Técnico responsável" value={ticket.technician || "Aguardando TI"} /><Info label="Assumido em" value={ticket.assigned_at ? date(ticket.assigned_at) : "Ainda não assumido"} /><Info label="Resolvido em" value={ticket.resolved_at ? date(ticket.resolved_at) : "Em aberto"} /></dl>{ticket.solution && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><h4 className="font-bold text-emerald-900">Solução aplicada</h4><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{ticket.solution}</p></div>}</section>
    <section><h3 className="font-bold">Descrição</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{ticket.description || "Nenhum detalhe adicional informado."}</p></section>
    {image && <section><h3 className="mb-2 flex items-center gap-2 font-bold"><Building2 className="size-5 text-orange-600" /> Anexo</h3><Image unoptimized width={1200} height={800} src={image} alt="Imagem enviada pelo colaborador" className="h-auto max-h-96 max-w-full rounded-xl border object-contain" /></section>}
    {imageError && <p className="error">Não foi possível carregar o anexo. Reabra o chamado para tentar novamente.</p>}
    <section aria-labelledby="history-info"><h3 id="history-info" className="mb-4 flex items-center gap-2 font-bold"><History className="size-5 text-orange-600" /> Histórico</h3><ol className="space-y-0">{ticket.history.map(h => <li key={h.id} className="relative border-l-2 border-orange-100 pb-5 pl-5 last:pb-0"><span className="absolute -left-[7px] top-1 size-3 rounded-full border-2 border-orange-500 bg-white" /><p className="text-xs text-slate-500">{date(h.created_at)}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{h.message.replace(/AGUARDANDO_USUARIO|AGUARDANDO_TERCEIRO|EM_ATENDIMENTO|RESOLVIDO|CANCELADO|NOVO|URGENTE|NORMAL|BAIXA|ALTA/g, value => labels[value] || value)}</p></li>)}</ol></section>
  </div>;
}
