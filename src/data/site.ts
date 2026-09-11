import site from './site.json' with { type: 'json' };

/*
 * The WhatsApp number is not yet supplied (MISSING-ASSETS.md 4), so every
 * caller has to cope with it being absent. Rendering a dead wa.me link on the
 * enquiry *failure* path would breach rule 2.4 outright — the customer would
 * tap the one thing left that could save their enquiry and land nowhere — so
 * the href is null until a real number is in site.json, and the buttons that
 * depend on it render nothing.
 */
export const whatsappDigits = site.contact.whatsapp.replace(/\D/g, '');

/** True while a field is still an `[AWAITING …]` marker rather than a fact. */
export function isPlaceholder(value: string): boolean {
  return value.startsWith('[AWAITING') || value.startsWith('[BLOCKED');
}

/*
 * The registered company name and the trading name are different things even
 * when they read the same. The client confirmed on 2026-09-11 that both are
 * "Princes Electronics", so `legalName` now resolves to a supplied fact
 * rather than to the fallback — but the fallback stays, because this is the
 * one field a rename would touch and a footer that silently printed a marker
 * would be worse than one that printed the trading name.
 *
 * If Companies House records 07396672 with a "Limited" or "Ltd" suffix, that
 * exact form is what belongs here: the legal footer and the privacy policy's
 * controller line are legal statements, not branding.
 */
export const tradingName = site.name;
export const legalName = isPlaceholder(site.legalName) ? site.name : site.legalName;

/** Pre-filled wa.me link, or null when no number is configured. */
export function whatsappHref(text?: string): string | null {
  if (whatsappDigits === '') return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${whatsappDigits}${query}`;
}
