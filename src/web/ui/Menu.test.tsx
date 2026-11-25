import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Menu,
  MenuCheckboxItem,
  MenuEmpty,
  MenuFilterProvider,
  MenuHint,
  MenuInertItem,
  MenuInput,
  MenuItem,
  MenuList,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from './Menu.js';
import { topLayerContainer } from './topLayer.js';

function Sample({
  onPick = () => undefined,
}: {
  onPick?: (id: string) => void;
}) {
  return (
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup aria-label="Actions">
        <MenuHint>Pick one</MenuHint>
        <MenuItem onClick={() => onPick('copy')}>Copy</MenuItem>
        <MenuInertItem title="Nothing is hidden">Show all</MenuInertItem>
        <MenuSeparator />
        <MenuCheckboxItem checked onClick={() => onPick('grid')}>
          Grid
        </MenuCheckboxItem>
      </MenuPopup>
    </Menu>
  );
}

function FilterSample() {
  return (
    <MenuFilterProvider>
      <Menu>
        <MenuTrigger>Actions</MenuTrigger>
        <MenuPopup aria-label="Actions">
          <MenuInput aria-label="Search actions" placeholder="Search actions" />
          <MenuList>
            <MenuItem>Copy</MenuItem>
            <MenuItem>Paste</MenuItem>
            <MenuItem>Grid</MenuItem>
          </MenuList>
          <MenuEmpty>No actions match</MenuEmpty>
        </MenuPopup>
      </Menu>
    </MenuFilterProvider>
  );
}

describe('Menu', () => {
  it('opens from the trigger with menu roles and names', () => {
    render(<Sample />);
    const trigger = screen.getByRole('button', { name: 'Actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('data-slot', 'menu-trigger');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Actions' });
    expect(menu).toHaveAttribute('data-slot', 'menu-popup');
    expect(menu).toHaveClass('bg-surface', 'z-popup');
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toHaveAttribute(
      'data-slot',
      'menu-item',
    );
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Grid' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('moves with the arrow keys and skips the hint and inert items', async () => {
    render(<Sample />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    const copy = screen.getByRole('menuitem', { name: 'Copy' });
    const grid = screen.getByRole('menuitemcheckbox', { name: 'Grid' });
    await waitFor(() => expect(copy).toHaveFocus());
    fireEvent.keyDown(copy, { key: 'ArrowDown' });
    await waitFor(() => expect(grid).toHaveFocus());
    fireEvent.keyDown(grid, { key: 'ArrowUp' });
    await waitFor(() => expect(copy).toHaveFocus());
  });

  it('runs an item, closes and returns focus to the trigger', async () => {
    const onPick = vi.fn();
    render(<Sample onPick={onPick} />);
    const trigger = screen.getByRole('button', { name: 'Actions' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy' }));
    expect(onPick).toHaveBeenCalledWith('copy');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('closes on Escape', async () => {
    render(<Sample />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    const copy = screen.getByRole('menuitem', { name: 'Copy' });
    await waitFor(() => expect(copy).toHaveFocus());
    fireEvent.keyDown(copy, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('keeps inert items disabled and out of reach', () => {
    const onPick = vi.fn();
    render(<Sample onPick={onPick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    const inert = screen.getByRole('menuitem', { name: 'Show all' });
    expect(inert).toHaveAttribute('aria-disabled', 'true');
    expect(inert).toHaveAttribute('title', 'Nothing is hidden');
    fireEvent.click(inert);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Pick one' })).toHaveAttribute(
      'data-slot',
      'menu-hint',
    );
  });

  it('portals into the surrounding dialog, so a modal keeps it interactive', () => {
    render(
      <dialog open>
        <Sample />
      </dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    expect(screen.getByRole('menu').closest('dialog')).not.toBeNull();
  });

  it('filters its items from the search field and names the empty state', async () => {
    render(<FilterSample />);
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    const search = screen.getByRole('searchbox', { name: 'Search actions' });
    expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: 'pa' } });
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Copy' })).toBeNull();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('menuitem')).toHaveLength(0);
    expect(await screen.findByText('No actions match')).toHaveAttribute(
      'data-slot',
      'menu-empty',
    );
  });
});

describe('topLayerContainer', () => {
  it('is the closest dialog, or the body', () => {
    const { container } = render(
      <dialog open>
        <span>inside</span>
      </dialog>,
    );
    const inside = screen.getByText('inside');
    expect(topLayerContainer(inside)).toBe(container.querySelector('dialog'));
    expect(topLayerContainer(document.body)).toBe(document.body);
    expect(topLayerContainer(null)).toBe(document.body);
  });
});
