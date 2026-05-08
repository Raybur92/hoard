import { randomInt } from 'node:crypto';

/**
 * Reduced 32-char alphabet — no 0/O/1/I to avoid ambiguity when codes
 * are typed by hand on a phone or read off a screenshot. 8 random
 * positions per code = 32^8 ≈ 1.1 trillion combinations; collision
 * probability for a closed beta of <50 codes is vanishingly small,
 * but the unique constraint on InviteCode.code + the caller's retry
 * loop covers it for free.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function block(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += ALPHABET[randomInt(ALPHABET.length)];
  }
  return s;
}

/**
 * Produces an invite code matching ^HOARD-[A-Z2-9]{4}-[A-Z2-9]{4}$.
 * Uses crypto.randomInt for cryptographically secure randomness.
 *
 * The HOARD- prefix is fixed and serves as a recognizable signal in
 * chat ("yeah here's your Hoard code"); plus, frontend regex
 * validation catches obviously-wrong inputs before they hit the API.
 */
export function generateCode(): string {
  return `HOARD-${block(4)}-${block(4)}`;
}
