/*
 * Client-side brand filter.
 *
 * The grid is fully rendered at build time; this only hides non-matches.
 * That keeps the page usable with JS disabled or still loading, and means
 * the filter cannot cause layout shift (CLAUDE.md 10.2).
 */

/** Case, accents and punctuation all folded away, so "Fisher & Paykel" matches "fisherpaykel". */
export function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/*
 * Subsequence match rather than substring: "mrph" finds Morphy Richards and
 * "sms" finds Samsung, which covers the common case of a customer typing the
 * consonants of a half-remembered name.
 *
 * ponytail: no edit-distance, so a genuine transposition ("smasung") misses.
 * Add Levenshtein only if the analytics in 8.10 show empty-result searches
 * that a fuzzier match would have caught.
 */
export function matches(query: string, name: string): boolean {
  const q = normalise(query);
  if (q === '') return true;

  const haystack = normalise(name);
  let i = 0;
  for (const char of haystack) {
    if (char === q[i]) i += 1;
    if (i === q.length) return true;
  }
  return false;
}

export interface BrandFilterInput {
  query: string;
  category: string;
}

/** Decides visibility for one card. Kept pure so the rules are testable without a DOM. */
export function isVisible(
  { query, category }: BrandFilterInput,
  brand: { name: string; categories: string[] },
): boolean {
  if (category !== 'all' && !brand.categories.includes(category)) return false;
  return matches(query, brand.name);
}

export function initBrandFilter(root: ParentNode = document): void {
  const input = root.querySelector<HTMLInputElement>('[data-brand-filter]');
  const status = root.querySelector<HTMLElement>('[data-brand-status]');
  const empty = root.querySelector<HTMLElement>('[data-brand-empty]');
  const featured = root.querySelector<HTMLElement>('[data-brand-featured]');
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-brand-card]'));
  const rail = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-brand-rail-letter]'));
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-brand-category]'));

  if (!input) return;

  let category = 'all';

  function apply(): void {
    const state = { query: input!.value, category };
    let visible = 0;

    for (const card of cards) {
      const show = isVisible(state, {
        name: card.dataset.name ?? '',
        categories: (card.dataset.categories ?? '').split(' ').filter(Boolean),
      });
      card.hidden = !show;
      if (show) visible += 1;
    }

    // A rail letter that would jump to a hidden card is a broken promise.
    const live = new Set(cards.filter((c) => !c.hidden).map((c) => c.dataset.letter));
    for (const link of rail) {
      link.setAttribute('aria-disabled', String(!live.has(link.dataset.brandRailLetter)));
    }

    // The featured row is a shortcut, not a search result — it only muddies a query.
    const filtering = state.query.trim() !== '' || category !== 'all';
    if (featured) featured.hidden = filtering;

    if (empty) empty.hidden = visible > 0;
    if (status) {
      status.textContent =
        visible === 0
          ? 'No brands match your search.'
          : `${visible} ${visible === 1 ? 'brand' : 'brands'} shown.`;
    }
  }

  input.addEventListener('input', apply);

  for (const chip of chips) {
    chip.addEventListener('click', () => {
      category = chip.dataset.brandCategory ?? 'all';
      for (const other of chips) {
        other.setAttribute('aria-pressed', String(other === chip));
      }
      apply();
    });
  }

  // Escape clears, matching the convention of every other search field.
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && input.value !== '') {
      input.value = '';
      apply();
    }
  });

  apply();
}
