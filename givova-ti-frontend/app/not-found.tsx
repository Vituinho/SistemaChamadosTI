import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <Link href="/" className="inline-flex rounded-lg"><Logo /><span className="sr-only"> — página inicial</span></Link>
        <span className="mx-auto mt-10 grid size-14 place-items-center rounded-full bg-slate-100 text-slate-600">
          <Compass className="size-7" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-2xl font-bold text-slate-950">Página não encontrada</h1>
        <p className="mt-2 text-slate-600">O endereço pode estar incompleto. Se você procura um chamado, use o link completo recebido ao abri-lo.</p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild><Link href="/chamado/">Abrir chamado</Link></Button>
          <Button asChild variant="outline"><Link href="/">Página inicial</Link></Button>
        </div>
      </div>
    </main>
  );
}
