/**
 * Tracking links: /acompanhar/?protocol=GV-000123#<chave>
 * The key lives in the URL fragment, which browsers never send to servers;
 * the app sends it only in the X-Ticket-Key header.
 */
const PROTOCOL = /^GV-\d{1,12}$/;
const KEY = /^[A-Za-z0-9_-]{16,128}$/;

export function isProtocol(value: string): boolean {
  return PROTOCOL.test(value);
}

export function isAccessKey(value: string): boolean {
  return KEY.test(value);
}

export function trackingPath(protocol: string, accessKey: string): string {
  return `/acompanhar/?protocol=${encodeURIComponent(protocol)}#${accessKey}`;
}

export function trackingUrl(origin: string, protocol: string, accessKey: string): string {
  return `${origin.replace(/\/+$/, "")}${trackingPath(protocol, accessKey)}`;
}

/**
 * Accepts a pasted link in the current or legacy format
 * (/acompanhar/?protocol=GV-1#key, /acompanhar?protocol=GV-1#key, /chamado/GV-1#key).
 */
export function parseTrackingLink(input: string): { protocol: string; accessKey: string } | null {
  const text = input.trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text, "https://placeholder.invalid");
  } catch {
    return null;
  }
  const accessKey = url.hash.replace(/^#/, "");
  const legacy = url.pathname.match(/\/chamado\/(GV-\d{1,12})\/?$/);
  const protocol = url.searchParams.get("protocol") ?? legacy?.[1] ?? "";
  return isProtocol(protocol) && isAccessKey(accessKey) ? { protocol, accessKey } : null;
}
