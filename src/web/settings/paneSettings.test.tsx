import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_TREE_VIEW } from '../components/tree/treeView.js';
import { FORGET_EVENT } from '../storage.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { readJson, writeJson } from '../test/storageJson.js';
import { TreeSettingsForm } from './PaneSettingsForms.js';
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

  it('keeps a stored hide action and maps removed values to select', () => {
    writeJson(PANE_SETTINGS.dashboard.action.key, 'hide');
    const { result } = renderHook(() =>
      usePaneSetting(PANE_SETTINGS.dashboard.action),
    );
    expect(result.current[0]).toBe('hide');
    expect(PANE_SETTINGS.summary.action.sanitize('hide')).toBe('hide');
    expect(PANE_SETTINGS.summary.action.sanitize('zoomed')).toBe('select');
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

  it('persists the Documents open mode and rejects unknown values', () => {
    writeJson(PANE_SETTINGS.tree.view.key, {
      ...DEFAULT_TREE_VIEW,
      openMode: 'combined',
    });
    const { result } = renderHook(() =>
      usePaneSetting(PANE_SETTINGS.tree.view),
    );
    expect(result.current[0].openMode).toBe('combined');
    act(() => result.current[1]({ ...result.current[0], openMode: 'replace' }));
    expect(readJson(PANE_SETTINGS.tree.view.key, null)).toMatchObject({
      openMode: 'replace',
    });
    expect(
      PANE_SETTINGS.tree.view.sanitize({ openMode: 'nope' }),
    ).toMatchObject({ openMode: 'tab' });
  });

  it('offers the open mode and the shortcut map in Documents settings', () => {
    render(<TreeSettingsForm />);
    expect(
      screen.getByRole('combobox', { name: /Open models in/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Keyboard shortcuts')).toBeInTheDocument();
    expect(screen.getByText('/')).toBeInTheDocument();
    expect(screen.getByText('Focus the filter')).toBeInTheDocument();
    expect(screen.getByText('Enter')).toBeInTheDocument();
    expect(screen.getByText('Open the focused version')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
    expect(screen.getByText('Select the version')).toBeInTheDocument();
    expect(screen.queryByText('Enter or Space')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: /Open models in/ }), {
      target: { value: 'combined' },
    });
    expect(readJson(PANE_SETTINGS.tree.view.key, null)).toMatchObject({
      openMode: 'combined',
    });
  });
});
