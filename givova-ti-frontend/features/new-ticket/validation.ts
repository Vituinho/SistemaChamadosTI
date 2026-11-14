/** Client-side validation mirroring the API rules (the API remains the authority). */
export interface TicketDraft {
  name: string;
  department: string;
  state: string;
  location: string;
  category: string;
  affected_system: string;
  title: string;
  description: string;
  attachment: File | null;
}

export type DraftErrors = Partial<Record<keyof TicketDraft, string>>;

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGES = ["image/png", "image/jpeg", "image/webp"];

export const emptyDraft = (): TicketDraft => ({
  name: "", department: "", state: "", location: "", category: "", affected_system: "", title: "", description: "", attachment: null,
});

export function validateDraft(draft: TicketDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.category) errors.category = "Escolha com o que você precisa de ajuda.";
  if (draft.category === "Sistema" && !draft.affected_system) errors.affected_system = "Escolha qual sistema está com problema.";
  const title = draft.title.trim();
  if (title.length < 3) errors.title = "Escolha uma sugestão ou conte em poucas palavras o que aconteceu.";
  else if (title.length > 160) errors.title = "Use no máximo 160 caracteres. Detalhes podem ir na descrição.";
  if (draft.description.length > 5000) errors.description = "A descrição pode ter até 5000 caracteres.";
  if (draft.attachment) {
    if (!ACCEPTED_IMAGES.includes(draft.attachment.type)) errors.attachment = "Envie uma imagem PNG, JPG ou WEBP.";
    else if (draft.attachment.size > MAX_ATTACHMENT_BYTES) errors.attachment = "A imagem deve ter até 5 MB. Envie outra ou continue sem imagem.";
  }
  const name = draft.name.trim();
  if (name.length < 2) errors.name = "Digite seu nome para a TI saber quem precisa de ajuda.";
  else if (name.length > 120) errors.name = "Use no máximo 120 caracteres.";
  if (!draft.department) errors.department = "Escolha seu setor.";
  if (!draft.state) errors.state = "Escolha o estado onde você está.";
  const location = draft.location.trim();
  if (location.length < 2) errors.location = "Diga onde você está para a TI encontrar você.";
  else if (location.length > 160) errors.location = "Use no máximo 160 caracteres.";
  return errors;
}

/** Order used for the error summary and to focus the first invalid field. */
export const FIELD_ORDER: (keyof TicketDraft)[] = ["category", "affected_system", "title", "description", "attachment", "name", "department", "state", "location"];

export function toFormData(draft: TicketDraft): FormData {
  const form = new FormData();
  form.set("name", draft.name.trim());
  form.set("department", draft.department);
  form.set("state", draft.state);
  form.set("location", draft.location.trim());
  form.set("category", draft.category);
  if (draft.category === "Sistema" && draft.affected_system) form.set("affected_system", draft.affected_system);
  form.set("title", draft.title.trim());
  form.set("description", draft.description.trim());
  if (draft.attachment) form.set("attachment", draft.attachment, draft.attachment.name || "imagem");
  return form;
}
