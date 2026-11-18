import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { SETTINGS_STORAGE_KEY, SettingsProvider } from './index.js';
import { PaintSettingsSection } from './PaintSettingsSection.js';

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  window.localStorage.clear();
});

function stored() {
  return JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}');
}

function renderSection() {
  render(
    <SettingsProvider>
      <PaintSettingsSection />
    </SettingsProvider>,
  );
}

describe('PaintSettingsSection', () => {
  it('starts with the three default swatches', () => {
    renderSection();
    expect(screen.getAllByLabelText(/^Swatch \d$/)).toHaveLength(3);
  });

  it('edits, adds and removes swatches and persists them', () => {
    renderSection();
    fireEvent.change(screen.getByLabelText('Swatch 1'), {
      target: { value: '#112233' },
    });
    expect(stored().paintPalette[0]).toBe('#112233');
    fireEvent.click(screen.getByRole('button', { name: 'Add swatch' }));
    expect(stored().paintPalette).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Remove swatch 1' }));
    expect(stored().paintPalette).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Reset palette' }));
    expect(stored().paintPalette[0]).toBe('#ef4444');
  });

  it('labels the slider as intensity and stores it', () => {
    renderSection();
    fireEvent.change(screen.getByLabelText(/^Intensity/), {
      target: { value: '0.8' },
    });
    expect(stored().paintIntensity).toBe(0.8);
  });
});
