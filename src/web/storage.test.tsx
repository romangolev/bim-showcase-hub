import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetModels } from './api/openModels.js';
import {
  LAYOUT_WRITE_DELAY_MS,
  useDebouncedWrite,
} from './layout/LayoutProvider.js';
import { defaultModel, LAYOUT_KEY } from './layout/layoutState.js';
import { readSettings, SETTINGS_STORAGE_KEY } from './settings/settings.js';
import { BSH_KEYS } from './storage.js';
import { tasks } from './tasks/taskStore.js';
import { readJson, writeJson } from './test/storageJson.js';
import { EXCEL_SETTINGS_KEY } from './tools/excel/excelSettings.js';
import { IFC_SETTINGS_KEY } from './tools/ifc/ifcSettings.js';
import './tools/index.js';
import { installMemoryStorage } from './test/mockApi.js';

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('storage helpers', () => {
  it('falls back on missing or broken values', () => {
    expect(readJson('missing', 7)).toBe(7);
    window.localStorage.setItem('broken', '{');
    expect(readJson('broken', 'x')).toBe('x');
    expect(writeJson('ok', { a: 1 })).toBe(true);
    expect(readJson('ok', null)).toEqual({ a: 1 });
  });
});

describe('sign-out', () => {
  it('clears every personal key and keeps preferences', () => {
    for (const key of Object.values(BSH_KEYS.personal)) {
      window.localStorage.setItem(key, '"x"');
    }
    window.sessionStorage.setItem(BSH_KEYS.personal.openModels, '"x"');
    for (const key of Object.values(BSH_KEYS.preference)) {
      window.localStorage.setItem(key, '"x"');
    }
    forgetModels();
    for (const key of Object.values(BSH_KEYS.personal)) {
      expect(window.localStorage.getItem(key)).toBeNull();
      expect(window.sessionStorage.getItem(key)).toBeNull();
    }
    expect(window.localStorage.getItem(BSH_KEYS.preference.theme)).toBe('"x"');
    expect(window.localStorage.getItem(BSH_KEYS.preference.treeView)).toBe(
      '"x"',
    );
  });

  it('blanks the IFC author and organisation but keeps other settings', () => {
    writeJson(SETTINGS_STORAGE_KEY, { recentsLength: 9 });
    writeJson(IFC_SETTINGS_KEY, {
      author: 'Ada',
      organisation: 'Acme',
      projectName: 'Tower',
      enabled: false,
    });
    forgetModels();
    expect(readSettings().recentsLength).toBe(9);
    expect(
      readJson<Record<string, unknown>>(IFC_SETTINGS_KEY, {}),
    ).toMatchObject({
      author: '',
      organisation: '',
      projectName: 'Tower',
      enabled: false,
    });
  });

  it('clears the user pane instances', () => {
    writeJson(BSH_KEYS.personal.layoutInstances, { chart: [] });
    forgetModels();
    expect(window.localStorage.getItem('bsh.layout.instances.v1')).toBeNull();
  });

  it('resets the Excel model scope', () => {
    writeJson(EXCEL_SETTINGS_KEY, { format: 'csv', modelScope: 'urn-secret' });
    forgetModels();
    expect(
      readJson<Record<string, unknown>>(EXCEL_SETTINGS_KEY, {}),
    ).toMatchObject({ format: 'csv', modelScope: 'all' });
  });

  it('clears finished tasks', () => {
    tasks.start({ label: 'Export Tower.rvt' }).finish();
    expect(tasks.getSnapshot().tasks).toHaveLength(1);
    forgetModels();
    expect(tasks.getSnapshot().tasks).toHaveLength(0);
  });

  it('does not resurrect the layout from a pending write', () => {
    vi.useFakeTimers();
    const { rerender, unmount } = renderHook(
      ({ model }) => useDebouncedWrite(model),
      { initialProps: { model: defaultModel() } },
    );
    rerender({ model: { ...defaultModel(), treeWidth: 300 } });
    forgetModels();
    act(() => {
      vi.advanceTimersByTime(LAYOUT_WRITE_DELAY_MS * 2);
    });
    unmount();
    window.dispatchEvent(new Event('pagehide'));
    expect(window.localStorage.getItem(LAYOUT_KEY)).toBeNull();
  });
});
