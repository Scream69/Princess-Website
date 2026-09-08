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
export function validateEmail(raw: string): Validation {
  const value = raw.trim();
  if (value === '') return no('Please enter your email address.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return no('That does not look like an email address.');
  }
  return ok(value);
}

export function validateCountry(raw: string, allowed: readonly string[]): Validation {
  const value = raw.trim().toUpperCase();
  if (value === '') return no('Please choose a country.');
  if (!allowed.includes(value)) return no('Please choose a country from the list.');
  return ok(value);
}

/*
 * Postcode formats vary enormously across Europe: Germany is five digits, the
 * Netherlands is "1234 AB", Ireland uses alphanumeric Eircodes. There is no
 * per-country pattern here and there must never be one (CLAUDE.md 8.6) — a
 * UK-shaped regex would reject most European customers at the final step.
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
