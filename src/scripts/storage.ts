/*
 * Enquiry persistence.
 *
 * Every localStorage call is wrapped: Safari in private mode throws on write,
 * and some managed browsers throw on read. A customer with storage disabled
 * must still be able to complete the wizard in one sitting — they just lose
 * the ability to come back to it. Losing persistence is acceptable; throwing
 * an exception mid-enquiry is not (CLAUDE.md 2.4).
 */

export const STORAGE_KEY = 'enquiry:v1';
export const SCHEMA_VERSION = 1;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 300;

export type Step = 1 | 2 | 3 | 4;
export type InputType = 'url' | 'model' | 'description';

export interface EnquiryItem {
  id: string;
  brandSlug: string | null;
  rawInput: string;
  inputType: InputType;
  parsedModel: string | null;
  parsedName: string | null;
  note: string;
  addedAt: number;
}

export interface EnquiryContact {
  name: string;
  email: string;
  phone: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  postcode: string;
}

export interface EnquiryState {
  version: typeof SCHEMA_VERSION;
  reference: string;
  items: EnquiryItem[];
  contact: EnquiryContact;
  step: Step;
  consent: boolean;
  /*
   * Two fields beyond the schema in CLAUDE.md 5.2, both documented there:
   *
   * `draftBrandSlug` holds the brand chosen in step 1 while the customer is
   * away on the manufacturer's site and has not yet added a product. It has
   * to persist, or a refresh mid-step-2 forgets which brand they picked.
   *
   * `submitted` stops `?step=4` from forging a confirmation screen for an
   * enquiry that was never sent.
   */
  draftBrandSlug: string | null;
  submitted: boolean;
  updatedAt: number;
}

export function createEmptyState(): EnquiryState {
  return {
    version: SCHEMA_VERSION,
    reference: '',
    items: [],
    contact: { name: '', email: '', phone: '', country: 'GB', postcode: '' },
    step: 1,
    consent: false,
    draftBrandSlug: null,
    submitted: false,
    updatedAt: Date.now(),
  };
}

export function isExpired(state: { updatedAt?: unknown }, now: number = Date.now()): boolean {
  return typeof state.updatedAt !== 'number' || now - state.updatedAt > THIRTY_DAYS_MS;
}

/*
 * Anything that is not a current, unexpired, structurally sound state is
 * discarded rather than repaired. A half-migrated enquiry that silently drops
 * a field is worse than an empty one: the customer sees their appliances and
 * we send an incomplete quote request.
 */
export function parseStored(raw: string | null, now: number = Date.now()): EnquiryState | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const state = parsed as Partial<EnquiryState>;

  if (state.version !== SCHEMA_VERSION) return null;
  if (!Array.isArray(state.items)) return null;
  if (isExpired(state, now)) return null;

  return { ...createEmptyState(), ...state } as EnquiryState;
}

export function load(now: number = Date.now()): EnquiryState | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  const state = parseStored(raw, now);
  if (!state) clear();
  return state;
}

function write(state: EnquiryState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: Date.now() }));
  } catch {
    // Quota exceeded or storage blocked. The in-memory enquiry is unaffected.
  }
}

export function clear(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — if we cannot remove it, it will expire.
  }
}

let pending: EnquiryState | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Writes at most every 300ms (CLAUDE.md 8.4). Always pair with `flush` on unload. */
export function save(state: EnquiryState): void {
  pending = state;
  if (timer !== undefined) return;
  timer = setTimeout(() => {
    timer = undefined;
    if (pending) write(pending);
    pending = null;
  }, SAVE_DEBOUNCE_MS);
}

/*
 * Cancels any debounced write *and* removes the record. `clear()` alone is not
 * enough: a save queued moments earlier would fire afterwards and recreate the
 * enquiry the customer just asked us to forget.
 */
export function discard(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  pending = null;
  clear();
}

/** Writes any debounced change immediately. */
export function flush(): void {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  if (pending) write(pending);
  pending = null;
}

/*
 * A customer who closes the tab within 300ms of their last keystroke would
 * otherwise lose it. pagehide is the only event iOS Safari fires reliably when
 * a tab is backgrounded or the app is swiped away; visibilitychange covers
 * the rest.
 */
export function persistOnUnload(): void {
  window.addEventListener('pagehide', flush);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}
