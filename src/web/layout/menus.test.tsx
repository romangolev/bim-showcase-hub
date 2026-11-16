import { createMemoryHistory } from '@tanstack/react-router';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { Menu } from '../components/Menu.js';
import { createAppRouter } from '../routes/router.js';
import {
  createTestClient,
  installMemoryStorage,
  mockFetch,
  mockMatchMedia,
  stubLayout,
  treeRoutes,
} from '../test/mockApi.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';

function renderModel() {
  const appRouter = createAppRouter(
    createMemoryHistory({ initialEntries: ['/model/abc123'] }),
  );
  render(<App appRouter={appRouter} client={createTestClient()} />);
}

async function openPaneMenu(title: string) {
  const trigger = await screen.findByRole('button', {
    name: `${title} pane options`,
  });
  fireEvent.click(trigger);
  return screen.getByRole('menu', { name: `${title} pane options` });
}

function itemNames(menu: HTMLElement) {
  return Array.from(menu.querySelectorAll('[role^="menuitem"]')).map(
    (item) => item.textContent,
  );
}

beforeEach(() => {
  stubLayout();
  installMemoryStorage();
  vi.stubGlobal('innerHeight', 1000);
  vi.stubGlobal('__MOCK_APS__', true);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  mockMatchMedia(1440);
  mockFetch({ '/api/session': { name: 'Ada', picture: null }, ...treeRoutes });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Menu', () => {
  function renderMenu(onPick = vi.fn()) {
    render(
      <Menu
        label="Things"
        trigger="Open"
        items={() => [
          { id: 'a', label: 'Alpha', onSelect: () => onPick('a') },
          { kind: 'separator', id: 's' },
          { id: 'b', label: 'Beta', onSelect: () => onPick('b') },
          { id: 'c', label: 'Gamma', checked: true, onSelect: vi.fn() },
        ]}
      />,
    );
    return { trigger: screen.getByRole('button', { name: 'Things' }), onPick };
  }

  it('opens from the keyboard and moves focus through the items', () => {
    const { trigger } = renderMenu();
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Things' });
    expect(within(menu).getByRole('menuitem', { name: 'Alpha' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(within(menu).getByRole('menuitem', { name: 'Beta' })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    const gamma = within(menu).getByRole('menuitemcheckbox', { name: 'Gamma' });
    expect(gamma).toHaveFocus();
    expect(gamma).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(within(menu).getByRole('menuitem', { name: 'Alpha' })).toHaveFocus();
    expect(within(menu).getByRole('separator')).toBeInTheDocument();
  });

  it('opens on the last item with ArrowUp', () => {
    const { trigger } = renderMenu();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Gamma' }),
    ).toHaveFocus();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('runs the item and closes', () => {
    const { trigger, onPick } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Beta' }));
    expect(onPick).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes when clicking outside', () => {
    const { trigger } = renderMenu();
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('pane menus', () => {
  it('offers every move without dragging and no Close for the viewer', async () => {
    renderModel();
    const menu = await openPaneMenu('Viewer');
    expect(itemNames(menu)).toEqual([
      'Move left',
      'Move right',
      'Move below',
      'Float',
      'Collapse',
      'Reset layout',
    ]);
  });

  it('offers Close for closable panes', async () => {
    renderModel();
    const menu = await openPaneMenu('Model summary');
    expect(itemNames(menu)).toContain('Close');
  });

  it('hides the tab close button only for the viewer', async () => {
    renderModel();
    await screen.findByRole('tab', { name: 'Viewer' });
    const tabs = screen.getAllByRole('tab');
    const viewer = tabs.find(
      (tab) => tab.getAttribute('aria-label') === 'Viewer',
    );
    const summary = tabs.find(
      (tab) => tab.getAttribute('aria-label') === 'Model summary',
    );
    expect(viewer?.querySelector('.dv-default-tab-action')).toBeNull();
    expect(summary?.querySelector('.dv-default-tab-action')).not.toBeNull();
  });

  it('floats and docks the viewer from its menu without reloading it', async () => {
    const destroy = vi.spyOn(MockViewerAdapter.prototype, 'destroy');
    const load = vi.spyOn(MockViewerAdapter.prototype, 'load');
    renderModel();
    await screen.findByLabelText('Mock building model');
    let menu = await openPaneMenu('Viewer');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Float' }));
    expect(document.querySelector('.dv-resize-container')).not.toBeNull();
    expect(document.querySelector('.dv-live-region')).toHaveTextContent(
      'Viewer floated',
    );
    menu = await openPaneMenu('Viewer');
    expect(itemNames(menu)).toContain('Dock');
    expect(itemNames(menu)).not.toContain('Collapse');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Dock' }));
    expect(document.querySelector('.dv-resize-container')).toBeNull();
    menu = await openPaneMenu('Viewer');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move left' }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(destroy).not.toHaveBeenCalled();
  });

  it('returns focus to the moved pane tab', async () => {
    renderModel();
    const menu = await openPaneMenu('Dashboard');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Move right' }));
    expect(screen.getByRole('tab', { name: 'Dashboard' })).toHaveFocus();
  });

  it('collapses from the menu and from the header button', async () => {
    renderModel();
    const menu = await openPaneMenu('Dashboard');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Collapse' }));
    expect(
      screen.getByRole('button', { name: 'Expand Dashboard' }),
    ).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Expand Dashboard' }));
    expect(
      screen.getByRole('button', { name: 'Collapse Dashboard' }),
    ).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('panes menu in the top bar', () => {
  it('closes and reopens panes and resets the layout', async () => {
    renderModel();
    const trigger = await screen.findByRole('button', { name: 'Panes' });
    fireEvent.click(trigger);
    let menu = screen.getByRole('menu', { name: 'Panes' });
    expect(
      within(menu)
        .getAllByRole('menuitemcheckbox')
        .map((item) => item.textContent),
    ).toEqual(['Documents', 'Model summary', 'Dashboard']);
    const dashboard = within(menu).getByRole('menuitemcheckbox', {
      name: 'Dashboard',
    });
    expect(dashboard).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(dashboard);
    await waitFor(() =>
      expect(screen.queryByRole('tab', { name: 'Dashboard' })).toBeNull(),
    );

    fireEvent.click(trigger);
    menu = screen.getByRole('menu', { name: 'Panes' });
    expect(
      within(menu).getByRole('menuitemcheckbox', { name: 'Dashboard' }),
    ).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(
      within(menu).getByRole('menuitemcheckbox', { name: 'Dashboard' }),
    );
    expect(
      await screen.findByRole('tab', { name: 'Dashboard' }),
    ).toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset layout' }));
    expect(document.querySelector('.layout-announcer')).toHaveTextContent(
      'Layout reset',
    );
  });

  it('is hidden on narrow screens', async () => {
    const media = mockMatchMedia(1440);
    renderModel();
    await screen.findByRole('button', { name: 'Panes' });
    act(() => media.setWidth(800));
    expect(screen.queryByRole('button', { name: 'Panes' })).toBeNull();
  });
});

describe('keyboard', () => {
  it('cycles focus between pane groups with F6 and Shift+F6', async () => {
    renderModel();
    const tab = await screen.findByRole('tab', { name: 'Viewer' });
    const root = tab.closest('.dock-root') as HTMLElement;
    tab.focus();
    fireEvent.keyDown(tab, { key: 'F6' });
    const next = document.activeElement as HTMLElement;
    expect(next).toHaveAttribute('role', 'tab');
    expect(next).not.toBe(tab);
    fireEvent.keyDown(next, { key: 'F6', shiftKey: true });
    expect(tab).toHaveFocus();
    expect(root).toBeTruthy();
  });
});
