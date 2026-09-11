import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, ClipboardList, Headphones, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return <main>
    <section className="border-b border-slate-200 bg-white"><div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.25fr_.75fr]">
      <div><p className="eyebrow">Central de atendimento interno</p><h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-slate-950 sm:text-6xl">Como podemos <span className="text-orange-600">ajudar?</span></h1><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Abra um chamado para a equipe de Tecnologia da Informação. É rápido, simples e você acompanha cada etapa.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><Button asChild className="min-h-14 text-base"><Link href="/chamado">Novo chamado <ArrowRight /></Link></Button><Button asChild variant="outline" className="min-h-14 text-base"><Link href="/tutorial"><BookOpen />Ver como funciona</Link></Button></div></div>
      <div className="rounded-3xl border border-slate-200 bg-slate-950 p-7 text-white shadow-xl shadow-slate-200/70"><div className="flex items-center justify-between"><span className="rounded-xl bg-orange-600 p-3"><Headphones /></span><span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-bold text-emerald-300">TI CONECTADA</span></div><h2 className="mt-8 text-2xl font-bold">Atendimento com acompanhamento</h2><ul className="mt-5 space-y-4 text-sm text-slate-300">{["Receba seu protocolo na hora", "Acompanhe o técnico responsável", "Consulte a solução e o histórico"].map(item => <li key={item} className="flex items-center gap-3"><CheckCircle2 className="size-5 text-orange-400" />{item}</li>)}</ul></div>
    </div></section>
    <section className="mx-auto max-w-7xl px-5 py-12 sm:px-6"><div className="grid gap-4 md:grid-cols-3">{[
      { icon: ClipboardList, title: "Abra o chamado", text: "Informe seus dados e escolha o tipo de ajuda que precisa." },
      { icon: ShieldCheck, title: "A TI é notificada", text: "Seu pedido entra imediatamente na fila de atendimento." },
      { icon: CheckCircle2, title: "Acompanhe até resolver", text: "Veja o andamento, o responsável e a solução aplicada." },
    ].map((item, index) => <article key={item.title} className="card"><span className="text-xs font-black text-orange-600">0{index + 1}</span><item.icon className="mt-5 size-7 text-slate-800" /><h2 className="mt-4 text-lg font-bold">{item.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p></article>)}</div>
      <div className="mt-8 flex flex-col items-start justify-between gap-5 rounded-2xl border border-orange-200 bg-orange-50 p-6 sm:flex-row sm:items-center"><div><p className="font-bold text-orange-950">Primeira vez utilizando?</p><p className="mt-1 text-sm text-orange-900/70">Veja como abrir e acompanhar um chamado.</p></div><Button asChild variant="outline"><Link href="/tutorial"><BookOpen />Assistir tutorial</Link></Button></div>
    </section>
  </main>;
}
