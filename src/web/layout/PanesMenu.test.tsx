import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModalProvider } from '../modal/index.js';
import { isHintDismissed } from '../onboarding/hints.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { type LayoutApi, LayoutContext } from './layoutContext.js';
import { PanesMenu } from './PanesMenu.js';
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
    activeModel: null,
    closeOthers: vi.fn(),
    reopenClosed: vi.fn(() => null),
    canReopen: () => false,
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

  it('groups the rows by category without a query', () => {
    renderMenu();
    const menu = openMenu();
    expect(
      Array.from(menu.querySelectorAll('.panes-menu__heading')).map(
        (heading) => heading.textContent,
      ),
    ).toEqual(['Workspace', 'Viewer', 'Analysis', 'Data']);
  });

  it('opens from the keyboard, moves to the rows and closes with Escape', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Panes' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const menu = screen.getByRole('dialog', { name: 'Panes' });
    expect(menu).toHaveAttribute('data-slot', 'menu-popup');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const search = within(menu).getByRole('searchbox', {
      name: 'Search panes',
    });
    await waitFor(() => expect(search).toHaveFocus());
    const first = within(menu).getByRole('menuitem', {
      name: 'Go to Documents',
    });
    await waitFor(() =>
      expect(search).toHaveAttribute('aria-activedescendant', first.id),
    );
    expect(first).toHaveAttribute('data-highlighted');
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    const second = within(menu).getAllByRole('menuitem', {
      name: 'Search project files',
    })[0] as HTMLElement;
    await waitFor(() =>
      expect(search).toHaveAttribute('aria-activedescendant', second.id),
    );
    fireEvent.keyDown(search, { key: 'End' });
    const last = within(menu).getByRole('menuitem', { name: 'Reset layout' });
    await waitFor(() =>
      expect(search).toHaveAttribute('aria-activedescendant', last.id),
    );
    fireEvent.keyDown(search, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Panes' })).toBeNull(),
    );
    expect(trigger).toHaveFocus();
  });

  it('closes on an outside click without taking focus back', async () => {
    renderMenu();
    const outside = document.createElement('button');
    document.body.append(outside);
    openMenu();
    fireEvent.pointerDown(outside);
    fireEvent.mouseDown(outside);
    fireEvent.click(outside);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Panes' })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: 'Panes' })).not.toHaveFocus();
    outside.remove();
  });

  it('returns focus to the trigger after running a row', async () => {
    renderMenu();
    const trigger = screen.getByRole('button', { name: 'Panes' });
    const menu = openMenu();
    fireEvent.click(
      within(menu).getByRole('menuitemcheckbox', { name: 'Dashboard' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Panes' })).toBeNull(),
    );
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
    expect(reset).toHaveAttribute('aria-disabled', 'true');
    expect(reset).toHaveAccessibleDescription('Unlock the layout first');
  });

  it('toggles the lock from its checked menu item', () => {
    const { layout } = renderMenu();
    const menu = openMenu();
    fireEvent.click(
      within(menu).getByRole('menuitemcheckbox', { name: 'Lock layout' }),
    );
    expect(layout.setLocked).toHaveBeenCalledWith(true);
  });

  it('hints about the Panes menu in the popover and remembers the dismissal', () => {
    renderMenu();
    const menu = openMenu();
    const hint = within(menu).getByRole('note');
    expect(hint).toHaveTextContent(
      'Open more panes, such as charts and properties, from Panes.',
    );
    fireEvent.click(within(hint).getByRole('button', { name: 'Dismiss hint' }));
    expect(isHintDismissed('panes-menu')).toBe(true);
    fireEvent.keyDown(menu, { key: 'Escape' });
    openMenu();
    expect(
      within(screen.getByRole('dialog', { name: 'Panes' })).queryByRole('note'),
    ).toBeNull();
  });
});
