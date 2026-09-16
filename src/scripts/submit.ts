/*
 * Submission — the highest-risk code in this project (CLAUDE.md 8.7).
 *
 * Rule 2.4 is the whole design brief: never lose an enquiry. A failed
 * submission the customer believes succeeded is the worst defect this
 * codebase could carry, so the order of operations is fixed and never
 * shortened:
 *
 *   post → retry twice → queue on the device → offer WhatsApp → only then clear
 *
 * Nothing here reports success unless the endpoint confirmed it. `submitted`
 * in the stored state — the gate on step 4 — is only ever set from a confirmed
 * response, never from a timeout, an assumption or an optimistic guess.
 *
 * Everything is injectable (fetch, endpoint, delays) so the retry, queue and
 * rate-limit behaviour can be tested without a browser or a network.
 */
import { describe as describeItem } from './parse.ts';
import type { EnquiryItem, EnquiryState } from './storage.ts';

/** Web3Forms. Netlify Forms would be a different endpoint and the same payload. */
const ENDPOINT = 'https://api.web3forms.com/submit';
const TIMEOUT_MS = 8000;
/** Two retries, backing off (CLAUDE.md 8.7 step 2). */
const RETRY_DELAYS_MS = [800, 2400] as const;

export const QUEUE_KEY = 'pending-enquiry';
export const RATE_KEY = 'enquiry:sent';

const QUEUE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const QUEUE_MAX = 10;
/** Bots submit instantly; a person cannot answer five questions this fast (8.8). */
export const MIN_ELAPSED_MS = 3000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT = 5;
/** wa.me tolerates long text, but a wall of it is unreadable on a phone. */
const WHATSAPP_MAX_CHARS = 1400;

// --- payload ----------------------------------------------------------------

/*
 * Deliberately flat and string-valued. The client reads these as an email, and
 * a form-to-email service renders nested objects as unreadable JSON — so the
 * appliances arrive as numbered lines, not as an array. Every field required
 * by CLAUDE.md 8.7 step 6 is present: reference, items with brand, raw input,
 * parsed model and note, contact details, and the session metadata.
 */
export interface EnquiryPayload {
  subject: string;
  from_name: string;
  replyto: string;
  reference: string;
  name: string;
  email: string;
  phone: string;
  postcode: string;
  appliance_count: number;
  appliances: string;
  consent: string;
  entry_url: string;
  brands_clicked: string;
  time_on_page: string;
  submitted_at: string;
}

export interface SessionMeta {
  /** The URL the customer landed on — tells the client where the lead came from. */
  entryUrl: string;
  brandsClicked: readonly string[];
  msOnPage: number;
}

export interface PayloadContext {
  state: EnquiryState;
  session: SessionMeta;
  brandNames: Readonly<Record<string, string>>;
  now?: number;
}

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function itemLines(item: EnquiryItem, brandNames: Readonly<Record<string, string>>): string {
  const label = describeItem(
    { inputType: item.inputType, model: item.parsedModel, name: item.parsedName },
    item.rawInput,
  );
  const brand = item.brandSlug ? (brandNames[item.brandSlug] ?? item.brandSlug) : null;
  const lines = [[brand, label].filter(Boolean).join(' — ')];

  // The raw input goes across whenever it carries anything the label does not:
  // the quote is built from it, so it is never summarised away (CLAUDE.md 8.3).
  if (item.rawInput.trim() !== label) lines.push(`   ${item.rawInput.trim()}`);
  if (item.note.trim() !== '') lines.push(`   Note: ${item.note.trim()}`);
  return lines.join('\n');
}

export function buildPayload(context: PayloadContext): EnquiryPayload {
  const { state, session, brandNames } = context;
  const now = context.now ?? Date.now();
  const { contact, items } = state;

  const appliances = items
    .map((item, index) => `${index + 1}. ${itemLines(item, brandNames)}`)
    .join('\n');

  const count = items.length;
  const noun = count === 1 ? 'appliance' : 'appliances';

  return {
    /*
     * The subject named the delivery country, so the client could judge
     * shipping without opening the email. With UK-only delivery it named the
     * same country every time, which is not information — it is a word in
     * every subject line that has to be read past to reach the ones that
     * differ. The postcode is in the body and carries the region anyway.
     */
    subject: `Enquiry ${state.reference} — ${contact.name} (${count} ${noun})`,
    from_name: contact.name,
    replyto: contact.email,
    reference: state.reference,
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    postcode: contact.postcode,
    appliance_count: count,
    appliances,
    // Recorded as evidence of the lawful basis for replying (CLAUDE.md 11).
    consent: state.consent ? `Given at ${new Date(now).toISOString()}` : 'NOT GIVEN',
    entry_url: session.entryUrl,
    brands_clicked: session.brandsClicked.join(', '),
    time_on_page: formatDuration(session.msOnPage),
    submitted_at: new Date(now).toISOString(),
  };
}

/*
 * The fallback that actually saves the lead when the form endpoint is
 * unreachable (CLAUDE.md 8.7 step 4). Written from the customer's side —
 * they are the one sending it.
 */
export function whatsappMessage(payload: EnquiryPayload): string {
  const body = [
    `Enquiry ${payload.reference}`,
    `${payload.name} · ${payload.phone} · ${payload.email}`,
    payload.postcode,
    '',
    payload.appliances,
    '',
    'Sent here because the website form could not reach you.',
  ].join('\n');

  if (body.length <= WHATSAPP_MAX_CHARS) return body;

  /*
   * Cut on a character, not on a UTF-16 index. `slice` counts code units, so a
   * non-BMP character — any emoji, and people do put them in a free-text
   * description — straddling the limit leaves a lone surrogate.
   * `encodeURIComponent` throws `URIError` on that, and it throws inside the
   * one code path whose entire job is to survive a failed submission: the
   * failure panel had already been shown, so the customer was left looking at
   * "we could not send it" with the WhatsApp button never revealed.
   */
  const cut = [...body].slice(0, WHATSAPP_MAX_CHARS).join('');
  return `${cut}…\n(cut short — please ask me for the rest)`;
}

// --- posting ----------------------------------------------------------------

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'unconfigured' | 'network' | 'rejected' };

export interface PostOptions {
  accessKey: string;
  payload: EnquiryPayload;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
  retryDelays?: readonly number[];
  wait?: (ms: number) => Promise<void>;
}

type Attempt = { ok: true } | { ok: false; reason: 'network' | 'rejected'; retryable: boolean };

/*
 * 429 and 5xx are the endpoint asking us to come back; every other 4xx is a
 * settled refusal (a bad access key, a spam verdict) and retrying it only
 * delays the WhatsApp fallback the customer needs.
 */
function classify(status: number): Attempt {
  if (status === 429 || status >= 500) return { ok: false, reason: 'network', retryable: true };
  return { ok: false, reason: 'rejected', retryable: false };
}

interface AttemptOptions {
  accessKey: string;
  payload: EnquiryPayload;
  fetchImpl: typeof fetch;
  endpoint: string;
  timeoutMs: number;
}

async function attemptPost(options: AttemptOptions): Promise<Attempt> {
  const { accessKey, payload, fetchImpl, endpoint, timeoutMs } = options;

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ access_key: accessKey, ...payload }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    // Offline, DNS failure, timeout, CORS: indistinguishable here, and all
    // worth one more try.
    return { ok: false, reason: 'network', retryable: true };
  }

  if (!response.ok) return classify(response.status);

  /*
   * A 2xx is not proof on its own: Web3Forms answers 200 with
   * `{ success: false }` when it drops a submission.
   *
   * The distinction that matters is *why* the body could not be parsed. Text
   * that simply is not JSON — Netlify Forms answers with HTML — is a
   * successful post from an endpoint that talks differently, and disbelieving
   * it would strand every Netlify deployment. A body that could not be *read*
   * is a different thing: the abort signal covers the response stream, not
   * just the headers, so a connection dropped mid-body or a stream that
   * outlasts the timeout lands here too. Treating that as delivered told the
   * customer their enquiry was sent when nothing arrived, which is rule 2.4
   * exactly. It is retryable — the POST may well have been received, and the
   * queue is keyed by reference so a duplicate send replaces rather than
   * stacks.
   */
  let text: string;
  try {
    text = await response.text();
  } catch {
    return { ok: false, reason: 'network', retryable: true };
  }

  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object' && (body as { success?: unknown }).success === false) {
      return { ok: false, reason: 'rejected', retryable: false };
    }
  } catch {
    // Not JSON at all: an endpoint that answers in HTML, which is fine.
  }
  return { ok: true };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Posts once, then retries twice with backoff. Never throws. */
export async function postEnquiry(options: PostOptions): Promise<SendResult> {
  const {
    accessKey,
    payload,
    fetchImpl = fetch,
    endpoint = ENDPOINT,
    timeoutMs = TIMEOUT_MS,
    retryDelays = RETRY_DELAYS_MS,
    wait = sleep,
  } = options;

  // A build with no access key cannot deliver anything. Say so, rather than
  // posting into the void and reading the failure as a network blip.
  if (accessKey.trim() === '') return { ok: false, reason: 'unconfigured' };

  let last: Attempt = { ok: false, reason: 'network', retryable: true };

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    if (attempt > 0) await wait(retryDelays[attempt - 1] ?? 0);
    last = await attemptPost({ accessKey, payload, fetchImpl, endpoint, timeoutMs });
    if (last.ok) return { ok: true };
    if (!last.retryable) break;
  }

  return { ok: false, reason: last.ok ? 'network' : last.reason };
}

// --- the on-device queue ----------------------------------------------------

export interface QueueEntry {
  reference: string;
  payload: EnquiryPayload;
  queuedAt: number;
  attempts: number;
}

function isEntry(value: unknown): value is QueueEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<QueueEntry>;
  return (
    typeof entry.reference === 'string' &&
    typeof entry.queuedAt === 'number' &&
    typeof entry.attempts === 'number' &&
    typeof entry.payload === 'object' &&
    entry.payload !== null
  );
}

/** Anything unreadable or older than 30 days is dropped rather than repaired. */
export function parseQueue(raw: string | null, now: number = Date.now()): QueueEntry[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isEntry).filter((entry) => now - entry.queuedAt <= QUEUE_TTL_MS);
}

export function readQueue(now: number = Date.now()): QueueEntry[] {
  try {
    return parseQueue(window.localStorage.getItem(QUEUE_KEY), now);
  } catch {
    return [];
  }
}

function writeQueue(entries: QueueEntry[]): void {
  try {
    if (entries.length === 0) window.localStorage.removeItem(QUEUE_KEY);
    else window.localStorage.setItem(QUEUE_KEY, JSON.stringify(entries));
  } catch {
    // Storage blocked or full. The in-memory enquiry and the WhatsApp fallback
    // are unaffected, and they are what actually protect the lead.
  }
}

/*
 * Keyed by reference, so a customer pressing "Try again" replaces their queued
 * enquiry instead of stacking duplicates the client would have to de-duplicate
 * by hand.
 *
 * **The entry being queued always survives the cap.** It used to be appended
 * last and then `slice`d off the end, so on a device holding ten entries the
 * enquiry the customer had just failed to send was the one thrown away — while
 * the screen told them "Nothing has been lost. Your enquiry is saved on this
 * device". Oldest-wins is the wrong tie-break anyway: the entries that have sat
 * longest are the ones most likely already dead, and the newest is the only one
 * with someone waiting on it.
 */
export function mergeIntoQueue(
  entries: QueueEntry[],
  payload: EnquiryPayload,
  now: number = Date.now(),
): QueueEntry[] {
  const existing = entries.find((entry) => entry.reference === payload.reference);
  const merged: QueueEntry = {
    reference: payload.reference,
    payload,
    queuedAt: existing?.queuedAt ?? now,
    attempts: existing?.attempts ?? 0,
  };
  const others = entries.filter((entry) => entry.reference !== payload.reference);
  // Keep the newest, then as many of the rest as fit, oldest first.
  return [merged, ...others.slice(0, QUEUE_MAX - 1)];
}

export function queueEnquiry(payload: EnquiryPayload, now: number = Date.now()): void {
  writeQueue(mergeIntoQueue(readQueue(now), payload, now));
}

/*
 * Called the moment a reference is confirmed delivered. Without this, an
 * enquiry that failed, queued, and then succeeded on "Try again" would be
 * re-sent on the next page load and reach the client twice.
 */
export function dropFromQueue(reference: string, now: number = Date.now()): void {
  writeQueue(readQueue(now).filter((entry) => entry.reference !== reference));
}

export interface RetryQueueOptions {
  accessKey: string;
  fetchImpl?: typeof fetch;
  endpoint?: string;
  /** Called once per entry the endpoint has confirmed. */
  onSent?: (entry: QueueEntry) => void;
  now?: number;
}

/*
 * Retried on every page load (CLAUDE.md 8.7 step 3). One pass, no retry
 * ladder: the customer is not waiting on this, and an entry that fails simply
 * stays queued for the next load.
 *
 * **The queue is re-read before it is written, never overwritten from the
 * snapshot this started with.** Each entry can take seconds, and the customer
 * is using the form the whole time: an enquiry they queue during the pass used
 * to be erased by the write-back, and one they sent successfully on "Try
 * again" used to be resurrected and mailed to the client a second time. What
 * this pass knows is which references it delivered and which it tried — so it
 * applies only that, to whatever the queue holds at the end.
 */
export async function retryQueue(options: RetryQueueOptions): Promise<QueueEntry[]> {
  const now = options.now ?? Date.now();
  const queued = readQueue(now);
  if (queued.length === 0) return [];

  const sent: QueueEntry[] = [];
  const tried = new Set<string>();

  for (const entry of queued) {
    const result = await postEnquiry({
      accessKey: options.accessKey,
      payload: entry.payload,
      fetchImpl: options.fetchImpl,
      endpoint: options.endpoint,
      retryDelays: [],
    });
    tried.add(entry.reference);
    if (result.ok) sent.push(entry);
  }

  const delivered = new Set(sent.map((entry) => entry.reference));
  writeQueue(
    readQueue(options.now ?? Date.now())
      .filter((entry) => !delivered.has(entry.reference))
      .map((entry) =>
        tried.has(entry.reference) ? { ...entry, attempts: entry.attempts + 1 } : entry,
      ),
  );
  for (const entry of sent) options.onSent?.(entry);
  return sent;
}

// --- spam guards (CLAUDE.md 8.8) --------------------------------------------

/*
 * No CAPTCHA — it costs real enquiries. Three cheap checks instead, each of
 * which a person filling the form in good faith passes without noticing.
 */

export interface TimeCheck {
  now: number;
  /** When this page was loaded. */
  loadedAt: number;
  /** When the enquiry was started — the first appliance added. */
  startedAt: number | null;
}

/*
 * Either clock is enough. Time-since-load alone would fail a genuine customer
 * who refreshes at step 3 with every answer restored and submits immediately,
 * which is exactly the person we can least afford to reject.
 */
export function passesTimeCheck({ now, loadedAt, startedAt }: TimeCheck): boolean {
  if (now - loadedAt >= MIN_ELAPSED_MS) return true;
  return startedAt !== null && now - startedAt >= MIN_ELAPSED_MS;
}

/** A hidden checkbox, not a text input: browser autofill fills fields, not boxes. */
export function isHoneypotTripped(box: HTMLInputElement | null): boolean {
  return box?.checked === true;
}

/*
 * A stamp from the future counts for nothing.
 *
 * `now - time <= WINDOW` is satisfied by every negative value, so a phone whose
 * clock was running days ahead — a flat battery, a manually set date — wrote
 * stamps that could never age out. Once the clock corrected itself the customer
 * was rate-limited permanently, and the rate-limit path deliberately does not
 * queue, so there was no route out and no way to clear it from inside the site.
 */
const withinWindow = (time: number, now: number): boolean => {
  const age = now - time;
  return age >= 0 && age <= RATE_WINDOW_MS;
};

export function withinRateLimit(times: readonly number[], now: number = Date.now()): boolean {
  return times.filter((time) => withinWindow(time, now)).length < RATE_LIMIT;
}

export function readSubmissionTimes(now: number = Date.now()): number[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RATE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((time): time is number => Number.isFinite(time))
      .filter((time) => withinWindow(time, now));
  } catch {
    return [];
  }
}

export function recordSubmission(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(RATE_KEY, JSON.stringify([...readSubmissionTimes(now), now]));
  } catch {
    // A browser that cannot store the count cannot be rate-limited. Accepted:
    // the alternative is refusing a submission we have no reason to doubt.
  }
}
