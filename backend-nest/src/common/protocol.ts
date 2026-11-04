/** Public protocol format: GV-000123 (zero-padded to at least 6 digits). */
export function formatProtocol(id: number): string {
  return 'GV-' + String(id).padStart(6, '0');
}

/** Parses a protocol received in a URL. Returns null for anything that is not GV-<digits>. */
export function parseProtocol(input: string): number | null {
  if (!/^GV-\d{1,12}$/.test(input)) return null;
  const id = Number(input.slice(3));
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647 ? id : null;
}

/** Parses a numeric route id (PostgreSQL integer range). */
export function parseId(input: string): number | null {
  if (!/^[1-9]\d{0,9}$/.test(input)) return null;
  const id = Number(input);
  return id <= 2_147_483_647 ? id : null;
}
