import Link from "next/link";
import { ArrowRight, CheckCircle2, PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { youtubeEmbedUrl } from "@/lib/youtube";

export default function Tutorial() {
  const embed = youtubeEmbedUrl(process.env.NEXT_PUBLIC_TUTORIAL_YOUTUBE_URL);
  const videoSrc = process.env.NEXT_PUBLIC_TUTORIAL_VIDEO_URL || "/tutorial.mp4";

  return <main className="mx-auto max-w-5xl px-5 py-10 sm:px-6 sm:py-14">
    <header className="max-w-3xl"><p className="eyebrow">Ajuda rápida</p><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Como abrir um chamado</h1><p className="mt-4 text-lg text-slate-600">Veja como solicitar atendimento da equipe de TI.</p></header>
    <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-lg">
      {embed ? (
        <div className="aspect-video">
          <iframe className="size-full" src={embed} title="Tutorial: como abrir um chamado" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      ) : videoSrc ? (
        <div className="aspect-video bg-black flex items-center justify-center">
          <video
            className="size-full rounded-2xl"
            controls
            playsInline
            preload="metadata"
          >
            <source src={videoSrc} type="video/mp4" />
            Seu navegador não suporta a reprodução deste vídeo.
          </video>
        </div>
      ) : (
        <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center text-white">
          <PlayCircle className="size-12 text-orange-500" />
          <h2 className="mt-4 text-xl font-bold">Tutorial em vídeo em breve</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">Enquanto isso, siga os passos abaixo. Abrir um chamado leva menos de dois minutos.</p>
        </div>
      )}
    </section>
    <section className="mt-8 grid gap-4 md:grid-cols-3">{["Informe seu nome, setor e localização.", "Escolha a categoria e explique o problema.", "Envie e guarde o link do protocolo."].map((step, index) => <div key={step} className="card flex gap-4"><CheckCircle2 className="mt-0.5 size-6 shrink-0 text-orange-600" /><div><p className="text-xs font-bold text-slate-400">PASSO {index + 1}</p><p className="mt-1 font-semibold leading-6">{step}</p></div></div>)}</section>
    <Button asChild className="mt-8 min-h-14"><Link href="/chamado">Abrir meu chamado <ArrowRight /></Link></Button>
  </main>;
}
