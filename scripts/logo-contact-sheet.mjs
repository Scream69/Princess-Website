/*
 * A contact sheet of every supplied logo, trimmed, on a neutral ground.
 *
 * Reading the numbers from `prepare-logos.mjs --report` tells you a file is
 * 536x172 and did not trim; it does not tell you that is because the mark sits
 * on a coloured rectangle. This renders them all onto one image so that kind
 * of thing is obvious at a glance.
 *
 * The ground is deliberately not white: on white, a logo that still carries a
 * white box is invisible as a problem, which is the exact fault being hunted.
 */
import sharp from 'sharp';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SOURCE = process.env.LOGO_SOURCE ?? 'C:/Users/DhairyaMehta/Desktop/ALL BRANDS';
const OUT = process.argv[2] ?? 'logo-contact-sheet.png';

const COLS = 7;
const CELL_W = 260;
const CELL_H = 150;
const LABEL_H = 26;
const GROUND = { r: 232, g: 236, b: 242, alpha: 1 };

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(SOURCE).sort();
const rows = Math.ceil(files.length / COLS);
const width = COLS * CELL_W;
const height = rows * (CELL_H + LABEL_H);

const composites = [];

for (const [index, file] of files.entries()) {
  const rel = relative(SOURCE, file).replace(/\\/g, '/');
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = col * CELL_W;
  const y = row * (CELL_H + LABEL_H);

  try {
    const buffer = await sharp(file)
      .trim({ threshold: 12 })
      .resize(CELL_W - 24, CELL_H - 24, { fit: 'inside', withoutEnlargement: false })
      .png()
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    composites.push({
      input: buffer,
      left: x + Math.round((CELL_W - meta.width) / 2),
      top: y + Math.round((CELL_H - meta.height) / 2),
    });
  } catch {
    // Unreadable files still get a cell, so the grid lines up with the labels.
  }

  const label = rel.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const svg = `<svg width="${CELL_W}" height="${LABEL_H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#0f1b2d"/>
    <text x="${CELL_W / 2}" y="17" font-family="Segoe UI, sans-serif" font-size="12"
          fill="#ffffff" text-anchor="middle">${label}</text>
  </svg>`;
  composites.push({ input: Buffer.from(svg), left: x, top: y + CELL_H });
}

await sharp({
  create: { width, height, channels: 4, background: GROUND },
})
  .composite(composites)
  .png()
  .toFile(OUT);

console.log(`${files.length} logos -> ${OUT} (${width}x${height})`);
