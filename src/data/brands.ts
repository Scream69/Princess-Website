import raw from './brands.json' with { type: 'json' };

export type BrandCategory = 'appliances' | 'av' | 'other';

export interface Brand {
  slug: string;
  name: string;
  /** UK homepage only. `null` only ever on an inactive brand — see `assertLinkable`. */
  url: string | null;
  /** Filename in src/assets/brands/. `null` renders the text fallback (CLAUDE.md 9.4). */
  logo: string | null;
  opticalScale: number;
  categories: BrandCategory[];
  featured: boolean;
  authorised: boolean;
  active: boolean;
}

/** A brand that has passed `assertLinkable` — `url` is guaranteed present. */
export type LinkableBrand = Brand & { url: string };

const all = raw as Brand[];

/*
 * A rendered brand card with no destination is a dead end in the middle of
 * the funnel: the customer taps it, nothing opens, and step 3 of the model
 * (bring back a model number) can never happen. Two brands in the Euronics
 * list have no manufacturer site at all, so rather than trust every caller
 * to null-check, the single entry point below refuses to emit them.
 */
export function assertLinkable(brands: Brand[]): LinkableBrand[] {
  const broken = brands.filter((b) => !b.url);
  if (broken.length > 0) {
    throw new Error(
      `brands.json: active brands with no url: ${broken.map((b) => b.slug).join(', ')}. ` +
        `Set "active": false, or supply a UK homepage.`,
    );
  }
  return brands as LinkableBrand[];
}

/** Strip diacritics so Schönhaus files under S, not after Z. */
export function firstLetter(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .charAt(0)
    .toUpperCase();
}

/** Every active brand, alphabetical. Order is derived, never hand-maintained (CLAUDE.md 5.1). */
export const brands: LinkableBrand[] = assertLinkable(all.filter((b) => b.active)).sort((a, b) =>
  a.name.localeCompare(b.name, 'en-GB'),
);

export const featuredBrands: LinkableBrand[] = brands.filter((b) => b.featured);

/** A–Z, with `has` false for letters no active brand starts with (CLAUDE.md 9.4). */
export const alphabet: { letter: string; has: boolean }[] = Array.from({ length: 26 }, (_, i) => {
  const letter = String.fromCharCode(65 + i);
  return { letter, has: brands.some((b) => firstLetter(b.name) === letter) };
});

export const categories: { value: BrandCategory; label: string }[] = [
  { value: 'appliances', label: 'Appliances' },
  { value: 'av', label: 'TV & audio' },
  { value: 'other', label: 'Everything else' },
];
