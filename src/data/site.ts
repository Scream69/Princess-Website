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

/** Pre-filled wa.me link, or null when no number is configured. */
export function whatsappHref(text?: string): string | null {
  if (whatsappDigits === '') return null;
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${whatsappDigits}${query}`;
}
