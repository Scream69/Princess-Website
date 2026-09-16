/*
 * Enquiry persistence.
 *
 * Every localStorage call is wrapped: Safari in private mode throws on write,
 * and some managed browsers throw on read. A customer with storage disabled
 * must still be able to complete the wizard in one sitting — they just lose
 * the ability to come back to it. Losing persistence is acceptable; throwing
 * an exception mid-enquiry is not (CLAUDE.md 2.4).
 */

import { createLocalStore } from './local-store.ts';

export const STORAGE_KEY = 'enquiry:v1';
export const SCHEMA_VERSION = 1;

/**
 * The only country served. Recorded on every enquiry and never asked for —
 * the client confirmed UK-only delivery on 2026-09-12.
 */
export const HOME_COUNTRY = 'GB';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
    /*
     * `country` starts at 'GB' rather than empty. It used to start empty on
     * purpose: a valid value would have made step 3 skip its country question
     * and give the postcode field the wrong label for anyone abroad. Now that
     * the UK is the only country served there is no question to skip, and the
     * field is a constant on the record rather than an answer.
     */
    contact: { name: '', email: '', phone: '', country: HOME_COUNTRY, postcode: '' },
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

/** One appliance, checked field by field rather than assumed. */
function isItem(value: unknown): value is EnquiryItem {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    (item.brandSlug === null || typeof item.brandSlug === 'string') &&
    typeof item.rawInput === 'string' &&
    (item.inputType === 'url' || item.inputType === 'model' || item.inputType === 'description') &&
    (item.parsedModel === null || typeof item.parsedModel === 'string') &&
    (item.parsedName === null || typeof item.parsedName === 'string') &&
    typeof item.note === 'string' &&
    typeof item.addedAt === 'number'
  );
}

const isStringRecord = (value: unknown, keys: readonly string[]): boolean =>
  typeof value === 'object' &&
  value !== null &&
  keys.every((key) => typeof (value as Record<string, unknown>)[key] === 'string');

/*
 * Anything that is not a current, unexpired, structurally sound state is
 * discarded rather than repaired. A half-migrated enquiry that silently drops
 * a field is worse than an empty one: the customer sees their appliances and
 * we send an incomplete quote request.
 *
 * **This is untrusted input.** It is a string under the customer's own hand in
 * devtools, and anything that survives here is spread straight into the
 * running state. Two things went through before the checks below existed:
 *
 *   - `{ version: 1, items: [], submitted: true }` forged a confirmation
 *     screen for an enquiry that was never sent, which is the one thing
 *     CLAUDE.md 5.2 says `submitted` exists to prevent.
 *   - `items: [null]` threw inside `backfillParse` during init, before any
 *     listener was attached — a page that renders and does nothing at all,
 *     with the enquiry unrecoverable behind it.
 *
 * The spread was also only one level deep, so a stored `contact` replaced the
 * defaults wholesale and a partial one reached `validateName(undefined)`.
 */
const CONTACT_KEYS = ['name', 'email', 'phone', 'country', 'postcode'] as const;

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
  if (!Array.isArray(state.items) || !state.items.every(isItem)) return null;
  if (isExpired(state, now)) return null;
  if (state.contact !== undefined && !isStringRecord(state.contact, CONTACT_KEYS)) return null;
  if (state.step !== undefined && ![1, 2, 3, 4].includes(state.step)) return null;

  // Missing fields still fill from the defaults; only wrong-typed ones are
  // dropped, so a record written by an older build is not thrown away.
  const reference = typeof state.reference === 'string' ? state.reference : '';

  /*
   * `submitted` is only believed alongside a reference and an emptied item
   * list — the shape `completeEnquiry` actually leaves behind. A record
   * claiming to be submitted while still holding appliances is not one this
   * code ever wrote, and CLAUDE.md 5.2 says this flag exists precisely so a
   * confirmation cannot be forged.
   */
  const submitted = state.submitted === true && reference !== '' && state.items.length === 0;

  const empty = createEmptyState();
  return {
    ...empty,
    ...state,
    reference,
    submitted,
    contact: { ...empty.contact, ...(state.contact ?? {}) },
  } as EnquiryState;
}

/*
 * The read/write/debounce/expiry machinery lives in local-store.ts, shared
 * with the repair booking. Only the validation above is specific to an
 * enquiry — and it stays specific, because each record has its own idea of
 * what an implausible one looks like.
 *
 * Writes at most every 300ms (CLAUDE.md 8.4); always paired with `flush` on
 * unload.
 */
const store = createLocalStore<EnquiryState>({ key: STORAGE_KEY, parse: parseStored });

export const load = store.load;
export const save = store.save;
export const flush = store.flush;
export const discard = store.discard;
export const persistOnUnload = store.persistOnUnload;

/** Removes the record without cancelling a pending write — `discard` does both. */
export function clear(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — if we cannot remove it, it will expire.
  }
}
