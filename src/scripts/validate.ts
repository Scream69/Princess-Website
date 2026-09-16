/*
 * Field validation for step 3.
 *
 * Every rule here is deliberately permissive. This is the last step before an
 * enquiry is sent, which makes it the most expensive place in the funnel to
 * reject someone. A false rejection loses a real customer; a loose value costs
 * the client one clarifying email. Validate for *plausibility*, not format.
 */

export type Validation = { ok: true; value: string } | { ok: false; message: string };

const ok = (value: string): Validation => ({ ok: true, value });
const no = (message: string): Validation => ({ ok: false, message });

const collapse = (value: string) => value.trim().replace(/\s+/g, ' ');

export function validateName(raw: string): Validation {
  const value = collapse(raw);
  if (value === '') return no('Please enter your name.');
  if (!/\p{L}/u.test(value)) return no('Please enter your name.');
  return ok(value);
}

/*
 * Phone numbers arrive with spaces, dashes, brackets and country codes, and
 * European numbers vary in length. Count digits and nothing else: 7 covers the
 * shortest national numbers, 15 is the E.164 maximum.
 */
export function validatePhone(raw: string): Validation {
  const value = collapse(raw);
  if (value === '') return no('Please enter a phone number.');

  // Character check first: "call me on Tuesday" is not a short number, and
  // telling someone their words are "too short" reads as nonsense.
  if (/[^\d\s+()./-]/.test(value)) return no('Please use only numbers, spaces and + ( ) -');

  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) return no('That number looks too short — please check it.');
  if (digits.length > 15) return no('That number looks too long — please check it.');
  return ok(value);
}

/*
 * One @, a dot in the domain, no spaces. Anything stricter starts rejecting
 * valid addresses — long TLDs, plus-addressing, apostrophes — and this is the
 * field the entire quote depends on reaching.
 */
/*
 * Zero-width and bidi characters, which `trim()` and `\s` both miss.
 *
 * They ride along when an address is copied out of Outlook, a PDF, or a page
 * that uses U+200B as a line-break hint — and the address then validates,
 * stores, submits, and shows the customer a confirmation, while the client's
 * reply bounces. That is the rule 2.4 failure shape: a send the customer
 * believes succeeded. Stripped rather than rejected, because the customer did
 * nothing wrong and cannot see the character to remove it.
 */
const INVISIBLE = /[\u200B-\u200F\u2060\uFEFF]/g;

export function validateEmail(raw: string): Validation {
  const value = raw.replace(INVISIBLE, '').trim();
  if (value === '') return no('Please enter your email address.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return no('That does not look like an email address.');
  }
  return ok(value);
}

/*
 * Postcodes are validated for presence and shape only, never against a
 * pattern. The original reason was Europe — Germany is five digits, the
 * Netherlands is "1234 AB", Ireland uses alphanumeric Eircodes — and the rule
 * survives UK-only delivery for a better one: British postcodes for new
 * builds can lead the published dataset by months, and the final step of the
 * funnel is the worst place to tell a customer their own address is wrong.
 * There is no
 * per-country pattern here and there must never be one (CLAUDE.md 8.6) — a
 * pattern would reject new-build postcodes, which can lead the published
 * dataset by months, at the final step.
 */
export function validatePostcode(raw: string): Validation {
  const value = collapse(raw).toUpperCase();
  if (value === '') return no('Please enter your postcode.');
  if (!/^[A-Z0-9][A-Z0-9\s-]*$/u.test(value)) {
    return no('Please use only letters, numbers, spaces and hyphens.');
  }

  const significant = value.replace(/[\s-]/g, '');
  if (significant.length < 3) return no('That looks too short — please check it.');
  if (significant.length > 10) return no('That looks too long — please check it.');
  return ok(value);
}
