import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** SHA-256 hex digest. Compatible with the legacy FastAPI hashes for sessions and tracking keys. */
export function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Opaque 256-bit token, URL-safe (same format as Python's secrets.token_urlsafe(32)). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Constant-time comparison between a stored hex digest and the digest of a supplied secret. */
export function matchesDigest(storedHex: string, supplied: string): boolean {
  const expected = Buffer.from(storedHex, 'hex');
  const actual = Buffer.from(digest(supplied), 'hex');
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

/** Tokens issued by this API (and by the legacy API) are base64url, at most 128 chars. */
export function isTokenShaped(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}
