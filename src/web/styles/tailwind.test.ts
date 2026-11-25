import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cn } from '../ui/cn.js';

const tailwind = readFileSync('src/web/styles/tailwind.css', 'utf8');
const tokens = readFileSync('src/web/styles/tokens.css', 'utf8');
const declared = new Set(
  [...tokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]),
);
const mapped = [
  ...tailwind.matchAll(/(--[a-z0-9-]+):\s*var\((--[a-z0-9-]+)\)/g),
];

function names(namespace: string): string[] {
  return mapped
    .map((match) => match[1] as string)
    .filter((name) => name.startsWith(`--${namespace}-`))
    .map((name) => name.slice(namespace.length + 3));
}

describe('tailwind.css', () => {
  it('imports only the theme and the utilities, never Preflight', () => {
    const imports = [...tailwind.matchAll(/@import\s+["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
    expect(imports).toEqual(['tailwindcss/theme', 'tailwindcss/utilities']);
  });

  it('switches off the default palette, radii and text scale', () => {
    for (const namespace of ['color', 'radius', 'text']) {
      expect(tailwind).toContain(`--${namespace}-*: initial;`);
    }
  });

  it('maps every theme name onto a variable tokens.css declares', () => {
    expect(names('color').length).toBeGreaterThan(30);
    expect(names('radius')).toContain('button');
    const missing = mapped
      .map((match) => match[2] as string)
      .filter((name) => !declared.has(name));
    expect(missing).toEqual([]);
  });

  it('has no raw colour and no dark variant', () => {
    expect(tailwind).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|oklch\(|dark:/i);
  });
});

describe('cn', () => {
  it('knows every text size, so a size and a colour both survive', () => {
    for (const size of names('text')) {
      expect(cn('text-snow', `text-${size}`)).toBe(`text-snow text-${size}`);
      expect(cn(`text-${size}`, 'text-snow', 'text-8')).toBe(
        'text-snow text-8',
      );
    }
  });

  it('knows every radius, weight and shadow', () => {
    for (const radius of names('radius')) {
      expect(cn(`rounded-${radius}`, 'rounded-badge')).toBe('rounded-badge');
    }
    for (const weight of names('font-weight')) {
      expect(cn('font-sans', `font-${weight}`, 'font-light')).toBe(
        'font-sans font-light',
      );
    }
    for (const shadow of names('shadow')) {
      expect(cn(`shadow-${shadow}`, 'shadow-none')).toBe('shadow-none');
    }
    for (const tracking of names('tracking')) {
      expect(cn(`tracking-${tracking}`, 'tracking-normal')).toBe(
        'tracking-normal',
      );
    }
    expect(cn('min-h-hit', 'min-h-4')).toBe('min-h-4');
  });
});

const PALETTE = [
  ...new Set(
    [...tokens.matchAll(/--color-([a-z-]+)\s*:/g)].map(
      (match) => match[1] as string,
    ),
  ),
];
const COLOR_PREFIXES =
  'bg|text|border|border-[stbexy]|outline|ring|fill|stroke|decoration|accent|caret|divide|placeholder|from|via|to';
const PALETTE_UTILITY = new RegExp(
  `(?<![\\w-])(${COLOR_PREFIXES})-(${PALETTE.join('|')})(?![\\w-])`,
);
const PHYSICAL_UTILITY =
  /(?<![\w-])-?((p|m|scroll-p|scroll-m|border-|rounded-|rounded-[tb])[lr]|left|right)(-[\w./]+)?(?![\w-])|(?<![\w-])(text|float|clear)-(left|right)(?![\w-])/;
const LITERAL_ATTRIBUTE = /\b(aria-label|title|placeholder|alt)="[^"]/;
const LITERAL_TEXT = />\s*[A-Za-z][A-Za-z ,.'!?:-]*\s*<\//;

const UI_LINTS: [string, RegExp, string[]][] = [
  ['a hex colour', /#[0-9a-f]{3,8}\b/i, ['text-#fff']],
  ['an arbitrary value', /-\[[^\]]+\]/, ['p-[3px]']],
  ['a palette utility', PALETTE_UTILITY, ['bg-graphite', 'hover:text-snow']],
  [
    'a physical utility',
    PHYSICAL_UTILITY,
    ['pl-2', '-mr-1', 'left-0', 'text-right', 'border-l', 'rounded-tl-control'],
  ],
  ['a literal attribute', LITERAL_ATTRIBUTE, ['<button aria-label="Close" />']],
  ['a literal text node', LITERAL_TEXT, ['<span>Close</span>']],
];
const NOT_PRIMITIVES = ['strings'];
const GOOD =
  '<span className="bg-surface text-fg border-line ps-2 -me-1 start-0 text-start rounded-s-control data-highlighted:bg-fill">{label}</span>';

describe('src/web/ui', () => {
  const files = readdirSync('src/web/ui').filter(
    (file) => file.endsWith('.tsx') && !file.includes('.test.'),
  );

  it('lists every primitive file in the contract test', () => {
    const contract = readFileSync('src/web/ui/contract.test.tsx', 'utf8');
    const missing = files
      .map((file) => file.replace('.tsx', ''))
      .filter((file) => !NOT_PRIMITIVES.includes(file))
      .filter((file) => !contract.includes(`file: '${file}'`));
    expect(missing).toEqual([]);
  });

  for (const [what, pattern, bad] of UI_LINTS) {
    it(`has no file with ${what}`, () => {
      for (const sample of bad) expect(sample).toMatch(pattern);
      expect(GOOD).not.toMatch(pattern);
      for (const file of files) {
        const source = readFileSync(`src/web/ui/${file}`, 'utf8');
        expect(source, file).not.toMatch(pattern);
      }
    });
  }
});
