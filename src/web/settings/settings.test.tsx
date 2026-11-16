import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  DEFAULT_SETTINGS,
  readSettings,
  SETTINGS_STORAGE_KEY,
  SettingsProvider,
  useSettings,
} from './index.js';

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('readSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults for corrupt storage', () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, '{nope');
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid booleans and defaults the rest', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ paintBrushes: false, excelExport: 'yes' }),
    );
    expect(readSettings()).toEqual({ paintBrushes: false, excelExport: true });
  });
});

function Probe() {
  const { settings, setSetting } = useSettings();
  return (
    <button type="button" onClick={() => setSetting('paintBrushes', false)}>
      paint {String(settings.paintBrushes)}
    </button>
  );
}

describe('SettingsProvider', () => {
  it('persists a changed setting', () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    fireEvent.click(screen.getByText('paint true'));
    expect(screen.getByText('paint false')).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}'),
    ).toMatchObject({ paintBrushes: false });
  });

  it('works without a provider using defaults', () => {
    render(<Probe />);
    expect(screen.getByText('paint true')).toBeTruthy();
  });
});
