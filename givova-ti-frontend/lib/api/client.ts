import { API_BASE } from "@/lib/env";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields: string[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const OFFLINE_MESSAGE = "Não conseguimos falar com a TI agora. Confira sua conexão e tente novamente.";

const FALLBACK: Record<number, string> = {
  401: "Sua sessão expirou. Entre novamente.",
  403: "Acesso não permitido.",
  404: "Não encontramos o que você procurou.",
  409: "Outra pessoa alterou este chamado. Os dados foram atualizados.",
  413: "O arquivo é grande demais.",
  422: "Confira os campos destacados.",
  429: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  502: "A TI está temporariamente indisponível. Tente novamente em instantes.",
  503: "A TI está temporariamente indisponível. Tente novamente em instantes.",
  504: "O servidor demorou para responder. Tente novamente.",
};

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH";
  json?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** fetch wrapper: credentials for the session cookie, timeouts and PT-BR errors from { detail }. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  let body: BodyInit | undefined;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(timeout.aborted ? FALLBACK[504] : OFFLINE_MESSAGE, 0);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: unknown; fields?: unknown } | null;
    const detail = typeof payload?.detail === "string" ? payload.detail : FALLBACK[response.status] ?? "Não foi possível concluir. Tente novamente.";
    const fields = Array.isArray(payload?.fields) ? payload.fields.filter((f): f is string => typeof f === "string") : [];
    throw new ApiError(detail, response.status, fields);
  }
  return (await response.json()) as T;
}

/** Downloads a protected binary (attachment) and returns an object URL the caller must revoke. */
export async function requestBlobUrl(path: string, headers: Record<string, string> = {}, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include", cache: "no-store", headers, signal });
  if (!response.ok) throw new ApiError(FALLBACK[response.status] ?? "Falha ao carregar o anexo.", response.status);
  return URL.createObjectURL(await response.blob());
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status === undefined || error.status === status);
}

export function errorMessage(error: unknown, fallback = "Não foi possível concluir. Tente novamente."): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
