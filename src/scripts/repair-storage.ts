/*
 * Repair booking persistence — the /repairs equivalent of storage.ts.
 *
 * A separate key (`repair:v1`) and a separate schema on purpose: a customer
 * can legitimately have a quote enquiry and a repair booking open at once,
 * and the two are submitted to different inboxes (CLAUDE.md, keys.ts). The
 * read/write/debounce/expiry mechanics are shared via local-store.ts; only
 * the shape and validation below are specific to a repair.
 *
 * No postcode, no country: the customer is carrying the item to the counter,
 * so an address is not collected (rule 2.7 — collect only what the step
 * needs).
 */
import { createLocalStore } from './local-store.ts';

export const STORAGE_KEY = 'repair:v1';
export const SCHEMA_VERSION = 1;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type RepairStep = 1 | 2 | 3 | 4;

export interface RepairContact {
  name: string;
  phone: string;
  email: string;
}

export interface RepairSlot {
  date: string; // ISO date, e.g. "2026-09-21"
  part: 'morning' | 'afternoon';
}

export interface RepairState {
  version: typeof SCHEMA_VERSION;
  reference: string;
  /** A category slug from repairs.json, or null if "Something else" was chosen. */
  category: string | null;
  product: string;
  fault: string;
  contact: RepairContact;
  slot: RepairSlot | null;
  step: RepairStep;
  consent: boolean;
  submitted: boolean;
  updatedAt: number;
}

export function createEmptyRepairState(): RepairState {
  return {
    version: SCHEMA_VERSION,
    reference: '',
    category: null,
    product: '',
    fault: '',
    contact: { name: '', phone: '', email: '' },
    slot: null,
    step: 1,
    consent: false,
    submitted: false,
    updatedAt: Date.now(),
  };
}

export function isExpired(state: { updatedAt?: unknown }, now: number = Date.now()): boolean {
  return typeof state.updatedAt !== 'number' || now - state.updatedAt > THIRTY_DAYS_MS;
}

const isStringRecord = (value: unknown, keys: readonly string[]): boolean =>
  typeof value === 'object' &&
  value !== null &&
  keys.every((key) => typeof (value as Record<string, unknown>)[key] === 'string');

const CONTACT_KEYS = ['name', 'phone', 'email'] as const;

function isSlot(value: unknown): value is RepairSlot {
  if (typeof value !== 'object' || value === null) return false;
  const slot = value as Partial<RepairSlot>;
  return (
    typeof slot.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(slot.date) &&
    (slot.part === 'morning' || slot.part === 'afternoon')
  );
}

/*
 * Same discipline as storage.ts's `parseStored`: this is untrusted input — a
 * string under the customer's own hand in devtools — so anything wrong-typed
 * is dropped rather than trusted, and `submitted` is only believed alongside
 * the emptied-out shape `completeRepair` actually leaves behind. A record
 * claiming to be submitted while still carrying a fault description is not
 * one this code ever wrote.
 */
export function parseStoredRepair(raw: string | null, now: number = Date.now()): RepairState | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const state = parsed as Partial<RepairState>;

  if (state.version !== SCHEMA_VERSION) return null;
  if (isExpired(state, now)) return null;
  if (state.contact !== undefined && !isStringRecord(state.contact, CONTACT_KEYS)) return null;
  if (state.step !== undefined && ![1, 2, 3, 4].includes(state.step)) return null;
  if (state.slot !== undefined && state.slot !== null && !isSlot(state.slot)) return null;
  if (state.category !== undefined && state.category !== null && typeof state.category !== 'string') {
    return null;
  }

  const reference = typeof state.reference === 'string' ? state.reference : '';
  const submitted =
    state.submitted === true && reference !== '' && (state.fault ?? '') === '' && !state.slot;

  const empty = createEmptyRepairState();
  return {
    ...empty,
    ...state,
    reference,
    submitted,
    contact: { ...empty.contact, ...(state.contact ?? {}) },
  } as RepairState;
}

const store = createLocalStore<RepairState>({ key: STORAGE_KEY, parse: parseStoredRepair });

export const load = store.load;
export const save = store.save;
export const flush = store.flush;
export const discard = store.discard;
export const persistOnUnload = store.persistOnUnload;

export function clear(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — if we cannot remove it, it will expire.
  }
}
