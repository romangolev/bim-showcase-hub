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

  it('opens with Enter and picks with Enter without a second activation', () => {
    const { trigger, onPick } = renderMenu();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const menu = screen.getByRole('menu', { name: 'Things' });
    expect(within(menu).getByRole('menuitem', { name: 'Alpha' })).toHaveFocus();
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    fireEvent.keyDown(menu, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('menu')).toBeNull();
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
  it('offers every move without dragging and Close for a model tab', async () => {
    renderModel();
    const menu = await openPaneMenu('Untitled model');
    expect(itemNames(menu)).toEqual([
      'Move left',
      'Move right',
      'Move below',
      'Float',
      'Resize with arrow keys',
      'Collapse',
      'Close',
      'Reset layout',
    ]);
  });

  it('offers Close for closable panes', async () => {
    renderModel();
    const menu = await openPaneMenu('Model summary');
    expect(itemNames(menu)).toContain('Close');
  });

  it('shows a close button on model tabs and closable panes', async () => {
    renderModel();
    await screen.findByRole('tab', { name: 'Untitled model' });
    const tabs = screen.getAllByRole('tab');
    const viewer = tabs.find(
      (tab) => tab.getAttribute('aria-label') === 'Untitled model',
    );
    const summary = tabs.find(
      (tab) => tab.getAttribute('aria-label') === 'Model summary',
    );
    expect(viewer?.querySelector('.dv-default-tab-action')).not.toBeNull();
    expect(summary?.querySelector('.dv-default-tab-action')).not.toBeNull();
  });

  it('floats and docks the viewer from its menu without reloading it', async () => {
    const destroy = vi.spyOn(MockViewerAdapter.prototype, 'destroy');
    const load = vi.spyOn(MockViewerAdapter.prototype, 'load');
    renderModel();
    await screen.findByLabelText('Mock building model');
    let menu = await openPaneMenu('Untitled model');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Float' }));
    expect(document.querySelector('.dv-resize-container')).not.toBeNull();
    expect(document.querySelector('.dv-live-region')).toHaveTextContent(
      'Untitled model floated',
    );
    menu = await openPaneMenu('Untitled model');
    expect(itemNames(menu)).toContain('Dock');
    expect(itemNames(menu)).not.toContain('Collapse');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Dock' }));
    expect(document.querySelector('.dv-resize-container')).toBeNull();
    menu = await openPaneMenu('Untitled model');
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
    const menu = await openPaneMenu('Model summary');
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Collapse' }));
    expect(
      screen.getByRole('button', { name: 'Expand Model summary' }),
    ).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(
      screen.getByRole('button', { name: 'Expand Model summary' }),
    );
    expect(
      screen.getByRole('button', { name: 'Collapse Model summary' }),
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
    ).toEqual(['Model summary', 'Dashboard']);
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
    const reset = screen.getByRole('menuitem', { name: 'Reset layout' });
    expect(reset).toHaveAccessibleDescription(
      'Resets the arrangement. Open models stay open; remembered viewer position and closed panes are cleared.',
    );
    fireEvent.click(reset);
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
  it('resizes a pane with the arrow keys from its menu', async () => {
    renderModel();
    const menu = await openPaneMenu('Model summary');
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Resize with arrow keys' }),
    );
    const announcer = document.querySelector('.layout-announcer');
    expect(announcer).toHaveTextContent('Resizing Model summary');
    expect(
      fireEvent.keyDown(document.body, { key: 'ArrowLeft', shiftKey: true }),
    ).toBe(false);
    expect(announcer?.textContent).toMatch(/^Model summary \d+ by \d+ pixels/);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(announcer).toHaveTextContent('Model summary resize finished');
    const after = announcer?.textContent;
    expect(fireEvent.keyDown(document.body, { key: 'ArrowLeft' })).toBe(true);
    expect(announcer?.textContent).toBe(after);
  });

  it('cycles focus between pane groups with F6 and Shift+F6', async () => {
    renderModel();
    const tab = await screen.findByRole('tab', { name: 'Untitled model' });
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

  it('enters the first pane group with F6 from the top bar', async () => {
    renderModel();
    await screen.findByRole('tab', { name: 'Untitled model' });
    const panes = screen.getByRole('button', { name: 'Panes' });
    panes.focus();
    fireEvent.keyDown(panes, { key: 'F6' });
    const focused = document.activeElement as HTMLElement;
    expect(focused).toHaveAttribute('role', 'tab');
    expect(focused.closest('.dv-groupview')).toBe(
      document.querySelector('.dv-groupview'),
    );
  });

  it('leaves F6 alone while typing in a field', async () => {
    renderModel();
    const filter = await screen.findByRole('searchbox', {
      name: 'Filter loaded nodes',
    });
    await waitFor(() => expect(filter).toBeEnabled());
    filter.focus();
    expect(filter).toHaveFocus();
    fireEvent.keyDown(filter, { key: 'F6' });
    expect(filter).toHaveFocus();
  });
});
