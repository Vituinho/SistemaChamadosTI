"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Headset, HelpCircle, Layers3, LoaderCircle, MapPin, Paperclip, Send, UserRound, X } from "lucide-react";
import { api, type Catalog, type Ticket } from "@/lib/api";
import { problemOptions } from "@/lib/problem-options";
import { Button } from "@/components/ui/button";

export default function Chamado() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [department, setDepartment] = useState("");
  const [category, setCategory] = useState("");
  const [affectedSystem, setAffectedSystem] = useState("");
  const [title, setTitle] = useState("");
  const [fileName, setFileName] = useState("");
  const sending = useRef(false);
  const attachment = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }
  function load() {
    setError("");
    void api<Catalog>("/catalog").then(setCatalog).catch(() => showError("Não conseguimos carregar o formulário. Clique em tentar novamente."));
  }
  useEffect(() => {
    const controller = new AbortController();
    void api<Catalog>("/catalog", { signal: controller.signal }).then(setCatalog).catch(() => {
      if (!controller.signal.aborted) setError("Não conseguimos carregar o formulário. Clique em tentar novamente.");
    });
    return () => controller.abort();
  }, []);

  function chooseCategory(value: string) {
    if (problemOptions[category]?.examples.includes(title)) setTitle("");
    setCategory(value);
    if (value !== "Sistema") setAffectedSystem("");
  }

  async function enviarChamado(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    setError("");
    const data = new FormData(event.currentTarget);
    if (String(data.get("name") || "").trim().length < 2) { showError("Digite seu nome para a TI saber quem precisa de ajuda."); return; }
    if (!department) { showError("Escolha seu setor na primeira parte do formulário."); return; }
    if (String(data.get("location") || "").trim().length < 2) { showError("Informe onde você está para a TI encontrar você rapidamente."); return; }
    if (!category) { showError("Escolha com o que você precisa de ajuda."); return; }
    if (category === "Sistema" && !affectedSystem) { showError("Escolha qual sistema está com problema."); return; }
    if (title.trim().length < 3) { showError("Escolha uma sugestão ou escreva o que aconteceu."); titleRef.current?.focus(); return; }
    const file = data.get("attachment");
    if (file instanceof File && file.size > 5 * 1024 * 1024) { showError("A imagem é muito grande. Escolha uma imagem de até 5 MB ou envie sem imagem."); return; }
    sending.current = true;
    setBusy(true);
    try {
      const result = await api<Ticket & { access_key: string }>("/tickets", { method: "POST", body: data });
      router.push(`/chamado/${result.protocol}#${result.access_key}`);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Não foi possível enviar. Tente novamente.");
      sending.current = false;
      setBusy(false);
    }
  }

  return <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
    <header className="mb-8"><p className="eyebrow flex items-center gap-2"><Headset size={18} /> Novo atendimento</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Chame a equipe de TI</h1><p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Preencha as informações abaixo. Uma frase curta já basta para abrir seu chamado.</p></header>
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="error mb-5 outline-offset-2">{error}{!catalog && <Button type="button" variant="outline" onClick={load} className="ml-3 mt-2">Tentar novamente</Button>}</div>}
    {!catalog ? <div role="status" className="card space-y-4 py-10"><div className="flex items-center gap-3 font-semibold"><LoaderCircle className="animate-spin text-orange-600 motion-reduce:animate-none" /> Preparando o formulário…</div><div className="skeleton h-12" /><div className="skeleton h-28" /></div> : <form onSubmit={enviarChamado}>
      <fieldset disabled={busy} className="min-w-0 space-y-5"><legend className="sr-only">Abrir chamado para a TI</legend>
        <section className="card space-y-5" aria-labelledby="who-heading">
          <div><p className="eyebrow">Etapa 1</p><h2 id="who-heading" className="mt-2 flex items-center gap-3 text-xl font-bold"><UserRound className="text-orange-600" /> Seus dados</h2></div>
          <div className="grid gap-5 sm:grid-cols-2"><label htmlFor="requester-name" className="text-base">Nome completo<input id="requester-name" name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder="Como podemos chamar você?" /></label><label htmlFor="requester-location" className="text-base">Onde você está?<span className="mt-1 block text-xs font-normal text-slate-500">Sala, unidade ou ponto de referência</span><div className="relative"><MapPin className="pointer-events-none absolute top-[21px] left-3 size-4 text-slate-400" /><input id="requester-location" name="location" required minLength={2} maxLength={160} className="pl-9" placeholder="Ex.: sala do Financeiro" /></div></label></div>
          <fieldset><legend className="mb-2 text-base font-semibold">Seu setor</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{catalog.departments.map(d => <label key={d} className="relative cursor-pointer"><input className="peer sr-only" type="radio" name="department" value={d} checked={department === d} onChange={() => setDepartment(d)} required /><span className="flex min-h-14 items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm peer-checked:border-orange-600 peer-checked:bg-orange-50 peer-checked:text-orange-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-orange-600 hover:border-orange-400">{d === "Juridico" ? "Jurídico" : d}{department === d && <Check size={18} className="shrink-0" aria-hidden="true" />}</span></label>)}</div></fieldset>
        </section>

        <section className="card space-y-5" aria-labelledby="problem-heading">
          <div><p className="eyebrow">Etapa 2</p><h2 id="problem-heading" className="mt-2 flex items-center gap-3 text-xl font-bold"><Layers3 className="text-orange-600" /> Como podemos ajudar?</h2></div>
          <fieldset><legend className="mb-3 text-base font-semibold">Com o que precisa de ajuda?</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{catalog.categories.map(c => { const Icon = problemOptions[c]?.icon || HelpCircle; return <label key={c} className="relative cursor-pointer"><input className="peer sr-only" type="radio" name="category" value={c} checked={category === c} onChange={() => chooseCategory(c)} required /><span className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm peer-checked:border-orange-600 peer-checked:bg-orange-50 peer-checked:text-orange-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-orange-600 hover:border-orange-400"><Icon className="size-6 shrink-0 text-orange-700" aria-hidden="true" /><span className="flex-1">{c === "Outro" ? "Outro / Não sei" : c}</span>{category === c && <Check size={17} className="shrink-0" aria-hidden="true" />}</span></label>; })}</div></fieldset>
          {category === "Sistema" && <fieldset className="rounded-xl border border-orange-200 bg-orange-50/60 p-4"><legend className="px-1 text-base font-semibold">Qual sistema está com problema?</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">{catalog.systems.map(system => <label key={system} className="relative cursor-pointer"><input className="peer sr-only" type="radio" name="affected_system" value={system} checked={affectedSystem === system} onChange={() => setAffectedSystem(system)} required /><span className="flex min-h-14 items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-semibold peer-checked:border-orange-600 peer-checked:text-orange-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-orange-600">{system}{affectedSystem === system && <Check size={17} aria-hidden="true" />}</span></label>)}</div></fieldset>}
          {category && <div className="space-y-3 rounded-xl bg-slate-50 p-4"><p className="text-sm font-semibold">Sugestões rápidas</p><div className="flex flex-wrap gap-2">{(problemOptions[category]?.examples || ["Preciso de ajuda da TI"]).map(example => <Button key={example} type="button" variant="outline" aria-pressed={title === example} onClick={() => setTitle(example)} className={`min-h-12 whitespace-normal text-left ${title === example ? "border-orange-600 bg-orange-50 text-orange-800" : ""}`}>{title === example && <Check />}{example}</Button>)}</div></div>}
          <label htmlFor="problem-title" className="text-base">Título do problema<input ref={titleRef} id="problem-title" name="title" value={title} onChange={e => setTitle(e.target.value)} required minLength={3} maxLength={160} placeholder={category ? "Escolha uma sugestão ou escreva aqui" : "Ex.: meu computador não liga"} /><span className="mt-2 block text-sm font-normal text-slate-500">Conte em uma frase o que aconteceu.</span></label>
          <label htmlFor="problem-description">Descrição <span className="font-normal text-slate-500">(opcional)</span><textarea id="problem-description" name="description" rows={3} maxLength={5000} placeholder="Se quiser, conte mais detalhes. Pode deixar em branco." /></label>
        </section>

        <section className="card space-y-4" aria-labelledby="attachment-heading"><div><p className="eyebrow">Etapa 3</p><h2 id="attachment-heading" className="mt-2 flex items-center gap-3 text-xl font-bold"><Paperclip className="text-orange-600" /> Anexo <span className="text-sm font-normal text-slate-500">(opcional)</span></h2></div><p className="text-sm leading-6 text-slate-600">Uma foto ou print pode ajudar a TI a entender mais rápido.</p><input ref={attachment} id="problem-attachment" name="attachment" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Foto ou imagem do problema" className="block w-full min-w-0 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-orange-100 file:p-3 file:font-semibold file:text-orange-800" onChange={e => setFileName(e.target.files?.[0]?.name || "")} /><p className="text-xs text-slate-500">PNG, JPG ou WEBP · até 5 MB. Não inclua senhas.</p>{fileName && <div className="flex items-center gap-2 text-sm"><span className="min-w-0 flex-1 break-all">Imagem: {fileName}</span><Button type="button" variant="outline" aria-label="Remover imagem" onClick={() => { if (attachment.current) attachment.current.value = ""; setFileName(""); }}><X />Remover</Button></div>}</section>
        <div className="pb-4"><Button disabled={busy} className="min-h-14 w-full text-lg shadow-md shadow-orange-200" type="submit">{busy ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <Send />}{busy ? "Enviando para a TI…" : "Chamar TI"}</Button><p className="mt-3 text-center text-sm text-slate-500" role="status">{busy ? "Aguarde só um instante. Estamos enviando seu pedido." : "Você receberá o protocolo e poderá acompanhar o atendimento."}</p></div>
      </fieldset>
    </form>}
  </main>;
}
