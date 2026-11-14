import Link from "next/link";
import { ArrowRight, BellRing, CircleCheckBig, Clock3, PlayCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORY_HINTS } from "@/features/new-ticket/suggestions";
import { PasteTrackingLink, RecentTickets } from "@/features/tracking/recent-tickets";

const shortcuts = ["Computador", "Internet", "Impressora", "Sistema", "Acesso / Senha", "E-mail", "DBFrete", "Outro"];

const steps = [
  { icon: Send, title: "Conte o problema", text: "Escolha o tipo e use uma sugestão pronta. Leva menos de um minuto." },
  { icon: BellRing, title: "A TI é avisada na hora", text: "Seu pedido entra na fila e os técnicos recebem um alerta." },
  { icon: CircleCheckBig, title: "Acompanhe até resolver", text: "Veja quem está atendendo, mensagens da TI e a solução aplicada." },
];

export default function Home() {
  return (
    <>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center lg:py-16">
          <div className="animate-slide-up">
            <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200">
              <Clock3 className="size-3.5" aria-hidden="true" /> Atendimento interno da TI
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-extrabold tracking-tight text-balance text-slate-950 sm:text-5xl">
              Precisa de ajuda com tecnologia?
            </h1>
            <p className="mt-4 max-w-lg text-lg leading-8 text-slate-600">
              Abra um chamado em poucos cliques e acompanhe cada etapa até a solução, sem precisar ligar ou procurar ninguém.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="xl">
                <Link href="/chamado/">
                  Abrir chamado <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <Link href="/tutorial/">
                  <PlayCircle /> Ver como funciona
                </Link>
              </Button>
            </div>
          </div>
          <div className="space-y-4">
            <RecentTickets />
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5">
              <h2 className="text-sm font-semibold text-slate-900">Já abriu um chamado?</h2>
              <p className="mt-1 mb-3 text-sm text-slate-600">Use o link recebido para ver o andamento.</p>
              <PasteTrackingLink />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="atalhos" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="atalhos" className="text-xl font-bold tracking-tight text-slate-950">Com o que você precisa de ajuda?</h2>
            <p className="mt-1 text-sm text-slate-600">Escolha um atalho para começar o chamado já com o tipo certo.</p>
          </div>
        </div>
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {shortcuts.map(category => {
            const hint = CATEGORY_HINTS[category];
            const Icon = hint.icon;
            return (
              <li key={category}>
                <Link
                  href={`/chamado/?categoria=${encodeURIComponent(category)}`}
                  className="group flex h-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-raised"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-700 group-hover:text-white">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900">{hint.label ?? category}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-600">{hint.hint}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="como-funciona" className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 id="como-funciona" className="text-xl font-bold tracking-tight text-slate-950">Como funciona</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">{index + 1}</span>
                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                    <step.icon className="size-4 text-brand-700" aria-hidden="true" /> {step.title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
