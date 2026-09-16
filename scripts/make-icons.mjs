/*
 * Favicon and share image, generated from the client's own logo.
 *
 *   node scripts/make-icons.mjs
 *
 * Both were placeholders: `favicon.svg` was a plain navy square from
 * scaffolding, and no `og:image` existed at all, so pasting a link into
 * WhatsApp or a message thread gave a bare text preview.
 *
 * Why the favicon is the crown alone: `logo-stacked.svg` is the crown above
 * "PRINCES ELECTRONICS", and at 32px that wordmark is three illegible grey
 * smudges. The crown is found by measurement rather than by a hardcoded crop —
 * rasterise, take the ink rows, and cut at the first blank band, which is the
 * gap the lockup already has between mark and words. Re-run this if the logo
 * is ever replaced.
 *
 * Uses `sharp`, already installed as one of Astro's dependencies (rule 2.8).
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'src/assets/logo-stacked.svg';
const WHITE = 250;

/*
 * The lockup's viewBox is ~16900 user units wide. sharp rasterises an SVG at
 * `density` DPI against those units, so the default 72 asks for a 16900px
 * image and anything higher blows past its pixel limit outright. Density is
 * therefore derived from the viewBox to land on a target width.
 */
const viewBox = readFileSync(SOURCE, 'utf8').match(/viewBox="[\d.]+ [\d.]+ ([\d.]+)/);
const unitsWide = viewBox ? Number(viewBox[1]) : 1024;
const densityFor = (targetWidth) => Math.max(1, (targetWidth * 72) / unitsWide);

/** Rows that contain ink, from a greyscale raster. */
async function inkRows(buffer) {
  const { data, info } = await sharp(buffer)
    .flatten({ background: '#ffffff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rows = [];
  for (let y = 0; y < info.height; y += 1) {
    let inked = false;
    for (let x = 0; x < info.width && !inked; x += 1) {
      if (data[y * info.width + x] < WHITE) inked = true;
    }
    rows.push(inked);
  }
  return { rows, width: info.width, height: info.height };
}

const full = await sharp(SOURCE, { density: densityFor(1024) })
  .flatten({ background: '#ffffff' })
  .png()
  .toBuffer();

const { rows, width, height } = await inkRows(full);

const firstInk = rows.indexOf(true);
if (firstInk < 0) throw new Error('the logo rasterised blank');

/*
 * The first run of blank rows after the mark begins is the gap between the
 * crown and the wordmark. A single stray blank row inside the crown would cut
 * it in half, so a gap only counts once it is a real one — 1.5% of the image.
 */
const MIN_GAP = Math.round(height * 0.015);
let gapStart = -1;
let run = 0;
for (let y = firstInk; y < height; y += 1) {
  if (!rows[y]) {
    if (run === 0) gapStart = y;
    run += 1;
    if (run >= MIN_GAP) break;
  } else {
    run = 0;
    gapStart = -1;
  }
}
const crownBottom = gapStart > firstInk ? gapStart : height;

// Horizontal extent of the crown only, so the square is centred on the mark.
const { data, info } = await sharp(full)
  .extract({ left: 0, top: firstInk, width, height: crownBottom - firstInk })
  .flatten({ background: '#ffffff' })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

let left = info.width;
let right = -1;
for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    if (data[y * info.width + x] < WHITE) {
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
}

const crown = await sharp(full)
  .extract({
    left,
    top: firstInk,
    width: right - left + 1,
    height: crownBottom - firstInk,
  })
  .toBuffer();

const meta = await sharp(crown).metadata();
console.log(`crown found: ${meta.width}x${meta.height} of ${width}x${height}`);

/** Square, centred, with a little air — a tab icon that touches its edges reads as noise. */
async function square(size, pad) {
  const inner = Math.round(size * (1 - pad * 2));
  const fitted = await sharp(crown)
    .resize(inner, inner, { fit: 'inside', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toBuffer();
  const fittedMeta = await sharp(fitted).metadata();
  return sharp({
    create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
  })
    .composite([
      {
        input: fitted,
        left: Math.round((size - fittedMeta.width) / 2),
        top: Math.round((size - fittedMeta.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

writeFileSync('public/favicon.png', await square(512, 0.06));
// Apple's icon is composited onto a white tile, so it gets one of its own.
const touch = await sharp({
  create: { width: 180, height: 180, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .composite([{ input: await square(180, 0.14), left: 0, top: 0 }])
  .png()
  .toBuffer();
writeFileSync('public/apple-touch-icon.png', touch);

/*
 * The share card. 1200x630 is what every platform crops from, and the safe
 * area is the middle — so the lockup sits centred with the tagline under it
 * and nothing near an edge.
 */
const OG_W = 1200;
const OG_H = 630;
const lockup = await sharp(SOURCE, { density: densityFor(1400) })
  .resize({ height: 260 })
  .flatten({ background: '#ffffff' })
  .png()
  .toBuffer();
const lockupMeta = await sharp(lockup).metadata();

const caption = `<svg width="${OG_W}" height="90" xmlns="http://www.w3.org/2000/svg">
  <text x="${OG_W / 2}" y="46" text-anchor="middle"
        font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="30" fill="#4a5a72">
    Every major brand, at speed.
  </text>
  <text x="${OG_W / 2}" y="86" text-anchor="middle"
        font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="24" fill="#66738a">
    Send us the model — we reply with a price within 24 hours.
  </text>
</svg>`;

await sharp({
  create: { width: OG_W, height: OG_H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
})
  .composite([
    {
      input: lockup,
      left: Math.round((OG_W - lockupMeta.width) / 2),
      top: 150,
    },
    { input: Buffer.from(caption), left: 0, top: 440 },
  ])
  .png()
  .toFile('public/og-image.png');

console.log('wrote public/favicon.png, public/apple-touch-icon.png, public/og-image.png');
