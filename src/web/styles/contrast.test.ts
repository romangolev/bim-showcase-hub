import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/web/styles/tokens.css', 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)) {
    tokens[match[1] as string] = match[2] as string;
  }
  return tokens;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ['void', 'graphite', 'charcoal'];
const TEXT = [
  'steel',
  'fog',
  'ash',
  'chalk',
  'snow',
  'arc-blue',
  'coral',
  'mint',
];
const UI = [
  'ring-blue',
  'signal-blue',
  'tag-red',
  'tag-orange',
  'tag-yellow',
  'tag-green',
  'tag-blue',
  'tag-purple',
];

const THEMES = {
  dark: block(':root[data-theme="dark"]'),
  light: block(':root[data-theme="light"]'),
};

describe('theme contrast', () => {
  for (const [theme, tokens] of Object.entries(THEMES)) {
    for (const surface of SURFACES) {
      for (const text of TEXT) {
        it(`${theme}: ${text} text on ${surface} is at least 4.5:1`, () => {
          expect(
            contrast(tokens[text] as string, tokens[surface] as string),
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
      for (const ui of UI) {
        it(`${theme}: ${ui} on ${surface} is at least 3:1`, () => {
          expect(
            contrast(tokens[ui] as string, tokens[surface] as string),
          ).toBeGreaterThanOrEqual(3);
        });
      }
    }
  }
});
