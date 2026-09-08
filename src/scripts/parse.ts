/*
 * Turns whatever the customer pasted into something the client can read.
 *
 * Parsing is a convenience, never a gate (CLAUDE.md 8.3). Every branch here
 * has to end with the input accepted: the worst outcome is a tray row showing
 * the raw string, which is still a usable enquiry. `rawInput` is stored
 * unmodified alongside whatever we managed to extract.
 */
import type { InputType } from './storage.ts';

export interface ParsedInput {
  inputType: InputType;
  model: string | null;
  name: string | null;
}

/*
 * Per-brand overrides. Deliberately empty.
 *
 * CLAUDE.md 8.3 asks for a table of brand-specific patterns, but writing 65 of
 * them without having seen a real URL from each brand would be inventing brand
 * facts (CLAUDE.md 2.2). The generic extractor below already handles every
 * example encountered so far. Add an entry here only when a real URL proves
 * the generic rule wrong for that brand, and note the example URL.
 */
export const BRAND_MODEL_PATTERNS: Record<string, RegExp> = {};

/** Path segments that carry no meaning and should never become a product name. */
const NOISE = new Set([
  'p',
  'en',
  'gb',
  'uk',
  'en-gb',
  'en_gb',
  'shop',
  'store',
  'buy',
  'product',
  'products',
  'detail',
  'details',
  'index',
  'home',
  'category',
  'categories',
]);

const hasLetter = (value: string) => /[a-z]/i.test(value);
const hasDigit = (value: string) => /\d/.test(value);

/** A model number is the rare token that mixes letters and digits. */
function looksLikeModel(token: string): boolean {
  return token.length >= 5 && token.length <= 24 && hasLetter(token) && hasDigit(token);
}

function stripExtension(segment: string): string {
  return segment.replace(/\.(html?|aspx?|php|jsp)$/i, '');
}

export function humanise(segment: string): string {
  const words = stripExtension(segment)
    .split(/[-_+]+/)
    .filter((word) => word !== '' && !NOISE.has(word.toLowerCase()));

  if (words.length === 0) return '';

  return words
    .map((word) =>
      // Leave existing capitalisation alone if the source already mixed case,
      // so "GreatOffer" is not flattened, but title-case plain lowercase slugs.
      word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(' ');
}

function toUrl(value: string): URL | null {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    // Reject "H7860BPX" being read as a hostname: a real host has a dot and
    // the original text must have looked like a link, not a bare token.
    if (!url.hostname.includes('.')) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value) && !/^www\./i.test(value)) return null;
    return url;
  } catch {
    return null;
  }
}

function modelFromSegments(segments: string[], override?: RegExp): { model: string; index: number } | null {
  // Search from the end: the model is almost always the deepest part of a path.
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = stripExtension(segments[index]);

    if (override) {
      const match = segment.match(override);
      if (match) return { model: (match[1] ?? match[0]).toUpperCase(), index };
      continue;
    }

    const tokens = segment.split(/[-_]+/).filter(looksLikeModel);
    if (tokens.length > 0) {
      // Longest wins: "bpx535061m" beats a stray "2024".
      const model = tokens.reduce((a, b) => (b.length > a.length ? b : a));
      return { model: model.toUpperCase(), index };
    }
  }
  return null;
}

function nameFromSegments(segments: string[], modelIndex: number, model: string | null): string {
  const candidates: string[] = [];

  if (modelIndex >= 0) {
    const withoutModel = model
      ? stripExtension(segments[modelIndex])
          .split(/[-_]+/)
          .filter((token) => token.toUpperCase() !== model)
          .join('-')
      : segments[modelIndex];
    candidates.push(withoutModel);
  }

  // AEG puts the model in its own segment (".../induction-hob/ikx64301cb/"),
  // so the descriptive name is one level up.
  for (let index = modelIndex - 1; index >= 0; index -= 1) candidates.push(segments[index]);

  for (const candidate of candidates) {
    const name = humanise(candidate);
    // A name made only of digits is a category id, not a product.
    if (name !== '' && hasLetter(name)) return name;
  }
  return '';
}

function parseUrl(url: URL, brandSlug?: string | null): ParsedInput {
  const segments = url.pathname
    .split('/')
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .filter((segment) => segment !== '');

  const override = brandSlug ? BRAND_MODEL_PATTERNS[brandSlug] : undefined;
  let found = modelFromSegments(segments, override);

  // Some sites carry the model in the query rather than the path.
  if (!found) {
    for (const value of url.searchParams.values()) {
      if (looksLikeModel(value)) {
        found = { model: value.toUpperCase(), index: segments.length - 1 };
        break;
      }
    }
  }

  const modelIndex = found?.index ?? segments.length - 1;
  const name = nameFromSegments(segments, modelIndex, found?.model ?? null);

  return {
    inputType: 'url',
    model: found?.model ?? null,
    name: name === '' ? null : name,
  };
}

function parseBareText(value: string): ParsedInput {
  const tokens = value.split(/\s+/);
  const collapsed = value.replace(/[\s]+/g, '');

  // A model number typed by hand is either one token ("H7860BPX") or a few
  // short ones ("H 7860 BPX"). Anything wordier is a description.
  const shaped =
    /^[a-z0-9/.-]+$/i.test(collapsed) &&
    collapsed.length >= 3 &&
    collapsed.length <= 24 &&
    hasLetter(collapsed) &&
    hasDigit(collapsed) &&
    tokens.length <= 4 &&
    // Only the spaced form ("H 7860 BPX") needs the per-token limit; it is what
    // separates a model from a short phrase. A single token is already bounded
    // by the overall length check above.
    (tokens.length === 1 || tokens.every((token) => token.length <= 6));

  return shaped
    ? { inputType: 'model', model: collapsed.toUpperCase(), name: null }
    : { inputType: 'description', model: null, name: null };
}

export function parseInput(raw: string, brandSlug?: string | null): ParsedInput {
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value === '') return { inputType: 'description', model: null, name: null };

  const url = toUrl(value);
  return url ? parseUrl(url, brandSlug) : parseBareText(value);
}

/** The line shown back to the customer, e.g. "Oven — BPX535061M". */
export function describe(parsed: ParsedInput, raw: string): string {
  if (parsed.name && parsed.model) return `${parsed.name} — ${parsed.model}`;
  return parsed.model ?? parsed.name ?? raw.trim();
}
