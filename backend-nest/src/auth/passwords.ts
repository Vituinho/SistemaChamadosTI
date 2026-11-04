import argon2 from 'argon2';

/**
 * Argon2id hashing. Verification accepts any Argon2 PHC string, including the
 * hashes produced by the legacy Python backend (pwdlib/argon2-cffi).
 */
export const MIN_PASSWORD_LENGTH = 12;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65_536, timeCost: 3, parallelism: 4 });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
