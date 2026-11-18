import { readFileSync } from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { SettingsProvider, useSettings } from './index.js';

const tokens = readFileSync('src/web/styles/tokens.css', 'utf8');

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
      <button type="button" onClick={() => setSetting('textSize', 'large')}>
        large
      </button>
      <button type="button" onClick={() => setSetting('textSize', 'medium')}>
        medium
      </button>
      <button type="button" onClick={() => setSetting('reducedMotion', true)}>
        reduce motion
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
});

describe('appearance settings', () => {
  it('applies density and text size to the document tokens', () => {
    const drop = withTokens();
    try {
      render(
        <SettingsProvider>
          <AppearanceProbe />
        </SettingsProvider>,
      );
      fireEvent.click(screen.getByText('compact'));
      fireEvent.click(screen.getByText('large'));
      fireEvent.click(screen.getByText('reduce motion'));
      const root = document.documentElement;
      expect(root.dataset.density).toBe('compact');
      expect(root.dataset.textSize).toBe('large');
      expect(root.dataset.reducedMotion).toBe('true');
      const computed = getComputedStyle(root);
      expect(computed.getPropertyValue('--density').trim()).toBe('0.8');
      expect(computed.getPropertyValue('--text-scale').trim()).toBe('1.14');
      expect(computed.getPropertyValue('--control-height')).toContain(
        'var(--density)',
      );
      expect(computed.getPropertyValue('--space-4')).toContain(
        'var(--density)',
      );
    } finally {
      drop();
    }
  });

  it('restores comfortable and medium from the scales', () => {
    const drop = withTokens();
    try {
      render(
        <SettingsProvider>
          <AppearanceProbe />
        </SettingsProvider>,
      );
      fireEvent.click(screen.getByText('comfortable'));
      fireEvent.click(screen.getByText('medium'));
      const computed = getComputedStyle(document.documentElement);
      expect(computed.getPropertyValue('--density').trim()).toBe('1');
      expect(computed.getPropertyValue('--text-scale').trim()).toBe('1');
    } finally {
      drop();
    }
  });
});
