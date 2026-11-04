import type { HistoryEntry, Priority, Status, TicketSummary } from "@/lib/api/types";

export const STATUS_META: Record<Status, { label: string; tone: string; dot: string; description: string }> = {
  NOVO: { label: "Novo", tone: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500", description: "Aguardando a TI assumir" },
  EM_ATENDIMENTO: { label: "Em atendimento", tone: "bg-violet-50 text-violet-800 ring-violet-200", dot: "bg-violet-500", description: "Um técnico está cuidando" },
  AGUARDANDO_USUARIO: { label: "Aguardando colaborador", tone: "bg-amber-50 text-amber-900 ring-amber-200", dot: "bg-amber-500", description: "A TI precisa de um retorno" },
  AGUARDANDO_TERCEIRO: { label: "Aguardando fornecedor", tone: "bg-amber-50 text-amber-900 ring-amber-200", dot: "bg-amber-500", description: "Depende de um terceiro" },
  RESOLVIDO: { label: "Resolvido", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500", description: "Atendimento concluído" },
  CANCELADO: { label: "Cancelado", tone: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-400", description: "Pedido cancelado" },
};

export const PRIORITY_META: Record<Priority, { label: string; tone: string; bars: number }> = {
  URGENTE: { label: "Urgente", tone: "bg-red-50 text-red-800 ring-red-200", bars: 4 },
  ALTA: { label: "Alta", tone: "bg-orange-50 text-orange-900 ring-orange-200", bars: 3 },
  NORMAL: { label: "Normal", tone: "bg-slate-50 text-slate-700 ring-slate-200", bars: 2 },
  BAIXA: { label: "Baixa", tone: "bg-white text-slate-600 ring-slate-200", bars: 1 },
};

export const OPEN_STATUSES: Status[] = ["NOVO", "EM_ATENDIMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_TERCEIRO"];
export const isClosed = (status: Status) => status === "RESOLVIDO" || status === "CANCELADO";

/** Legacy display names stored in the database. */
export function displayDepartment(value: string) {
  return value === "Juridico" ? "Jurídico" : value;
}

const CODE_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(STATUS_META).map(([code, meta]) => [code, meta.label])),
  ...Object.fromEntries(Object.entries(PRIORITY_META).map(([code, meta]) => [code, meta.label])),
};

/** History messages contain technical codes (e.g. "status NOVO → EM_ATENDIMENTO"); show friendly labels. */
export function humanizeHistory(message: string): string {
  return message.replace(/\b(AGUARDANDO_USUARIO|AGUARDANDO_TERCEIRO|EM_ATENDIMENTO|RESOLVIDO|CANCELADO|NOVO|URGENTE|NORMAL|BAIXA|ALTA)\b/g, code => CODE_LABELS[code] ?? code);
}

export function isNote(entry: HistoryEntry) {
  return entry.kind === "note";
}

const DEFAULT_SLA: Record<Priority, number> = { URGENTE: 15, ALTA: 30, NORMAL: 120, BAIXA: 480 };

/** A new ticket waiting longer than the first-response target for its priority. */
export function isOverdue(ticket: Pick<TicketSummary, "status" | "priority" | "created_at">, sla: Record<Priority, number> | undefined, now = Date.now()) {
  if (ticket.status !== "NOVO") return false;
  const limit = (sla ?? DEFAULT_SLA)[ticket.priority] ?? DEFAULT_SLA.NORMAL;
  return now - new Date(ticket.created_at).getTime() > limit * 60_000;
}

/** Employee-facing headline per status. */
export function employeeHeadline(status: Status, technician: string | null): { title: string; text: string } {
  switch (status) {
    case "NOVO":
      return { title: "A TI recebeu seu pedido", text: "A equipe foi avisada. Não é preciso abrir outro chamado — esta página atualiza sozinha." };
    case "EM_ATENDIMENTO":
      return { title: "A TI está indo até você!", text: technician ? `${technician} assumiu seu chamado e já está cuidando do problema.` : "Um técnico assumiu seu chamado." };
    case "AGUARDANDO_USUARIO":
      return { title: "A TI precisa de um retorno seu", text: "Veja a mensagem da TI abaixo ou procure o técnico responsável." };
    case "AGUARDANDO_TERCEIRO":
      return { title: "Aguardando um fornecedor", text: "A solução depende de um serviço externo. Avisaremos aqui assim que houver novidade." };
    case "RESOLVIDO":
      return { title: "Problema resolvido", text: "Confira abaixo o que foi feito. Se voltar a acontecer, abra um novo chamado." };
    case "CANCELADO":
      return { title: "Chamado cancelado", text: "Este pedido foi encerrado sem atendimento. Se ainda precisar de ajuda, abra um novo chamado." };
  }
}
