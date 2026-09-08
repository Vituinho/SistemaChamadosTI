"use client";
import { useEffect, useState } from "react";
import { API, date, labels, type Ticket } from "@/lib/api";
export function Badge({ value }: { value: string }) {
  return <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${value === "NOVO" || value === "URGENTE" ? "bg-orange-100 text-orange-800" : value === "RESOLVIDO" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{labels[value] || value}</span>;
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
  return <div className="space-y-6">
    <div><p className="text-sm font-bold text-orange-700">#{ticket.protocol}</p><h2 className="mt-2 text-2xl font-bold break-words">{ticket.title}</h2><div className="mt-3 flex gap-2"><Badge value={ticket.status} /><Badge value={ticket.priority} /></div></div>
    <dl className="grid gap-4 text-sm sm:grid-cols-2">{[["Colaborador", ticket.name], ["Setor", ticket.department], ["Categoria", ticket.category], ["Abertura", date(ticket.created_at)], ["Responsável", ticket.technician || "Aguardando TI"]].map(([k, v]) => <div key={k}><dt className="text-slate-500">{k}</dt><dd className="mt-1 font-medium break-words">{v}</dd></div>)}</dl>
    <div><h3 className="font-semibold">Mais detalhes</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{ticket.description || "Nenhum detalhe adicional informado."}</p></div>
    {image && <div><h3 className="mb-2 font-semibold">Anexo</h3>
      {/* Private blob URLs bypass the optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="Imagem enviada pelo colaborador" className="max-h-96 max-w-full rounded-lg border object-contain" />
    </div>}
    {imageError && <p className="error">Não foi possível carregar o anexo. Reabra o chamado para tentar novamente.</p>}
    {ticket.solution && <div className="rounded-lg bg-emerald-50 p-4"><h3 className="font-semibold text-emerald-800">Solução aplicada</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm">{ticket.solution}</p><p className="mt-2 text-xs text-slate-500">{ticket.resolved_at && date(ticket.resolved_at)}</p></div>}
    <div><h3 className="mb-4 font-semibold">Histórico do atendimento</h3><ol className="space-y-4 border-l-2 border-orange-100 pl-4">{ticket.history.map(h => <li key={h.id}><p className="text-xs text-slate-500">{date(h.created_at)}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm">{h.message.replace(/AGUARDANDO_USUARIO|AGUARDANDO_TERCEIRO|EM_ATENDIMENTO|RESOLVIDO|CANCELADO|NOVO|URGENTE|NORMAL|BAIXA|ALTA/g, value => labels[value] || value)}</p></li>)}</ol></div>
  </div>;
}
