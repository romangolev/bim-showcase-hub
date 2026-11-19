import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import indexHtml from '../../../index.html?raw';
import { BSH_KEYS } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';

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
  beforeEach(() => {
    installMemoryStorage();
    document.documentElement.removeAttribute('data-theme');
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
  });

  it('follows the system for a stored system choice, not the legacy key', () => {
    window.localStorage.setItem(
      BSH_KEYS.preference.settings,
      JSON.stringify({ theme: 'system' }),
    );
    window.localStorage.setItem(BSH_KEYS.preference.theme, 'light');
    runPrepaint(false);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('uses the legacy key while the settings hold no theme', () => {
    window.localStorage.setItem(BSH_KEYS.preference.theme, 'light');
    runPrepaint(false);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('falls back to the media query for a corrupt settings blob', () => {
    window.localStorage.setItem(BSH_KEYS.preference.settings, '{nope');
    runPrepaint(true);
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
});
