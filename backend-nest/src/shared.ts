import { createHash, timingSafeEqual } from 'node:crypto';
import { UnprocessableEntityException } from '@nestjs/common';

export const departments = ['Faturamento', 'Financeiro', 'Logística', 'Juridico', 'Departamento Pessoal', 'Monitoramento'] as const;
export const categories = ['Computador', 'Internet', 'Impressora', 'Sistema', 'E-mail', 'Acesso / Senha', 'WhatsApp', 'Telefone / Celular', 'Equipamento', 'DBFrete', 'Fretebrás', 'Outro'] as const;
export const systems = ['DBFrete', 'Frete Brás', 'E-mail / Outlook', 'WhatsApp', 'Sistema interno', 'Outro sistema'] as const;
export const states = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;
export const statuses = ['NOVO', 'EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'AGUARDANDO_TERCEIRO', 'RESOLVIDO', 'CANCELADO'] as const;
export const priorities = ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as const;
export type Status = (typeof statuses)[number];
export type Priority = (typeof priorities)[number];

export const transitions: Record<Status, readonly Status[]> = {
  NOVO: ['CANCELADO'],
  EM_ATENDIMENTO: ['AGUARDANDO_USUARIO', 'AGUARDANDO_TERCEIRO', 'CANCELADO'],
  AGUARDANDO_USUARIO: ['EM_ATENDIMENTO', 'AGUARDANDO_TERCEIRO', 'CANCELADO'],
  AGUARDANDO_TERCEIRO: ['EM_ATENDIMENTO', 'AGUARDANDO_USUARIO', 'CANCELADO'],
  RESOLVIDO: [], CANCELADO: [],
};
export function catalog() {
  return { departments, states, categories, systems, statuses, priorities };
}
export const COOKIE = 'givova_session';
export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export function equalDigest(expected: string, supplied: string) {
  const first = Buffer.from(expected, 'hex'), second = Buffer.from(digest(supplied), 'hex');
  return first.length === second.length && timingSafeEqual(first, second);
}
export function failValidation(): never {
  throw new UnprocessableEntityException('Confira os campos obrigatórios, setores, categorias e limites de tamanho.');
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) failValidation();
  return value as Record<string, unknown>;
}
export function exactFields(data: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(data).some(field => !allowed.includes(field))) failValidation();
}
export function stringField(data: Record<string, unknown>, field: string, min: number, max: number, optional = false) {
  const input = data[field];
  if (optional && (input === undefined || input === null)) return '';
  if (typeof input !== 'string') failValidation();
  const value = input.trim();
  if (value.length < min || value.length > max) failValidation();
  return value;
}
export type TicketInput = {
  name: string; department: string; state: string; location: string;
  category: string; affected_system: string; title: string; description: string;
};
export function validateTicket(body: unknown): TicketInput {
  const data = object(body);
  exactFields(data, ['name', 'department', 'state', 'location', 'category', 'affected_system', 'title', 'description']);
  const name = stringField(data, 'name', 2, 120);
  const department = stringField(data, 'department', 1, 80);
  const state = stringField(data, 'state', 2, 2).toUpperCase();
  const location = stringField(data, 'location', 0, 160, true);
  const category = stringField(data, 'category', 1, 80);
  const affected_system = stringField(data, 'affected_system', 0, 80, true);
  const title = stringField(data, 'title', 3, 160);
  const description = stringField(data, 'description', 0, 5000, true);
  if (!(departments as readonly string[]).includes(department)
      || !(states as readonly string[]).includes(state)
      || !(categories as readonly string[]).includes(category)
      || (affected_system && !(systems as readonly string[]).includes(affected_system))
      || (category === 'Sistema' && !affected_system)) failValidation();
  return { name, department, state, location, category, affected_system, title, description };
}
export function validateLogin(body: unknown) {
  const data = object(body);
  exactFields(data, ['username', 'password']);
  const username = stringField(data, 'username', 1, 80).toLowerCase();
  // Never trim passwords: spaces are significant.
  if (typeof data.password !== 'string' || data.password.length < 1 || data.password.length > 256) failValidation();
  return { username, password: data.password };
}
export function validateResolution(body: unknown) {
  const data = object(body);
  exactFields(data, ['solution']);
  return { solution: stringField(data, 'solution', 3, 3000) };
}
export function validateUpdate(body: unknown) {
  const data = object(body);
  exactFields(data, ['status', 'priority']);
  const status = data.status == null ? undefined : data.status;
  const priority = data.priority == null ? undefined : data.priority;
  if (status !== undefined && !(statuses as readonly unknown[]).includes(status)) failValidation();
  if (priority !== undefined && !(priorities as readonly unknown[]).includes(priority)) failValidation();
  return { status: status as Status | undefined, priority: priority as Priority | undefined };
}
export function validId(input: string): number {
  if (!/^[1-9]\d{0,11}$/.test(input)) failValidation();
  const id = Number(input);
  if (!Number.isSafeInteger(id)) failValidation();
  return id;
}
export function protocolId(input: string): number | null {
  if (!/^GV-\d{1,12}$/.test(input)) return null;
  const id = Number(input.slice(3));
  return Number.isSafeInteger(id) ? id : null;
}
export function utcStamp(value: Date | string | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null;
}
export function envList(name: string, fallback: string[] = []) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    const result: unknown = JSON.parse(raw);
    if (Array.isArray(result) && result.every(x => typeof x === 'string')) return result as string[];
  } catch { /* reject invalid format */ }
  throw new Error(name + ' must be a JSON string array');
}
