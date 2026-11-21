import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenModelsStore, modelUrnsOf } from '../../api/openModels.js';
import { OpenModelsContext } from '../../api/useOpenModels.js';
import { PANE_SETTINGS } from '../../settings/paneSettings.js';
import { notifications } from '../../tasks/notifications.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import { DEFAULT_TREE_VIEW } from './treeView.js';
import { useModelOpeners } from './useModelOpeners.js';

const navigate = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}));

function setup(openMode: 'tab' | 'replace' | 'combined') {
  PANE_SETTINGS.tree.view.write({ ...DEFAULT_TREE_VIEW, openMode });
  const store = createOpenModelsStore(null);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <OpenModelsContext.Provider value={store}>
      {children}
    </OpenModelsContext.Provider>
  );
  return { store, ...renderHook(() => useModelOpeners(), { wrapper }) };
}

beforeEach(() => {
  installMemoryStorage();
  navigate.mockClear();
  notifications.clear();
});

describe('useModelOpeners open in combined mode', () => {
  it('opens a new tab and says so when the combined viewer is full', () => {
    const { store, result } = setup('combined');
    store.open('urn-a', {});
    for (let index = 1; index < 6; index += 1) {
      store.addTo('urn-a', `urn-x-${index}`);
    }
    act(() => result.current.open('urn-new', { file: 'New.rvt' }));
    expect(modelUrnsOf(store.getState(), 'urn-a')).toHaveLength(6);
    expect(store.getState().models.map((model) => model.urn)).toEqual([
      'urn-a',
      'urn-new',
    ]);
    expect(
      notifications.getSnapshot().items.map((item) => item.message),
    ).toContain('The open viewer is full; opened a new tab');
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('activates a model that is already its own tab', () => {
    const { store, result } = setup('combined');
    store.open('urn-a', {});
    store.open('urn-b', {});
    act(() => result.current.open('urn-a', {}));
    expect(modelUrnsOf(store.getState(), 'urn-b')).toEqual(['urn-b']);
    expect(store.getState().active).toBe('urn-a');
  });
});
