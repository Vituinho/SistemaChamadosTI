"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MapPin, Pencil, Send, Sparkles, UserRound, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card, Skeleton } from "@/components/ui/primitives";
import { Checkbox } from "@/components/ui/switch";
import { api } from "@/lib/api/endpoints";
import { errorMessage } from "@/lib/api/client";
import { forgetThisDevice, grantDeviceConsent, hasDeviceConsent } from "@/lib/device-memory";
import { trackingPath } from "@/lib/tracking-link";
import { cn } from "@/lib/utils";
import { displayDepartment } from "@/features/tickets/meta";
import { saveTicket } from "@/features/tracking/saved-tickets";
import { AttachmentField } from "./attachment-field";
import { ChoiceTiles } from "./choice-tiles";
import { loadRequester, saveRequester } from "./requester";
import { CATEGORY_HINTS, categoryHint, isSuggestion } from "./suggestions";
import { emptyDraft, FIELD_ORDER, toFormData, validateDraft, type DraftErrors, type TicketDraft } from "./validation";

export const JUST_CREATED_KEY = "givova.justCreated";

const FIELD_LABELS: Record<keyof TicketDraft, string> = {
  category: "Tipo de problema", affected_system: "Sistema afetado", title: "Resumo", description: "Descrição",
  attachment: "Imagem", name: "Nome", department: "Setor", state: "Estado", location: "Onde você está",
};

function fieldAnchor(field: keyof TicketDraft) {
  return field === "category" || field === "affected_system" || field === "department" ? `group-${field}` : `field-${field}`;
}

export function NewTicketForm() {
  const router = useRouter();
  const params = useSearchParams();
  const catalog = useQuery({ queryKey: ["catalog"], queryFn: ({ signal }) => api.catalog(signal), staleTime: Infinity });
  const [draft, setDraft] = useState<TicketDraft>(emptyDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [attempted, setAttempted] = useState(false);
  // Opt-in: shared computers must not keep anyone's data by default.
  const [remember, setRemember] = useState(false);
  const [editingRequester, setEditingRequester] = useState(true);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Restore remembered requester details and an optional ?categoria= shortcut after hydration.
  const categoryParam = params.get("categoria") ?? "";
  useEffect(() => {
    const saved = loadRequester();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRemember(hasDeviceConsent());
    setDraft(current => ({ ...current, ...(saved ?? {}), category: CATEGORY_HINTS[categoryParam] ? categoryParam : current.category }));
    if (saved?.name && saved.department && saved.state && saved.location) setEditingRequester(false);
  }, [categoryParam]);

  // Drop catalog values that no longer exist (e.g. remembered department renamed).
  const data = catalog.data;
  const validDraft = useMemo(() => {
    if (!data) return draft;
    return {
      ...draft,
      department: data.departments.includes(draft.department) ? draft.department : "",
      state: data.states.includes(draft.state) ? draft.state : "",
      category: data.categories.includes(draft.category) ? draft.category : "",
    };
  }, [data, draft]);

  const update = <K extends keyof TicketDraft>(key: K, value: TicketDraft[K]) => {
    const next = { ...validDraft, [key]: value };
    if (key === "category") {
      if (value !== "Sistema") next.affected_system = "";
      if (isSuggestion(validDraft.title)) next.title = "";
    }
    setDraft(next);
    if (attempted) setErrors(validateDraft(next));
  };

  const mutation = useMutation({
    mutationFn: (value: TicketDraft) => api.createTicket(toFormData(value)),
    onSuccess: (ticket, value) => {
      if (remember) {
        grantDeviceConsent();
        saveRequester({ name: value.name.trim(), department: value.department, state: value.state, location: value.location.trim() });
        saveTicket({ protocol: ticket.protocol, accessKey: ticket.access_key, title: ticket.title, createdAt: ticket.created_at });
      } else {
        // Unticked: wipe anything previously remembered on this computer.
        forgetThisDevice();
      }
      try {
        sessionStorage.setItem(JUST_CREATED_KEY, ticket.protocol);
      } catch {
        // optional confirmation banner only
      }
      router.push(trackingPath(ticket.protocol, ticket.access_key));
    },
    onError: () => requestAnimationFrame(() => summaryRef.current?.focus()),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    setAttempted(true);
    const found = validateDraft(validDraft);
    setErrors(found);
    const first = FIELD_ORDER.find(field => found[field]);
    if (first) {
      if (["name", "department", "state", "location"].includes(first)) setEditingRequester(true);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    mutation.mutate(validDraft);
  }

  // Paste a screenshot anywhere on the page (Ctrl+V).
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.files ?? [])].find(item => item.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      const named = new File([file], file.name && file.name !== "image.png" ? file.name : `print-${Date.now()}.png`, { type: file.type });
      setDraft(current => ({ ...current, attachment: named }));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  if (catalog.isPending) return <FormSkeleton />;
  if (catalog.isError || !data) {
    return (
      <Alert
        tone="error"
        title="Não conseguimos carregar o formulário"
        action={<Button variant="outline" onClick={() => catalog.refetch()} loading={catalog.isFetching}>Tentar novamente</Button>}
      >
        {errorMessage(catalog.error)}
      </Alert>
    );
  }

  const errorList = FIELD_ORDER.filter(field => errors[field]);
  const hint = categoryHint(validDraft.category);
  const requesterComplete = validDraft.name && validDraft.department && validDraft.state && validDraft.location;

  return (
    <form onSubmit={submit} noValidate className="space-y-6" aria-describedby="form-help">
      <p id="form-help" className="sr-only">Campos obrigatórios: tipo de problema, resumo, nome, setor, estado e onde você está.</p>
      <div ref={summaryRef} tabIndex={-1} className="focus:outline-none" aria-live="assertive">
        {(attempted && errorList.length > 0) && (
          <Alert tone="error" title={errorList.length === 1 ? "Falta 1 informação" : `Faltam ${errorList.length} informações`}>
            <ul className="list-disc space-y-0.5 pl-4">
              {errorList.map(field => (
                <li key={field}>
                  <a className="underline underline-offset-2" href={`#${fieldAnchor(field)}`}>{FIELD_LABELS[field]}</a>: {errors[field]}
                </li>
              ))}
            </ul>
          </Alert>
        )}
        {mutation.isError && (
          <Alert tone="error" title="Não foi possível enviar o chamado">
            {errorMessage(mutation.error)} Seus dados continuam preenchidos.
          </Alert>
        )}
      </div>

      <fieldset disabled={mutation.isPending} className="min-w-0 space-y-6">
        <Card className="space-y-6 p-5 sm:p-7">
          <StepTitle step={1} title="O que está acontecendo?" />
          <div id="group-category">
            <ChoiceTiles
              name="category"
              legend="Escolha o tipo de problema"
              value={validDraft.category}
              onChange={value => update("category", value)}
              error={errors.category}
              columns="grid-cols-2 lg:grid-cols-3"
              choices={data.categories.map(category => {
                const h = categoryHint(category);
                return { value: category, label: h.label ?? category, hint: h.hint, icon: h.icon };
              })}
            />
          </div>

          {validDraft.category === "Sistema" && (
            <div id="group-affected_system" className="animate-slide-up rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <ChoiceTiles
                name="affected_system"
                legend="Qual sistema?"
                value={validDraft.affected_system}
                onChange={value => update("affected_system", value)}
                error={errors.affected_system}
                size="sm"
                choices={data.systems.map(system => ({ value: system, label: system }))}
              />
            </div>
          )}

          {validDraft.category && (
            <div className="animate-slide-up space-y-4">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <Sparkles className="size-4 text-brand-700" aria-hidden="true" /> Sugestões rápidas
                </p>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Sugestões de resumo">
                  {hint.examples.map(example => {
                    const active = validDraft.title === example;
                    return (
                      <button
                        key={example}
                        type="button"
                        aria-pressed={active}
                        onClick={() => update("title", example)}
                        className={cn(
                          "rounded-full border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
                          active ? "border-brand-700 bg-brand-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:border-brand-400 hover:bg-brand-50",
                        )}
                      >
                        {example}
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field id="field-title" label="Resumo do problema" hint="Uma frase curta já basta." error={errors.title}>
                {props => (
                  <Input {...props} value={validDraft.title} maxLength={160} onChange={e => update("title", e.target.value)} placeholder="Ex.: meu computador não liga" autoComplete="off" />
                )}
              </Field>
              <Field id="field-description" label="Mais detalhes" optional error={errors.description}>
                {props => (
                  <Textarea
                    {...props}
                    rows={3}
                    maxLength={5000}
                    value={validDraft.description}
                    onChange={e => update("description", e.target.value)}
                    placeholder="Se quiser, conte quando começou, mensagens de erro, etc."
                  />
                )}
              </Field>
              <div id="field-attachment">
                <AttachmentField file={validDraft.attachment} onChange={file => update("attachment", file)} error={errors.attachment} />
              </div>
            </div>
          )}
        </Card>

        <Card className="space-y-5 p-5 sm:p-7">
          <StepTitle step={2} title="Quem precisa de ajuda?" />
          {!editingRequester && requesterComplete ? (
            <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-900 text-white"><UserRound className="size-5" aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{validDraft.name}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-sm text-slate-600">
                  {displayDepartment(validDraft.department)} · {validDraft.state}
                  <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" aria-hidden="true" />{validDraft.location}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditingRequester(true)}>
                  <Pencil /> Alterar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    forgetThisDevice();
                    setRemember(false);
                    setDraft(current => ({ ...current, name: "", department: "", state: "", location: "" }));
                    setEditingRequester(true);
                  }}
                >
                  <UserX /> Não sou eu
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-6">
              <Field id="field-name" label="Seu nome" error={errors.name} className="sm:col-span-4">
                {props => <Input {...props} value={validDraft.name} maxLength={120} autoComplete={remember ? "name" : "off"} onChange={e => update("name", e.target.value)} placeholder="Nome e sobrenome" />}
              </Field>
              <Field id="field-state" label="Estado" error={errors.state} className="sm:col-span-2">
                {props => (
                  <Select {...props} value={validDraft.state} onChange={e => update("state", e.target.value)}>
                    <option value="">Selecione</option>
                    {data.states.map(state => <option key={state} value={state}>{state}</option>)}
                  </Select>
                )}
              </Field>
              <div id="group-department" className="sm:col-span-6">
                <ChoiceTiles
                  name="department"
                  legend="Seu setor"
                  value={validDraft.department}
                  onChange={value => update("department", value)}
                  error={errors.department}
                  size="sm"
                  choices={data.departments.map(department => ({ value: department, label: displayDepartment(department) }))}
                />
              </div>
              <Field id="field-location" label="Onde você está?" hint="Sala, unidade ou ponto de referência para a TI encontrar você." error={errors.location} className="sm:col-span-6">
                {props => <Input {...props} value={validDraft.location} maxLength={160} onChange={e => update("location", e.target.value)} placeholder="Ex.: sala do Financeiro, 2º andar" />}
              </Field>
            </div>
          )}
          <label className="flex items-start gap-3 text-sm text-slate-700">
            <Checkbox checked={remember} onCheckedChange={value => setRemember(value === true)} className="mt-0.5" aria-describedby="remember-hint" />
            <span>
              Lembrar meus dados e chamados neste computador
              <span id="remember-hint" className="block text-xs text-slate-600">
                Marque somente se este computador é usado só por você. Em computadores compartilhados, deixe desmarcado: nada fica salvo.
              </span>
            </span>
          </label>
        </Card>

        <div className="space-y-3">
          <Button type="submit" size="xl" className="w-full text-base" loading={mutation.isPending}>
            {!mutation.isPending && <Send />}
            {mutation.isPending ? "Enviando para a TI…" : "Enviar chamado"}
          </Button>
          <p className="text-center text-sm text-slate-600" role="status">
            {mutation.isPending ? "Aguarde um instante. Estamos registrando seu pedido." : "Você recebe o protocolo na hora e pode acompanhar o atendimento."}
          </p>
        </div>
      </fieldset>
    </form>
  );
}

function StepTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white" aria-hidden="true">{step}</span>
      <h2 className="text-lg font-bold tracking-tight text-slate-950">
        <span className="sr-only">Etapa {step}: </span>
        {title}
      </h2>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div role="status" aria-label="Carregando formulário" className="space-y-6">
      <Card className="space-y-4 p-7">
        <Skeleton className="h-6 w-56" />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </Card>
      <Card className="space-y-4 p-7">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </Card>
    </div>
  );
}
