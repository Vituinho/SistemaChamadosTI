import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ClipboardCheck, Link2, MousePointerClick, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { TUTORIAL_VIDEO_URL, TUTORIAL_YOUTUBE_URL } from "@/lib/env";
import { youtubeEmbedUrl } from "@/lib/youtube";

export const metadata: Metadata = { title: "Como abrir um chamado" };

const steps = [
  { icon: MousePointerClick, title: "Escolha o problema", text: "Toque no tipo (Internet, Impressora, Sistema…) e em uma sugestão pronta." },
  { icon: UserRound, title: "Confirme seus dados", text: "Nome, setor e onde você está. Na próxima vez eles já aparecem preenchidos." },
  { icon: ClipboardCheck, title: "Envie", text: "Você recebe o protocolo na hora e a TI é avisada imediatamente." },
  { icon: Link2, title: "Acompanhe", text: "A página mostra quem está atendendo, mensagens da TI e a solução." },
];

export default function TutorialPage() {
  const embed = youtubeEmbedUrl(TUTORIAL_YOUTUBE_URL);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="max-w-2xl">
        <p className="text-sm font-semibold text-brand-700">Ajuda rápida</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Como abrir um chamado</h1>
        <p className="mt-2 text-lg text-slate-600">Veja em menos de dois minutos como pedir ajuda para a TI e acompanhar o atendimento.</p>
      </header>
      <Card className="mt-8 overflow-hidden bg-slate-950">
        <div className="aspect-video">
          {embed ? (
            <iframe
              className="size-full"
              src={embed}
              title="Vídeo: como abrir um chamado"
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <video className="size-full" controls playsInline preload="metadata" aria-label="Vídeo: como abrir um chamado">
              <source src={TUTORIAL_VIDEO_URL} type="video/mp4" />
              Seu navegador não reproduz este vídeo. Siga os passos abaixo.
            </video>
          )}
        </div>
      </Card>
      <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Card className="h-full p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-700"><step.icon className="size-5" aria-hidden="true" /></span>
                <span className="text-xs font-semibold text-slate-500">Passo {index + 1}</span>
              </div>
              <h2 className="mt-3 font-semibold text-slate-950">{step.title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">{step.text}</p>
            </Card>
          </li>
        ))}
      </ol>
      <Button asChild size="xl" className="mt-8">
        <Link href="/chamado/">Abrir meu chamado <ArrowRight /></Link>
      </Button>
    </div>
  );
}
