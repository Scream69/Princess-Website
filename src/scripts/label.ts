/*
 * Encodes a repair drop-off slip into a URL fragment, and decodes it back.
 *
 * Why a fragment and not a query string or a stored record: there is no
 * server and no database (CLAUDE.md 3), so the slip has to travel entirely
 * inside the link — and `#` is the one part of a URL browsers never send in
 * an HTTP request. Nothing personal reaches a server log, a CDN's access log,
 * or Netlify/Cloudflare's request logging, because it never leaves the
 * browser at all. The whole artefact is a link: one the client clicks from
 * the notification email, and one the customer can print for themselves on
 * the confirmation screen (CLAUDE.md 5.2-equivalent for repairs).
 *
 * Deliberately NOT the same encoding as the queue/payload machinery in
 * submit.ts: this is a link meant to be pasted around and to survive an email
 * client, so it has to be URL-safe on its own without percent-encoding, and
 * short enough that wrapping is unlikely. Base64url of a compact JSON array
 * (not an object — no repeated key names) does that in the fewest characters
 * available without a dependency (rule 2.8).
 */

/** Field order is the wire format. Changing it is a breaking change — see `LABEL_VERSION`. */
export interface LabelData {
  reference: string;
  name: string;
  phone: string;
  email: string;
  product: string;
  fault: string;
  /** Formatted for display already — e.g. "Monday 21 September, Morning" — so the label never needs slots.ts. */
  dropoff: string;
}

/*
 * Bumped only if the field order below ever changes. A link already sent in
 * an email must keep decoding the way it did when it was sent — the client
 * may click it days later — so this is a compatibility guard, not a version
 * to increment casually.
 */
const LABEL_VERSION = 1;

type Wire = [
  version: number,
  reference: string,
  name: string,
  phone: string,
  email: string,
  product: string,
  fault: string,
  dropoff: string,
];

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const withPadding = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(withPadding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encodes a slip into the string that goes after `#` in the label URL. */
export function encodeLabel(data: LabelData): string {
  const wire: Wire = [
    LABEL_VERSION,
    data.reference,
    data.name,
    data.phone,
    data.email,
    data.product,
    data.fault,
    data.dropoff,
  ];
  const json = JSON.stringify(wire);
  return toBase64Url(new TextEncoder().encode(json));
}

/*
 * Decoding is defensive throughout: this reads a hash typed or pasted by a
 * human, or clipped by an email client's line-wrapping, and a half-arrived
 * link must fail visibly rather than render a slip with fields silently
 * missing or shifted.
 */
export function decodeLabel(hash: string): LabelData | null {
  const value = hash.startsWith('#') ? hash.slice(1) : hash;
  if (value === '') return null;

  let json: string;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(value));
  } catch {
    return null;
  }

  let wire: unknown;
  try {
    wire = JSON.parse(json);
  } catch {
    return null;
  }

  if (!Array.isArray(wire) || wire.length !== 8) return null;
  const [version, reference, name, phone, email, product, fault, dropoff] = wire;
  if (version !== LABEL_VERSION) return null;
  if (
    ![reference, name, phone, email, product, fault, dropoff].every(
      (field) => typeof field === 'string',
    )
  ) {
    return null;
  }

  return { reference, name, phone, email, product, fault, dropoff };
}

/** Builds the full `/repairs/label#...` URL for a given origin. */
export function labelUrl(origin: string, data: LabelData): string {
  return `${origin}/repairs/label#${encodeLabel(data)}`;
}
