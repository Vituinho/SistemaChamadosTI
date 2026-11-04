"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusCircle, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/acompanhar/", match: "/acompanhar", label: "Acompanhar" },
  { href: "/tutorial/", match: "/tutorial", label: "Como funciona" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <a href="#conteudo" className="sr-only rounded-md bg-white px-3 py-2 font-semibold focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50">
        Pular para o conteúdo
      </a>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Givova TI — página inicial" className="rounded-lg">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-1">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname.startsWith(link.match) ? "page" : undefined}
              className={cn(
                "hidden rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 md:inline-flex",
                pathname.startsWith(link.match) && "bg-slate-100 text-slate-900",
              )}
            >
              {link.label}
            </Link>
          ))}
          <Button asChild variant="ghost" size="sm" className="h-9 text-slate-600">
            <Link href="/ti/">
              <ShieldCheck />
              <span className="hidden sm:inline">Área da TI</span>
              <span className="sm:hidden">TI</span>
            </Link>
          </Button>
          {!pathname.startsWith("/chamado") && (
            <Button asChild size="sm" className="ml-1 h-9">
              <Link href="/chamado/">
                <PlusCircle />
                <span>Abrir chamado</span>
              </Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Givova Transportes · Tecnologia da Informação</p>
        <p>Suporte interno — seus dados são usados apenas para o atendimento.</p>
      </div>
    </footer>
  );
}
