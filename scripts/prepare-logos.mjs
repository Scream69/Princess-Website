/*
 * Brand logo preparation.
 *
 * The client supplies logos as photographs — PNG, JPG, WebP, AVIF, whatever
 * the manufacturer's press page handed over — in a folder of letter
 * subdirectories. This turns that into what the brand grid needs: one file per
 * brand, named for its slug, trimmed to its own ink, and scaled so that every
 * mark reads at the same visual weight (CLAUDE.md 9.4).
 *
 *   node scripts/prepare-logos.mjs --report   inspect the source, write nothing
 *   node scripts/prepare-logos.mjs            write public/brands/<slug>.webp
 *
 * Run `--report` first. It is the only way to see which files are too small to
 * survive a 2x render, and a soft logo on a white card is worse than the text
 * fallback it replaces.
 *
 * Uses `sharp`, already installed as one of Astro's own dependencies — nothing
 * was added for this (rule 2.8).
 *
 * WHY THE SCALING IS NOT "FIT EVERYTHING TO THE SAME BOX". Fitting each mark
 * to the same width makes a long wordmark tower over a square badge, and
 * fitting to the same height does the reverse; CLAUDE.md 9.4 calls that out as
 * the thing that looks amateur. Each mark is instead scaled so its *geometric
 * mean* — sqrt(width x height) — is constant, which is a good stand-in for how
 * big something looks, then clamped so nothing overflows the canvas. Every
 * output file is the same pixel size with the mark centred, so the grid can
 * render them all in an identical box.
 */
import sharp from 'sharp';
import { readdirSync, statSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { brands } from '../src/data/brands.ts';

const SOURCE = process.env.LOGO_SOURCE ?? 'C:/Users/DhairyaMehta/Desktop/ALL BRANDS';
const OUT_DIR = 'public/brands';

/*
 * The canvas, at 2x. 140x44 CSS pixels is what the narrowest grid — the
 * six-column featured row — can give a logo without crowding its card.
 */
const CANVAS_W = 280;
const CANVAS_H = 88;
/** A little breathing room inside the canvas, so nothing touches the edge. */
const USABLE_W = 272;
const USABLE_H = 84;
/*
 * The constant every mark is scaled to. Chosen so a typical wordmark lands
 * comfortably inside the canvas rather than against its edges: a 4.8:1 mark
 * comes out 258x54, a square one 118x118 before the height clamp takes it.
 */
const OPTICAL_TARGET = 118;

/** Below this, a 2x render is doing nothing and the mark will look soft. */
const MIN_USABLE_WIDTH = 240;

/*
 * Files whose names do not match a brand, and the one case where two files
 * describe the same brand. Explicit, because guessing which file is which
 * manufacturer is exactly the kind of invention rule 2.3 forbids — each of
 * these was identified by looking at the artwork.
 */
const OVERRIDES = {
  'F/Fridge master.png': 'fridgemaster',
  'M/MORPHY RICHARD.png': 'morphy-richards',
  'N/Segway-Ninebot_Logo.png': 'ninebot',
  'S/SCHONHAUS.png': 'schonhaus',
  'Z/Screenshot 2026-09-10 174948.png': 'zenith', // Brand is inactive; kept so it is ready if it returns.
};

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** "AEG LOGO.png" -> "aeg", for matching against brand names. */
function normalise(value) {
  return value
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(logo|logos|brand|image|images)\b/g, ' ')
    .replace(/[^a-z0-9& ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const byName = new Map(brands.map((brand) => [normalise(brand.name), brand.slug]));

function slugFor(rel) {
  if (rel in OVERRIDES) return OVERRIDES[rel];
  return byName.get(normalise(basename(rel))) ?? null;
}

/*
 * Crop to the ink, by measuring it.
 *
 * `sharp.trim()` compares everything to the top-left pixel and gives up the
 * moment a margin is not perfectly uniform. Samsung and Tower did not shrink
 * by a single pixel at any threshold from 12 to 70, so both rendered small and
 * lost on their cards while every neighbour filled its box.
 *
 * So the background is measured rather than assumed. The most common grey
 * level in a logo file is its background — and it is rarely 255: these are
 * JPEGs and WebPs, and Montpellier's "white" and Zanussi's are both a shade
 * off it. Fixing the threshold at near-white made every pixel in those two
 * count as ink, and both collapsed to a ninth of their proper size.
 *
 * The dark-background case is separate and has to stay separate. Where the
 * dominant colour is dark the block is part of the mark, not something behind
 * it — Hotpoint, KEF, Miele, Zanussi — so there the rule falls back to "ink is
 * anything that is not near-white", which keeps the block and drops only the
 * white margin around it.
 */
async function inkBox(file) {
  const flat = sharp(file).flatten({ background: '#ffffff' });
  const { data, info } = await flat
    .clone()
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 1) histogram[data[i]] += 1;

  let background = 0;
  for (let value = 1; value < 256; value += 1) {
    if (histogram[value] > histogram[background]) background = value;
  }

  /** Light background: ink is whatever differs from it. Dark: ink is the block. */
  const isInk =
    background >= 200
      ? (value) => Math.abs(value - background) > 12
      : (value) => value < 244;

  let top = info.height;
  let bottom = -1;
  let left = info.width;
  let right = -1;

  for (let y = 0; y < info.height; y += 1) {
    const row = y * info.width;
    for (let x = 0; x < info.width; x += 1) {
      if (isInk(data[row + x])) {
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  // An entirely blank image: keep it whole rather than crop to nothing.
  if (bottom < 0) return flat.toBuffer({ resolveWithObject: true });

  return flat
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .toBuffer({ resolveWithObject: true });
}

const files = walk(SOURCE).sort();
const report = process.argv.includes('--report');

if (!report) {
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
}

const results = [];

for (const file of files) {
  const rel = relative(SOURCE, file).replace(/\\/g, '/');
  const slug = slugFor(rel);
  const row = { rel, slug, kb: Math.round(statSync(file).size / 1024) };

  if (slug === null) {
    row.note = rel in OVERRIDES ? 'skipped — superseded' : 'NO BRAND MATCH';
    results.push(row);
    continue;
  }

  try {
    const trimmed = await inkBox(file);
    const { width, height } = trimmed.info;
    row.trimmed = `${width}x${height}`;

    const aspect = width / height;
    let targetW = Math.round(OPTICAL_TARGET * Math.sqrt(aspect));
    let targetH = Math.round(OPTICAL_TARGET / Math.sqrt(aspect));

    // Clamp, preserving aspect: the canvas wins over the optical target.
    const shrink = Math.min(1, USABLE_W / targetW, USABLE_H / targetH);
    targetW = Math.max(1, Math.round(targetW * shrink));
    targetH = Math.max(1, Math.round(targetH * shrink));

    row.rendered = `${targetW}x${targetH}`;
    row.upscale = Number((targetW / width).toFixed(2));

    if (width < MIN_USABLE_WIDTH) row.soft = `source only ${width}px wide`;

    if (!report) {
      const resized = await sharp(trimmed.data)
        .resize(targetW, targetH, { fit: 'fill' })
        .toBuffer();

      await sharp({
        create: {
          width: CANVAS_W,
          height: CANVAS_H,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        },
      })
        .composite([
          {
            input: resized,
            left: Math.round((CANVAS_W - targetW) / 2),
            top: Math.round((CANVAS_H - targetH) / 2),
          },
        ])
        .webp({ quality: 92, effort: 6 })
        .toFile(join(OUT_DIR, `${slug}.webp`));

      row.out = `${slug}.webp`;
      row.outKb = Math.round(statSync(join(OUT_DIR, `${slug}.webp`)).size / 1024);
    }
  } catch (error) {
    row.note = `FAILED — ${error.message.split('\n')[0].slice(0, 60)}`;
  }

  results.push(row);
}

const pad = (value, n) => String(value).padEnd(n);
console.log(
  pad('file', 36),
  pad('slug', 18),
  pad('trimmed', 11),
  pad('rendered', 10),
  pad('up', 5),
  'note',
);
console.log('-'.repeat(100));
for (const r of results) {
  console.log(
    pad(r.rel, 36),
    pad(r.slug ?? '-', 18),
    pad(r.trimmed ?? '-', 11),
    pad(r.rendered ?? '-', 10),
    pad(r.upscale ?? '-', 5),
    [r.note, r.soft, r.outKb ? `${r.outKb}KB` : null].filter(Boolean).join(' · '),
  );
}

const written = results.filter((r) => r.out);
const missing = brands.filter(
  (brand) => brand.active && !results.some((r) => r.slug === brand.slug && !r.note),
);

console.log(`\n${files.length} files · ${written.length} written`);
if (missing.length) {
  console.log(`${missing.length} active brands still without a logo:`);
  for (const brand of missing) console.log('   ', brand.slug.padEnd(20), brand.name);
} else {
  console.log('Every active brand has a logo.');
}

const soft = results.filter((r) => r.soft && r.slug);
if (soft.length) {
  console.log(`\n${soft.length} are below ${MIN_USABLE_WIDTH}px and will look soft on a phone:`);
  for (const r of soft) console.log('   ', pad(r.slug, 18), r.soft, `· upscaled ${r.upscale}x`);
}
