import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import indexHtml from '../../../index.html?raw';
import { THEME_COLORS } from './theme.js';

const manifest = JSON.parse(
  readFileSync('public/manifest.webmanifest', 'utf8'),
);
const tokens = readFileSync('src/web/styles/tokens.css', 'utf8');

describe('web app manifest', () => {
  it('is linked and names the app', () => {
    expect(indexHtml).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(manifest.name).toBe('BIM Showcase Hub');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('has 192 and 512 icons and a maskable one', () => {
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(
      manifest.icons.some(
        (icon: { purpose?: string }) => icon.purpose === 'maskable',
      ),
    ).toBe(true);
  });

  it('keeps theme colors in line with the graphite token', () => {
    expect(tokens).toContain(`--color-graphite: ${THEME_COLORS.dark}`);
    expect(tokens).toContain(`--color-graphite: ${THEME_COLORS.light}`);
    expect(manifest.theme_color).toBe(THEME_COLORS.dark);
  });
});
