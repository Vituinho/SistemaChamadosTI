"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Inbox, LogOut, Search, Wrench, Clock3, ArrowRight, X, Volume2 } from "lucide-react";
import { api, ApiError, json, labels, date, age, subscribe, type Catalog, type Dashboard, type Ticket } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge, TicketDetails } from "@/components/ticket-details";
import { NotificationSound } from "@/lib/notification-sound";
import { RefreshQueue } from "@/lib/refresh-queue";

type User = { id: number; name: string };
export default function TI() {
  const [user, setUser] = useState<User | null>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    void api<User>("/auth/me").then(setUser).catch(e => {
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else setError("Não foi possível conectar ao servidor. Tente novamente.");
    });
  }, [retry]);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try { setUser(await api<User>("/auth/login", json("POST", Object.fromEntries(data)))); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível entrar."); }
    finally { setBusy(false); }
  }
  if (user) return <Panel user={user} onLogout={() => setUser(null)} />;
  return <main className="mx-auto max-w-md px-5 py-16"><section className="card shadow-sm"><div className="mb-6"><p className="text-xs font-bold tracking-widest text-orange-700">ACESSO RESTRITO</p><h1 className="mt-2 text-2xl font-bold">Olá, equipe de TI</h1><p className="mt-2 text-sm text-slate-500">Entre para gerenciar os atendimentos.</p></div>
    {error && <p className="error mb-4" role="alert">{error}</p>}
    {user === undefined ? <><p role="status">Verificando conexão…</p>{error && <Button onClick={() => { setError(""); setRetry(n => n + 1); }}>Tentar novamente</Button>}</> : <form onSubmit={login} className="space-y-5"><label>Usuário<input name="username" autoComplete="username" required maxLength={80} /></label><label>Senha<input name="password" type="password" autoComplete="current-password" required maxLength={256} /></label><Button type="submit" disabled={busy} className="w-full">{busy ? "Entrando…" : "Entrar no painel"}<ArrowRight /></Button></form>}
  </section></main>;
}

function Panel({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [catalog, setCatalog] = useState<Catalog>();
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState({ status: "", department: "", category: "", priority: "", q: "" });
  const [selected, setSelected] = useState<Ticket>();
  const [selectedId, setSelectedId] = useState<number>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [newTicket, setNewTicket] = useState<Ticket>();
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [enablingAlerts, setEnablingAlerts] = useState(false);
  const sound = useRef<NotificationSound | null>(null);
  const desktopNotification = useRef<Notification | null>(null);
  const latest = useRef<number | null>(null);
  const sequence = useRef(0);
  const refreshQueue = useRef(new RefreshQueue());
  const detailsRef = useRef<HTMLElement>(null);
  const openTicket = useCallback((id: number) => {
    setSelected(current => current?.id === id ? current : undefined);
    setSelectedId(id);
    setNewTicket(undefined);
    desktopNotification.current?.close();
    detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  useEffect(() => () => {
    sound.current?.dispose();
    desktopNotification.current?.close();
    refreshQueue.current.cancelPending();
    sequence.current++;
  }, []);
  useEffect(() => { if (selectedId !== undefined) detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [selectedId]);
  const handleError = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) onLogout();
    else setError(e instanceof Error ? e.message : "Não foi possível carregar os chamados.");
  }, [onLogout]);
  const refresh = useCallback(() => refreshQueue.current.run(async () => {
    // A slow response must finish before polling starts another request.
    // Collapse events/filter changes into one follow-up using the latest filters.
    const requestId = ++sequence.current;
    try {
      const query = new URLSearchParams({ offset: String(offset), limit: "30" });
      for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
      const [dash, list, cat] = await Promise.all([api<Dashboard>("/dashboard"), api<{ items: Ticket[]; total: number }>(`/tickets?${query}`), api<Catalog>("/catalog")]);
      if (requestId !== sequence.current) return;
      const hasNewTicket = latest.current !== null && dash.latest_id > latest.current;
      // Fetch outside the current filters: new tickets may not be in the visible page.
      const incoming = hasNewTicket ? list.items.find(t => t.id === dash.latest_id) ?? await api<Ticket>(`/tickets/${dash.latest_id}`) : undefined;
      if (requestId !== sequence.current) return;
      if (incoming) {
        setNewTicket(incoming);
        sound.current?.play();
        if ("Notification" in window && Notification.permission === "granted") {
          try {
            desktopNotification.current?.close();
            const notification = new Notification(`Novo chamado — ${incoming.department}`, {
              body: `${incoming.name}: ${incoming.title}`,
              tag: incoming.protocol,
            });
            notification.onclick = () => { window.focus(); openTicket(incoming.id); notification.close(); };
            desktopNotification.current = notification;
          } catch { /* Some mobile browsers require a service worker; the in-app notice remains available. */ }
        }
      }
      latest.current = dash.latest_id;
      setDashboard(dash); setTickets(list.items); setTotal(list.total); setCatalog(cat); setLoaded(true); setError("");
    } catch (e) { if (requestId === sequence.current) handleError(e); }
  }), [filters, offset, handleError, openTicket]);
  // Keep one stream connected while filters change; updates use the latest refresh.
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; const delay = setTimeout(() => void refresh(), 200); return () => clearTimeout(delay); }, [refresh]);
  useEffect(() => {
    const stop = subscribe("/events", () => void refreshRef.current(), setOnline);
    const fallback = setInterval(() => void refreshRef.current(), 15000);
    return () => { stop(); clearInterval(fallback); };
  }, []);
  useEffect(() => {
    if (selectedId === undefined) return;
    let active = true;
    const load = () => void api<Ticket>(`/tickets/${selectedId}`).then(t => { if (active) setSelected(t); }).catch(handleError);
    load();
    const timer = setInterval(load, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [selectedId, handleError]);
  async function logout() { try { await api("/auth/logout", { method: "POST" }); onLogout(); } catch (e) { handleError(e); } }
  async function notifications() {
    setEnablingAlerts(true);
    // Request both permissions within the click, before waiting for either one.
    sound.current ??= new NotificationSound();
    const audio = sound.current.enable().then(() => { setSoundEnabled(true); return true; }).catch(() => { setSoundEnabled(false); return false; });
    const permission = "Notification" in window
      ? Notification.requestPermission().catch(() => "denied" as const)
      : Promise.resolve("unsupported" as const);
    const [audible, allowed] = await Promise.all([audio, permission]);
    setNotice(`${audible ? "Som ativado nesta aba." : "O navegador não liberou o som."} ${allowed === "granted" ? "Notificações do navegador permitidas." : "Notificações do navegador indisponíveis ou sem permissão."} Os avisos na tela estão sempre ativos. Mantenha o painel aberto para receber novos chamados.`);
    setEnablingAlerts(false);
  }
  function filter(key: keyof typeof filters, value: string) { setOffset(0); setFilters(f => ({ ...f, [key]: value })); }
  return <main className="mx-auto max-w-7xl space-y-6 px-5 py-8">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold tracking-widest text-orange-700">CENTRAL DE ATENDIMENTO</p><h1 className="mt-2 text-3xl font-bold">Olá, {user.name}</h1><p className="mt-2 text-sm text-slate-500">{online ? "● Conectado · atualizações automáticas" : "Reconectando · atualização alternativa a cada 15 segundos"}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={enablingAlerts} onClick={() => void notifications()}><Bell />{enablingAlerts ? "Ativando…" : "Ativar alertas"}</Button><Button variant="outline" onClick={logout}><LogOut />Sair</Button></div></header>
    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600"><span>{soundEnabled ? "Som ativado nesta aba. Deixe o painel aberto." : "Ative os alertas para ouvir quando chegar um chamado. Deixe o painel aberto."}</span>{soundEnabled && <><Button variant="outline" onClick={() => sound.current?.play()}><Volume2 />Testar som</Button><Button variant="outline" onClick={() => { sound.current?.dispose(); setSoundEnabled(false); }}>Silenciar</Button></>}</div>
    {error && <div className="error flex flex-wrap items-center justify-between gap-2" role="alert">{error}<Button variant="outline" onClick={() => void refresh()}>Tentar novamente</Button></div>}
    {notice && <div className="notice flex items-center justify-between gap-3" role="status"><span>{notice}</span><button className="font-semibold underline" onClick={() => setNotice("")}>Dispensar</button></div>}
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Indicadores">
      {([{ key: "new", label: "Novos", icon: Inbox, status: "NOVO" }, { key: "active", label: "Em atendimento", icon: Wrench, status: "EM_ATENDIMENTO" }, { key: "resolved_today", label: "Resolvidos hoje", icon: CheckCheck, status: "RESOLVIDO" }, { key: "pending", label: "Pendentes", icon: Clock3, status: "" }] as const).map(c => <div key={c.key} className={`card ${c.key === "new" ? "border-t-4 border-t-orange-500" : ""}`}><div className="flex items-center justify-between gap-2 text-slate-500"><p className="text-sm">{c.label}</p><c.icon size={18} /></div><p className="mt-4 text-3xl font-bold">{dashboard ? dashboard[c.key] : "—"}</p></div>)}
    </section>
    <section className="card"><div className="mb-5 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">Fila de chamados</h2><span className="text-xs text-slate-500">Mais antigos primeiro · {total} encontrados</span></div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label><span className="flex items-center gap-1"><Search size={14} />Buscar</span><input value={filters.q} onChange={e => filter("q", e.target.value)} placeholder="Protocolo, nome ou título" maxLength={160} /></label>{([ ["status", "Status", catalog?.statuses], ["department", "Setor", catalog?.departments], ["category", "Categoria", catalog?.categories], ["priority", "Prioridade", catalog?.priorities] ] as const).map(([key, label, values]) => <label key={key}>{label}<select value={filters[key]} onChange={e => filter(key, e.target.value)}><option value="">Todos</option>{values?.map(v => <option key={v} value={v}>{labels[v] || v}</option>)}</select></label>)}</div>
      {!loaded ? <p role="status" className="py-12 text-center text-slate-500">Carregando chamados…</p> : tickets.length === 0 ? <div className="py-12 text-center"><Inbox className="mx-auto mb-3 text-slate-400" /><h3 className="font-semibold">Nenhum chamado encontrado</h3><p className="mt-2 text-sm text-slate-500">Novas solicitações aparecerão automaticamente. Confira também os filtros.</p></div> : <div className="space-y-3">{tickets.map(t => <button key={t.id} onClick={() => { if (selectedId !== t.id) { setSelected(undefined); setSelectedId(t.id); } else { detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); } }} className={`w-full rounded-xl border p-4 text-left transition hover:border-orange-400 focus-visible:outline-orange-600 ${t.status === "NOVO" ? "border-orange-200 bg-orange-50/60" : "border-slate-200"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><span className="text-xs font-bold text-orange-700">#{t.protocol}</span><h3 className="mt-1 font-semibold break-words">{t.title}</h3></div><div className="flex flex-wrap gap-2"><Badge value={t.status} /><Badge value={t.priority} /></div></div><p className="mt-2 break-words text-sm text-slate-600">{t.name} · {t.department}</p><div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>{t.category} · {t.technician || "Sem responsável"}</span><span>{date(t.created_at)} · há {age(t.created_at)}</span></div></button>)}</div>}
      <div className="mt-5 flex items-center justify-between"><Button variant="outline" disabled={offset === 0} onClick={() => setOffset(v => Math.max(0, v - 30))}>Anterior</Button><span className="text-xs text-slate-500">Página {Math.floor(offset / 30) + 1}</span><Button variant="outline" disabled={offset + 30 >= total} onClick={() => setOffset(v => v + 30)}>Próxima</Button></div>
    </section>
    {selectedId !== undefined && <section ref={detailsRef} className="card scroll-mt-5" aria-label="Detalhes do chamado"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">Atendimento</h2><Button variant="outline" onClick={() => { setSelectedId(undefined); setSelected(undefined); }}>Fechar detalhes</Button></div>{selected ? <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]"><TicketDetails key={`details-${selected.id}`} ticket={selected} /><Actions key={`actions-${selected.id}`} ticket={selected} catalog={catalog} onUpdated={t => { setSelected(t); void refresh(); }} /></div> : <p role="status">Carregando detalhes…</p>}</section>}
    {newTicket && <aside className="fixed right-4 bottom-4 left-4 z-50 mx-auto max-w-sm rounded-2xl border-2 border-orange-500 bg-white p-5 shadow-xl sm:mr-0" aria-label="Aviso de novo chamado"><div role="alert" aria-atomic="true"><div className="flex items-start justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-bold text-orange-800"><Bell className="size-5 shrink-0" />Novo chamado!</h2><button aria-label="Dispensar aviso de novo chamado" className="rounded-lg p-2 hover:bg-slate-100 focus-visible:outline-orange-600" onClick={() => setNewTicket(undefined)}><X className="size-5" /></button></div><p className="mt-2 font-semibold break-words">{newTicket.name} · {newTicket.department}</p><p className="mt-1 line-clamp-2 break-words text-sm text-slate-600">{newTicket.title}</p><p className="mt-2 text-xs text-slate-500">#{newTicket.protocol} · Confira todos os pedidos na fila.</p></div><Button className="mt-4 w-full" onClick={() => openTicket(newTicket.id)}>Ver chamado<ArrowRight /></Button></aside>}
  </main>;
}

function Actions({ ticket, catalog, onUpdated }: { ticket: Ticket; catalog?: Catalog; onUpdated: (ticket: Ticket) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirm, setConfirm] = useState<"assign" | "resolve" | "cancel" | null>(null);
  const [solution, setSolution] = useState("");
  const closed = ["RESOLVIDO", "CANCELADO"].includes(ticket.status);
  async function action(path: string, init: RequestInit) {
    setBusy(true); setError(""); setSuccess("");
    try { onUpdated(await api<Ticket>(`/tickets/${ticket.id}${path}`, init)); setConfirm(null); setSuccess(path === "/assign" ? "Chamado assumido. A tela do colaborador mostrará que a TI está indo até ele." : "Chamado atualizado com sucesso."); }
    catch (e) { setError(e instanceof Error ? e.message : "Falha ao atualizar."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-4 rounded-xl bg-slate-50 p-5"><h3 className="font-bold">Ações da TI</h3>{error && <p role="alert" className="error">{error}</p>}{success && <p role="status" className="notice">{success}</p>}
    {closed ? <p className="text-sm text-slate-500">Atendimento encerrado. O histórico foi preservado.</p> : <>
      {ticket.status === "NOVO" && <div className="space-y-2"><Button className="w-full" disabled={busy} onClick={() => setConfirm("assign")}><Wrench />Assumir chamado</Button><p className="text-sm text-slate-600">Ao confirmar, o colaborador verá: “A TI está indo até você”.</p></div>}
      <label>Prioridade<select value={ticket.priority} disabled={busy} onChange={e => void action("", json("PATCH", { priority: e.target.value }))}>{catalog?.priorities.map(p => <option key={p} value={p}>{labels[p]}</option>)}</select></label>
      {ticket.status !== "NOVO" && <><label>Status<select value={ticket.status} disabled={busy} onChange={e => void action("", json("PATCH", { status: e.target.value }))}>{["EM_ATENDIMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_TERCEIRO"].map(s => <option key={s} value={s}>{labels[s]}</option>)}</select></label><label>Solução aplicada<textarea value={solution} onChange={e => setSolution(e.target.value)} rows={4} maxLength={3000} placeholder="Descreva o que foi feito para resolver." /></label><Button className="w-full" disabled={busy || solution.trim().length < 3} onClick={() => setConfirm("resolve")}><CheckCheck />Resolver chamado</Button></>}
      <Button className="w-full" variant="outline" disabled={busy} onClick={() => setConfirm("cancel")}>Cancelar chamado</Button>
      {confirm && <div className="notice space-y-3" role="group" aria-label="Confirmar ação"><p>{confirm === "assign" ? "Assumir o chamado e avisar ao colaborador que você está indo até ele?" : confirm === "resolve" ? "Confirmar a resolução com a solução informada?" : "Confirmar o cancelamento deste chamado?"}</p><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void action(confirm === "assign" ? "/assign" : confirm === "resolve" ? "/resolve" : "", confirm === "assign" ? { method: "POST" } : confirm === "resolve" ? json("POST", { solution }) : json("PATCH", { status: "CANCELADO" }))}>{busy ? "Salvando…" : "Confirmar"}</Button><Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>Voltar</Button></div></div>}
    </>}
  </div>;
}
