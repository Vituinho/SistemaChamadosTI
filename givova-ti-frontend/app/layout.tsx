import type { Metadata } from "next";
import Link from "next/link";
import { Headset, ArrowUpRight } from "lucide-react";
import "./globals.css";
export const metadata: Metadata = { title: "Givova TI — Sistema de Chamados", description: "Central de suporte interno da Givova Transportes", referrer: "no-referrer" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body>
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5">
      <Link href="/" className="flex items-center gap-3"><span className="rounded-xl bg-orange-600 p-2.5 text-white"><Headset size={24} /></span><span className="text-xl font-extrabold tracking-tight">GIVOVA <span className="text-orange-600">TI</span><span className="block text-[10px] font-semibold tracking-[.2em] text-slate-500">TRANSPORTES • SUPORTE</span></span></Link>
      <Link href="/ti" className="flex items-center gap-1 text-sm font-semibold text-slate-600">Área da TI <ArrowUpRight size={16} /></Link>
    </div></header>{children}<footer className="mx-auto max-w-7xl px-5 py-8 text-center text-xs text-slate-500">Givova Transportes · Central de suporte interno</footer>
  </body></html>;
}
