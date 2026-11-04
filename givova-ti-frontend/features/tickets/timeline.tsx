import { MessageSquareText } from "lucide-react";
import type { HistoryEntry } from "@/lib/api/types";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { humanizeHistory, isNote } from "./meta";

/** Chronological history. Technician messages are highlighted as speech bubbles. */
export function Timeline({ entries, newestFirst = false }: { entries: HistoryEntry[]; newestFirst?: boolean }) {
  const items = newestFirst ? [...entries].reverse() : entries;
  if (!items.length) return <p className="text-sm text-slate-600">Sem registros ainda.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[7px] before:w-px before:bg-slate-200">
      {items.map(entry => {
        const note = isNote(entry);
        return (
          <li key={entry.id} className="relative pl-7">
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1.5 left-0 grid size-[15px] place-items-center rounded-full border-2 bg-white",
                note ? "border-brand-600" : "border-slate-300",
              )}
            >
              {note && <span className="size-1.5 rounded-full bg-brand-600" />}
            </span>
            <p className="text-xs text-slate-600">
              <time dateTime={entry.created_at} title={formatDateTime(entry.created_at)}>{formatDateTime(entry.created_at)}</time>
              <span className="text-slate-500"> · {formatRelative(entry.created_at)}</span>
            </p>
            {note ? (
              <div className="mt-1.5 rounded-xl rounded-tl-sm border border-brand-200 bg-brand-50 px-3.5 py-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-900">
                  <MessageSquareText className="size-3.5" aria-hidden="true" /> {entry.author ?? "TI"} escreveu
                </p>
                <p className="mt-1 text-sm leading-6 whitespace-pre-wrap break-words text-slate-900">{entry.message}</p>
              </div>
            ) : (
              <p className="mt-0.5 text-sm leading-6 whitespace-pre-wrap break-words text-slate-800">{humanizeHistory(entry.message)}</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
