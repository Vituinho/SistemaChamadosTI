import type { Metadata } from "next";
import Link from "next/link";
import { Headset, ShieldCheck } from "lucide-react";
import "./globals.css";
export const metadata: Metadata = { title: "Givova TI — Sistema de Chamados", description: "Central de suporte interno da Givova Transportes", referrer: "no-referrer" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>
    <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white/95 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
      <Link href="/" className="flex items-center gap-3" aria-label="Givova TI — início"><span className="rounded-xl bg-orange-600 p-2.5 text-white shadow-sm"><Headset size={23} /></span><span className="text-lg font-black tracking-tight sm:text-xl">GIVOVA <span className="text-orange-600">TI</span><span className="block text-[9px] font-bold tracking-[.2em] text-slate-500">TRANSPORTES • SUPORTE</span></span></Link>
      <nav aria-label="Navegação principal" className="flex items-center gap-1 sm:gap-2"><Link href="/chamado" className="nav-link">Novo chamado</Link><Link href="/tutorial" className="nav-link hidden sm:inline-flex">Tutorial</Link><Link href="/ti" className="nav-link"><ShieldCheck size={16} /> <span className="hidden min-[430px]:inline">Área da </span>TI</Link></nav>
    </div></header>{children}<footer className="border-t border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-5 py-7 text-center text-xs text-slate-500 sm:flex-row"><span>Givova Transportes · Central de suporte interno</span><span>Atendimento simples, seguro e rastreável</span></div></footer>
  </body></html>;
}
