import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STACKED_MAX_WIDTH } from '../layout/breakpoint.js';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  DEFAULT_SETTINGS,
  readSettings,
  SettingsProvider,
  useSettings,
} from './index.js';

const tokens = readFileSync('src/web/styles/tokens.css', 'utf8');
const dockTheme = readFileSync('src/web/layout/dockTheme.css', 'utf8');
const panels = readFileSync('src/web/panels/panels.css', 'utf8');

function AppearanceProbe() {
  const { setSetting } = useSettings();
  return (
    <>
      <button type="button" onClick={() => setSetting('density', 'compact')}>
        compact
      </button>
      <button
        type="button"
        onClick={() => setSetting('density', 'comfortable')}
      >
        comfortable
      </button>
      <button type="button" onClick={() => setSetting('textSize', 112)}>
        text 112
      </button>
      <button type="button" onClick={() => setSetting('textSize', 100)}>
        text 100
      </button>
      <button type="button" onClick={() => setSetting('reducedMotion', true)}>
        reduce motion
      </button>
      <button type="button" onClick={() => setSetting('language', 'ru')}>
        russian
      </button>
      <button type="button" onClick={() => setSetting('units', 'imperial')}>
        imperial
      </button>
    </>
  );
}

function withTokens() {
  const style = document.createElement('style');
  style.textContent = tokens;
  document.head.append(style);
  return () => style.remove();
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  const root = document.documentElement;
  delete root.dataset.density;
  delete root.dataset.textSize;
  delete root.dataset.reducedMotion;
  root.style.fontSize = '';
});

describe('appearance settings', () => {
  it('applies density, text size, motion, language and units', () => {
    const drop = withTokens();
    try {
      render(
        <SettingsProvider>
          <AppearanceProbe />
        </SettingsProvider>,
      );
      fireEvent.click(screen.getByText('compact'));
      fireEvent.click(screen.getByText('text 112'));
      fireEvent.click(screen.getByText('reduce motion'));
      fireEvent.click(screen.getByText('russian'));
      fireEvent.click(screen.getByText('imperial'));
      const root = document.documentElement;
      expect(root.dataset.density).toBe('compact');
      expect(root.dataset.textSize).toBe('112');
      expect(root.dataset.reducedMotion).toBe('true');
      expect(root.style.fontSize).toBe('');
      expect(getComputedStyle(root).fontSize).toBe('112%');
      const computed = getComputedStyle(root);
      expect(computed.getPropertyValue('--density').trim()).toBe('0.8');
      expect(computed.getPropertyValue('--text-13').trim()).toBe('0.8125rem');
      expect(computed.getPropertyValue('--control-height')).toContain(
        'var(--density)',
      );
      expect(computed.getPropertyValue('--space-4')).toContain(
        'var(--density)',
      );
      expect(readSettings()).toMatchObject({
        density: 'compact',
        textSize: 112,
        reducedMotion: true,
        language: 'ru',
        units: 'imperial',
      });
    } finally {
      drop();
    }
  });

  it('restores every stored appearance choice on a reload', () => {
    window.localStorage.setItem(
      'bsh-settings-v1',
      JSON.stringify({
        theme: 'light',
        density: 'compact',
        textSize: 125,
        reducedMotion: true,
        language: 'ru',
        units: 'imperial',
      }),
    );
    render(
      <SettingsProvider>
        <AppearanceProbe />
      </SettingsProvider>,
    );
    const root = document.documentElement;
    expect(root.dataset.density).toBe('compact');
    expect(root.dataset.textSize).toBe('125');
    expect(root.dataset.reducedMotion).toBe('true');
    expect(readSettings()).toMatchObject({
      language: 'ru',
      units: 'imperial',
    });
  });

  it('has no named text scale left in the tokens', () => {
    expect(tokens).not.toContain('--text-scale');
    expect(tokens).toMatch(
      /:root\[data-text-size="112"\] \{\s*font-size: 112%;/,
    );
    expect(tokens).toMatch(
      /:root\[data-text-size="125"\] \{\s*font-size: 125%;/,
    );
    expect(tokens).toMatch(/--text-13: 0\.8125rem;/);
  });

  it('drives rows, tables and the dock from the same density tokens', () => {
    expect(tokens).toMatch(
      /--row-inset: calc\(0\.375rem \* var\(--density\)\);/,
    );
    expect(tokens).toMatch(
      /--tree-row-height: calc\(1\.875rem \* var\(--density\)\);/,
    );
    expect(panels).toMatch(/padding: var\(--row-padding\);/);
    expect(dockTheme).toMatch(
      /--dv-tabs-and-actions-container-height: calc\(var\(--hit-target\) \+ 1px\);/,
    );
    expect(dockTheme).toMatch(
      /--dv-tab-close-icon-size: calc\(0\.75rem \* var\(--density\)\);/,
    );
    expect(dockTheme).toMatch(
      /--dv-floating-titlebar-height: calc\(0\.75rem \* var\(--density\)\);/,
    );
  });

  it('keeps the touch hit target at 44px or more in compact density', () => {
    const query = `(pointer: coarse), (max-width: ${STACKED_MAX_WIDTH}px)`;
    const start = tokens.indexOf(query);
    const touchBlock =
      (start === -1 ? '' : tokens.slice(start).split('}')[0]) || '';
    expect(touchBlock).toMatch(/--hit-target:\s*max\(\s*44px\s*,/);
    const density = /:root\[data-density="compact"\] \{\s*--density: ([^;]+);/
      .exec(tokens)?.[1]
      ?.trim();
    expect(density).toBe('0.8');
  });

  it('enlarges hit targets for the whole stacked layout', () => {
    expect(tokens).toContain(`(max-width: ${STACKED_MAX_WIDTH}px)`);
  });

  it('styles selection and the active tab for forced colors', () => {
    const global = readFileSync('src/web/styles/global.css', 'utf8');
    const forced = global.slice(
      global.indexOf('@media (forced-colors: active)'),
    );
    expect(forced).toContain('Highlight');
    expect(forced).toContain('.tree-row');
    expect(dockTheme).toContain('@media (forced-colors: active)');
  });

  it('restores comfortable and the default text size', () => {
    const drop = withTokens();
    try {
      render(
        <SettingsProvider>
          <AppearanceProbe />
        </SettingsProvider>,
      );
      fireEvent.click(screen.getByText('comfortable'));
      fireEvent.click(screen.getByText('text 100'));
      const computed = getComputedStyle(document.documentElement);
      expect(computed.getPropertyValue('--density').trim()).toBe('1');
      expect(document.documentElement.dataset.textSize).toBe('100');
      expect(DEFAULT_SETTINGS.textSize).toBe(100);
    } finally {
      drop();
    }
  });
});
