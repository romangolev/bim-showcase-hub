import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import indexHtml from '../../../index.html?raw';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { THEMES } from './theme.js';

const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1] ?? '';

function runPrepaint(matchesLight: boolean): void {
  const run = Function('localStorage', 'window', 'document', script) as (
    storage: Storage,
    scope: { matchMedia: () => { matches: boolean } },
    doc: Document,
  ) => void;
  run(
    window.localStorage,
    { matchMedia: () => ({ matches: matchesLight }) },
    document,
  );
}

describe('pre-paint theme', () => {
  it('knows the same themes, schemes and colours as THEMES', () => {
    const literal = /const themes = (\{[^;]+\});/.exec(script)?.[1] ?? '';
    const themes = Function(`return ${literal}`)() as Record<string, string[]>;
    expect(themes).toEqual(
      Object.fromEntries(
        THEMES.map((theme) => [theme.id, [theme.scheme, theme.color]]),
      ),
    );
  });

  beforeEach(() => {
    installMemoryStorage();
    for (const meta of document.head.querySelectorAll(
      'meta[name="theme-color"]',
    )) {
      meta.remove();
    }
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.append(meta);
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.removeAttribute('data-text-size');
    document.documentElement.removeAttribute('data-reduced-motion');
    document.documentElement.lang = 'en';
    document.documentElement.style.colorScheme = '';
  });

  it('paints an explicit light choice before React on a dark system', () => {
    window.localStorage.setItem(
      BSH_KEYS.preference.settings,
      JSON.stringify({ theme: 'light' }),
    );
    runPrepaint(false);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(
      document
        .querySelector('meta[name="theme-color"]')
        ?.getAttribute('content'),
    ).toBe('#ffffff');
  });

  it('follows the system for a stored system choice', () => {
    window.localStorage.setItem(
      BSH_KEYS.preference.settings,
      JSON.stringify({ theme: 'system' }),
    );
    runPrepaint(false);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('falls back to the media query for a corrupt settings blob', () => {
    window.localStorage.setItem(BSH_KEYS.preference.settings, '{nope');
    runPrepaint(true);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('applies density, text size and reduced motion before React', () => {
    window.localStorage.setItem(
      BSH_KEYS.preference.settings,
      JSON.stringify({
        density: 'compact',
        textSize: 125,
        reducedMotion: true,
      }),
    );
    runPrepaint(false);
    const root = document.documentElement;
    expect(root.dataset.density).toBe('compact');
    expect(root.dataset.textSize).toBe('125');
    expect(root.dataset.reducedMotion).toBe('true');
  });

  it('migrates the old named text size before paint', () => {
    window.localStorage.setItem(
      BSH_KEYS.preference.settings,
      JSON.stringify({ textSize: 'large' }),
    );
    runPrepaint(false);
    expect(document.documentElement.dataset.textSize).toBe('112');
  });

  it('applies the stored language before React', () => {
    window.localStorage.setItem(
      BSH_KEYS.preference.settings,
      JSON.stringify({ language: 'ru' }),
    );
    runPrepaint(false);
    expect(document.documentElement.lang).toBe('ru');
  });

  it('keeps the document language for a language it does not know', () => {
    window.localStorage.setItem(
      BSH_KEYS.preference.settings,
      JSON.stringify({ language: 'fr' }),
    );
    runPrepaint(false);
    expect(document.documentElement.lang).toBe('en');
  });

  it('leaves the defaults to the stylesheet', () => {
    runPrepaint(false);
    const root = document.documentElement;
    expect(root.dataset.density).toBeUndefined();
    expect(root.dataset.textSize).toBeUndefined();
    expect(root.dataset.reducedMotion).toBeUndefined();
  });
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-density');
  document.documentElement.removeAttribute('data-text-size');
  document.documentElement.removeAttribute('data-reduced-motion');
  document.documentElement.style.colorScheme = '';
});
