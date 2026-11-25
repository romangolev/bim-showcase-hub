import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  contrast,
  resolveRoles,
  roleFailures,
  type Scheme,
} from './roleContrast.js';

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
    it(`${theme}: every role pair passes`, () => {
      expect(roleFailures(resolveRoles(css, theme as Scheme))).toEqual([]);
    });
  }
});
