import { readdirSync, readFileSync } from 'node:fs';
import { compile } from 'tailwindcss';
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

  it('scans the primitives and never their tests', () => {
    expect(tailwind).toContain('@source "../ui/**/*.tsx";');
    expect(tailwind).toContain('@source not "../ui/**/*.test.tsx";');
  });
});

describe('cascade layers', () => {
  const global = readFileSync('src/web/styles/global.css', 'utf8');
  const main = readFileSync('src/web/main.tsx', 'utf8');

  it('declares the order once, in the first stylesheet the app loads', () => {
    expect(
      tokens.startsWith('@layer properties, theme, base, utilities, effects;'),
    ).toBe(true);
    const sheets = [...main.matchAll(/import '(\.[^']+\.css)'/g)].map(
      (match) => match[1],
    );
    expect(sheets[0]).toBe('./styles/tokens.css');
  });

  it('keeps the element rules of global.css in the base layer, below the utilities', () => {
    const unlayered = global.slice(global.indexOf('\n}\n') + 3);
    expect(global.startsWith('@layer base {')).toBe(true);
    expect(global.slice(0, global.indexOf('\n}\n'))).toMatch(
      /button,\s*input,\s*select,\s*textarea\s*\{/,
    );
    expect(unlayered).not.toMatch(/^(\*|html|body|button|a|h1)[\s,{:]/m);
  });

  it('compiles utilities into the utilities layer with the hairline border width', async () => {
    const compiler = await compile(tailwind, {
      base: 'src/web/styles',
      loadStylesheet: async (id) => {
        const path = `node_modules/${id}.css`;
        return {
          path,
          base: 'node_modules',
          content: readFileSync(path, 'utf8'),
        };
      },
    });
    const css = compiler.build(['border', 'min-h-hit', 'bg-surface']);
    const layer = css.slice(css.indexOf('@layer utilities {'));
    expect(css).toContain('@layer utilities {');
    expect(layer).toMatch(/\.border \{[^}]*border-width: 0\.5px;/);
    expect(layer).toMatch(/\.min-h-hit \{[^}]*var\(--hit-target\)/);
    expect(layer).toMatch(/\.bg-surface \{[^}]*var\(--ui-surface\)/);
    expect(compiler.build(['bg-red-500', 'rounded-lg'])).toBe(css);
  });

  it('loads the effects after the utilities, in their own layer', () => {
    const effects = readFileSync('src/web/ui/effects.css', 'utf8');
    expect(main.indexOf("'./ui/effects.css'")).toBeGreaterThan(
      main.indexOf("'./styles/tailwind.css'"),
    );
    expect(effects).toContain('@layer effects {');
    expect(effects).toMatch(/@property --ui-effect \{[^}]*inherits: false;/);
    expect(effects).toMatch(/:where\(\[data-effect~="glow"\]\)/);
    expect(effects).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
    for (const token of effects.matchAll(/var\((--ui-glow-[a-z]+)\)/g)) {
      expect(declared.has(token[1])).toBe(true);
    }
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
