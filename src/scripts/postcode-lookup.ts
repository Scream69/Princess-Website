/*
 * UK postcode confirmation, via postcodes.io (ONS open data, no key, no cost).
 *
 * THIS IS CONFIRMATION, NOT VALIDATION. Nothing here may ever block a
 * submission. The API can be down, a new-build postcode can be missing from
 * the dataset, and most importantly the business serves the whole of Europe
 * (CLAUDE.md 8.6) — so a lookup that fails means only that we say nothing.
 *
 * It also deliberately does NOT fetch a street address. Rule 7 is data
 * minimisation: name, email, phone, country, postcode, product. The full
 * address is an order-time detail, and capturing it here would need a
 * licensed Royal Mail PAF provider and a change to that rule.
 */

const ENDPOINT = 'https://api.postcodes.io/postcodes/';
const TIMEOUT_MS = 4000;

export interface PostcodeArea {
  /** The canonical form, correctly spaced — e.g. "SW1A 1AA" from "sw1a1aa". */
  postcode: string;
  /** Human-readable location, e.g. "Watford, East of England". */
  summary: string;
}

interface PostcodesIoResult {
  postcode?: unknown;
  admin_district?: unknown;
  region?: unknown;
  country?: unknown;
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

/** Builds the confirmation line, skipping repeated or missing parts. */
export function summarise(result: PostcodesIoResult): PostcodeArea | null {
  const postcode = text(result.postcode);
  if (!postcode) return null;

  const parts: string[] = [];
  for (const value of [
    text(result.admin_district),
    // "England" adds nothing next to "East of England"; region alone is enough.
    text(result.region) ?? text(result.country),
  ]) {
    if (value && !parts.includes(value)) parts.push(value);
  }

  return { postcode, summary: parts.join(', ') };
}

/** Only UK postcodes can be looked up — the dataset is UK-only. */
export function isLookupSupported(countryCode: string): boolean {
  return countryCode.toUpperCase() === 'GB';
}

export async function lookupPostcode(
  postcode: string,
  signal?: AbortSignal,
): Promise<PostcodeArea | null> {
  const cleaned = postcode.replace(/\s+/g, '').toUpperCase();
  if (cleaned.length < 5 || cleaned.length > 8) return null;

  // AbortSignal.any keeps the caller's cancellation working alongside the
  // timeout, so a fast typist does not leave requests hanging.
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  try {
    const response = await fetch(`${ENDPOINT}${encodeURIComponent(cleaned)}`, {
      signal: combined,
    });
    if (!response.ok) return null;

    const body = (await response.json()) as { result?: PostcodesIoResult };
    return body.result ? summarise(body.result) : null;
  } catch {
    // Offline, blocked, timed out, or the customer kept typing. All the same
    // to us: say nothing and let them continue.
    return null;
  }
}
