export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export type Catalog = { departments: string[]; categories: string[]; statuses: string[]; priorities: string[] };
export type Ticket = {
  id: number; protocol: string; name: string; department: string;
  category: string; title: string; description: string; status: string; priority: string;
  technician: string | null; created_at: string; assigned_at: string | null;
  resolved_at: string | null; solution: string | null; has_attachment: boolean;
  history: { id: number; message: string; created_at: string }[];
};
export type Dashboard = { new: number; active: number; pending: number; resolved_today: number; latest_id: number };
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...init, signal: init.signal ?? AbortSignal.timeout(20000), credentials: "include", cache: "no-store" });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ApiError("Não conseguimos falar com a TI agora. Confira sua conexão e tente novamente. Seus campos continuam preenchidos.", 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(typeof body.detail === "string" ? body.detail : "Não foi possível concluir. Tente novamente.", response.status);
  }
  return response.json();
}
export function json(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}
export const labels: Record<string, string> = {
  NOVO: "Novo", EM_ATENDIMENTO: "Em atendimento", AGUARDANDO_USUARIO: "Aguardando usuário",
  AGUARDANDO_TERCEIRO: "Aguardando terceiro", RESOLVIDO: "Resolvido", CANCELADO: "Cancelado",
  BAIXA: "Baixa", NORMAL: "Normal", ALTA: "Alta", URGENTE: "Urgente",
};
export function date(value: string) { return new Date(value).toLocaleString("pt-BR"); }
export function age(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes / 60)} h` : `${Math.floor(minutes / 1440)} dias`;
}
// Fetch-based SSE keeps tracking keys out of URLs and retries interrupted connections.
export function subscribe(path: string, onUpdate: () => void, onState: (online: boolean) => void, key?: string) {
  const controller = new AbortController();
  let retry: ReturnType<typeof setTimeout>;
  async function connect() {
    try {
      const response = await fetch(`${API}${path}`, { credentials: "include", signal: controller.signal,
        headers: key ? { "X-Ticket-Key": key } : {} });
      if (!response.ok || !response.body) throw new Error("stream");
      onState(true);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (event.includes("event: update") || event.includes("event: expired")) onUpdate();
        }
      }
    } catch { /* Reconnect unless unmounted. */ }
    if (!controller.signal.aborted) { onState(false); retry = setTimeout(connect, 3000); }
  }
  void connect();
  return () => { controller.abort(); clearTimeout(retry); };
}
