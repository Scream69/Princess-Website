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

/*
 * `ENQ-XXXXX` for a quote, `REP-XXXXX` for a repair.
 *
 * The prefix is what tells the client, at a glance in their inbox and aloud
 * over the phone, which of the two things a reference belongs to — the two go
 * to different addresses and are handled by different people. The alphabet and
 * the length are shared deliberately: a reference is read back the same way
 * whichever it is.
 *
 * Generated once, on the first item added (CLAUDE.md 5.2).
 */
export type ReferenceKind = 'ENQ' | 'REP';

export function createReference(prefix: ReferenceKind = 'ENQ'): string {
  return `${prefix}-${randomChars(UNAMBIGUOUS, REFERENCE_LENGTH)}`;
}

export const referencePattern = (prefix: ReferenceKind = 'ENQ'): RegExp =>
  new RegExp(`^${prefix}-[${UNAMBIGUOUS}]{${REFERENCE_LENGTH}}$`);

/** The quote reference shape. Kept as a constant — it is asserted in several places. */
export const REFERENCE_PATTERN = referencePattern('ENQ');

/** Local-only id for tray items. Never leaves the browser except in the payload. */
export function createId(): string {
  return `${Date.now().toString(36)}${randomChars('abcdefghijklmnopqrstuvwxyz0123456789', 6)}`;
}
