import { createMemoryHistory } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { createAppRouter } from '../routes/router.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
  mockMatchMedia,
  stubLayout,
  treeRoutes,
} from '../test/mockApi.js';
import { LAYOUT_KEY, parseLayout } from './layoutState.js';
import { ModelSwitcher, stackedPanes } from './StackedLayout.js';

function renderPath(path: string) {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: [path] }),
  );
  return render(<App appRouter={appRouter} client={createTestClient()} />);
}

let storage: Storage;

beforeEach(() => {
  stubLayout();
  storage = installMemoryStorage();
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('__MOCK_APS__', true);
  mockFetch({ '/api/session': { name: 'Ada', picture: null }, ...treeRoutes });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('stackedPanes', () => {
  it('stacks main, dashboard and summary on a model route', () => {
    expect(
      stackedPanes(['tree', 'viewer', 'summary', 'dashboard'], true),
    ).toEqual(['viewer', 'dashboard', 'summary']);
  });

  it('shows no viewer section without a model', () => {
    expect(
      stackedPanes(['tree', 'viewer', 'summary', 'dashboard'], false),
    ).toEqual([]);
  });

  it('keeps closed companions closed and always shows the open model', () => {
    expect(stackedPanes(['tree'], true)).toEqual(['viewer']);
  });
});

describe('model switcher keyboard', () => {
  const state = {
    models: [
      { urn: 'a', context: {} },
      { urn: 'b', context: {} },
      { urn: 'c', context: {} },
    ],
    active: 'a',
    live: [],
    visible: [],
  };
  const titles = {
    'viewer:a': { label: 'A', tooltip: '' },
    'viewer:b': { label: 'B', tooltip: '' },
    'viewer:c': { label: 'C', tooltip: '' },
  };

  function setup() {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    function Switcher() {
      const [active, setActive] = useState(state.active);
      return (
        <ModelSwitcher
          models={{ ...state, active }}
          titles={titles}
          onSelect={(urn) => {
            setActive(urn);
            onSelect(urn);
          }}
          onClose={onClose}
        />
      );
    }
    render(<Switcher />);
    return { onSelect, onClose };
  }

  it('keeps tabs as direct children of the tablist with one in the tab order', () => {
    setup();
    const list = screen.getByRole('tablist', { name: 'Open models' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((tab) => tab.parentElement)).toEqual([list, list, list]);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('moves with the arrow keys, Home and End, and wraps', async () => {
    const { onSelect } = setup();
    const [a, b, c] = screen.getAllByRole('tab');
    const press = async (
      from: HTMLElement | undefined,
      key: string,
      to: HTMLElement | undefined,
      urn: string,
    ) => {
      fireEvent.keyDown(from as HTMLElement, { key });
      await waitFor(() => expect(to).toHaveFocus());
      expect(onSelect).toHaveBeenLastCalledWith(urn);
    };
    a?.focus();
    await press(a, 'ArrowRight', b, 'b');
    await press(b, 'End', c, 'c');
    await press(c, 'ArrowRight', a, 'a');
    await press(a, 'ArrowLeft', c, 'c');
    await press(c, 'Home', a, 'a');
  });

  it('closes the focused tab with Delete', () => {
    const { onClose } = setup();
    const [, b] = screen.getAllByRole('tab');
    fireEvent.keyDown(b as HTMLElement, { key: 'Delete' });
    expect(onClose).toHaveBeenCalledWith('b');
  });
});

describe('stacked layout', () => {
  it('replaces the dock below 876px and keeps the saved dock layout', async () => {
    const media = mockMatchMedia(1440);
    renderPath('/model/abc123');
    await waitFor(() =>
      expect(document.querySelector('.dv-dockview')).not.toBeNull(),
    );
    await waitFor(() =>
      expect(parseLayout(storage.getItem(LAYOUT_KEY))?.dock).toBeTruthy(),
    );
    const before = storage.getItem(LAYOUT_KEY);

    act(() => media.setWidth(800));
    await waitFor(() =>
      expect(document.querySelector('.dv-dockview')).toBeNull(),
    );
    expect(document.querySelector('.stack')).not.toBeNull();
    expect(
      await screen.findByRole('complementary', { name: 'Model summary' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Model viewer' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Documents' }),
    ).toBeNull();
    expect(storage.getItem(LAYOUT_KEY)).toBe(before);
    expect(
      document.querySelectorAll('.stack__column .stack__pane'),
    ).toHaveLength(3);
  });

  it('uses the panels own collapse toggles in the stack', async () => {
    mockMatchMedia(800);
    renderPath('/model/abc123');
    expect(
      await screen.findByRole('button', { name: 'Collapse Model summary' }),
    ).toHaveClass('bsh-summary__toggle');
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('names the open model above the viewer and keeps the path in the tooltip', async () => {
    mockMatchMedia(800);
    renderPath(
      `/model/abc123?file=Tower.rvt&v=v2&crumbs=${encodeURIComponent(JSON.stringify(['Hub', 'Docs']))}`,
    );
    const strip = await screen.findByRole('tablist', { name: 'Open models' });
    const tab = await within(strip).findByRole('tab', {
      name: 'Tower.rvt · v2',
    });
    expect(tab).toHaveAttribute('title', 'Hub / Docs / Tower.rvt · v2\nabc123');
    const panel = screen.getByRole('tabpanel', { name: 'Tower.rvt · v2' });
    expect(tab).toHaveAttribute('aria-controls', panel.id);
    expect(panel.querySelector('[data-slot]')?.getAttribute('data-slot')).toBe(
      'viewer:abc123',
    );
    expect(within(strip).queryByRole('button')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Close Tower.rvt · v2' }),
    ).toBeInTheDocument();
  });

  it('shows no model strip on the index route', async () => {
    mockMatchMedia(800);
    renderPath('/');
    await screen.findByRole('heading', { name: 'Pick a model to explore' });
    expect(screen.queryByRole('tablist', { name: 'Open models' })).toBeNull();
  });

  it('shows only main on the index route', async () => {
    mockMatchMedia(800);
    renderPath('/');
    await screen.findByRole('heading', { name: 'Pick a model to explore' });
    expect(
      document.querySelectorAll('.stack__column > .pane-slot'),
    ).toHaveLength(1);
  });

  it('opens the document sheet as a drawer and closes it with Escape', async () => {
    mockMatchMedia(800);
    renderPath('/model/abc123');
    const toggle = await screen.findByRole('button', {
      name: 'Expand document tree',
    });
    fireEvent.click(toggle);
    const sheet = document.querySelector('.stack__tree');
    expect(sheet).toHaveAttribute('data-slot', 'drawer');
    expect(sheet).not.toHaveAttribute('hidden');
    await waitFor(() =>
      expect(
        sheet?.querySelector('[data-slot="drawer-body"] #document-panel'),
      ).not.toBeNull(),
    );
    expect(
      screen.getByRole('button', { name: 'Close document tree' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(sheet).toHaveAttribute('hidden'));
  });
});
