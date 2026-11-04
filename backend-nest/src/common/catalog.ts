/**
 * Business catalog shared by validation and the public /catalog contract.
 * Values are persisted as-is in PostgreSQL; never rename an existing entry
 * (it would orphan historical tickets). Add new entries at the end.
 */
export const DEPARTMENTS = ['Faturamento', 'Financeiro', 'Logística', 'Juridico', 'Departamento Pessoal', 'Monitoramento'] as const;
export const CATEGORIES = [
  'Computador', 'Internet', 'Impressora', 'Sistema', 'E-mail', 'Acesso / Senha', 'WhatsApp',
  'Telefone / Celular', 'Equipamento', 'DBFrete', 'Fretebrás', 'Outro',
] as const;
export const SYSTEMS = ['DBFrete', 'Frete Brás', 'E-mail / Outlook', 'WhatsApp', 'Sistema interno', 'Outro sistema'] as const;
export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;
export const STATUSES = ['NOVO', 'EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'AGUARDANDO_TERCEIRO', 'RESOLVIDO', 'CANCELADO'] as const;
export const PRIORITIES = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const;

export type Status = (typeof STATUSES)[number];
export type Priority = (typeof PRIORITIES)[number];

export const OPEN_STATUSES: readonly Status[] = ['NOVO', 'EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'AGUARDANDO_TERCEIRO'];
export const WAITING_STATUSES: readonly Status[] = ['AGUARDANDO_USUARIO', 'AGUARDANDO_TERCEIRO'];
export const CLOSED_STATUSES: readonly Status[] = ['RESOLVIDO', 'CANCELADO'];
export const RESOLVABLE_STATUSES: readonly Status[] = ['EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'AGUARDANDO_TERCEIRO'];

/** Status changes allowed through PATCH. Assign and resolve have dedicated actions. */
export const TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  NOVO: ['CANCELADO'],
  EM_ATENDIMENTO: ['AGUARDANDO_USUARIO', 'AGUARDANDO_TERCEIRO', 'CANCELADO'],
  AGUARDANDO_USUARIO: ['EM_ATENDIMENTO', 'AGUARDANDO_TERCEIRO', 'CANCELADO'],
  AGUARDANDO_TERCEIRO: ['EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'CANCELADO'],
  RESOLVIDO: [],
  CANCELADO: [],
};

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from].includes(to);
}

export const PRIORITY_RANK: Readonly<Record<Priority, number>> = { URGENTE: 0, ALTA: 1, NORMAL: 2, BAIXA: 3 };
