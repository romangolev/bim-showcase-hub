import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { THEMES } from '../theme/theme.js';
import { Button } from '../ui/Button.js';
import { IconButton } from '../ui/IconButton.js';
import { ToggleButton } from '../ui/ToggleButton.js';
import {
  declarations,
  resolveRoles,
  roleFailures,
  type Scheme,
} from './roleContrast.js';

const tokens = readFileSync('src/web/styles/tokens.css', 'utf8');
const PACKS = 'src/web/styles/themes';
const BASE = ['dark', 'light'];

const CONTRAST_PACK = `:root[data-theme="contrast"] {
  color-scheme: dark;
  --color-graphite: #000000;
  --color-charcoal: #0a0a0a;
  --color-void: #000000;
  --ui-text-subtle: #e0e0e0;
  --ui-text-disabled: #b8b8b8;
  --ui-accent: #ffe14d;
  --ui-accent-fill: #1f5fff;
  --ui-solid: #ffe14d;
  --ui-solid-hover: #fff09a;
  --ui-on-solid: #000000;
  --ui-radius-control: 0px;
  --ui-glow-size: 12px;
}`;

const BROKEN_PACK = `:root[data-theme="broken"] {
  color-scheme: light;
  --ui-text: #f4f4f4;
}`;

function pack(css: string, id: string) {
  const block = declarations(css, `:root[data-theme="${id}"]`);
  const scheme = /color-scheme:\s*(dark|light)/.exec(css)?.[1] as Scheme;
  return { block, scheme };
}

const SAMPLES: [string, () => ReactElement][] = [
  ['Button', () => <Button variant="primary">label</Button>],
  ['IconButton', () => <IconButton label="label" />],
  ['ToggleButton', () => <ToggleButton pressed>label</ToggleButton>],
];

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('theme packs', () => {
  it('a third theme resolves every role and passes the contrast pairs', () => {
    const { block, scheme } = pack(CONTRAST_PACK, 'contrast');
    const roles = resolveRoles(tokens, scheme, block);
    const base = resolveRoles(tokens, scheme);
    expect(Object.keys(roles).sort()).toEqual(Object.keys(base).sort());
    expect(Object.values(roles).every(Boolean)).toBe(true);
    expect(roles.accent).toBe('#ffe14d');
    expect(roles.surface).toBe('#000000');
    expect(roles['radius-control']).toBe('0px');
    expect(roleFailures(roles)).toEqual([]);
  });

  it('a pack with an unreadable pair fails the same check', () => {
    const { block, scheme } = pack(BROKEN_PACK, 'broken');
    expect(roleFailures(resolveRoles(tokens, scheme, block))).toContain(
      'text on surface is 1.10:1, below 4.5:1',
    );
  });

  for (const [name, sample] of SAMPLES) {
    it(`${name} renders the same DOM under a third theme, so no primitive knows a theme`, () => {
      document.documentElement.dataset.theme = 'dark';
      const dark = render(sample()).container.innerHTML;
      document.documentElement.dataset.theme = 'contrast';
      const third = render(sample()).container.innerHTML;
      expect(third).toBe(dark);
    });
  }

  it('every shipped pack is one block for a listed theme, sets its scheme and passes contrast', () => {
    const files = existsSync(PACKS)
      ? readdirSync(PACKS).filter((file) => file.endsWith('.css'))
      : [];
    const listed = THEMES.map((theme) => theme.id).filter(
      (id) => !BASE.includes(id),
    );
    expect(files.map((file) => file.replace('.css', '')).sort()).toEqual(
      [...listed].sort(),
    );
    for (const file of files) {
      const id = file.replace('.css', '');
      const css = readFileSync(`${PACKS}/${file}`, 'utf8');
      const { block, scheme } = pack(css, id);
      expect(scheme, file).toBe(
        THEMES.find((theme) => theme.id === id)?.scheme,
      );
      expect(roleFailures(resolveRoles(tokens, scheme, block)), file).toEqual(
        [],
      );
    }
  });
});
