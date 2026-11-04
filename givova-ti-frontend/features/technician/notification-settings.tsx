"use client";

import { useState } from "react";
import { Bell, BellOff, BellRing, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { disablePush, enablePush, type PushState } from "./notifications";

const PUSH_TEXT: Record<PushState, string> = {
  on: "Ativas neste computador — chegam mesmo com o painel fechado.",
  off: "Desativadas neste computador.",
  denied: "Bloqueadas no navegador. Libere as notificações deste site nas configurações.",
  unsupported: "Este navegador não oferece notificações em segundo plano.",
  "server-disabled": "O servidor ainda não tem chaves de notificação configuradas.",
};

export function NotificationSettings({
  push, setPush, sound, onToggleSound, onTestSound,
}: {
  push: PushState | null;
  setPush: (state: PushState) => void;
  sound: boolean;
  onToggleSound: (enabled: boolean) => void;
  onTestSound: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const active = push === "on" || sound;

  async function togglePush(enabled: boolean) {
    setBusy(true);
    try {
      setPush(enabled ? await enablePush() : await disablePush());
      toast.success(enabled ? "Notificações do computador ativadas" : "Notificações do computador desativadas");
    } catch (error) {
      toast.error("Não foi possível alterar as notificações", { description: errorMessage(error) });
      if (typeof Notification !== "undefined" && Notification.permission === "denied") setPush("denied");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9">
          {active ? <BellRing className="text-brand-700" /> : <Bell />}
          <span className="sr-only md:not-sr-only">Notificações</span>
          {push !== "on" && <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] space-y-4">
        <div>
          <p className="font-semibold text-slate-950">Avisos de novos chamados</p>
          <p className="text-xs text-slate-600">Configuração válida apenas para este computador.</p>
        </div>
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-3">
            <label htmlFor="push-switch" className="text-sm font-medium text-slate-900">Notificações do Windows</label>
            <Switch
              id="push-switch"
              checked={push === "on"}
              disabled={busy || push === null || push === "unsupported"}
              onCheckedChange={value => void togglePush(value)}
            />
          </div>
          <p className={cn("text-xs", push === "on" ? "text-emerald-800" : "text-slate-600")}>{push ? PUSH_TEXT[push] : "Verificando…"}</p>
          {push === "on" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => api.pushTest().then(() => toast.success("Teste enviado", { description: "A notificação deve aparecer em alguns segundos." }), error => toast.error(errorMessage(error)))}
            >
              <BellRing /> Enviar teste
            </Button>
          )}
        </div>
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <div className="flex items-start justify-between gap-3">
            <label htmlFor="sound-switch" className="text-sm font-medium text-slate-900">Som no painel</label>
            <Switch id="sound-switch" checked={sound} onCheckedChange={onToggleSound} />
          </div>
          <p className="text-xs text-slate-600">Toca um alerta enquanto esta aba estiver aberta.</p>
          {sound && (
            <Button variant="outline" size="sm" onClick={onTestSound}>
              <Volume2 /> Testar som
            </Button>
          )}
        </div>
        {push === "denied" && (
          <p className="flex items-start gap-2 text-xs text-amber-900"><BellOff className="size-4 shrink-0" aria-hidden="true" /> Clique no cadeado ao lado do endereço do site para permitir notificações.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
