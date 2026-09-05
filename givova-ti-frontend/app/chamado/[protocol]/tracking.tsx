"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy } from "lucide-react";
import { api, subscribe, type Ticket } from "@/lib/api";
import { TicketDetails } from "@/components/ticket-details";
import { Button } from "@/components/ui/button";
export default function Tracking({ protocol }: { protocol: string }) {
  const [ticket, setTicket] = useState<Ticket>();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const accessKey = window.location.hash.slice(1);
    const load = () => { setKey(accessKey); void api<Ticket>(`/tracking/${protocol}`, { headers: { "X-Ticket-Key": accessKey } }).then(t => { setTicket(t); setError(""); }).catch(e => setError(e instanceof Error ? e.message : "Falha ao carregar")); };
    load();
    const stop = subscribe(`/tracking/${protocol}/events`, load, setOnline, accessKey);
    const fallback = setInterval(load, 15000);
    return () => { stop(); clearInterval(fallback); };
  }, [protocol]);
  async function copy() { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setError("Copie o endereço completo da barra do navegador para guardar o link."); } }
  return <main className="mx-auto max-w-3xl space-y-6 px-5 py-10">
    <div className="flex items-center gap-3"><CheckCircle2 className="text-orange-600" /><h1 className="text-2xl font-bold">Acompanhar chamado</h1></div>
    <div className="notice"><p className="font-semibold">Guarde seu link de acompanhamento</p><p className="mt-1 text-sm">Este link dá acesso ao chamado. Mantenha-o com você.</p><Button variant="outline" onClick={copy} className="mt-3"><Copy />{copied ? "Link copiado" : "Copiar link"}</Button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {ticket ? <><section className="card"><p className="mb-2 text-xs text-slate-500">{online ? "Atualização automática conectada" : "Reconectando · tentaremos atualizar automaticamente"}</p><h2 className="text-xl font-bold">{ticket.status === "NOVO" ? "Chamado recebido. Aguardando TI." : ticket.status === "RESOLVIDO" ? "Tudo certo! Seu chamado foi resolvido." : ticket.status === "CANCELADO" ? "Este chamado foi cancelado." : ticket.status === "EM_ATENDIMENTO" ? "Seu chamado está sendo atendido pela TI." : "Seu chamado aguarda uma etapa do atendimento."}</h2>{ticket.technician && <p className="mt-2 text-slate-600">Responsável: {ticket.technician}</p>}</section><section className="card"><TicketDetails ticket={ticket} accessKey={key} /></section></> : !error && <p role="status">Carregando chamado…</p>}
    <Button asChild variant="outline"><Link href="/chamado">Abrir outro chamado</Link></Button>
  </main>;
}
