/*
 * Analytics events (CLAUDE.md 8.10).
 *
 * Cookieless by construction: this file never sets a cookie, never reads one,
 * and never assigns an identifier. It hands an event name and a few properties
 * to whichever provider script the page loaded — Plausible or Umami — and if
 * neither is there, it does nothing at all (rule 2.6, so no consent banner).
 *
 * Two hard rules:
 *
 *   1. Analytics must never break an enquiry. Every call is wrapped, because a
 *      blocked or half-loaded provider script throwing inside a click handler
 *      would take the wizard down with it (rule 2.4).
 *   2. No personal data leaves in a property. Names, emails, phone numbers,
 *      postcodes and pasted URLs are all excluded here on purpose — the funnel
 *      needs counts and step numbers, not who the customer is (rule 2.7).
 */

/** The full event list from CLAUDE.md 8.10. A union, so a typo will not compile. */
export type AnalyticsEvent =
  | 'step_view'
  | 'brand_click'
  | 'paste_success'
  | 'paste_failure'
  | 'manual_entry'
  | 'add_another'
  | 'item_removed'
  | 'validation_error'
  | 'submit_attempt'
  | 'submit_success'
  | 'submit_failure'
  | 'whatsapp_click'
  | 'abandon';

export type EventProps = Record<string, string | number | boolean>;

interface PlausibleWindow {
  plausible?: (event: string, options?: { props: EventProps }) => void;
  umami?: { track?: (event: string, props?: EventProps) => void };
}

export function track(event: AnalyticsEvent, props?: EventProps): void {
  try {
    const provider = window as unknown as PlausibleWindow;

    if (typeof provider.plausible === 'function') {
      provider.plausible(event, props ? { props } : undefined);
      return;
    }
    if (typeof provider.umami?.track === 'function') {
      provider.umami.track(event, props);
    }
  } catch {
    // A provider that throws is a provider we stop talking to. Never rethrow.
  }
}

/*
 * Where customers give up (CLAUDE.md 8.10). `pagehide` rather than
 * `visibilitychange`, because leaving for the manufacturer's site is the
 * normal path through this wizard, not abandonment — counting it would make
 * step 2 look like a cliff when it is the whole point of the page.
 */
export function trackAbandonment(getState: () => { step: number; items: number; submitted: boolean }): void {
  let sent = false;
  window.addEventListener('pagehide', () => {
    if (sent) return;
    sent = true;
    const { step, items, submitted } = getState();
    if (submitted) return;
    track('abandon', { step, items });
  });
}
