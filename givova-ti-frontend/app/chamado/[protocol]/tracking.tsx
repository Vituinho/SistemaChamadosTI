"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Clock3, Headphones, Wrench } from "lucide-react";
import { api, subscribe, type Ticket } from "@/lib/api";
import { TicketDetails } from "@/components/ticket-details";
import { Button } from "@/components/ui/button";
export default function Tracking({ protocol }: { protocol: string }) {
  const [ticket, setTicket] = useState<Ticket>();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [copied, setCopied] = useState(false);
  const step = ticket?.status === "RESOLVIDO" ? 3 : ticket?.status === "NOVO" ? 1 : 2;
  useEffect(() => {
    const accessKey = window.location.hash.slice(1);
    const load = () => { setKey(accessKey); void api<Ticket>(`/tracking/${protocol}`, { headers: { "X-Ticket-Key": accessKey } }).then(t => { setTicket(t); setError(""); }).catch(e => setError(e instanceof Error ? e.message : "Falha ao carregar")); };
    load();
    const stop = subscribe(`/tracking/${protocol}/events`, load, setOnline, accessKey);
    const fallback = setInterval(load, 15000);
    return () => { stop(); clearInterval(fallback); };
  }, [protocol]);
  async function copy() { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); } catch { setError("Copie o endereço completo da barra do navegador para guardar o link."); } }
  return <main className="mx-auto max-w-4xl space-y-6 px-5 py-10 sm:py-14">
    <div><p className="eyebrow">Acompanhamento</p><div className="mt-2 flex items-center gap-3"><CheckCircle2 className="text-orange-600" /><h1 className="text-2xl font-black sm:text-3xl">Seu chamado</h1></div></div>
    {error && <p className="error" role="alert">{error}</p>}
    {ticket ? <>
      <section className="card border-t-4 border-t-orange-500 shadow-sm" aria-live="polite">
        <p className="mb-3 text-sm font-black tracking-wide text-orange-700">PROTOCOLO {ticket.protocol}</p>
        <h2 className="text-2xl font-bold">{ticket.status === "NOVO" ? "Pronto! A TI recebeu seu pedido." : ticket.status === "RESOLVIDO" ? "Tudo certo! Seu problema foi resolvido." : ticket.status === "CANCELADO" ? "Este pedido foi cancelado." : ticket.status === "EM_ATENDIMENTO" ? "A TI está indo até você!" : ticket.status === "AGUARDANDO_USUARIO" ? "A TI precisa de um retorno seu." : "A TI está aguardando ajuda de um fornecedor."}</h2>
        {ticket.status === "EM_ATENDIMENTO" && <div className="mt-4 flex items-center gap-3 rounded-xl bg-orange-50 p-4 text-orange-900"><Wrench className="size-8 shrink-0" aria-hidden="true" /><p className="font-semibold">Seu chamado foi assumido. Aguarde a chegada da TI ao seu setor.</p></div>}
        <p className="mt-3 text-base text-slate-600">{ticket.status === "NOVO" ? "A equipe de TI foi notificada. Agora é só aguardar e não precisa enviar novamente." : ticket.technician ? `Técnico responsável: ${ticket.technician}.` : "Você pode conferir os detalhes abaixo."}</p>
        {ticket.status !== "CANCELADO" && <ol className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Etapas do atendimento">{[{ label: "Recebido", icon: CheckCircle2 }, { label: "Aguardando TI", icon: Clock3 }, { label: "Em atendimento", icon: Wrench }, { label: "Resolvido", icon: CheckCircle2 }].map((item, i) => <li key={item.label} aria-current={step === i ? "step" : undefined} className={`rounded-xl border p-3 text-center text-xs font-semibold sm:text-sm ${i < step ? "border-emerald-200 bg-emerald-50 text-emerald-800" : i === step ? "border-orange-300 bg-orange-50 text-orange-800" : "border-slate-200 bg-slate-50 text-slate-400"}`}><item.icon className="mx-auto mb-2 size-6" aria-hidden="true" />{i < step ? "✓ " : ""}{item.label}</li>)}</ol>}
        <p className="mt-5 flex items-center gap-2 text-sm text-slate-500"><Clock3 size={16} aria-hidden="true" />{online ? "Esta página atualiza sozinha. Pode deixá-la aberta." : "Estamos tentando atualizar. Não precisa enviar outro pedido."}</p>
      </section>
      <div className="notice flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Guarde seu acompanhamento</p><p className="mt-1 text-sm">Este link é exclusivo do chamado e permite voltar depois.</p></div><Button variant="outline" onClick={copy} className="shrink-0"><Copy />{copied ? "Link copiado!" : "Copiar link"}</Button></div>
      {ticket.solution && <section className="card bg-emerald-50"><h2 className="font-bold text-emerald-900">O que foi feito</h2><p className="mt-2 whitespace-pre-wrap break-words">{ticket.solution}</p></section>}
      <details className="card"><summary className="flex cursor-pointer list-none items-center gap-2 text-lg font-semibold"><Headphones className="text-orange-600" /> Ver detalhes e histórico</summary><div className="mt-6 border-t border-slate-100 pt-6"><TicketDetails ticket={ticket} accessKey={key} /></div></details>
    </> : !error && <p role="status">Carregando seu pedido…</p>}
    <Button asChild variant="outline"><Link href="/chamado">Abrir outro chamado</Link></Button>
  </main>;
}
