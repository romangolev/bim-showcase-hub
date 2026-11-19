import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  DEFAULT_SETTINGS,
  readSettings,
  SETTINGS_STORAGE_KEY,
  SETTINGS_VERSION,
  SettingsProvider,
  scrubAppSettings,
  useSettings,
  writeSettings,
} from './index.js';

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('app settings', () => {
  it('keep unmigrated tool fields when an app setting changes', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ recentsLength: 3, ifc: { schema: 'IFC4' } }),
    );
    writeSettings({ ...DEFAULT_SETTINGS, recentsLength: 9 });
    expect(
      JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? ''),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      recentsLength: 9,
      ifc: { schema: 'IFC4' },
    });
  });

  it('hold only app-level fields', () => {
    expect(Object.keys(DEFAULT_SETTINGS).sort()).toEqual([
      'density',
      'recentsLength',
      'reducedMotion',
      'sessionWarnMinutes',
      'textSize',
      'theme',
      'version',
    ]);
  });
});

describe('readSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('does not rewrite a blob from a newer build', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: SETTINGS_VERSION + 1, recentsLength: 3 }),
    );
    expect(writeSettings({ ...DEFAULT_SETTINGS, recentsLength: 9 })).toBe(
      false,
    );
    expect(
      JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? ''),
    ).toEqual({ version: SETTINGS_VERSION + 1, recentsLength: 3 });
  });

  it('ignores a stored language field and keeps the other values', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ language: 'en', recentsLength: 7 }),
    );
    expect(readSettings()).toEqual({ ...DEFAULT_SETTINGS, recentsLength: 7 });
  });

  it('falls back to defaults for corrupt storage', () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, '{nope');
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid numbers, clamps them and defaults the rest', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ sessionWarnMinutes: 500, recentsLength: 'many' }),
    );
    expect(readSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      sessionWarnMinutes: 120,
    });
  });

  it('ignores tool fields that are still in an old blob', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ recentsLength: 8, paintBrushes: false, ifc: {} }),
    );
    expect(readSettings()).toEqual({ ...DEFAULT_SETTINGS, recentsLength: 8 });
  });

  it.each(['null', '"5"', '[]'])('defaults for non-object JSON %s', (raw) => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, raw);
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('swallows a throwing setItem', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});

function Probe() {
  const { settings, setSetting } = useSettings();
  return (
    <button type="button" onClick={() => setSetting('recentsLength', 2)}>
      recents {settings.recentsLength}
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
    fireEvent.click(screen.getByText('recents 5'));
    expect(screen.getByText('recents 2')).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}'),
    ).toEqual({ ...DEFAULT_SETTINGS, recentsLength: 2 });
  });

  it('works without a provider using defaults', () => {
    render(<Probe />);
    expect(screen.getByText('recents 5')).toBeTruthy();
  });
});

describe('scrubAppSettings', () => {
  const stored = () => window.localStorage.getItem(SETTINGS_STORAGE_KEY);

  it('drops old tool fields such as the IFC author but keeps app fields', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        recentsLength: 3,
        sessionWarnMinutes: 20,
        ifc: { author: 'Ada', organisation: 'Acme' },
      }),
    );
    scrubAppSettings();
    expect(JSON.parse(stored() ?? '')).toEqual({
      recentsLength: 3,
      sessionWarnMinutes: 20,
    });
  });

  it.each([
    ['truncated JSON with an author', '{"ifc":{"author":"Ada'],
    ['a number', '7'],
    ['a string', '"x"'],
    ['an array', '[{"ifc":{"author":"Ada"}}]'],
    ['null', 'null'],
  ])('removes a corrupt blob: %s', (_name, blob) => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, blob);
    scrubAppSettings();
    expect(stored()).toBeNull();
  });

  it('removes the blob when the scrubbed write fails', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ recentsLength: 3, ifc: { author: 'Ada' } }),
    );
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    scrubAppSettings();
    expect(stored()).toBeNull();
  });

  it('does nothing when nothing is stored', () => {
    scrubAppSettings();
    expect(stored()).toBeNull();
  });
});
