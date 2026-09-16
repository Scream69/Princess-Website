/*
 * The Web3Forms access keys, one per destination inbox.
 *
 * Quotes go to info@, repairs go to repairs@, and in Web3Forms the access key
 * *is* the binding between a form and the address it delivers to — so there
 * are two keys, not one endpoint with a routing field.
 *
 * Both pages import both. A repair queued on /repairs has to go out even if
 * the customer's next visit is to /order, which is the whole point of
 * retrying the queue on page load (CLAUDE.md 8.7 step 3).
 *
 * Read defensively rather than as `import.meta.env.X`: this module is
 * imported by code that the unit tests load under plain Node, where
 * `import.meta.env` does not exist at all. An empty key is a defined state —
 * `postEnquiry` reports it as `unconfigured`, the submission is queued, and
 * the customer is never told it was sent (8.7 step 7).
 */
import type { SubmissionKind } from './submit.ts';

const env = import.meta.env as unknown as Record<string, string | undefined> | undefined;

export const ACCESS_KEYS: Record<SubmissionKind, string> = {
  quote: env?.PUBLIC_WEB3FORMS_KEY ?? '',
  repair: env?.PUBLIC_WEB3FORMS_KEY_REPAIRS ?? '',
};
