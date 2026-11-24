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

describe('src/web/ui', () => {
  it('uses no hex colour and no arbitrary value', () => {
    const files = readdirSync('src/web/ui').filter(
      (file) => file.endsWith('.tsx') && !file.includes('.test.'),
    );
    for (const file of files) {
      const source = readFileSync(`src/web/ui/${file}`, 'utf8');
      expect(source, file).not.toMatch(/#[0-9a-f]{3,8}\b|-\[[^\]]+\]/i);
    }
  });
});
