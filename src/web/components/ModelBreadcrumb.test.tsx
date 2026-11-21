import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenModelsStore } from '../api/openModels.js';
import { OpenModelsContext } from '../api/useOpenModels.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { ModelBreadcrumb } from './ModelBreadcrumb.js';
import { TreeControlContext } from './TreeControl.js';
import { TOPBAR_PREFS } from './topbarPrefs.js';

function renderWith(reveal = vi.fn()) {
  const store = createOpenModelsStore(null);
  store.open('urn-a', { crumbs: ['Hub', 'Project'], file: 'A.rvt', v: 'v2' });
  render(
    <OpenModelsContext.Provider value={store}>
      <TreeControlContext.Provider value={{ reveal }}>
        <ModelBreadcrumb />
      </TreeControlContext.Provider>
    </OpenModelsContext.Provider>,
  );
  return reveal;
}

describe('ModelBreadcrumb', () => {
  beforeEach(() => installMemoryStorage());

  it('names the active model location as a navigation landmark', () => {
    renderWith();
    const nav = screen.getByRole('navigation', { name: 'Model location' });
    expect(nav.textContent).toContain('Hub');
    expect(screen.getByText('A.rvt · v2').getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('reveals the model in Documents from a folder crumb', () => {
    const reveal = renderWith();
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    expect(reveal).toHaveBeenCalledOnce();
  });

  it('renders nothing when the preference is off', () => {
    TOPBAR_PREFS.write({ breadcrumb: 'off' });
    renderWith();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
