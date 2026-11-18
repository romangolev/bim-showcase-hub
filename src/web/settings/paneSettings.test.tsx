import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FORGET_EVENT, readJson, writeJson } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { PANE_SETTINGS, usePaneSetting } from './paneSettings.js';

beforeEach(() => {
  installMemoryStorage();
});

describe('pane settings', () => {
  it('keeps the existing keys and falls back on garbage', () => {
    writeJson(PANE_SETTINGS.summary.action.key, 'isolate');
    const { result } = renderHook(() =>
      usePaneSetting(PANE_SETTINGS.summary.action),
    );
    expect(result.current[0]).toBe('isolate');
    act(() => result.current[1]('nonsense' as never));
    expect(readJson(PANE_SETTINGS.summary.action.key, null)).toBe('nonsense');
    expect(PANE_SETTINGS.summary.action.sanitize('nonsense')).toBe('select');
  });

  it('resets personal pane settings on sign-out', () => {
    writeJson(PANE_SETTINGS.dashboard.action.key, 'zoom');
    const { result } = renderHook(() =>
      usePaneSetting(PANE_SETTINGS.dashboard.action),
    );
    expect(result.current[0]).toBe('zoom');
    act(() => {
      window.localStorage.removeItem(PANE_SETTINGS.dashboard.action.key);
      window.dispatchEvent(new Event(FORGET_EVENT));
    });
    expect(result.current[0]).toBe('select');
  });
});
