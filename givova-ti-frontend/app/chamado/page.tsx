"use client";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, ShieldCheck, Clock3, Paperclip } from "lucide-react";
import { api, type Catalog, type Ticket } from "@/lib/api";
import { Button } from "@/components/ui/button";
export default function Chamado() {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function load() { setError(""); void api<Catalog>("/catalog").then(setCatalog).catch(() => setError("Não foi possível conectar à central. Tente novamente.")); }
  useEffect(() => { void api<Catalog>("/catalog").then(setCatalog).catch(() => setError("Não foi possível conectar à central. Tente novamente.")); }, []);
  async function enviarChamado(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const data = new FormData(event.currentTarget);
    const file = data.get("attachment");
    if (file instanceof File && file.size > 5 * 1024 * 1024) { setError("A imagem deve ter até 5 MB."); setBusy(false); return; }
    try {
      const result = await api<Ticket & { access_key: string }>("/tickets", { method: "POST", body: data });
      router.push(`/chamado/${result.protocol}#${result.access_key}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível enviar o chamado."); setBusy(false); }
  }
  return <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[.8fr_1.2fr] lg:py-16">
    <section><p className="mb-4 text-xs font-bold tracking-[.18em] text-orange-700">ESTAMOS AQUI PARA AJUDAR</p><h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">Um problema?<br /><span className="text-orange-600">Chame a TI.</span></h1><p className="mt-5 max-w-sm leading-7 text-slate-600">Conte o que aconteceu. Nossa equipe recebe seu chamado e você acompanha o atendimento por aqui.</p>
      <div className="mt-10 space-y-6"><div className="flex gap-3"><Clock3 className="shrink-0 text-orange-600" /><div><h2 className="font-semibold">Acompanhe cada etapa</h2><p className="mt-1 text-sm text-slate-500">Saiba quando a TI assumir e resolver seu chamado.</p></div></div><div className="flex gap-3"><ShieldCheck className="shrink-0 text-orange-600" /><div><h2 className="font-semibold">Simples e direto</h2><p className="mt-1 text-sm text-slate-500">Sem cadastro. Guarde o link após enviar.</p></div></div></div>
    </section>
    <section className="card shadow-sm"><h2 className="text-xl font-bold">Abrir chamado</h2><p className="mb-6 mt-1 text-sm text-slate-500">Preencha os campos abaixo. Apenas o anexo é opcional.</p>
      {error && <div role="alert" className="error mb-4">{error} {!catalog && <Button type="button" variant="outline" onClick={load}>Tentar novamente</Button>}</div>}
      {!catalog ? <p role="status" className="py-10 text-slate-500">Carregando formulário…</p> : <form onSubmit={enviarChamado} className="space-y-5">
        <label>Seu nome<input name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder="Como você se chama?" /></label>
        <label>Setor<select name="department" required defaultValue=""><option value="" disabled>Selecione seu setor</option>{catalog.departments.map(d => <option key={d}>{d}</option>)}</select></label>
        <label>Categoria do problema<select name="category" required defaultValue=""><option value="" disabled>Com o que precisa de ajuda?</option>{catalog.categories.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Resumo do problema<input name="title" required minLength={3} maxLength={160} placeholder="Ex.: impressora não imprime" /></label>
        <label>Descrição<textarea name="description" rows={4} required minLength={5} maxLength={5000} placeholder="O que está acontecendo? Desde quando?" /></label>
        <label className="rounded-lg border border-dashed border-slate-300 p-4"><span className="flex items-center gap-2"><Paperclip size={16} /> Imagem ou print <span className="font-normal text-slate-500">(opcional)</span></span><input name="attachment" type="file" accept="image/png,image/jpeg,image/webp" className="mt-3 block w-full text-sm font-normal" /><span className="mt-2 block text-xs font-normal text-slate-500">PNG, JPG ou WEBP · até 5 MB. Não inclua senhas.</span></label>
        <Button disabled={busy} className="w-full" type="submit"><Send />{busy ? "Enviando chamado…" : "Chamar TI"}</Button>
      </form>}
    </section>
  </main>;
}
