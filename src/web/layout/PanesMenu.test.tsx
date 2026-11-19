import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalProvider } from '../modal/index.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { type LayoutApi, LayoutContext } from './layoutContext.js';
import { PanesMenu } from './PanesMenu.js';
import { PANE_CATALOG_KEY } from './paneCatalog.js';
import type { PaneId } from './paneRegistry.js';

function fakeLayout(over: Partial<LayoutApi> = {}): LayoutApi {
  const open = new Set<PaneId>(['summary', 'dashboard', 'models']);
  return {
    mode: 'dock',
    locked: false,
    presenting: false,
    canPresent: true,
    canAddInstance: true,
    openPanes: [...open],
    isOpen: (id: PaneId) => open.has(id),
    togglePane: vi.fn(),
    addInstance: vi.fn(),
    focusPane: vi.fn(),
    setPresenting: vi.fn(),
    setLocked: vi.fn(),
    resetLayout: vi.fn(),
    workspaces: {
      canRevert: false,
      openDialog: vi.fn(),
      download: vi.fn(),
      copyJson: vi.fn(),
      copyLink: vi.fn(),
      revert: vi.fn(),
    },
    ...over,
  } as unknown as LayoutApi;
}

function renderMenu(over: Partial<LayoutApi> = {}) {
  const layout = fakeLayout(over);
  const view = render(
    <ModalProvider definitions={[]}>
      <LayoutContext.Provider value={layout}>
        <PanesMenu />
      </LayoutContext.Provider>
    </ModalProvider>,
  );
  return { layout, ...view };
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Panes' }));
  return screen.getByRole('dialog', { name: 'Panes' });
}

beforeEach(() => {
  installMemoryStorage();
});

describe('Panes menu', () => {
  it('lists panes with an icon, description and open state', () => {
    renderMenu();
    const menu = openMenu();
    const dashboard = within(menu).getByRole('menuitemcheckbox', {
      name: 'Dashboard',
    });
    expect(dashboard).toHaveAttribute('aria-checked', 'true');
    expect(
      within(menu).getByText('Chart the properties of the active model.'),
    ).toBeInTheDocument();
    expect(within(menu).queryByText('Pinned')).toBeNull();
  });

  it('opens and closes a pane through the row action', () => {
    const { layout } = renderMenu();
    const menu = openMenu();
    fireEvent.click(
      within(menu).getByRole('menuitemcheckbox', { name: 'Dashboard' }),
    );
    expect(layout.togglePane).toHaveBeenCalledWith('dashboard');
    expect(screen.queryByRole('dialog', { name: 'Panes' })).toBeNull();
  });

  it('filters by title, description and keywords', () => {
    renderMenu();
    const menu = openMenu();
    const search = within(menu).getByRole('searchbox', {
      name: 'Search panes',
    });
    fireEvent.change(search, { target: { value: 'hub' } });
    expect(
      within(menu).getByText(
        'Browse hubs, projects, folders and model versions.',
      ),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitemcheckbox', { name: 'Dashboard' }),
    ).toBeNull();

    fireEvent.change(search, { target: { value: 'graph' } });
    expect(
      within(menu).getByRole('menuitemcheckbox', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'New chart' }),
    ).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'selection attributes' } });
    expect(
      within(menu).getByRole('menuitem', { name: 'New properties' }),
    ).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(within(menu).getByText('No panes match')).toBeInTheDocument();
  });

  it('adds another instance from the row action', () => {
    const { layout } = renderMenu();
    const menu = openMenu();
    fireEvent.change(
      within(menu).getByRole('searchbox', { name: 'Search panes' }),
      { target: { value: 'chart' } },
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'New chart' }));
    expect(layout.addInstance).toHaveBeenCalledWith('chart');
  });

  it('focuses an open pane from the row action', () => {
    const { layout } = renderMenu();
    const menu = openMenu();
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Focus Dashboard' }),
    );
    expect(layout.focusPane).toHaveBeenCalledWith('dashboard');
  });

  it('pins favourites first, in pin order, and remembers them', () => {
    const { unmount } = renderMenu();
    let menu = openMenu();
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Pin Dashboard' }),
    );
    fireEvent.click(
      within(
        menu.querySelector('[data-kind="summary"]') as HTMLElement,
      ).getByRole('menuitem', { name: 'Pin Model summary' }),
    );
    expect(
      Array.from(
        document.querySelectorAll('[aria-label="Pinned panes"] [data-kind]'),
      ).map((row) => row.getAttribute('data-kind')),
    ).toEqual(['dashboard', 'summary']);
    expect(window.localStorage.getItem(PANE_CATALOG_KEY)).toContain(
      'dashboard',
    );
    fireEvent.keyDown(menu, { key: 'Escape' });

    unmount();
    renderMenu();
    menu = openMenu();
    expect(
      Array.from(
        document.querySelectorAll('[aria-label="Pinned panes"] [data-kind]'),
      ).map((row) => row.getAttribute('data-kind')),
    ).toEqual(['dashboard', 'summary']);
  });

  it('hides a pane and shows it again from the hidden section', () => {
    renderMenu();
    const menu = openMenu();
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'Hide Dashboard' }),
    );
    expect(
      within(menu).queryByRole('menuitemcheckbox', { name: 'Dashboard' }),
    ).toBeNull();
    const manage = within(menu).getByRole('menuitemcheckbox', {
      name: 'Show hidden panes (1)',
    });
    fireEvent.click(manage);
    const hidden = screen.getByRole('group', { name: 'Hidden panes' });
    expect(
      within(hidden).getByText('Chart the properties of the active model.'),
    ).toBeInTheDocument();
    fireEvent.click(
      within(hidden).getByRole('menuitem', { name: 'Show Dashboard' }),
    );
    expect(
      within(menu).getByRole('menuitemcheckbox', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole('menuitemcheckbox', {
        name: 'Show hidden panes (1)',
      }),
    ).toBeNull();
  });

  it('opens from the keyboard, moves to the rows and closes with Escape', () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Panes' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('dialog', { name: 'Panes' });
    const search = within(menu).getByRole('searchbox', {
      name: 'Search panes',
    });
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(
      within(menu).getByRole('menuitem', { name: 'Go to Documents' }),
    );
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(
      within(menu).getByRole('menuitem', { name: 'Reset layout' }),
    );
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Panes' })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('exposes menu semantics for pane rows and layout actions', () => {
    renderMenu();
    const menu = openMenu();
    const list = within(menu).getByRole('menu', { name: 'Panes' });
    const dashboard = within(list).getByRole('menuitemcheckbox', {
      name: 'Dashboard',
    });
    expect(dashboard).toHaveAttribute('aria-checked', 'true');
    expect(
      within(list).getByRole('menuitem', { name: 'New chart' }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', { name: 'Present' }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitemcheckbox', { name: 'Lock layout' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('keeps the layout actions and blocked reasons', () => {
    renderMenu({ locked: true });
    const menu = openMenu();
    expect(
      within(menu).getByRole('menuitemcheckbox', { name: 'Unlock layout' }),
    ).toBeInTheDocument();
    const reset = within(menu).getByRole('menuitem', { name: 'Reset layout' });
    expect(reset).toBeDisabled();
    expect(reset).toHaveAccessibleDescription('Unlock the layout first');
  });
});
