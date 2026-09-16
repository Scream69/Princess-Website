/*
 * The localStorage discipline this site depends on, in one place.
 *
 * Every call is wrapped. Safari in private mode throws on write, some managed
 * browsers throw on read, and a quota-full device throws on both. A customer
 * with storage disabled must still be able to finish in one sitting — they
 * just lose the ability to come back to it. Losing persistence is acceptable;
 * throwing mid-enquiry is not (CLAUDE.md 2.4).
 *
 * Two records now use this — the quote enquiry and the repair booking. They
 * are separate keys with separate schemas and separate debounce timers, and
 * they must stay that way: one is submitted to info@ and the other to
 * repairs@, and a customer can legitimately have both on the go.
 *
 * What is *not* generic is parsing. Each record validates its own stored
 * shape, because each has its own idea of what an implausible record looks
 * like, and a half-migrated record that silently drops a field is worse than
 * no record at all.
 */

const SAVE_DEBOUNCE_MS = 300;

export interface LocalStore<T> {
  /** Parsed and validated, or null — a record that fails to parse is removed. */
  load(now?: number): T | null;
  /** Debounced. Always pair with `flush` on unload. */
  save(value: T): void;
  /** Writes any debounced change immediately. */
  flush(): void;
  /** Cancels a pending write *and* removes the record. */
  discard(): void;
  persistOnUnload(): void;
}

export interface StoreOptions<T> {
  key: string;
  /** Returns null for anything unreadable, expired or structurally unsound. */
  parse: (raw: string | null, now: number) => T | null;
}

export function createLocalStore<T extends { updatedAt: number }>({
  key,
  parse,
}: StoreOptions<T>): LocalStore<T> {
  let pending: T | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function clear(): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to do — if we cannot remove it, it will expire.
    }
  }

  function write(value: T): void {
    try {
      window.localStorage.setItem(key, JSON.stringify({ ...value, updatedAt: Date.now() }));
    } catch {
      // Quota exceeded or storage blocked. The in-memory record is unaffected.
    }
  }

  function flush(): void {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (pending) write(pending);
    pending = null;
  }

  return {
    load(now: number = Date.now()): T | null {
      let raw: string | null;
      try {
        raw = window.localStorage.getItem(key);
      } catch {
        return null;
      }

      const value = parse(raw, now);
      // A record we could not make sense of is removed rather than left to be
      // re-read and re-rejected on every load.
      if (!value) clear();
      return value;
    },

    save(value: T): void {
      pending = value;
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (pending) write(pending);
        pending = null;
      }, SAVE_DEBOUNCE_MS);
    },

    flush,

    /*
     * `clear()` alone is not enough: a save queued moments earlier would fire
     * afterwards and recreate the record the customer just asked us to forget.
     */
    discard(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      pending = null;
      clear();
    },

    /*
     * A customer who closes the tab within the debounce window would otherwise
     * lose their last keystroke. `pagehide` is the only event iOS Safari fires
     * reliably when a tab is backgrounded or the app is swiped away;
     * `visibilitychange` covers the rest.
     */
    persistOnUnload(): void {
      window.addEventListener('pagehide', flush);
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flush();
      });
    },
  };
}
