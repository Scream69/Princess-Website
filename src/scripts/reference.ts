/*
 * Enquiry reference and local item ids.
 *
 * The reference is read aloud over the phone and typed into the client's
 * inbox search, so the alphabet excludes every character pair that is
 * ambiguous in a sans-serif face or in speech: 0/O, 1/I/L, 2/Z, 5/S, 8/B.
 */
const UNAMBIGUOUS = '34679ACDEFGHJKMNPQRTUVWXY';
const REFERENCE_LENGTH = 5;

function randomChars(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let out = '';
  for (const byte of bytes) {
    // Modulo bias is irrelevant here: this is a human-readable label, not a
    // secret. Collisions are handled by the client, who sees the email too.
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

/** `ENQ-XXXXX`. Generated once, on the first item added (CLAUDE.md 5.2). */
export function createReference(): string {
  return `ENQ-${randomChars(UNAMBIGUOUS, REFERENCE_LENGTH)}`;
}

export const REFERENCE_PATTERN = new RegExp(`^ENQ-[${UNAMBIGUOUS}]{${REFERENCE_LENGTH}}$`);

/** Local-only id for tray items. Never leaves the browser except in the payload. */
export function createId(): string {
  return `${Date.now().toString(36)}${randomChars('abcdefghijklmnopqrstuvwxyz0123456789', 6)}`;
}
