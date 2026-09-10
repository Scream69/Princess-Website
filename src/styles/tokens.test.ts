import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * The contrast budget in CLAUDE.md 10.1 is pass/fail, so it is a test rather
 * than a comment. Written after a pass found two real failures that had been
 * sitting in the palette since Phase 1: `ink-subtle` was 3.5:1 and used for
 * footer text, and `line-strong` was 1.7:1 while being the only thing
 * outlining every input on the site.
 *
 * The tokens are parsed out of the stylesheet rather than duplicated here —
 * a copy would drift, and then this would be testing itself.
 */
const css = readFileSync(new URL('./global.css', import.meta.url), 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `--color-${name} is not defined in global.css`);
  return match[1]!;
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((pair) => {
      const value = parseInt(pair, 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const CANVAS = 'canvas';
const SURFACE = 'surface';

/** Every colour used for text, against both backgrounds it can sit on. */
const TEXT: string[] = ['ink', 'ink-muted', 'ink-subtle', 'accent', 'error'];

for (const name of TEXT) {
  test(`${name} text meets AA on both backgrounds`, () => {
    for (const background of [CANVAS, SURFACE]) {
      const ratio = contrast(token(name), token(background));
      assert.ok(
        ratio >= 4.5,
        `${name} on ${background} is ${ratio.toFixed(2)}:1, below the 4.5:1 minimum`,
      );
    }
  });
}

test('text on the accent colour meets AA', () => {
  const ratio = contrast(token('accent-contrast'), token('accent'));
  assert.ok(ratio >= 4.5, `accent-contrast on accent is ${ratio.toFixed(2)}:1`);
});

test('the accent stays legible as a hover state', () => {
  const ratio = contrast(token('accent-contrast'), token('accent-hover'));
  assert.ok(ratio >= 4.5, `accent-contrast on accent-hover is ${ratio.toFixed(2)}:1`);
});

/*
 * 1.4.11: the border is the only thing identifying an empty text field, so it
 * is a UI component and needs 3:1 — a rule that is easy to miss because the
 * text inside the field passes comfortably.
 */
test('input borders meet the 3:1 minimum for UI components', () => {
  for (const background of [CANVAS, SURFACE]) {
    const ratio = contrast(token('line-strong'), token(background));
    assert.ok(
      ratio >= 3,
      `line-strong on ${background} is ${ratio.toFixed(2)}:1, below the 3:1 minimum`,
    );
  }
});

test('the focus ring is visible against every background it lands on', () => {
  for (const background of [CANVAS, SURFACE]) {
    const ratio = contrast(token('accent'), token(background));
    assert.ok(ratio >= 3, `the focus ring on ${background} is ${ratio.toFixed(2)}:1`);
  }
});

/*
 * `line` is deliberately not held to 3:1. It draws card edges and dividers,
 * which carry no information a sighted user needs to operate anything — the
 * cards are identified by their text. Holding it to 3:1 would make every
 * divider on the page a hard grey line, and 1.4.11 does not ask for it.
 */
test('the decorative border stays lighter than the functional one', () => {
  assert.ok(contrast(token('line'), token(SURFACE)) < contrast(token('line-strong'), token(SURFACE)));
});
