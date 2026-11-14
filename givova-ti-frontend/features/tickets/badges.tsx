import { AlarmClock } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import type { Priority, Status } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { PRIORITY_META, STATUS_META } from "./meta";

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge className={cn(meta.tone, className)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

export function PriorityBadge({ priority, className, hideNormal }: { priority: Priority; className?: string; hideNormal?: boolean }) {
  const meta = PRIORITY_META[priority];
  if (hideNormal && priority === "NORMAL") return null;
  return (
    <Badge className={cn(meta.tone, className)} title={`Prioridade ${meta.label.toLowerCase()}`}>
      <span className="flex h-3 items-end gap-px" aria-hidden="true">
        {[1, 2, 3, 4].map(level => (
          <span key={level} className={cn("w-[3px] rounded-[1px]", level <= meta.bars ? "bg-current" : "bg-current/25")} style={{ height: `${level * 3}px` }} />
        ))}
      </span>
      <span>
        <span className="sr-only">Prioridade </span>
        {meta.label}
      </span>
    </Badge>
  );
}

export function OverdueBadge() {
  return (
    <Badge className="bg-red-700 text-white ring-red-700" title="Passou do tempo esperado para o primeiro atendimento">
      <AlarmClock className="size-3.5" aria-hidden="true" /> Atrasado
    </Badge>
  );
}
