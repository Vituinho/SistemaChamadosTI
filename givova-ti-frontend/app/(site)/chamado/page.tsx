import { Suspense } from "react";
import type { Metadata } from "next";
import { NewTicketForm } from "@/features/new-ticket/new-ticket-form";
import { Skeleton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Abrir chamado" };

export default function NewTicketPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <p className="text-sm font-semibold text-brand-700">Novo chamado</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Chame a equipe de TI</h1>
        <p className="mt-2 text-base leading-7 text-slate-600">Escolha o tipo de problema, confirme seus dados e envie. Leva menos de um minuto.</p>
      </header>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <NewTicketForm />
      </Suspense>
    </div>
  );
}
