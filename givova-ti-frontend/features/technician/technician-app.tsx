"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, WifiOff } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api/endpoints";
import { errorMessage, isApiError } from "@/lib/api/client";
import type { Technician } from "@/lib/api/types";
import { LoginScreen } from "./login-screen";
import { ME_KEY } from "./use-workspace";
import { Workspace } from "./workspace";

/** Auth gate for /ti. The session is always validated by the API (cookie HttpOnly). */
export function TechnicianApp() {
  const client = useQueryClient();
  const me = useQuery<Technician | null>({
    queryKey: ME_KEY,
    queryFn: async ({ signal }) => {
      try {
        return await api.me(signal);
      } catch (error) {
        if (isApiError(error, 401)) return null;
        throw error;
      }
    },
    staleTime: Infinity,
    retry: 1,
  });

  // When a session ends while working (expiry/revocation), explain why the login appears.
  const [hadSession, setHadSession] = useState(false);
  const expired = hadSession && me.data === null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (me.data) setHadSession(true);
    if (me.data === null) client.removeQueries({ predicate: query => query.queryKey[0] !== "auth" && query.queryKey[0] !== "catalog" });
  }, [me.data, client]);

  if (me.isPending) return <WorkspaceSkeleton />;
  if (me.isError) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <div className="max-w-sm text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-50 text-amber-700"><WifiOff className="size-6" aria-hidden="true" /></span>
          <h1 className="mt-4 text-xl font-semibold text-slate-950">Não foi possível conectar</h1>
          <p className="mt-2 text-sm text-slate-600">{errorMessage(me.error)}</p>
          <Button className="mt-5" variant="outline" onClick={() => me.refetch()} loading={me.isFetching}><RefreshCw /> Tentar novamente</Button>
        </div>
      </main>
    );
  }
  if (!me.data) return <LoginScreen notice={expired ? "Sua sessão terminou. Entre novamente para continuar." : undefined} />;
  return <Workspace technician={me.data} />;
}

function WorkspaceSkeleton() {
  return (
    <div role="status" aria-label="Carregando painel" className="min-h-dvh">
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-6"><LogoMark /><Skeleton className="h-5 w-32" /></div>
      <div className="mx-auto max-w-[1600px] space-y-5 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
        <div className="grid gap-5 lg:grid-cols-[440px_1fr]"><Skeleton className="h-[60vh] rounded-xl" /><Skeleton className="hidden h-[60vh] rounded-xl lg:block" /></div>
      </div>
    </div>
  );
}
