"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ClipboardList, Link2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { formatRelative } from "@/lib/format";
import { parseTrackingLink, trackingPath } from "@/lib/tracking-link";
import { forgetTicket, listSavedTickets, type SavedTicket } from "./saved-tickets";

/** Tickets saved on this computer (localStorage). Renders nothing until hydrated. */
export function RecentTickets({ limit = 4, compact = false }: { limit?: number; compact?: boolean }) {
  const [items, setItems] = useState<SavedTicket[] | null>(null);
  useEffect(() => {
    // Read after hydration: localStorage is not available during static rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(listSavedTickets());
  }, []);
  if (!items?.length) return null;
  return (
    <section aria-labelledby="recent-title" className={compact ? "" : "rounded-xl border border-slate-200 bg-white p-5 shadow-card"}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="recent-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ClipboardList className="size-4 text-brand-700" aria-hidden="true" />
          Seus chamados neste computador
        </h2>
      </div>
      <ul className="mt-3 divide-y divide-slate-100">
        {items.slice(0, limit).map(item => (
          <li key={item.protocol} className="group flex items-center gap-2 py-2">
            <Link
              href={trackingPath(item.protocol, item.accessKey)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{item.title}</span>
                <span className="block text-xs text-slate-600">
                  <span className="font-mono">{item.protocol}</span> · aberto {formatRelative(item.createdAt)}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Remover ${item.protocol} deste computador`}
              title="Remover deste computador"
              onClick={() => {
                forgetTicket(item.protocol);
                setItems(listSavedTickets());
              }}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Lets an employee paste a saved tracking link (current or legacy format). */
export function PasteTrackingLink({ autoFocus }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      noValidate
      onSubmit={event => {
        event.preventDefault();
        const parsed = parseTrackingLink(value);
        if (!parsed) {
          setError("Link inválido. Cole o endereço completo recebido ao abrir o chamado, incluindo a parte depois de #.");
          return;
        }
        router.push(trackingPath(parsed.protocol, parsed.accessKey));
      }}
      className="space-y-2"
    >
      <Label htmlFor="tracking-link">Cole o link de acompanhamento</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          <Input
            id="tracking-link"
            value={value}
            autoFocus={autoFocus}
            onChange={event => {
              setValue(event.target.value);
              setError("");
            }}
            placeholder="https://…/acompanhar/?protocol=GV-000123#…"
            className="pl-9"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "tracking-link-error" : undefined}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" variant="secondary" className="h-11">Abrir</Button>
      </div>
      {error && <FieldError id="tracking-link-error">{error}</FieldError>}
    </form>
  );
}
