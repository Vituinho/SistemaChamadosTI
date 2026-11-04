"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { Logo, LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/primitives";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import { ME_KEY } from "./use-workspace";

export function LoginScreen({ notice }: { notice?: string }) {
  const client = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const login = useMutation({
    mutationFn: () => api.login(username, password),
    onSuccess: technician => {
      setPassword("");
      client.removeQueries({ predicate: query => query.queryKey[0] !== "auth" && query.queryKey[0] !== "catalog" });
      client.setQueryData(ME_KEY, technician);
    },
  });

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(460px,0.9fr)]">
      <aside className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden="true" className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-brand-700/25 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <LogoMark className="size-10" />
          <span className="text-lg font-extrabold tracking-tight">Givova <span className="text-brand-400">TI</span></span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold tracking-tight text-balance">Central de atendimento da equipe de TI</h2>
          <p className="mt-4 leading-7 text-slate-300">Fila em tempo real, alertas de novos chamados, histórico completo e comunicação direta com os colaboradores.</p>
        </div>
        <p className="relative text-xs text-slate-400">Acesso restrito à equipe de Tecnologia da Informação.</p>
      </aside>

      <main className="flex flex-col px-4 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/" className="rounded-lg lg:invisible"><Logo subtitle="Área da TI" /><span className="sr-only"> — página inicial</span></Link>
          <Button asChild variant="ghost" size="sm"><Link href="/"><ArrowLeft /> Voltar ao site</Link></Button>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200"><ShieldCheck className="size-6" aria-hidden="true" /></span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">Entrar no painel</h1>
          <p className="mt-1.5 text-sm text-slate-600">Use seu usuário e senha da equipe de TI.</p>

          <form
            className="mt-8 space-y-5"
            onSubmit={event => {
              event.preventDefault();
              if (username.trim() && password) login.mutate();
            }}
          >
            {notice && !login.isError && <Alert tone="info">{notice}</Alert>}
            {login.isError && <Alert tone="error" role="alert">{errorMessage(login.error)}</Alert>}
            <Field id="login-username" label="Usuário">
              {props => <Input {...props} value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={80} required autoFocus />}
            </Field>
            <Field id="login-password" label="Senha">
              {props => (
                <div className="relative">
                  <Input {...props} type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" maxLength={256} required className="pr-11" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-1/2 right-1.5 -translate-y-1/2"
                    onClick={() => setShow(value => !value)}
                    aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={show}
                  >
                    {show ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              )}
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={login.isPending} disabled={!username.trim() || !password}>
              {!login.isPending && <LogIn />} Entrar
            </Button>
          </form>
          <p className="mt-6 text-xs leading-5 text-slate-600">Esqueceu a senha? Peça a outro técnico para redefini-la pelo terminal de administração da API.</p>
        </div>
      </main>
    </div>
  );
}
